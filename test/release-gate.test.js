#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { test } = require('node:test');
const { check, tag } = require('../maintainer/release');

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

test('a PR that changes shipped files must raise the version; docs-only changes need none', () => withEnv(() => {
  const r = repo();
  r.write('docs/x.md', 'y\n');
  r.save('docs');
  assert.deepStrictEqual(check('main', r.dir), { ok: true, message: 'no shipped change, no release' });
  r.write('src/a.js', '2\n');
  r.save('feat');
  const blocked = check('main', r.dir);
  assert.strictEqual(blocked.ok, false);
  assert.match(blocked.message, /shipped files changed without a version bump \(still 1\.0\.0\): src\/a\.js/);
  r.version('1.1.0');
  r.save('release');
  assert.deepStrictEqual(check('main', r.dir), { ok: true, message: 'release v1.1.0 on merge (was 1.0.0)' });
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
