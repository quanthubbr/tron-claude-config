'use strict';

// Self-contained: copied to ~/.claude/exonous/hooks/lib/, node builtins only. One state dir serves every tool.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { exoDir, stateDir, redirectedHome, testMode, foreignOwner } = require('./paths.cjs');
const { RELEASE_REF, compareVersions, listReleases } = require('./release.cjs');
const repo = require('./repo.cjs');

const DAY_MS = 24 * 60 * 60 * 1000;
const LOCK_STALE_MS = 30 * 60 * 1000;
const LOG_MAX = 64 * 1024;
const NOTE_MAX = 200;
// Fixed on purpose: install.json `source` is informational and never executed.
const SOURCE = 'https://github.com/zaqueu-1/exonous.git';
const SLUG = 'zaqueu-1/exonous';
const PMS = ['npm', 'pnpm', 'bun'];
const SHA = /^[0-9a-f]{40}$/;
const VERSION = /^\d+\.\d+\.\d+$/;

const NOTES = {
  updated: (from, to) => `exonous updated v${from} → v${to} (restart to load new hooks)`,
  failed: (to) => `exonous update to v${to} failed — run \`exonous update\` to see why`,
  major: (version) => `exonous v${version} is a new major — run \`exonous update --major\``,
  tagMoved: (version) => `exonous: release tag v${version} moved since install — run \`exonous doctor\``,
};

const statePath = (name) => path.join(stateDir(), name);
// Another uid (root in a user's session) owns the exonous dir: read nothing, write nothing.
const notOwner = () => foreignOwner(exoDir()) !== null || foreignOwner(stateDir()) !== null;
const parts = (version) => String(version).split('.').map(Number);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(name, content) {
  fs.mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(statePath(name), content, { mode: 0o600 });
}

/** Detailed errors stay in state/update.log (64 KB, one rotation), never in the note. */
function logLine(text) {
  try {
    fs.mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
    const file = statePath('update.log');
    const line = `${new Date().toISOString()} ${flatten(text).slice(0, 4096)}\n`;
    let size = 0;
    try {
      size = fs.statSync(file).size;
    } catch {
      // first line
    }
    if (size + Buffer.byteLength(line) > LOG_MAX) fs.renameSync(file, `${file}.1`);
    fs.appendFileSync(file, line, { mode: 0o600 });
  } catch {
    // logging must never break an update
  }
}

const installFile = () => path.join(exoDir(), 'install.json');
const readInstall = () => readJson(installFile());

function patchInstall(fields) {
  const file = installFile();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ ...readInstall(), ...fields }, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(tmp, file);
}

/** @returns {string | null} why automatic updates are off */
function optedOut(env = process.env) {
  if (env.EXONOUS_NO_UPDATE && env.EXONOUS_NO_UPDATE !== '0') return 'EXONOUS_NO_UPDATE';
  if (env.CI || env.CONTINUOUS_INTEGRATION) return 'CI';
  if (readJson(path.join(exoDir(), 'config.json'))?.autoUpdate === false) return 'config.json autoUpdate:false';
  return null;
}

/** @returns {number | null} ms timestamp of the last update check */
function lastCheck() {
  try {
    return fs.statSync(statePath('last-check')).mtimeMs;
  } catch {
    return null;
  }
}

// A last-check in the future (clock moved back) counts as due.
function due({ now = Date.now() } = {}) {
  const last = lastCheck();
  return last === null || now - last >= DAY_MS || now < last;
}

function markChecked({ now = Date.now() } = {}) {
  if (notOwner()) return false;
  writeState('last-check', `${now}\n`);
  const t = now / 1000;
  fs.utimesSync(statePath('last-check'), t, t);
  return true;
}

/** One printable line: whitespace collapsed, control and bidi characters dropped. */
const flatten = (text) => String(text)
  .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
  .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

function cleanNote(text) {
  const flat = flatten(text);
  return flat.length > NOTE_MAX ? `${flat.slice(0, NOTE_MAX - 1)}…` : flat;
}

function writeNote(text) {
  writeState('note', `${cleanNote(text)}\n`);
}

/** Note left for the next session start, removed once read. */
function takeNote() {
  if (notOwner()) return '';
  try {
    const note = cleanNote(fs.readFileSync(statePath('note'), 'utf8'));
    fs.rmSync(statePath('note'), { force: true });
    return note;
  } catch {
    return '';
  }
}

/** @returns {{ version: string, expected: string, actual: string } | null} set when an installed release tag moved */
function tagWarning() {
  return readJson(statePath('tag-moved.json'));
}

/**
 * Compares install.json with the release tags; changes nothing.
 * @param {{ major?: boolean }} [options] major: also consider a newer major.
 */
function check({ major = false } = {}) {
  const info = readInstall();
  if (!info?.version) return { status: 'not-installed' };
  if (info.ref && !RELEASE_REF.test(info.ref)) return { status: 'pinned', from: info.version, ref: info.ref };
  const from = info.version;
  // Repo mode follows the repo's own dependency spec (source and ref), never install.json.
  const source = repo.repoSource(info);
  if (source && (repo.pinned(source.ref) || !source.url)) return { status: 'pinned', from, ref: `${source.dep.name}@${source.dep.spec} in ${source.root}`, repo: source.root };
  const releases = listReleases(source ? source.url : SOURCE).filter((r) => SHA.test(r.sha));
  const sameMajor = releases.filter((r) => r.parts[0] === parts(from)[0]).pop();
  const top = releases[releases.length - 1];
  const result = { status: 'current', from };
  const newer = (r) => r && compareVersions(r.parts, parts(from)) > 0;
  if (newer(top) && top.parts[0] !== parts(from)[0]) result.newMajor = top.version;
  const installedTag = releases.find((r) => r.version === from);
  if (installedTag && info.tagSha && installedTag.sha !== info.tagSha) {
    result.tagMoved = { version: from, expected: info.tagSha, actual: installedTag.sha };
  }
  if (installedTag && !info.tagSha) result.tagSha = installedTag.sha;
  const target = major && result.newMajor ? top : sameMajor;
  if (!releases.length) return { ...result, status: 'no-release' };
  if (newer(target)) return { ...result, status: 'available', to: target.version, sha: target.sha };
  return { ...result, to: from };
}

const lockFile = () => statePath('update.lock');

function lockAcquire() {
  fs.mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.closeSync(fs.openSync(lockFile(), 'wx', 0o600));
      fs.writeFileSync(lockFile(), `${process.pid}\n`);
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        if (Date.now() - fs.statSync(lockFile()).mtimeMs < LOCK_STALE_MS) return false;
        fs.rmSync(lockFile(), { force: true });
      } catch {
        // gone between the open and the stat: retry
      }
    }
  }
  return false;
}

// Keeps a long update from looking stale to a concurrent session.
function lockTouch() {
  try {
    const t = Date.now() / 1000;
    fs.utimesSync(lockFile(), t, t);
  } catch {
    // lock removed underneath: the update still finishes
  }
}

/** The only spec ever installed: the fixed repo at the tag's commit. */
function spec(sha) {
  if (!SHA.test(sha)) throw new Error(`refusing to install: "${sha}" is not a commit sha`);
  return `github:${SLUG}#${sha}`;
}

/** pm binary recorded at install when it still looks like that pm; else the name on PATH. */
function pmCommand(info) {
  const pm = PMS.includes(info.pm) ? info.pm : 'npm';
  const recorded = info.pmPath;
  const ok = typeof recorded === 'string' && path.isAbsolute(recorded) && !/["%]/.test(recorded)
    && path.basename(recorded).replace(/\.(cmd|exe)$/i, '') === pm && fs.existsSync(recorded);
  return { pm, bin: ok ? recorded : pm };
}

// win32 needs a shell for .cmd shims: command quoted, args are fixed literals or a validated sha spec.
function pmRun({ bin }, args) {
  const win = process.platform === 'win32';
  return execFileSync(win ? `"${bin}"` : bin, args, {
    encoding: 'utf8', timeout: 10 * 60 * 1000, stdio: ['ignore', 'pipe', 'pipe'], shell: win, windowsHide: true,
  });
}

function globalRoot(cmd) {
  if (cmd.pm === 'bun') return path.join(process.env.BUN_INSTALL || path.join(os.homedir(), '.bun'), 'install', 'global', 'node_modules', 'exonous');
  const out = pmRun(cmd, ['root', '-g']).trim().split(/\r?\n/).pop();
  if (!path.isAbsolute(out)) throw new Error(`${cmd.pm} root -g gave no absolute path`);
  return path.join(out, 'exonous');
}

/**
 * Checks the installed package is the release: name, version, and the commit wherever the pm records it.
 * npm: <global>/node_modules/.package-lock.json; pnpm: <global>/pnpm-lock.yaml; bun: <global>/bun.lock. None → name + version only.
 */
function verifyPackage(root, { to, sha }) {
  const pkg = readJson(path.join(root, 'package.json'));
  if (pkg?.name !== 'exonous') throw new Error(`${root} is not the exonous package`);
  if (pkg.version !== to) throw new Error(`${root} holds v${pkg.version || '?'}, expected v${to}`);
  if (pkg.gitHead && pkg.gitHead !== sha) throw new Error(`${root} was built from ${pkg.gitHead}, expected ${sha}`);
  const nm = path.dirname(root);
  const locks = [path.join(nm, '.package-lock.json'), path.join(path.dirname(nm), 'pnpm-lock.yaml'), path.join(path.dirname(nm), 'bun.lock')]
    .map((file) => {
      try {
        return fs.readFileSync(file, 'utf8');
      } catch {
        return '';
      }
    })
    .filter((text) => text.includes(SLUG));
  if (locks.length && !locks.some((text) => text.includes(sha))) throw new Error(`the ${path.basename(nm)} lockfile does not pin exonous to ${sha}`);
  return { commitVerified: locks.length > 0 };
}

// A redirected home must not reach the real global pm prefix; only test mode may use its PATH shims.
const globalAllowed = () => !redirectedHome() || (testMode() && process.env.EXONOUS_UPDATE_TEST_PM === '1');

const devCheckout = (info) => typeof info.packageRoot === 'string' && fs.existsSync(path.join(info.packageRoot, '.git'));

const detail = (err) => flatten(`${err.message || err}${err.stderr ? ` | ${err.stderr}` : ''}`).slice(0, 4000);

/** Global mode: the fixed source at the tag's commit, through the recorded pm. Returns the new package root. */
function installGlobal(info, decision) {
  const cmd = pmCommand(info);
  const target = spec(decision.sha);
  pmRun(cmd, cmd.pm === 'npm' ? ['i', '-g', '--no-audit', '--no-fund', target] : ['add', '-g', target]);
  return globalRoot(cmd);
}

/** @returns {{ warnings: string[], commitVerified: boolean }} */
function apply(info, decision) {
  if (!VERSION.test(decision.to)) throw new Error(`invalid release version ${decision.to}`);
  const source = repo.repoSource(info);
  const root = source ? repo.bumpRepo(source, decision.to) : installGlobal(info, decision);
  lockTouch();
  const { commitVerified } = verifyPackage(root, decision);
  lockTouch();
  // The hooks under ~/.claude/exonous only change if this install succeeds; `setup` from a repo copy keeps repo mode.
  const out = execFileSync(process.execPath, [path.join(root, 'bin', 'exonous.js'), source ? 'setup' : 'install', '--quiet'], {
    cwd: source ? source.root : undefined,
    env: source ? { ...process.env, INIT_CWD: source.root } : process.env,
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10 * 60 * 1000, windowsHide: true,
  });
  const warnings = String(out).split('\n').filter((l) => l.includes('WARN'));
  if (!warnings.length) patchInstall({ ref: `v${decision.to}`, tagSha: decision.sha });
  return { warnings, commitVerified };
}

function recordTag(decision) {
  if (decision.tagMoved) {
    writeState('tag-moved.json', `${JSON.stringify(decision.tagMoved)}\n`);
    logLine(`release tag v${decision.tagMoved.version} moved: installed ${decision.tagMoved.expected}, now ${decision.tagMoved.actual}`);
    writeNote(NOTES.tagMoved(decision.tagMoved.version));
  } else if (decision.status !== 'pinned') {
    fs.rmSync(statePath('tag-moved.json'), { force: true });
  }
  if (decision.tagSha) patchInstall({ tagSha: decision.tagSha });
}

function announceMajor(version) {
  if (readJson(statePath('major-seen.json'))?.version === version) return;
  writeState('major-seen.json', `${JSON.stringify({ version })}\n`);
  writeNote(NOTES.major(version));
}

/**
 * Checks and, when a newer release exists, reinstalls through the recorded pm. Never throws in background mode.
 * @param {{ background?: boolean, major?: boolean }} [options] background: honor opt-outs and report through state/note.
 */
function run({ background = false, major = false } = {}) {
  if (notOwner()) return { status: 'not-owner' };
  if (background) {
    const reason = optedOut();
    if (reason) return { status: 'disabled', reason };
  }
  let decision;
  try {
    decision = check({ major });
    recordTag(decision);
  } catch (err) {
    markChecked();
    logLine(`check failed: ${detail(err)}`);
    if (!background) throw err;
    return { status: 'error', error: detail(err) };
  }
  if (decision.status !== 'available') {
    if (background && decision.newMajor) announceMajor(decision.newMajor);
    return decision;
  }
  const info = readInstall();
  if (devCheckout(info)) return { ...decision, status: 'pinned', ref: `dev checkout ${info.packageRoot}` };
  if (!globalAllowed()) return { ...decision, status: 'isolated' };
  if (!lockAcquire()) return { ...decision, status: 'busy' };
  try {
    const { warnings, commitVerified } = apply(info, decision);
    for (const w of warnings) logLine(`install v${decision.to}: ${cleanNote(w)}`);
    if (!commitVerified) logLine(`v${decision.to}: no pm lockfile records the commit; verified by name and version only`);
    if (background) writeNote(NOTES.updated(decision.from, decision.to));
    return { ...decision, status: 'updated', warnings: warnings.length };
  } catch (err) {
    markChecked();
    const error = detail(err);
    logLine(`update to v${decision.to} failed: ${error}`);
    if (background) writeNote(NOTES.failed(decision.to));
    return { ...decision, status: 'failed', error };
  } finally {
    fs.rmSync(lockFile(), { force: true });
  }
}

module.exports = {
  DAY_MS, LOCK_STALE_MS, SOURCE, notOwner, optedOut, due, lastCheck, markChecked, cleanNote, takeNote, tagWarning, check, run, spec,
  pmCommand, pmRun, globalRoot, globalAllowed, verifyPackage,
};
