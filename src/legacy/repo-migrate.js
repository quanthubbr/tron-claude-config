'use strict';

// Repo-mode install → machine install: machine first, verify the gate, then clean the repo. Delete with v2-manifest.json in v3.0.0.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const paths = require('../lib/paths');

const DEPS = ['exonous', '@tron/claude-config'];
const GIT_HOOKS = ['pre-commit', 'pre-push'];
// Generated (timestamped) files: recognized by shape, not hash.
const SCOPE_FILES = ['.claude/.exonous-scope.json', '.claude/.tron-scope.json', '.claude/.ecc-scope.json'];
const SCOPE_KEYS = ['folders', 'scoped', 'signals', 'updatedAt'];
// Repo-era runtime state, gitignored by the installers.
const STATE = ['.claude/.exonous', '.claude/.commit-authorized', '.claude/.pr-body-draft.md', '.claude/.harness-last-update', '.claude/.harness-session'];
const DESIGN_FILES = ['.cursor/hooks.json', '.github/hooks/ui-design.json', '.github/hooks/tron-design.json', '.github/hooks/impeccable.json', '.github/hooks/kallos.json'];
const DESIGN_MARKERS = ['/.agents/skills/ui-design/scripts/', '/skills/tron-design/scripts/tron-design', '/skills/impeccable/scripts/impeccable', '/skills/kallos/scripts/kallos'];
const KEEP_DIRS = new Set(['.claude', '.github', '.cursor']);
const LOCKFILES = { npm: ['package-lock.json'], pnpm: ['pnpm-lock.yaml'], bun: ['bun.lock', 'bun.lockb'] };
const DOCS = 'https://github.com/zaqueu-1/exonous#readme';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const loadManifest = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'v2-manifest.json'), 'utf8'));

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// Read-only git queries with the caller's env: the hardened gitEnv would mask the repo's own core.hooksPath.
function gitRead(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).replace(/\n$/, '');
  } catch {
    return null;
  }
}

/**
 * Guards every write and delete: the target must resolve inside the repo and no path segment below root may be a symlink,
 * so a committed `.claude -> /elsewhere` can never redirect a delete.
 */
function makeGuard(root, summary, log) {
  const base = fs.realpathSync(root);
  return (abs) => {
    const rel = path.relative(base, abs);
    let ok = Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
    let cur = base;
    for (const seg of ok ? rel.split(path.sep) : []) {
      cur = path.join(cur, seg);
      try {
        if (fs.lstatSync(cur).isSymbolicLink()) ok = false;
      } catch {
        break;
      }
    }
    if (ok) {
      try {
        const real = fs.realpathSync(abs);
        ok = real.startsWith(`${base}${path.sep}`);
      } catch {
        // missing target: nothing to resolve
      }
    }
    if (!ok) {
      const shown = rel || abs;
      if (!summary.skipped.includes(shown)) {
        summary.skipped.push(shown);
        log(`WARN: ${shown} skipped — it is a symlink or resolves outside ${base}`);
      }
    }
    return ok;
  };
}

function packageDeps(root) {
  const pkg = readJson(path.join(root, 'package.json')) || {};
  return DEPS.filter((name) => (pkg.devDependencies || {})[name] || (pkg.dependencies || {})[name]);
}

/** Repo pm: `packageManager` field, then the lockfile, then the pm running us; npm when nothing says otherwise. */
function repoPm(root, env = process.env) {
  const field = /^(npm|pnpm|bun)@/.exec(String((readJson(path.join(root, 'package.json')) || {}).packageManager || ''));
  const agent = /^(npm|pnpm|bun)\//.exec(String(env.npm_config_user_agent || ''));
  const byLock = Object.entries(LOCKFILES).find(([, files]) => files.some((f) => fs.existsSync(path.join(root, f))));
  const pm = (field && field[1]) || (byLock && byLock[0]) || (agent && agent[1]) || 'npm';
  return { pm, lockfiles: LOCKFILES[pm].filter((f) => fs.existsSync(path.join(root, f))) };
}

function isScopeFile(file) {
  const data = readJson(file);
  return Boolean(data) && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).every((k) => SCOPE_KEYS.includes(k)) && Array.isArray(data.folders);
}

/** True when the repo still carries anything a repo-mode install wrote. */
function hasRepoInstall(root, manifest) {
  if (packageDeps(root).length) return true;
  return [...Object.keys(manifest.files).filter((k) => !k.startsWith('git-hooks:')), ...SCOPE_FILES].some((rel) => fs.existsSync(path.join(root, rel)));
}

function optedOut(env) {
  if (env.EXONOUS_NO_INSTALL === '1') return 'EXONOUS_NO_INSTALL=1';
  return readJson(path.join(paths.exoDir(), 'config.json'))?.autoInstall === false ? '{"autoInstall": false} in ~/.claude/exonous/config.json' : null;
}

function machineGate(log) {
  const { ADAPTERS } = require('../adapters');
  const wanted = ADAPTERS.filter((a) => ['claude', 'cursor'].includes(a.id) && a.detect());
  if (!wanted.length) return { error: 'neither Claude Code nor Cursor is installed on this machine' };
  if (!fs.existsSync(path.join(paths.exoDir(), 'hooks', 'pyle.cjs'))) return { error: 'the gate runtime ~/.claude/exonous/hooks/pyle.cjs is missing' };
  const missing = wanted.filter((a) => !a.registeredCommand()).map((a) => a.id);
  if (missing.length) return { error: `the gate hook is not registered for ${missing.join(', ')}` };
  log(`machine gate verified for ${wanted.map((a) => a.id).join(', ')}`);
  return { gated: wanted.map((a) => a.id) };
}

/** Global copy pinned like self-update: the commit of this version's tag, verified after install. Failures only warn. */
function globalAdd(version, { lifecycle, log }) {
  const selfupdate = require('../../assets/machine/hooks/lib/selfupdate.cjs');
  const { listReleases } = require('../lib/release');
  const hint = `npm i -g github:zaqueu-1/exonous#v${version}`;
  if (lifecycle) {
    log(`global install skipped inside a package-manager script: run \`${hint}\` (or pnpm/bun add -g) once`);
    return 'skipped';
  }
  if (!selfupdate.globalAllowed()) {
    log('global install skipped: EXONOUS_HOME points away from the real home');
    return 'skipped';
  }
  const cmd = selfupdate.pmCommand(require('../lib/runtime').readInstallInfo() || {});
  try {
    const tag = listReleases(selfupdate.SOURCE).find((r) => r.version === version);
    if (!tag) throw new Error(`no v${version} release tag on the source`);
    const target = selfupdate.spec(tag.sha);
    selfupdate.pmRun(cmd, cmd.pm === 'npm' ? ['i', '-g', '--no-audit', '--no-fund', target] : ['add', '-g', target]);
    selfupdate.verifyPackage(selfupdate.globalRoot(cmd), { to: version, sha: tag.sha });
    log(`installed exonous v${version} globally with ${cmd.pm} (${tag.sha.slice(0, 12)})`);
    return 'ok';
  } catch (err) {
    log(`WARN: global install with ${cmd.pm} failed (${String(err.message).split('\n')[0]}) — the machine install still works; run \`${hint}\` later`);
    return 'failed';
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Drops hook entries whose commands are all ours; keeps permissions and foreign entries. Returns true when changed. */
function stripHooks(config, isOurs) {
  if (!config.hooks || typeof config.hooks !== 'object') return false;
  let changed = false;
  for (const [event, list] of Object.entries(config.hooks)) {
    if (!Array.isArray(list)) continue;
    const kept = list.flatMap((entry) => {
      if (Array.isArray(entry?.hooks)) {
        const inner = entry.hooks.filter((h) => !isOurs(h));
        if (inner.length === entry.hooks.length) return [entry];
        changed = true;
        return inner.length ? [{ ...entry, hooks: inner }] : [];
      }
      if (isOurs(entry)) {
        changed = true;
        return [];
      }
      return [entry];
    });
    if (kept.length) config.hooks[event] = kept;
    else delete config.hooks[event];
  }
  if (changed && !Object.keys(config.hooks).length) delete config.hooks;
  return changed;
}

/** Shared hooks of a linked worktree belong to the main checkout; a hooks dir outside the common git dir is not ours. */
function gitHooksDir(root, summary, log) {
  if (gitRead(root, ['config', '--get', 'core.hooksPath'])) return null;
  const gitDir = gitRead(root, ['rev-parse', '--absolute-git-dir']);
  const common = gitRead(root, ['rev-parse', '--git-common-dir']);
  const hooks = gitRead(root, ['rev-parse', '--git-path', 'hooks']);
  if (!gitDir || !common || !hooks) return null;
  const commonReal = fs.realpathSync(path.resolve(root, common));
  if (fs.realpathSync(gitDir) !== commonReal) {
    const main = path.dirname(commonReal);
    summary.notes.push(`git hooks are shared with ${main} — run \`exonous migrate\` there`);
    log(`git hooks are shared with ${main} — run \`exonous migrate\` there`);
    return null;
  }
  const dir = path.resolve(root, hooks);
  let real = dir;
  try {
    real = fs.realpathSync(dir);
  } catch {
    return null;
  }
  if (!real.startsWith(`${commonReal}${path.sep}`)) {
    summary.skipped.push(hooks);
    log(`WARN: git hooks dir ${hooks} resolves outside ${commonReal} — skipped`);
    return null;
  }
  return real;
}

function cleanRepo(root, manifest, summary, log) {
  const inside = makeGuard(root, summary, log);
  const tracked = new Set((gitRead(root, ['ls-files', '-z']) || '').split('\0').filter(Boolean).map((f) => f.split('/').join(path.sep)));
  const prune = (abs) => {
    let dir = path.dirname(abs);
    while (dir.startsWith(`${root}${path.sep}`) && !KEEP_DIRS.has(path.relative(root, dir)) && inside(dir)) {
      try {
        if (fs.readdirSync(dir).length) return;
        fs.rmdirSync(dir);
      } catch {
        return;
      }
      dir = path.dirname(dir);
    }
  };
  const remove = (abs, rel) => {
    if (!inside(abs)) return;
    fs.rmSync(abs, { recursive: true, force: true });
    summary.removed.push(rel);
    if (tracked.has(rel.split('/').join(path.sep))) summary.trackedRemoved += 1;
    prune(abs);
  };
  for (const [rel, hashes] of Object.entries(manifest.files)) {
    if (rel.startsWith('git-hooks:') || rel === '.claude/settings.json') continue;
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs) || !inside(abs) || !fs.lstatSync(abs).isFile()) continue;
    if (hashes.includes(sha256(fs.readFileSync(abs)))) remove(abs, rel);
    else summary.keptModified.push(rel);
  }
  for (const rel of SCOPE_FILES) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs) && inside(abs) && isScopeFile(abs)) remove(abs, rel);
  }
  for (const rel of STATE) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) remove(abs, rel);
  }
  const settings = path.join(root, '.claude', 'settings.json');
  if (fs.existsSync(settings) && inside(settings)) {
    if ((manifest.files['.claude/settings.json'] || []).includes(sha256(fs.readFileSync(settings)))) remove(settings, '.claude/settings.json');
    else {
      const config = readJson(settings);
      const ours = new Set(manifest.settingsCommands || []);
      if (!config) log('WARN: .claude/settings.json is not valid JSON — left as is');
      else if (stripHooks(config, (h) => ours.has(h?.command))) {
        if (Object.keys(config).length) writeJson(settings, config);
        else remove(settings, '.claude/settings.json');
        summary.stripped.push('.claude/settings.json');
      }
    }
  }
  const isDesign = (entry) => DESIGN_MARKERS.some((m) => JSON.stringify(entry || {}).replace(/\\\\/g, '/').includes(m));
  for (const rel of DESIGN_FILES) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs) || !inside(abs)) continue;
    const config = readJson(abs);
    if (!config) {
      log(`WARN: ${rel} is not valid JSON — left as is`);
      continue;
    }
    if (!stripHooks(config, isDesign)) continue;
    // Our template wrote only `version` and `hooks`; a file left with neither is ours to delete.
    if (!Object.keys(config).filter((k) => k !== 'version').length) remove(abs, rel);
    else {
      writeJson(abs, config);
      summary.stripped.push(rel);
    }
  }
  const hooksDir = gitHooksDir(root, summary, log);
  for (const name of hooksDir ? GIT_HOOKS : []) {
    const abs = path.join(hooksDir, name);
    let stat;
    try {
      stat = fs.lstatSync(abs);
    } catch {
      continue;
    }
    if (!stat.isFile()) {
      summary.skipped.push(`git hook ${name}`);
      continue;
    }
    if ((manifest.files[`git-hooks:${name}`] || []).includes(sha256(fs.readFileSync(abs)))) {
      fs.rmSync(abs, { force: true });
      summary.removed.push(`git hook ${name}`);
    } else if (/exonous|tron|claude-config/i.test(fs.readFileSync(abs, 'utf8'))) {
      summary.keptModified.push(`git hook ${name}`);
    }
  }
}

const canonical = (value) => JSON.stringify(value, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v));

/** package.json and npm's lockfile minus the exonous entries, so the v2.0.0 updater's own spec bump does not count as a change. */
function withoutOurs(file, data) {
  const copy = JSON.parse(JSON.stringify(data));
  const dropDeps = (obj) => {
    for (const key of ['dependencies', 'devDependencies']) {
      if (!obj || !obj[key]) continue;
      for (const name of DEPS) delete obj[key][name];
      if (!Object.keys(obj[key]).length) delete obj[key];
    }
  };
  if (file === 'package.json') dropDeps(copy);
  else {
    for (const name of DEPS) {
      if (copy.packages) delete copy.packages[`node_modules/${name}`];
      if (copy.dependencies) delete copy.dependencies[name];
    }
    if (copy.packages && copy.packages['']) dropDeps(copy.packages['']);
    if (copy.dependencies && !Object.keys(copy.dependencies).length) delete copy.dependencies;
  }
  return canonical(copy);
}

/** Clean = no change vs HEAD, or (package.json, package-lock.json) changes confined to the exonous entries. */
function onlyOurChanges(root, files) {
  const status = gitRead(root, ['status', '--porcelain', '--', ...files]);
  if (status === null) return { clean: false, why: 'git could not confirm package.json is committed' };
  for (const line of status.split('\n').filter(Boolean)) {
    const file = line.slice(3);
    const tolerant = ['package.json', 'package-lock.json'].includes(file) && line.slice(0, 2).trim() === 'M';
    const head = tolerant ? gitRead(root, ['show', `HEAD:${file}`]) : null;
    const now = tolerant ? readJson(path.join(root, file)) : null;
    let same = false;
    try {
      same = Boolean(head && now) && withoutOurs(file, JSON.parse(head)) === withoutOurs(file, now);
    } catch {
      same = false;
    }
    if (!same) return { clean: false, why: `${file} has uncommitted changes` };
  }
  return { clean: true };
}

function dropDependency(root, { lifecycle, env, log }) {
  const deps = packageDeps(root);
  if (!deps.length) return 'none';
  const hint = (why) => {
    log(`${why}: run \`exonous migrate\` in ${root} to drop the devDependency`);
    return 'note';
  };
  if (lifecycle) return hint('devDependency kept while a package-manager script is running');
  const { pm, lockfiles } = repoPm(root, env);
  const state = onlyOurChanges(root, ['package.json', ...lockfiles]);
  if (!state.clean) return hint(`devDependency kept: ${state.why}`);
  const verb = pm === 'npm' ? 'uninstall' : 'remove';
  const run = (args) => execFileSync(pm, args, {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10 * 60 * 1000, shell: process.platform === 'win32',
    env: { ...process.env, npm_config_ignore_scripts: 'true' },
  });
  // npm takes --ignore-scripts on every command (a config flag); pnpm and bun must list it for `remove`.
  if (pm !== 'npm') {
    let help = '';
    try {
      help = run([verb, '--help']);
    } catch (err) {
      help = `${err.stdout || ''}`;
    }
    if (!help.includes('--ignore-scripts')) return hint(`devDependency kept: \`${pm} ${verb}\` cannot skip lifecycle scripts`);
  }
  try {
    run([verb, ...(pm === 'npm' ? ['--ignore-scripts', '--no-audit', '--no-fund'] : ['--ignore-scripts']), ...deps]);
    log(`removed devDependency ${deps.join(', ')} with ${pm} (scripts disabled)`);
    return 'removed';
  } catch (err) {
    return hint(`${pm} could not remove ${deps.join(', ')} (${String(err.message).split('\n')[0]})`);
  }
}

function notice({ tools, gated }, log) {
  for (const line of [
    'exonous is now installed for this machine (triggered by this repo\'s exonous dependency):',
    `  tools configured: ${tools.join(', ') || 'none'}`,
    `  gate active for: ${gated.join(', ')} (commits, pushes and PRs need a review first)`,
    `  read more: ${DOCS}`,
    '  undo: exonous uninstall (or npx exonous uninstall)',
  ]) log(line);
}

/**
 * @param {{ root: string, manifest?: object, env?: NodeJS.ProcessEnv, log?: (m: string) => void, install?: () => { tools: string[] }, trigger?: 'repo'|'cli' }} options
 *   trigger 'repo' (setup/postinstall from a repo's node_modules) honors the opt-outs and announces what it did.
 */
function migrateRepo({ root, manifest = loadManifest(), env = process.env, log = (m) => process.stdout.write(`[exonous] ${m}\n`), install, trigger = 'cli' } = {}) {
  const summary = { status: 'nothing', removed: [], keptModified: [], stripped: [], skipped: [], notes: [], trackedRemoved: 0 };
  if (!root || !fs.existsSync(root)) return summary;
  // The repo itself may be reached through a symlink (or /tmp → /private/tmp); only what lies below it is checked.
  root = fs.realpathSync(root);
  if (!hasRepoInstall(root, manifest)) return summary;
  const lifecycle = Boolean(env.npm_lifecycle_event);
  const saved = process.env;
  process.env = env;
  try {
    const off = trigger === 'repo' && optedOut(env);
    if (off) {
      log(`machine install skipped (${off}); to migrate by hand run \`exonous install\`, then \`exonous migrate\` in ${root}`);
      return { ...summary, status: 'opted-out', reason: off };
    }
    const installed = (install || (() => require('../install').install({ log: (m) => { if (/^(WARN|⚠)/.test(m)) log(m); } })))() || { tools: [] };
    summary.global = globalAdd(require('../lib/runtime').packageVersion(), { lifecycle, log });
    const gate = machineGate(log);
    if (gate.error) {
      log(`repo left unchanged: ${gate.error} — run \`exonous install\`, then \`exonous migrate\` in ${root}`);
      return { ...summary, status: 'blocked', reason: gate.error };
    }
    if (trigger === 'repo') notice({ tools: installed.tools || [], gated: gate.gated }, log);
    cleanRepo(root, manifest, summary, log);
    summary.devDependency = dropDependency(root, { lifecycle, env, log });
  } finally {
    process.env = saved;
  }
  if (summary.keptModified.length) log(`kept (edited since install, review by hand): ${summary.keptModified.join(', ')}`);
  if (summary.skipped.length) log(`skipped (symlink or outside the repo): ${summary.skipped.join(', ')}`);
  log(`repo-mode install migrated: ${summary.removed.length} removed, ${summary.keptModified.length} kept, ${summary.stripped.length} config file(s) stripped, devDependency ${summary.devDependency}`);
  if (summary.trackedRemoved) log(`${summary.trackedRemoved} tracked file(s) deleted — commit the cleanup`);
  return { ...summary, status: 'migrated' };
}

/** The repo that owns a node_modules copy of exonous (first node_modules segment), or null. */
function repoOf(packageRoot) {
  let real = packageRoot;
  try {
    real = fs.realpathSync(packageRoot);
  } catch {
    // keep the given path
  }
  const i = real.split(path.sep).indexOf('node_modules');
  return i > 0 ? real.split(path.sep).slice(0, i).join(path.sep) || path.sep : null;
}

/** v2 wrote repo files into INIT_CWD, which may be a workspace below the repo that owns node_modules. */
function migrationRoot(packageRoot, env = process.env) {
  const repo = repoOf(packageRoot);
  const init = env.INIT_CWD && path.resolve(env.INIT_CWD);
  return init && repo && (init === repo || init.startsWith(`${repo}${path.sep}`)) ? init : repo;
}

module.exports = { migrateRepo, migrationRoot, repoOf, repoPm, hasRepoInstall, loadManifest };
