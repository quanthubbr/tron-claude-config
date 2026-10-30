'use strict';

// exonous update: moves the consumer to the latest vX.Y.Z release tag, then re-runs setup from the new code.
// A spec pinned to anything other than a release tag (commit, branch) is the user's choice and is left alone.
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const NAME = 'exonous';
const LEGACY_NAMES = ['@tron/claude-config'];
const RELEASE_REF = /^v(\d+)\.(\d+)\.(\d+)$/;
const LOCK_STALE_MS = 10 * 60 * 1000;
const PM_COMMANDS = {
  npm: { add: ['install', '--save-dev', '--no-audit', '--no-fund'], remove: ['uninstall'], install: ['install', '--no-audit', '--no-fund'] },
  pnpm: { add: ['add', '-D'], remove: ['remove'], install: ['install'] },
  bun: { add: ['add', '-d'], remove: ['remove'], install: ['install'] },
};

function detectPm(root) {
  if (['bun.lockb', 'bun.lock'].some((f) => fs.existsSync(path.join(root, f)))) return 'bun';
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  return 'npm';
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** @returns {{ name: string, spec: string } | null} */
function findDependency(root) {
  const pkg = readJson(path.join(root, 'package.json')) || {};
  for (const name of [NAME, ...LEGACY_NAMES]) {
    const spec = (pkg.devDependencies || {})[name] || (pkg.dependencies || {})[name];
    if (spec) return { name, spec: String(spec) };
  }
  return null;
}

function legacyDependencies(root) {
  const pkg = readJson(path.join(root, 'package.json')) || {};
  return LEGACY_NAMES.filter((name) => (pkg.devDependencies || {})[name] || (pkg.dependencies || {})[name]);
}

function splitSpec(spec) {
  const at = spec.indexOf('#');
  return at === -1 ? { base: spec, ref: '' } : { base: spec.slice(0, at), ref: spec.slice(at + 1) };
}

/** Git URL `git ls-remote` can read, or null for registry/local-folder specs. */
function remoteUrl(base) {
  if (base.startsWith('git+')) return base.slice(4);
  if (/^(git|ssh|https?):\/\//.test(base) && /\.git$|github\.com/.test(base)) return base;
  const slug = /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(base);
  return slug ? `https://github.com/${slug[1].replace(/\.git$/, '')}.git` : null;
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function latestRelease(url) {
  const out = execFileSync('git', ['ls-remote', '--tags', '--refs', url, 'v*'], {
    encoding: 'utf8',
    timeout: 30000,
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  const versions = out.split('\n')
    .map((line) => RELEASE_REF.exec(line.split('refs/tags/')[1] || ''))
    .filter(Boolean)
    .map((m) => [Number(m[1]), Number(m[2]), Number(m[3])])
    .sort(compareVersions);
  return versions.length ? versions[versions.length - 1].join('.') : null;
}

function installedVersion(root) {
  for (const name of [NAME, ...LEGACY_NAMES]) {
    const pkg = readJson(path.join(root, 'node_modules', name, 'package.json'));
    if (pkg?.name === NAME) return { dir: path.join(root, 'node_modules', name), version: pkg.version };
  }
  return null;
}

function run(pm, args, root) {
  const res = spawnSync(pm, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  if (res.status !== 0) throw new Error(`${pm} ${args.join(' ')} failed: ${(res.stderr || res.error?.message || '').trim().split('\n').pop()}`);
}

function withLock(root, fn) {
  const lock = path.join(root, '.claude', '.exonous', 'update.lock');
  try {
    if (Date.now() - fs.statSync(lock).mtimeMs < LOCK_STALE_MS) return { status: 'busy' };
  } catch {
    // no lock yet
  }
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  fs.writeFileSync(lock, String(process.pid));
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

/**
 * @param {{ root?: string, check?: boolean }} [options] check: report only, change nothing.
 * @returns {{ status: 'absent'|'pinned'|'unknown-source'|'no-release'|'current'|'available'|'updated'|'busy', from?: string, to?: string }}
 */
function update({ root = process.cwd(), check = false } = {}) {
  const dep = findDependency(root);
  if (!dep) return { status: 'absent' };
  const { base, ref } = splitSpec(dep.spec);
  if (ref && !RELEASE_REF.test(ref)) return { status: 'pinned', from: ref };
  const url = remoteUrl(base);
  if (!url) return { status: 'unknown-source' };
  const latest = latestRelease(url);
  if (!latest) return { status: 'no-release' };

  const installed = installedVersion(root);
  const target = `${base}#v${latest}`;
  const from = installed?.version;
  const inPlace = installed && path.basename(installed.dir) === NAME;
  const legacyDeps = legacyDependencies(root);
  if (dep.name === NAME && dep.spec === target && from === latest && inPlace && !legacyDeps.length) return { status: 'current', to: latest };
  if (check) return { status: 'available', from, to: latest };

  return withLock(root, () => {
    const pm = detectPm(root);
    const cmds = PM_COMMANDS[pm];
    // Add before removing the legacy name: a failed add must leave the old install working.
    run(pm, [...cmds.add, `${NAME}@${target}`], root);
    for (const name of legacyDeps) {
      try {
        run(pm, [...cmds.remove, name], root);
      } catch {
        // Non-fatal: the next update retries while the legacy name stays listed.
      }
    }
    // npm keeps a package installed under a key that left package.json; it would shadow the real one in kairos.
    for (const legacy of LEGACY_NAMES) {
      const dir = path.join(root, 'node_modules', legacy);
      fs.rmSync(dir, { recursive: true, force: true });
      const scope = path.dirname(dir);
      if (path.basename(scope).startsWith('@') && fs.existsSync(scope) && !fs.readdirSync(scope).length) fs.rmdirSync(scope);
    }
    // pnpm and bun skip dependency lifecycle scripts, so setup is run explicitly from the new code.
    execFileSync(process.execPath, [path.join(root, 'node_modules', NAME, 'bin', 'exonous.js'), 'setup'], {
      cwd: root,
      env: { ...process.env, INIT_CWD: root },
      stdio: 'ignore',
    });
    return { status: 'updated', from, to: latest };
  });
}

module.exports = { update, findDependency, legacyDependencies, remoteUrl, latestRelease, detectPm, splitSpec };
