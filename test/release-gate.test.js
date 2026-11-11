#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { test } = require('node:test');
const { check, bump, tag } = require('../maintainer/release');

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
};

function repo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'release-gate-')));
  const git = (...args) => execFileSync('git', args, { cwd: dir, env: GIT_ENV, encoding: 'utf8' }).trim();
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  const version = (v) => write('package.json', `${JSON.stringify({ name: 'x', version: v, files: ['src/', 'README.md'] }, null, 2)}\n`);
  const save = (msg) => {
    git('add', '-A');
    git('commit', '-q', '-m', msg);
  };
  git('init', '-q', '-b', 'main');
  version('1.0.0');
  write('src/a.js', '1\n');
  write('docs/x.md', 'x\n');
  save('init');
  git('tag', '-a', 'v1.0.0', '-m', 'v1.0.0');
  git('switch', '-q', '-c', 'pr');
  return { dir, git, write, version, save };
}

// The gate's own git calls (annotated tags need a committer) run in-process.
const withEnv = (fn) => {
  const saved = { ...process.env };
  Object.assign(process.env, GIT_ENV);
  try {
    return fn();
  } finally {
    process.env = saved;
  }
};

test('check previews the bump a PR gets on merge; docs-only changes need none', () => withEnv(() => {
  const r = repo();
  r.write('docs/x.md', 'y\n');
  r.save('docs: notes');
  assert.deepStrictEqual(check('main', r.dir), { ok: true, message: 'no shipped change, no release' });
  r.write('src/a.js', '2\n');
  r.save('feat: thing');
  assert.deepStrictEqual(check('main', r.dir), { ok: true, message: 'minor bump on merge (from 1.0.0)' });
  r.version('1.1.0');
  r.save('chore: release');
  assert.deepStrictEqual(check('main', r.dir), { ok: true, message: 'release v1.1.0 on merge (was 1.0.0)' });
}));

test('bump raises the newest tag by the highest level since it and skips docs commits', () => withEnv(() => {
  const r = repo();
  r.write('src/a.js', 'docs\n');
  r.save('docs: shipped wording');
  assert.deepStrictEqual(bump(r.dir), { status: 'none', version: '1.0.0' });
  r.write('docs/x.md', 'y\n');
  r.save('feat: unshipped');
  assert.deepStrictEqual(bump(r.dir), { status: 'none', version: '1.0.0' });
  r.write('src/a.js', 'fix\n');
  r.save('fix(cli): thing');
  assert.deepStrictEqual(bump(r.dir), { status: 'bumped', version: '1.0.1' });
  assert.deepStrictEqual(bump(r.dir), { status: 'kept', version: '1.0.1' }, 'idempotent');
  r.save('chore: release v1.0.1');
  r.write('src/a.js', 'feat\n');
  r.save('feat: new skill');
  assert.deepStrictEqual(bump(r.dir), { status: 'bumped', version: '1.1.0' }, 'an untagged patch bump still rises to minor');
  r.write('src/b.js', 'x\n');
  r.save('refactor!: drop old flag');
  assert.deepStrictEqual(bump(r.dir), { status: 'bumped', version: '2.0.0' });
  assert.match(fs.readFileSync(path.join(r.dir, 'package.json'), 'utf8'), /"version": "2\.0\.0",\n/);
}));

test('bump keeps a manual bump at or above the computed one', () => withEnv(() => {
  const r = repo();
  r.write('src/a.js', '2\n');
  r.version('1.3.0');
  r.save('fix: thing');
  assert.deepStrictEqual(bump(r.dir), { status: 'kept', version: '1.3.0' });
  r.write('src/a.js', '3\n');
  r.save('fix: other\n\nBREAKING CHANGE: install contract');
  assert.deepStrictEqual(bump(r.dir), { status: 'bumped', version: '2.0.0' });
}));

test('the version may never go down or reuse a released tag', () => withEnv(() => {
  const r = repo();
  r.git('tag', '-a', 'v1.1.0', '-m', 'v1.1.0');
  r.version('1.1.0');
  r.save('reuse');
  assert.match(check('main', r.dir).message, /v1\.1\.0 is already released/);
  r.version('0.9.0');
  r.save('down');
  assert.match(check('main', r.dir).message, /version went down: 1\.0\.0 → 0\.9\.0/);
}));

test('tag creates the annotated tag once and never below the newest release', () => withEnv(() => {
  const r = repo();
  r.version('1.2.0');
  r.save('release');
  assert.deepStrictEqual(tag(r.dir, { push: false }), { status: 'tagged', tag: 'v1.2.0' });
  assert.strictEqual(r.git('cat-file', '-t', 'v1.2.0'), 'tag', 'annotated');
  assert.strictEqual(r.git('rev-parse', 'v1.2.0^{commit}'), r.git('rev-parse', 'HEAD'));
  assert.deepStrictEqual(tag(r.dir, { push: false }), { status: 'exists', tag: 'v1.2.0' });
  r.version('1.1.5');
  r.save('older');
  assert.throws(() => tag(r.dir, { push: false }), /v1\.1\.5 is not above the newest release v1\.2\.0/);
}));
