#!/usr/bin/env node
'use strict';

// maintainer/release.js — CI release gate. `check <base-ref>`: preview the bump a PR gets on merge; the version never goes down.
// `bump`: raise package.json from the newest tag by the commits since it. `tag`: push the annotated vX.Y.Z tag, once.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const LEVELS = ['patch', 'minor', 'major'];

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const parts = (version) => VERSION.exec(version).slice(1).map(Number);

function compare(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

function readVersion(text, where) {
  const { version } = JSON.parse(text);
  if (!VERSION.test(String(version))) throw new Error(`${where}: version "${version}" is not X.Y.Z`);
  return version;
}

const shippedBy = (files) => (file) => files.some((entry) => (entry.endsWith('/') ? file.startsWith(entry) : file === entry));

// docs commits never release; feat → minor, `type!:` or BREAKING CHANGE → major, anything else → patch.
function levelOf(subject, body) {
  const [, type = '', bang = ''] = /^(\w+)(?:\([^)]*\))?(!?):/.exec(subject) || [];
  if (type.toLowerCase() === 'docs') return null;
  if (bang || /^BREAKING[ -]CHANGE:/m.test(body)) return 'major';
  return type.toLowerCase() === 'feat' ? 'minor' : 'patch';
}

/** @returns {'patch'|'minor'|'major'|null} highest level among non-merge commits in `range` that touch shipped files */
function levelFor(range, files, cwd) {
  const isShipped = shippedBy(files);
  const log = git(['log', '--no-merges', '--format=%H%x1f%s%x1f%b%x1e', range], cwd);
  const levels = log.split('\x1e').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [sha, subject, body = ''] = entry.split('\x1f');
    const changed = git(['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', sha], cwd).split('\n').filter(Boolean);
    return changed.some(isShipped) ? levelOf(subject, body) : null;
  });
  return levels.filter(Boolean).sort((a, b) => LEVELS.indexOf(a) - LEVELS.indexOf(b)).pop() || null;
}

function raise(version, level) {
  const [major, minor, patch] = parts(version);
  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

const newestTag = (cwd) => git(['tag', '--list', 'v*'], cwd).split('\n').map((t) => t.slice(1)).filter((v) => VERSION.test(v)).sort(compare).pop();

/** @returns {{ ok: boolean, message: string }} */
function check(base, cwd = process.cwd()) {
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  const head = readVersion(JSON.stringify(pkg), 'package.json');
  const before = readVersion(git(['show', `${base}:package.json`], cwd), `${base}:package.json`);
  const order = compare(head, before);
  if (order < 0) return { ok: false, message: `version went down: ${before} → ${head}` };
  if (order > 0 && git(['tag', '--list', `v${head}`], cwd)) return { ok: false, message: `v${head} is already released — pick a higher version` };
  if (order > 0) return { ok: true, message: `release v${head} on merge (was ${before})` };
  const level = levelFor(`${base}...HEAD`, pkg.files || [], cwd);
  return { ok: true, message: level ? `${level} bump on merge (from ${before})` : 'no shipped change, no release' };
}

/** @returns {{ status: 'bumped'|'kept'|'none', version: string }} newest tag + highest level since it; a higher manual bump stays */
function bump(cwd = process.cwd()) {
  const file = path.join(cwd, 'package.json');
  const text = fs.readFileSync(file, 'utf8');
  const current = readVersion(text, 'package.json');
  const released = newestTag(cwd);
  const level = levelFor(released ? `v${released}..HEAD` : 'HEAD', JSON.parse(text).files || [], cwd);
  if (!level) return { status: 'none', version: current };
  const target = raise(released || current, level);
  if (compare(current, target) >= 0) return { status: 'kept', version: current };
  fs.writeFileSync(file, text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${target}$2`));
  return { status: 'bumped', version: target };
}

/** @returns {{ status: 'tagged'|'exists', tag: string }} */
function tag(cwd = process.cwd(), { push = true } = {}) {
  const version = readVersion(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'), 'package.json');
  const name = `v${version}`;
  if (git(['tag', '--list', name], cwd)) return { status: 'exists', tag: name };
  const newest = newestTag(cwd);
  if (newest && compare(version, newest) <= 0) throw new Error(`${name} is not above the newest release v${newest}`);
  git(['tag', '-a', name, '-m', `exonous ${name}`], cwd);
  if (push) git(['push', 'origin', `refs/tags/${name}`], cwd);
  return { status: 'tagged', tag: name };
}

if (require.main === module) {
  const [cmd, base] = process.argv.slice(2);
  try {
    if (cmd === 'check' && base) {
      const result = check(base);
      console.log(result.message);
      process.exit(result.ok ? 0 : 1);
    } else if (cmd === 'bump') {
      const result = bump();
      console.log(result.status === 'bumped' ? `bumped to ${result.version}` : `${result.status}: ${result.version}`);
    } else if (cmd === 'tag') {
      const result = tag();
      console.log(result.status === 'tagged' ? `pushed ${result.tag}` : `${result.tag} already exists — nothing to release`);
    } else {
      console.error('usage: node maintainer/release.js check <base-ref> | bump | tag');
      process.exit(2);
    }
  } catch (err) {
    console.error(`release: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { check, bump, tag, compare };
