'use strict';

// What exonous ships and where its machine runtime lives: ~/.claude/exonous/{hooks,PR-TEMPLATE.md,rules,install.json}.
const fs = require('fs');
const os = require('os');
const path = require('path');
const paths = require('./paths');
const { renderRules, VARIANTS } = require('./render-rules');
const { RELEASE_REF } = require('./release');

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const ASSETS = path.join(PACKAGE_ROOT, 'assets');
const SOURCE = 'https://github.com/zaqueu-1/exonous.git';
const OWNED_MARKER = '/.claude/exonous/hooks/';
const COMMANDS = ['commit-changes', 'make-pr', 'code-review', 'security-review'];
// Code files only — config.json and data/ hold each person's settings and are never touched.
const HOME_SKILLS = {
  deliver: ['SKILL.md', 'references/parallel.md'],
  'project-memory': ['SKILL.md', 'project-memory.mjs', 'config.example.json'],
  'session-handoff': ['SKILL.md', 'config.example.json'],
  doc: ['SKILL.md', 'doc.mjs'],
  'issue-board': ['SKILL.md', 'board.mjs', 'render.py', 'config.example.json'],
};
const DESIGN_SKILLS = ['ui-design', 'ui-motion', 'native-ui', 'ui-mockup'];
// HOME_SKILLS live in ~/.agents/skills (read by Gemini and OpenCode); Claude gets a link per skill.
const sharedSkillDir = (name) => path.join(paths.home(), '.agents', 'skills', name);

/** A SKILL.md under that name that is not ours (different `name:`): never overwritten or moved. */
function foreignSkill(dir, name) {
  try {
    return !new RegExp(`^name: ${name}\\r?$`, 'm').test(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'));
  } catch {
    return false;
  }
}

function packageVersion() {
  return JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;
}

// POSIX separators: the path is spliced into JSON hook templates and sh commands.
const uiDesignBin = () => path.join(paths.home(), '.agents', 'skills', 'ui-design', 'scripts', 'ui-design').replaceAll('\\', '/');

/** One argument for the shell that runs hook commands (sh; cmd.exe on Windows). */
function shellQuote(value, platform = process.platform) {
  if (platform === 'win32') {
    // cmd.exe expands %VAR% even inside quotes and has no reliable escape there, so such a path is refused.
    if (/[%"]/.test(String(value))) throw new Error(`cannot use ${value} in a cmd.exe hook command: it contains % or " (cmd.exe would expand or split it); install Node or the home under a path without them`);
    return `"${value}"`;
  }
  return `"${String(value).replace(/[\\"$`]/g, (c) => `\\${c}`)}"`;
}

/** Hook command with the node binary captured at install, so hooks never depend on PATH. */
function hookCommand(execPath, script, args = '') {
  return `${shellQuote(execPath)} ${shellQuote(path.join(paths.exoDir(), 'hooks', script))}${args ? ` ${args}` : ''}`;
}

// A redirected home (tests, sandboxes) must never reach the real one through external installers or CLIs.
function isolatedHome() {
  if (!process.env.EXONOUS_HOME) return false;
  try {
    return fs.realpathSync(process.env.EXONOUS_HOME) !== fs.realpathSync(os.homedir());
  } catch {
    return true;
  }
}

const devCheckout = (root = PACKAGE_ROOT) => fs.existsSync(path.join(root, '.git'));

/**
 * Prints the target home; a dev checkout refuses to write the real home unless --real-home was given.
 * @param {{ action: string, dryRun?: boolean, realHome?: boolean, log?: (msg: string) => void }} options
 */
function guardTarget({ action, dryRun = false, realHome = false, log = () => {} }) {
  log(`target home: ${paths.home()}${isolatedHome() ? ' (EXONOUS_HOME)' : ''}`);
  if (dryRun || realHome || isolatedHome() || !devCheckout()) return;
  throw new Error(`refusing to ${action} the real home ${paths.home()} from a dev checkout (${PACKAGE_ROOT}); set EXONOUS_HOME to a test home, or pass --real-home if you mean it`);
}

/**
 * `exonous setup` (what the v2.0.0 updater runs from <repo>/node_modules/exonous): migrate when this copy sits in a repo
 * that depends on exonous, otherwise it is just `install`.
 * @returns {'migrate'|'install'}
 */
function setupDecision(root = PACKAGE_ROOT) {
  let real = root;
  try {
    real = fs.realpathSync(root);
  } catch {
    // keep the given path
  }
  const parts = real.split(path.sep);
  const i = parts.indexOf('node_modules');
  if (i <= 0) return 'install';
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(parts.slice(0, i).join(path.sep) || path.sep, 'package.json'), 'utf8'));
  } catch {
    return 'install';
  }
  const declared = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (!['exonous', '@tron/claude-config'].some((name) => name in declared)) return 'install';
  // pnpm, yarn and bun keep global packages under a package.json of their own; only a git work tree is a repo.
  return (paths.gitOut(parts.slice(0, i).join(path.sep) || path.sep, ['rev-parse', '--is-inside-work-tree']) || '').trim() === 'true' ? 'migrate' : 'install';
}

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return listFiles(full, base);
    return e.isFile() && e.name !== '.DS_Store' ? [path.relative(base, full)] : [];
  });
}

/** Copies rels into a temp sibling of dest, then swaps it in; dest is untouched until the copy is complete. */
function stageDir(srcRoot, rels, dest) {
  const tag = `${process.pid}-${Date.now()}`;
  const stage = `${dest}.staging-${tag}`;
  const old = `${dest}.old-${tag}`;
  try {
    for (const rel of rels) {
      fs.mkdirSync(path.dirname(path.join(stage, rel)), { recursive: true });
      fs.copyFileSync(path.join(srcRoot, rel), path.join(stage, rel));
    }
  } catch (err) {
    fs.rmSync(stage, { recursive: true, force: true });
    throw err;
  }
  const hadDest = fs.existsSync(dest);
  if (hadDest) fs.renameSync(dest, old);
  try {
    fs.renameSync(stage, dest);
  } catch (err) {
    if (hadDest) fs.renameSync(old, dest);
    fs.rmSync(stage, { recursive: true, force: true });
    throw err;
  }
  fs.rmSync(old, { recursive: true, force: true });
}

function installRuntime(home, { dryRun = false } = {}) {
  const hooks = path.join(ASSETS, 'machine', 'hooks');
  const dest = path.join(paths.exoDir(), 'hooks');
  const rels = listFiles(hooks);
  for (const rel of rels) home.track(path.join(dest, rel), fs.readFileSync(path.join(hooks, rel)));
  if (!dryRun) stageDir(hooks, rels, dest);
  home.sync(path.join(ASSETS, 'machine', 'PR-TEMPLATE.md'), path.join(paths.exoDir(), 'PR-TEMPLATE.md'));
  for (const variant of VARIANTS) {
    home.write(path.join(paths.exoDir(), 'rules', variant === 'full' ? 'nomos.md' : `nomos.${variant}.md`), renderRules(variant));
  }
}

/** Absolute path of the pm binary on PATH, recorded so self-update does not depend on a later PATH. */
function findOnPath(name, env = process.env) {
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', ''] : [''];
  for (const dir of String(env.PATH || '').split(path.delimiter)) {
    if (!dir || !path.isAbsolute(dir)) continue;
    for (const ext of exts) {
      const file = path.join(dir, `${name}${ext}`);
      try {
        if (fs.statSync(file).isFile()) return file;
      } catch {
        // not here
      }
    }
  }
  return null;
}

const INSTALL_ERROR = 'exonous install did not finish — run `exonous install`';
const installErrorFile = () => path.join(paths.stateDir(), 'last-install-error.json');

/** Fixed text + time for doctor and the package manager; the details go to state/install.log (64 KB, one rotation). */
function recordInstallError(detail) {
  try {
    fs.mkdirSync(paths.stateDir(), { recursive: true, mode: 0o700 });
    const at = new Date().toISOString();
    fs.writeFileSync(installErrorFile(), `${JSON.stringify({ text: INSTALL_ERROR, at })}\n`, { mode: 0o600 });
    const log = path.join(paths.stateDir(), 'install.log');
    const line = `${at} ${String(detail).slice(0, 4000)}\n`;
    if (fs.existsSync(log) && fs.statSync(log).size + line.length > 64 * 1024) fs.renameSync(log, `${log}.1`);
    fs.appendFileSync(log, line, { mode: 0o600 });
  } catch {
    // the state dir itself is unusable: the caller still prints INSTALL_ERROR
  }
}

function clearInstallError() {
  fs.rmSync(installErrorFile(), { force: true });
}

function readInstallError() {
  try {
    return JSON.parse(fs.readFileSync(installErrorFile(), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Every writing command calls this first: root must not write into a home another uid owns, and nobody may write into an
 * exonous dir another uid owns (a sudo session would leave files the user can no longer read or update).
 */
function assertOwner(action) {
  if (paths.currentUid() === null) return;
  if (paths.currentUid() === 0) {
    const owner = paths.foreignOwner(paths.home());
    if (owner !== null) throw new Error(`refusing to ${action} as root into ${paths.home()}, which is owned by uid ${owner} — run exonous as that user (without sudo)`);
  }
  for (const dir of [paths.exoDir(), paths.stateDir()]) {
    const owner = paths.foreignOwner(dir);
    if (owner !== null) throw new Error(`refusing to ${action}: ${dir} is owned by uid ${owner}, not you — run exonous as that user, or fix it with sudo chown -R "$(id -un)" ~/.claude/exonous`);
  }
}

const installInfoPath = () => path.join(paths.exoDir(), 'install.json');

function readInstallInfo() {
  try {
    return JSON.parse(fs.readFileSync(installInfoPath(), 'utf8'));
  } catch {
    return null;
  }
}

/** @param {{ tools: Record<string, { tier: number }>, dryRun?: boolean }} options */
function writeInstallInfo({ tools, dryRun = false }) {
  const previous = readInstallInfo() || {};
  const version = packageVersion();
  // A release ref holds only for the version it installed; any other ref is the user's pin.
  const keepRef = previous.ref && (previous.version === version || !RELEASE_REF.test(previous.ref));
  const pm = paths.detectPm(process.env, PACKAGE_ROOT);
  const info = {
    version,
    pm,
    pmPath: findOnPath(pm),
    packageRoot: PACKAGE_ROOT,
    source: SOURCE,
    ...(keepRef ? { ref: previous.ref } : {}),
    tagSha: previous.version === version ? previous.tagSha ?? null : null,
    installedAt: previous.version === version && previous.installedAt ? previous.installedAt : new Date().toISOString(),
    tools: Object.fromEntries(Object.entries(tools).map(([id, t]) => [id, { tier: t.tier, version }])),
  };
  if (dryRun) return info;
  const file = installInfoPath();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(info, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  fs.renameSync(tmp, file);
  return info;
}

module.exports = {
  PACKAGE_ROOT, ASSETS, SOURCE, OWNED_MARKER, COMMANDS, HOME_SKILLS, DESIGN_SKILLS, sharedSkillDir, foreignSkill,
  packageVersion, uiDesignBin, shellQuote, hookCommand, listFiles, stageDir, installRuntime, readInstallInfo, writeInstallInfo,
  isolatedHome, devCheckout, guardTarget, setupDecision, assertOwner, INSTALL_ERROR, recordInstallError, clearInstallError, readInstallError,
};
