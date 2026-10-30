#!/usr/bin/env node
'use strict';

// maintainer/release.js — CI release gate. `check <base-ref>`: a change to shipped files must raise the version.
// `tag`: create and push the annotated vX.Y.Z tag for package.json's version, once, never below the newest tag.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

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

/** @returns {{ ok: boolean, message: string }} */
function check(base, cwd = process.cwd()) {
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  const head = readVersion(JSON.stringify(pkg), 'package.json');
  const before = readVersion(git(['show', `${base}:package.json`], cwd), `${base}:package.json`);
  const shipped = git(['diff', '--name-only', `${base}...HEAD`], cwd).split('\n').filter(Boolean).filter(shippedBy(pkg.files || []));
  const order = compare(head, before);
  if (order < 0) return { ok: false, message: `version went down: ${before} → ${head}` };
  if (order > 0 && git(['tag', '--list', `v${head}`], cwd)) return { ok: false, message: `v${head} is already released — pick a higher version` };
  if (shipped.length && order === 0) {
    return { ok: false, message: `shipped files changed without a version bump (still ${head}): ${shipped.join(', ')} — run \`npm version patch|minor --no-git-tag-version\`` };
  }
  return { ok: true, message: order > 0 ? `release v${head} on merge (was ${before})` : 'no shipped change, no release' };
}

/** @returns {{ status: 'tagged'|'exists', tag: string }} */
function tag(cwd = process.cwd(), { push = true } = {}) {
  const version = readVersion(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'), 'package.json');
  const name = `v${version}`;
  if (git(['tag', '--list', name], cwd)) return { status: 'exists', tag: name };
  const newest = git(['tag', '--list', 'v*'], cwd).split('\n').map((t) => t.slice(1)).filter((v) => VERSION.test(v)).sort(compare).pop();
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
    } else if (cmd === 'tag') {
      const result = tag();
      console.log(result.status === 'tagged' ? `pushed ${result.tag}` : `${result.tag} already exists — nothing to release`);
    } else {
      console.error('usage: node maintainer/release.js check <base-ref> | tag');
      process.exit(2);
    }
  } catch (err) {
    console.error(`release: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { check, tag, compare };
