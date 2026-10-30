#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, beforeEach, afterEach } = require('node:test');
const token = require('../assets/machine/hooks/lib/token.cjs');
const { repoKey, stateDir } = require('../assets/machine/hooks/lib/paths.cjs');

const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

let prevHome;
beforeEach(() => {
  prevHome = process.env.EXONOUS_HOME;
  process.env.EXONOUS_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'token-home-'));
});
afterEach(() => {
  if (prevHome === undefined) delete process.env.EXONOUS_HOME;
  else process.env.EXONOUS_HOME = prevHome;
});

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-repo-'));
  git(dir, 'init', '-q', '-b', 'feat/x');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '--no-gpg-sign', '-m', 'init');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b');
  git(dir, 'add', 'b.txt');
  return dir;
}

test('no token means no commit', () => {
  assert.deepStrictEqual(token.consume('commit', repo()), { ok: false, reason: 'none' });
});

test('a commit token matching the staged tree allows once', () => {
  const dir = repo();
  token.mint('commit', dir);
  const file = path.join(stateDir(), 'commit', `${repoKey(dir)}.json`);
  assert.ok(fs.existsSync(file));
  if (process.platform !== 'win32') assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepStrictEqual(token.verify('commit', dir), { ok: true });
  assert.deepStrictEqual(token.consume('commit', dir), { ok: true });
  assert.deepStrictEqual(token.consume('commit', dir), { ok: false, reason: 'none' });
});

test('the token is keyed by the real repo root, so a subdirectory finds it', () => {
  const dir = repo();
  fs.mkdirSync(path.join(dir, 'sub'));
  token.mint('commit', dir);
  assert.strictEqual(repoKey(path.join(dir, 'sub')), repoKey(dir));
  assert.deepStrictEqual(token.consume('commit', path.join(dir, 'sub')), { ok: true });
});

test('staging anything after minting invalidates the commit token', () => {
  const dir = repo();
  token.mint('commit', dir);
  fs.writeFileSync(path.join(dir, 'c.txt'), 'c');
  git(dir, 'add', 'c.txt');
  assert.deepStrictEqual(token.consume('commit', dir), { ok: false, reason: 'mismatch' });
});

test('an expired token is refused and removed', () => {
  const dir = repo();
  token.mint('commit', dir, { now: Date.now() - token.TTL_MS - 1000 });
  assert.deepStrictEqual(token.consume('commit', dir), { ok: false, reason: 'expired' });
  assert.deepStrictEqual(token.verify('commit', dir), { ok: false, reason: 'none' });
});

test('a push token binds to HEAD and is independent of the commit token', () => {
  const dir = repo();
  token.mint('push', dir);
  assert.deepStrictEqual(token.verify('commit', dir), { ok: false, reason: 'none' });
  git(dir, 'commit', '-q', '--no-gpg-sign', '-m', 'b');
  assert.deepStrictEqual(token.verify('push', dir), { ok: false, reason: 'mismatch' });
  token.mint('push', dir);
  assert.deepStrictEqual(token.consume('push', dir), { ok: true });
});

test('a corrupt token file is refused, never trusted', () => {
  const dir = repo();
  token.mint('commit', dir);
  fs.writeFileSync(path.join(stateDir(), 'commit', `${repoKey(dir)}.json`), '{not json');
  assert.deepStrictEqual(token.consume('commit', dir), { ok: false, reason: 'invalid' });
});

test('unknown kinds and non-repos throw on mint', () => {
  assert.throws(() => token.mint('merge', repo()), /kind/);
  assert.throws(() => token.mint('commit', fs.mkdtempSync(path.join(os.tmpdir(), 'not-repo-'))), /git/);
});

test('concurrent consumers: exactly one wins the token', async () => {
  const dir = repo();
  token.mint('commit', dir);
  const { spawn } = require('child_process');
  const script = `const t=require(${JSON.stringify(path.join(__dirname, '..', 'assets', 'machine', 'hooks', 'lib', 'token.cjs'))});process.stdout.write(JSON.stringify(t.consume('commit', ${JSON.stringify(dir)})));`;
  const runs = Array.from({ length: 8 }, () => new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', script], { env: process.env });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', () => resolve(JSON.parse(out || '{}')));
  }));
  const results = await Promise.all(runs);
  assert.strictEqual(results.filter((r) => r.ok).length, 1);
});

test('minting refuses when the exonous dir belongs to another uid (no root-owned token files)', { skip: process.platform === 'win32' ? 'no uids' : false }, () => {
  const dir = repo();
  token.mint('commit', dir);
  const saved = { t: process.env.EXONOUS_TEST, u: process.env.EXONOUS_TEST_UID };
  process.env.EXONOUS_TEST = '1';
  process.env.EXONOUS_TEST_UID = String(process.getuid() + 1);
  try {
    assert.throws(() => token.mint('commit', dir), /owned by uid \d+.*sudo chown/);
  } finally {
    for (const [k, v] of [['EXONOUS_TEST', saved.t], ['EXONOUS_TEST_UID', saved.u]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('verify and consume can check explicit source shas', () => {
  const dir = repo();
  git(dir, 'commit', '-q', '--no-gpg-sign', '-m', 'b');
  const head = git(dir, 'rev-parse', 'HEAD');
  const parent = git(dir, 'rev-parse', 'HEAD~1');
  token.mint('push', dir);
  assert.deepStrictEqual(token.verify('push', dir, [head, parent]), { ok: false, reason: 'mismatch' });
  assert.deepStrictEqual(token.verify('push', dir, [head]), { ok: true });
  assert.deepStrictEqual(token.consume('push', dir, [parent]), { ok: false, reason: 'mismatch' });
});
