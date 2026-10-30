#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { test } = require('node:test');
const { install } = require('../src/install');
const { uninstall } = require('../src/uninstall');
const { selftest, ADAPTERS } = require('../src/adapters');
const fx = require('./helpers/adapter-fixture');

const osHome = fx.useFixtureHome();
const copilot = ADAPTERS.find((a) => a.id === 'copilot');
const C = ['.copilot'];
const USER_HOOK = { version: 1, hooks: { postToolUse: [{ type: 'command', command: 'log.sh' }] } };
const run = (q = fx.quiet()) => install({ external: false, execPath: process.execPath, tools: ['copilot'], ...q });

test('detects ~/.copilot; hard gate, reduced tier', () => {
  assert.strictEqual(copilot.detect(), false);
  fs.mkdirSync(fx.home(...C));
  assert.strictEqual(copilot.detect(), true);
  assert.strictEqual(copilot.gate, 'hard');
  assert.strictEqual(copilot.tierLabel, 'hard-reduced');
});

test('install writes our own hooks/exonous.json (version 1, preToolUse + sessionStart) and leaves user hook files alone', () => {
  fx.write(USER_HOOK, ...C, 'hooks', 'mine.json');
  run();
  const ours = fx.readJson(...C, 'hooks', 'exonous.json');
  assert.strictEqual(ours.version, 1);
  assert.strictEqual(ours.hooks.preToolUse[0].type, 'command');
  assert.match(ours.hooks.preToolUse[0].command, /pyle\.cjs" auto --adapter copilot$/);
  assert.match(ours.hooks.sessionStart[0].command, /kairos\.cjs" --adapter copilot$/);
  assert.deepStrictEqual(fx.readJson(...C, 'hooks', 'mine.json'), USER_HOOK);
});

test('the registered gate denies with JSON permissionDecision for a camelCase toolArgs payload', () => {
  fs.mkdirSync(fx.home(...C));
  run();
  const res = selftest(copilot);
  assert.ok(res.ok, res.detail);
  const command = copilot.registeredCommand();
  const [shell, args] = process.platform === 'win32' ? ['cmd.exe', ['/d', '/s', '/c', `"${command}"`]] : ['sh', ['-c', command]];
  const out = spawnSync(shell, args, { windowsVerbatimArguments: true, input: JSON.stringify({ toolName: 'bash', toolArgs: JSON.stringify({ command: 'git commit -m x' }), cwd: path.sep }), encoding: 'utf8' });
  assert.strictEqual(out.status, 0);
  assert.strictEqual(JSON.parse(out.stdout).permissionDecision, 'deny');
});

test('doctor labels the gate Preview and notes rules come from ~/.claude', () => {
  fs.mkdirSync(fx.home(...C));
  run();
  const rows = copilot.doctor({});
  assert.ok(rows.some((r) => /Preview/.test(r.name) && r.ok));
  assert.ok(rows.some((r) => /~\/\.claude/.test(`${r.name} ${r.status}`)));
});

test('idempotent; uninstall removes only our file', async () => {
  fx.write(USER_HOOK, ...C, 'hooks', 'mine.json');
  run();
  const first = fx.read(...C, 'hooks', 'exonous.json');
  run();
  assert.strictEqual(fx.read(...C, 'hooks', 'exonous.json'), first);
  await uninstall({ yes: true, log: () => {} });
  assert.ok(!fx.exists(...C, 'hooks', 'exonous.json'));
  assert.deepStrictEqual(fx.readJson(...C, 'hooks', 'mine.json'), USER_HOOK);
  assert.deepStrictEqual(fs.readdirSync(osHome.osHome), []);
});

test('COPILOT_HOME is honored only for real-home installs; a redirected home ignores it and doctor warns', () => {
  const { copilotDir } = copilot;
  assert.strictEqual(copilotDir({ COPILOT_HOME: '/opt/cp' }, { redirected: false, home: '/h' }), '/opt/cp');
  assert.strictEqual(copilotDir({ COPILOT_HOME: '/opt/cp' }, { redirected: true, home: '/h' }), path.join('/h', '.copilot'));
  assert.strictEqual(copilotDir({}, { redirected: false, home: '/h' }), path.join('/h', '.copilot'));
  fs.mkdirSync(fx.home(...C));
  process.env.COPILOT_HOME = fx.home('elsewhere');
  try {
    run();
    assert.ok(fx.exists(...C, 'hooks', 'exonous.json'));
    assert.ok(!fx.exists('elsewhere'));
    const row = copilot.doctor({}).find((r) => /COPILOT_HOME/.test(r.name));
    assert.ok(row && row.level === 'warn' && !row.ok, JSON.stringify(copilot.doctor({})));
  } finally {
    delete process.env.COPILOT_HOME;
  }
  assert.ok(!copilot.doctor({}).some((r) => /COPILOT_HOME/.test(r.name)));
});

