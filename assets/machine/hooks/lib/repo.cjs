'use strict';

// Self-contained: copied to ~/.claude/exonous/hooks/lib/, node builtins only. Repo mode = the machine runs from a copy in <repo>/node_modules.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { gitOut } = require('./paths.cjs');

const DEPS = ['exonous', '@tron/claude-config'];
const LOCKFILES = { npm: ['package-lock.json'], pnpm: ['pnpm-lock.yaml'], bun: ['bun.lock', 'bun.lockb'] };
const RELEASE_REF = /^v\d+\.\d+\.\d+$/;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** @returns {{ name: string, spec: string, field: string } | null} the exonous entry of the repo's package.json */
function readDep(root) {
  const pkg = readJson(path.join(root, 'package.json')) || {};
  for (const field of ['devDependencies', 'dependencies']) {
    for (const name of DEPS) {
      const spec = (pkg[field] || {})[name];
      if (typeof spec === 'string' && spec) return { name, spec, field };
    }
  }
  return null;
}

/**
 * The git repo whose node_modules holds this package copy and declares it, or null (global copies, dev checkouts).
 * pnpm, yarn and bun keep global packages under a package.json of their own; only a git work tree is a repo.
 */
function repoOf(packageRoot) {
  if (!packageRoot) return null;
  let real = packageRoot;
  try {
    real = fs.realpathSync(packageRoot);
  } catch {
    // keep the given path
  }
  const parts = real.split(path.sep);
  const i = parts.indexOf('node_modules');
  if (i <= 0) return null;
  const root = parts.slice(0, i).join(path.sep) || path.sep;
  if (!readDep(root)) return null;
  return (gitOut(root, ['rev-parse', '--is-inside-work-tree']) || '').trim() === 'true' ? root : null;
}

/** A global install recorded in install.json whose package still exists: it takes precedence over any repo copy. */
function globalPrevails(info) {
  const root = info && info.packageRoot;
  return typeof root === 'string' && fs.existsSync(path.join(root, 'package.json')) && !repoOf(root);
}

/** Repo pm: `packageManager` field, then the lockfile; npm when nothing says otherwise. */
function repoPm(root) {
  const field = /^(npm|pnpm|bun)@/.exec(String((readJson(path.join(root, 'package.json')) || {}).packageManager || ''));
  const byLock = Object.entries(LOCKFILES).find(([, files]) => files.some((f) => fs.existsSync(path.join(root, f))));
  const pm = (field && field[1]) || (byLock && byLock[0]) || 'npm';
  return { pm, lockfiles: LOCKFILES[pm].filter((f) => fs.existsSync(path.join(root, f))) };
}

function splitSpec(spec) {
  const at = spec.indexOf('#');
  return at === -1 ? { base: spec, ref: '' } : { base: spec.slice(0, at), ref: spec.slice(at + 1) };
}

// Background updates run code from the source: only the canonical repo and its quanthub mirror qualify.
const SOURCES = ['zaqueu-1/exonous', 'quanthubbr/tron-claude-config'];

/** The release source of a GitHub spec base (`owner/repo`, `github:`, https, ssh, git+…), or null for anything else. */
function remoteUrl(base) {
  const m = /^(?:github:|(?:git\+)?(?:https:\/\/|ssh:\/\/git@|git@)github\.com[/:])?([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(base);
  const slug = m && SOURCES.find((s) => s === m[1].toLowerCase());
  return slug ? `https://github.com/${slug}.git` : null;
}

/**
 * Where a repo-mode machine install follows releases: the source and ref of the repo's own dependency spec.
 * @returns {{ root: string, dep: { name: string, spec: string, field: string }, base: string, ref: string, url: string | null } | null}
 */
function repoSource(info) {
  const root = repoOf(info && info.packageRoot);
  const dep = root && readDep(root);
  if (!dep) return null;
  const { base, ref } = splitSpec(dep.spec);
  return { root, dep, base, ref, url: remoteUrl(base) };
}

const pinned = (ref) => Boolean(ref) && !RELEASE_REF.test(ref);

// win32 needs a shell for .cmd shims: the pm name is fixed and every arg is a literal.
function pmRun(pm, args, cwd) {
  const win = process.platform === 'win32';
  return execFileSync(pm, args, {
    cwd, encoding: 'utf8', timeout: 10 * 60 * 1000, stdio: ['ignore', 'pipe', 'pipe'], shell: win, windowsHide: true,
    env: { ...process.env, npm_config_ignore_scripts: 'true' },
  });
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Rewrites only the spec string of the dependency, keeping the file's formatting. */
function writeSpec(root, name, from, to) {
  const file = path.join(root, 'package.json');
  const text = fs.readFileSync(file, 'utf8');
  const entry = new RegExp(`(${escape(JSON.stringify(name))}\\s*:\\s*)${escape(JSON.stringify(from))}`);
  if (!entry.test(text)) throw new Error(`could not find ${name} in ${file}`);
  fs.writeFileSync(file, text.replace(entry, (_, head) => `${head}${JSON.stringify(to)}`));
}

/**
 * Moves the repo's dependency to the release tag and reinstalls with the repo's pm, scripts disabled.
 * Refuses while package.json or the lockfile has uncommitted changes: the bump must be the only change there.
 * @returns {string} the package root of the new copy
 */
function bumpRepo(source, version) {
  const { root, dep, base } = source;
  const { pm, lockfiles } = repoPm(root);
  const dirty = gitOut(root, ['status', '--porcelain', '--', 'package.json', ...lockfiles]);
  if (dirty === null) throw new Error(`git could not read the status of ${root}`);
  if (dirty.trim()) throw new Error(`${root}: package.json or its lockfile has uncommitted changes — commit them, then run \`exonous update\``);
  const target = `${base}#v${version}`;
  writeSpec(root, dep.name, dep.spec, target);
  try {
    pmRun(pm, pm === 'npm' ? ['install', '--ignore-scripts', '--no-audit', '--no-fund'] : ['install', '--ignore-scripts'], root);
  } catch (err) {
    writeSpec(root, dep.name, target, dep.spec);
    throw err;
  }
  return path.join(root, 'node_modules', ...dep.name.split('/'));
}

module.exports = { DEPS, LOCKFILES, readDep, repoOf, globalPrevails, repoPm, splitSpec, remoteUrl, repoSource, pinned, bumpRepo };
