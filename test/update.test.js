#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { test } = require('node:test');
const { fixture, ROOT } = require('./helpers/selfupdate-fixture');
const { describe } = require('../src/update');

const BIN = path.join(ROOT, 'bin', 'exonous.js');
const skip = process.platform === 'win32' ? 'sh shims' : false;
const cli = (fx, args, env = {}) => spawnSync(process.execPath, [BIN, 'update', ...args], { env: { ...fx.env, ...env }, encoding: 'utf8' });

test('update --check reports the newer release and changes nothing', { skip }, () => {
  const fx = fixture();
  const res = cli(fx, ['--check']);
  assert.strictEqual(res.status, 0, res.stderr);
  assert.match(res.stdout, /update available: v2\.1\.0 → v2\.2\.0/);
  assert.deepStrictEqual(fx.pmCalls(), []);
  assert.strictEqual(fx.info().version, '2.1.0');
});

test('update applies the release and prints the result', { skip }, () => {
  const fx = fixture();
  const res = cli(fx, []);
  assert.strictEqual(res.status, 0, res.stderr);
  assert.match(res.stdout, /exonous updated v2\.1\.0 → v2\.2\.0/);
  assert.strictEqual(fx.info().version, '2.2.0');
});

test('update --check points at --major when only a new major exists', { skip }, () => {
  const fx = fixture({ tags: ['v2.1.0', 'v3.0.0'] });
  assert.match(cli(fx, ['--check']).stdout, /up to date \(v2\.1\.0\)\. v3\.0\.0 is a new major — run `exonous update --major`/);
  assert.match(cli(fx, ['--check', '--major']).stdout, /update available: v2\.1\.0 → v3\.0\.0/);
});

test('a failed update exits 1 with the reason', { skip }, () => {
  const fx = fixture({ env: { SHIM_FAIL: '1' } });
  const res = cli(fx, []);
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /update to v2\.2\.0 failed: .*registry unreachable/);
});

test('update --background is silent, honors opt-outs and leaves its result in the note', { skip }, () => {
  const off = fixture({ config: { autoUpdate: false } });
  assert.strictEqual(cli(off, ['--background']).stdout, '');
  assert.deepStrictEqual(off.pmCalls(), []);
  const fx = fixture();
  const res = cli(fx, ['--background']);
  assert.strictEqual(res.status, 0);
  assert.strictEqual(res.stdout, '');
  assert.match(fx.note(), /exonous updated v2\.1\.0 → v2\.2\.0/);
});

test('an unreachable source is an error, not a crash', { skip }, () => {
  const fx = fixture();
  const res = cli(fx, ['--check'], { EXONOUS_RELEASE_SOURCE: `file://${path.join(fx.dir, 'missing.git')}` });
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /exonous update/);
  assert.ok(!fs.existsSync(path.join(fx.state, 'note')));
});

test('doctor shows the last check and flags a moved release tag', { skip }, () => {
  const fx = fixture();
  const doctor = () => spawnSync(process.execPath, [BIN, 'doctor'], { env: fx.env, encoding: 'utf8' }).stdout;
  assert.match(doctor(), /✓ self-update \(never checked\)/);
  assert.match(doctor(), /✓ release tag unchanged since install/);
  fx.put('tag-moved.json', JSON.stringify({ version: '2.1.0', expected: 'a'.repeat(40), actual: 'b'.repeat(40) }));
  assert.match(doctor(), /✗ release tag unchanged since install \(v2\.1\.0 now points to bbbbbbbbbbbb, installed from aaaaaaaaaaaa\)/);
});

test('every status has a message', () => {
  for (const status of ['not-installed', 'pinned', 'no-release', 'current', 'available', 'updated', 'busy', 'isolated', 'disabled', 'failed', 'error']) {
    assert.ok(describe({ status, from: '2.1.0', to: '2.2.0' }), status);
  }
});
