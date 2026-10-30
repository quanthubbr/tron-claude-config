#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { test } = require('node:test');
const { fixture, HOOKS, DAY_MS } = require('./helpers/selfupdate-fixture');

const KAIROS = path.join(HOOKS, 'kairos.cjs');
const skip = process.platform === 'win32' ? 'sh shims' : false;

function kairos(fx, args, env = {}) {
  return spawnSync(process.execPath, [KAIROS, ...args], { env: { ...fx.env, ...env }, encoding: 'utf8', input: '{}' });
}

async function waitFor(fn, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

test('prints nothing without a note, and a note exactly once', { skip }, () => {
  const fx = fixture();
  fx.put('last-check', '');
  let res = kairos(fx, ['--adapter', 'claude']);
  assert.strictEqual(res.status, 0);
  assert.strictEqual(res.stdout, '');
  fx.put('note', 'exonous updated v2.1.0 → v2.2.0 (restart to load new hooks)\n');
  res = kairos(fx, ['--adapter', 'claude']);
  assert.strictEqual(res.stdout, 'exonous updated v2.1.0 → v2.2.0 (restart to load new hooks)\n');
  assert.strictEqual(kairos(fx, ['--adapter', 'claude']).stdout, '');
});

test('a tampered note still prints as one clean line of at most 200 chars', { skip }, () => {
  const fx = fixture();
  fx.put('last-check', '');
  fx.put('note', `line one\nline two\u001b[2J\u0007 ${'z'.repeat(400)}\n`);
  const out = kairos(fx, ['--adapter', 'claude']).stdout;
  assert.strictEqual(out.split('\n').length, 2, 'one line plus newline');
  assert.ok(out.trimEnd().length <= 200);
  assert.ok(!/[\u0000-\u001f]/.test(out.trimEnd()));
  assert.ok(out.startsWith('line one line two [2J z'));
});

test('Cursor gets the note as additional_context JSON', { skip }, () => {
  const fx = fixture();
  fx.put('last-check', '');
  fx.put('note', 'exonous updated v2.1.0 → v2.2.0 (restart to load new hooks)\n');
  const res = kairos(fx, ['--adapter', 'cursor']);
  assert.deepStrictEqual(JSON.parse(res.stdout), { additional_context: 'exonous updated v2.1.0 → v2.2.0 (restart to load new hooks)' });
  assert.strictEqual(res.stdout.split('\n').filter(Boolean).length, 1);
});

test('Gemini gets the note as SessionStart additionalContext; OpenCode stays silent and keeps it', { skip }, () => {
  const fx = fixture();
  fx.put('last-check', '');
  fx.put('note', 'exonous updated v2.1.0 → v2.2.0 (restart to load new hooks)\n');
  assert.strictEqual(kairos(fx, ['--adapter', 'opencode']).stdout, '');
  assert.notStrictEqual(fx.note(), '');
  fx.put('note', 'copilot note\n');
  assert.deepStrictEqual(JSON.parse(kairos(fx, ['--adapter', 'copilot']).stdout), { additionalContext: 'copilot note' });
  fx.put('note', 'exonous updated v2.1.0 → v2.2.0 (restart to load new hooks)\n');
  const out = JSON.parse(kairos(fx, ['--adapter', 'gemini']).stdout);
  assert.deepStrictEqual(out, { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'exonous updated v2.1.0 → v2.2.0 (restart to load new hooks)' } });
});

test('a due check is claimed before the detached update runs; the next tool within 24 h does not start another', { skip }, async () => {
  const fx = fixture();
  const started = Date.now();
  const res = kairos(fx, ['--adapter', 'claude']);
  assert.strictEqual(res.status, 0);
  assert.ok(Date.now() - started < 5000, 'session never waits for the update');
  assert.ok(fs.existsSync(path.join(fx.state, 'last-check')), 'last-check written before spawning');
  assert.ok(await waitFor(() => fx.note() !== '' && !fs.existsSync(path.join(fx.state, 'update.lock'))), 'background update ran and left a note');
  const next = kairos(fx, ['--adapter', 'cursor']);
  assert.match(next.stdout, /v2\.1\.0 → v2\.2\.0/);
  await new Promise((r) => setTimeout(r, 500));
  assert.deepStrictEqual(fx.installs(), [`npm i -g --no-audit --no-fund github:zaqueu-1/exonous#${fx.repo.shas['v2.2.0']}`]);
  assert.strictEqual(fx.installCalls().length, 1);
});

test('two tools updating at once share one lock: one install, the other is busy', { skip }, async () => {
  const fx = fixture({ env: { SHIM_SLEEP: '1' } });
  const runs = ['claude', 'cursor'].map((adapter) => new Promise((resolve) => {
    spawn(process.execPath, [KAIROS, '--run', '--adapter', adapter], { env: fx.env, stdio: 'ignore' }).on('exit', resolve);
  }));
  assert.deepStrictEqual(await Promise.all(runs), [0, 0]);
  assert.strictEqual(fx.installs().length, 1);
  assert.strictEqual(fx.installCalls().length, 1);
});

test('opt-outs stop the check before last-check is touched', { skip }, () => {
  for (const [opts, env] of [[{}, { EXONOUS_NO_UPDATE: '1' }], [{}, { CI: '1' }], [{ config: { autoUpdate: false } }, {}]]) {
    const fx = fixture(opts);
    assert.strictEqual(kairos(fx, ['--adapter', 'claude'], env).status, 0);
    assert.ok(!fs.existsSync(path.join(fx.state, 'last-check')), JSON.stringify(env));
  }
});

test('windsurf mode only stats last-check: silent, spawns only when due', { skip }, async () => {
  const fx = fixture();
  fx.put('note', 'pending note\n');
  fx.put('last-check', '');
  let res = kairos(fx, ['--adapter', 'windsurf']);
  assert.strictEqual(res.stdout, '');
  assert.strictEqual(fx.note(), 'pending note', 'note left for a session-start tool');
  await new Promise((r) => setTimeout(r, 300));
  assert.deepStrictEqual(fx.pmCalls(), []);
  fx.age('last-check', DAY_MS + 1000);
  res = kairos(fx, ['--adapter', 'windsurf']);
  assert.strictEqual(res.stdout, '');
  assert.ok(await waitFor(() => fx.installCalls().length === 1), 'due check spawned the update');
  // The detached update must finish before the fixture is removed, or it recreates the deleted home.
  assert.ok(await waitFor(() => fx.note() !== '' && !fs.existsSync(path.join(fx.state, 'update.lock'))));
});

test('always exits 0, even when the home is broken', { skip }, () => {
  const fx = fixture();
  const file = path.join(fx.dir, 'not-a-dir');
  fs.writeFileSync(file, 'x');
  const res = kairos(fx, ['--adapter', 'claude'], { EXONOUS_HOME: file });
  assert.strictEqual(res.status, 0);
  assert.strictEqual(kairos(fx, ['--run'], { EXONOUS_HOME: file, EXONOUS_RELEASE_SOURCE: 'file:///nope' }).status, 0);
});

test('kairos under a uid that does not own the exonous dir prints nothing and writes nothing', { skip }, async () => {
  const fx = fixture();
  fx.put('note', 'exonous updated v2.1.0 → v2.2.0 (restart to load new hooks)\n');
  const res = kairos(fx, ['--adapter', 'claude'], { EXONOUS_TEST_UID: String(process.getuid() + 1) });
  assert.strictEqual(res.status, 0);
  assert.strictEqual(res.stdout, '');
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(!fs.existsSync(path.join(fx.state, 'last-check')));
  assert.notStrictEqual(fx.note(), '');
  assert.deepStrictEqual(fx.pmCalls(), []);
});

