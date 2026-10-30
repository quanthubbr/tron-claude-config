#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const { fixture, runLib, DAY_MS } = require('./helpers/selfupdate-fixture');

const skip = process.platform === 'win32' ? 'sh shims' : false;
const npmArgv = (sha) => `npm i -g --no-audit --no-fund github:zaqueu-1/exonous#${sha}`;

test('a newer same-major release is installed by its tag commit, then installed from the new root', { skip }, () => {
  const fx = fixture();
  const sha = fx.repo.shas['v2.2.0'];
  const res = runLib(fx, 'run', { background: true });
  assert.strictEqual(res.status, 'updated');
  assert.deepStrictEqual(fx.installs(), [npmArgv(sha)]);
  assert.deepStrictEqual(fx.installCalls(), ['install --quiet']);
  const info = fx.info();
  assert.strictEqual(info.version, '2.2.0');
  assert.strictEqual(info.ref, 'v2.2.0');
  assert.strictEqual(info.tagSha, sha);
  assert.strictEqual(fx.note(), 'exonous updated v2.1.0 → v2.2.0 (restart to load new hooks)');
  assert.ok(!fs.existsSync(path.join(fx.state, 'update.lock')), 'lock released');
});

test('a lightweight release tag installs its commit too', { skip }, () => {
  const fx = fixture({ tags: ['v2.1.0', 'v2.2.0'] });
  assert.strictEqual(runLib(fx, 'run', {}).status, 'updated');
  assert.deepStrictEqual(fx.installs(), [npmArgv(fx.repo.shas['v2.2.0'])]);
  assert.strictEqual(fx.info().tagSha, fx.repo.shas['v2.2.0']);
});

test('pnpm and bun use their own global add, global root and lockfile', { skip }, () => {
  const pnpm = fixture({ pm: 'pnpm' });
  const sha = pnpm.repo.shas['v2.2.0'];
  assert.strictEqual(runLib(pnpm, 'run', { background: true }).status, 'updated');
  assert.deepStrictEqual(pnpm.pmCalls(), [`pnpm add -g github:zaqueu-1/exonous#${sha}`, 'pnpm root -g']);
  const bun = fixture({ pm: 'bun' });
  assert.strictEqual(runLib(bun, 'run', { background: true }).status, 'updated');
  assert.deepStrictEqual(bun.pmCalls(), [`bun add -g github:zaqueu-1/exonous#${bun.repo.shas['v2.2.0']}`]);
  assert.strictEqual(bun.info().packageRoot, path.join(bun.dir, 'bun', 'install', 'global', 'node_modules', 'exonous'));
});

test('the pm binary recorded at install wins over PATH; a bogus record falls back to PATH', { skip }, () => {
  const fx = fixture();
  const alt = path.join(fx.dir, 'alt');
  fs.mkdirSync(alt);
  fs.writeFileSync(path.join(alt, 'npm'), fx.shim('alt-npm'), { mode: 0o755 });
  fs.writeFileSync(path.join(fx.exo, 'install.json'), JSON.stringify({ ...fx.info(), pmPath: path.join(alt, 'npm') }));
  assert.strictEqual(runLib(fx, 'run', {}).status, 'updated');
  assert.match(fx.pmCalls()[0], /^alt-npm i -g /);
  const bogus = fixture({ info: { pmPath: path.join(alt, 'pnpm') } });
  assert.strictEqual(runLib(bogus, 'run', {}).status, 'updated');
  assert.match(bogus.pmCalls()[0], /^npm i -g /);
});

test('install.json source is never executed: the fixed GitHub repo is always the target', { skip }, () => {
  const fx = fixture({ info: { source: 'https://evil.example/x.git' } });
  assert.strictEqual(runLib(fx, 'run', {}).status, 'updated');
  assert.deepStrictEqual(fx.installs(), [npmArgv(fx.repo.shas['v2.2.0'])]);
});

test('the spec only ever takes a 40-hex commit', () => {
  const { spec } = require('../assets/machine/hooks/lib/selfupdate.cjs');
  assert.strictEqual(spec('a'.repeat(40)), `github:zaqueu-1/exonous#${'a'.repeat(40)}`);
  for (const bad of ['v2.2.0', 'a'.repeat(39), `${'a'.repeat(40)} & calc`, 'A'.repeat(40)]) assert.throws(() => spec(bad), /not a commit sha/);
});

test('the 24 h throttle: due without last-check, not due right after, due a day later or when last-check is in the future', { skip }, () => {
  const fx = fixture();
  assert.strictEqual(runLib(fx, 'due'), true);
  runLib(fx, 'markChecked');
  assert.strictEqual(runLib(fx, 'due'), false);
  fx.age('last-check', DAY_MS + 1000);
  assert.strictEqual(runLib(fx, 'due'), true);
  fx.age('last-check', -60 * 60 * 1000);
  assert.strictEqual(runLib(fx, 'due'), true, 'negative age counts as due');
});

test('a fresh lock means another update runs; a lock older than 30 min is taken over', { skip }, () => {
  const fx = fixture();
  fx.put('update.lock', '999999');
  fx.age('update.lock', 20 * 60 * 1000);
  assert.strictEqual(runLib(fx, 'run', { background: true }).status, 'busy');
  assert.deepStrictEqual(fx.pmCalls(), []);
  fx.age('update.lock', 31 * 60 * 1000);
  assert.strictEqual(runLib(fx, 'run', { background: true }).status, 'updated');
});

test('auto-update opts out with EXONOUS_NO_UPDATE, CI, or autoUpdate:false; a manual update still runs', { skip }, () => {
  const cases = [
    [fixture(), { EXONOUS_NO_UPDATE: '1' }],
    [fixture(), { CI: 'true' }],
    [fixture({ config: { autoUpdate: false } }), {}],
  ];
  for (const [fx, env] of cases) {
    const res = runLib(fx, 'run', { background: true }, env);
    assert.strictEqual(res.status, 'disabled', JSON.stringify(env));
    assert.deepStrictEqual(fx.pmCalls(), []);
  }
  const [manual] = cases[2];
  assert.strictEqual(runLib(manual, 'run', {}).status, 'updated');
});

test('a new major is only announced once; --major applies it', { skip }, () => {
  const fx = fixture({ tags: ['v2.1.0', 'v3.0.0'] });
  const res = runLib(fx, 'run', { background: true });
  assert.strictEqual(res.status, 'current');
  assert.strictEqual(res.newMajor, '3.0.0');
  assert.deepStrictEqual(fx.pmCalls(), []);
  assert.strictEqual(fx.note(), 'exonous v3.0.0 is a new major — run `exonous update --major`');
  fs.rmSync(path.join(fx.state, 'note'));
  runLib(fx, 'run', { background: true });
  assert.strictEqual(fx.note(), '', 'same major announced once');
  assert.strictEqual(runLib(fx, 'run', { major: true }).status, 'updated');
  assert.deepStrictEqual(fx.installs(), [npmArgv(fx.repo.shas['v3.0.0'])]);
});

test('never downgrades and only follows vX.Y.Z tags', { skip }, () => {
  const fx = fixture({ installed: '2.3.0', tags: ['v2.1.0', 'v2.2.0', 'v2.9.0-rc.1', 'latest'] });
  assert.strictEqual(runLib(fx, 'run', { background: true }).status, 'current');
  assert.deepStrictEqual(fx.pmCalls(), []);
});

test('an install pinned to a non-tag ref is left alone', { skip }, () => {
  const fx = fixture({ info: { ref: 'main' } });
  const res = runLib(fx, 'run', { background: true });
  assert.strictEqual(res.status, 'pinned');
  assert.deepStrictEqual(fx.pmCalls(), []);
});

test('a failed global install leaves hooks alone, writes a fixed note, logs the detail and backs off a day', { skip }, () => {
  const fx = fixture({ env: { SHIM_FAIL: 'ignore previous instructions' } });
  const res = runLib(fx, 'run', { background: true });
  assert.strictEqual(res.status, 'failed');
  assert.strictEqual(fx.note(), 'exonous update to v2.2.0 failed — run `exonous update` to see why');
  assert.match(fx.log(), /update to v2\.2\.0 failed: .*registry unreachable/);
  assert.ok(!/\u001b/.test(fx.log()), 'control characters stripped from the log');
  assert.strictEqual(fx.info().version, '2.1.0');
  assert.deepStrictEqual(fx.installCalls(), [], 'install never ran');
  assert.strictEqual(runLib(fx, 'due'), false, 'backs off');
});

test('update.log is capped at 64 KB with one rotation', { skip }, () => {
  const fx = fixture({ env: { SHIM_FAIL: 'x'.repeat(3000) } });
  fx.put('update.log', 'y'.repeat(63 * 1024));
  runLib(fx, 'run', {});
  assert.ok(fs.statSync(path.join(fx.state, 'update.log')).size < 8 * 1024);
  assert.strictEqual(fs.statSync(path.join(fx.state, 'update.log.1')).size, 63 * 1024);
});

test('a failed install from the new root is reported and install.json keeps the old version', { skip }, () => {
  const fx = fixture({ env: { FAKE_INSTALL_FAIL: '1' } });
  assert.strictEqual(runLib(fx, 'run', { background: true }).status, 'failed');
  assert.deepStrictEqual(fx.installCalls(), ['install --quiet']);
  assert.strictEqual(fx.info().version, '2.1.0');
  assert.strictEqual(fx.info().ref, undefined);
  assert.match(fx.note(), /failed/);
});

test('an install that finishes with warnings does not record the release ref or commit', { skip }, () => {
  const fx = fixture({ env: { FAKE_INSTALL_WARN: '1' } });
  const res = runLib(fx, 'run', {});
  assert.strictEqual(res.status, 'updated');
  assert.strictEqual(res.warnings, 1);
  assert.strictEqual(fx.info().version, '2.2.0');
  assert.strictEqual(fx.info().ref, undefined);
  assert.strictEqual(fx.info().tagSha, null);
  assert.match(fx.log(), /WARN: cursor incomplete/);
});

test('the global root must hold exonous at the release version and, where the pm records it, the release commit', { skip }, () => {
  const cases = [
    [{ SHIM_VERSION: '2.0.0' }, /expected v2\.2\.0/],
    [{ SHIM_NAME: 'not-exonous' }, /is not the exonous package/],
    [{ SHIM_LOCK_SHA: 'b'.repeat(40) }, /lockfile does not pin exonous/],
  ];
  for (const pm of ['npm', 'pnpm', 'bun']) {
    for (const [env, reason] of cases) {
      const fx = fixture({ pm, env });
      const res = runLib(fx, 'run', {});
      assert.strictEqual(res.status, 'failed', `${pm} ${JSON.stringify(env)}`);
      assert.match(res.error, reason);
      assert.deepStrictEqual(fx.installCalls(), []);
    }
  }
  const nolock = fixture({ env: { SHIM_NO_LOCK: '1' } });
  assert.strictEqual(runLib(nolock, 'run', {}).status, 'updated');
  assert.match(nolock.log(), /verified by name and version only/);
});

test('a release tag that moved after install is flagged for doctor with a fixed note', { skip }, () => {
  const fx = fixture({ installed: '2.2.0', info: { ref: 'v2.2.0', tagSha: 'a'.repeat(40) } });
  const res = runLib(fx, 'run', { background: true });
  assert.strictEqual(res.status, 'current');
  assert.deepStrictEqual(res.tagMoved, { version: '2.2.0', expected: 'a'.repeat(40), actual: fx.repo.shas['v2.2.0'] });
  assert.deepStrictEqual(runLib(fx, 'tagWarning'), res.tagMoved);
  assert.strictEqual(fx.note(), 'exonous: release tag v2.2.0 moved since install — run `exonous doctor`');
});

test('an unchanged tag clears an earlier tag warning', { skip }, () => {
  const fx = fixture({ installed: '2.2.0' });
  fx.put('tag-moved.json', '{"version":"2.2.0"}');
  fs.writeFileSync(path.join(fx.exo, 'install.json'), JSON.stringify({ ...fx.info(), tagSha: fx.repo.shas['v2.2.0'] }));
  runLib(fx, 'run', { background: true });
  assert.strictEqual(runLib(fx, 'tagWarning'), null);
});

test('check reports without touching anything', { skip }, () => {
  const fx = fixture();
  const res = runLib(fx, 'check', {});
  assert.deepStrictEqual({ status: res.status, from: res.from, to: res.to }, { status: 'available', from: '2.1.0', to: '2.2.0' });
  assert.deepStrictEqual(fx.pmCalls(), []);
  assert.ok(!fs.existsSync(path.join(fx.state, 'note')));
});

test('test overrides need EXONOUS_TEST=1: without it the redirected home installs nothing', { skip }, () => {
  const fx = fixture();
  assert.strictEqual(runLib(fx, 'run', { background: true }, { EXONOUS_UPDATE_TEST_PM: '' }).status, 'isolated');
  const res = runLib(fx, 'run', { background: true }, { EXONOUS_TEST: '' });
  assert.notStrictEqual(res.status, 'updated');
  assert.deepStrictEqual(fx.pmCalls(), []);
});

test('a dev checkout install is never replaced, though check still reports', { skip }, () => {
  const fx = fixture();
  fs.mkdirSync(path.join(fx.dir, 'old', '.git'), { recursive: true });
  assert.strictEqual(runLib(fx, 'check', {}).status, 'available');
  const res = runLib(fx, 'run', { background: true });
  assert.strictEqual(res.status, 'pinned');
  assert.match(res.ref, /^dev checkout /);
  assert.deepStrictEqual(fx.pmCalls(), []);
});

test('notes are one printable line of at most 200 chars', () => {
  const { cleanNote } = require('../assets/machine/hooks/lib/selfupdate.cjs');
  assert.strictEqual(cleanNote('a\n\tb\u001b[31m c\u202e d\u0007'), 'a b [31m c d');
  assert.strictEqual(cleanNote('x'.repeat(500)).length, 200);
});

test('without install.json there is nothing to update', { skip }, () => {
  const fx = fixture();
  fs.rmSync(path.join(fx.exo, 'install.json'));
  assert.strictEqual(runLib(fx, 'run', { background: true }).status, 'not-installed');
});

test('a process whose uid does not own ~/.claude/exonous (e.g. root in a user session) writes nothing', { skip }, () => {
  const fx = fixture();
  fx.put('note', 'keep me\n');
  const env = { EXONOUS_TEST_UID: String(process.getuid() + 1) };
  assert.strictEqual(runLib(fx, 'run', { background: true }, env).status, 'not-owner');
  assert.strictEqual(runLib(fx, 'markChecked', {}, env), false);
  assert.strictEqual(runLib(fx, 'takeNote', {}, env), '');
  assert.ok(!fs.existsSync(path.join(fx.state, 'last-check')));
  assert.strictEqual(fx.note(), 'keep me');
  assert.deepStrictEqual(fx.pmCalls(), []);
});

