#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { test } = require('node:test');

const HOOK = path.join(__dirname, '..', 'assets', 'machine', 'hooks', 'ethos.cjs');

function fixture() {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ethos-')));
  fs.mkdirSync(path.join(home, '.claude', 'exonous'), { recursive: true });
  const base = { ...process.env, EXONOUS_HOME: home, HOME: home, EXONOUS_NO_UPDATE: '1' };
  delete base.EXONOUS_RULES_REMINDER;
  const run = (adapter = 'claude', extra = {}) => spawnSync(process.execPath, [HOOK, '--adapter', adapter], {
    input: JSON.stringify({ prompt: 'fix the checkout total' }), env: { ...base, ...extra }, encoding: 'utf8',
  });
  const config = (value) => fs.writeFileSync(path.join(home, '.claude', 'exonous', 'config.json'), JSON.stringify(value));
  return { home, run, config };
}

test('every adapter with a prompt-submit channel gets the reminder in its own payload shape', () => {
  const fx = fixture();
  const text = (adapter) => {
    const res = fx.run(adapter);
    assert.strictEqual(res.status, 0, adapter);
    return res.stdout.trim();
  };
  for (const [adapter, event] of [['claude', 'UserPromptSubmit'], ['gemini', 'BeforeAgent']]) {
    const out = JSON.parse(text(adapter));
    assert.strictEqual(out.hookSpecificOutput.hookEventName, event, adapter);
    assert.match(out.hookSpecificOutput.additionalContext, /nomos \+ praxis/, adapter);
  }
  assert.match(JSON.parse(text('cursor')).additional_context, /nomos \+ praxis/);
  assert.match(JSON.parse(text('copilot')).additionalContext, /nomos \+ praxis/);
  assert.match(text('codex'), /^exonous rules in force \(nomos \+ praxis\)/);
});

test('the reminder stays short and names the gates it restates', () => {
  const out = JSON.parse(fixture().run('claude').stdout).hookSpecificOutput.additionalContext;
  assert.ok(out.length <= 200, `${out.length} chars`);
  for (const re of [/terse/, /smallest change/, /locate before reading/, /test first/, /only when asked/]) assert.match(out, re);
});

test('an adapter with no channel back to the model, an unknown one, and an inherited key print nothing', () => {
  const fx = fixture();
  for (const adapter of ['windsurf', 'opencode', 'kiro', '../evil', 'toString', 'constructor', 'hasOwnProperty']) {
    const res = fx.run(adapter);
    assert.strictEqual(res.status, 0, adapter);
    assert.strictEqual(res.stdout, '', adapter);
  }
});

test('opting out silences the hook: EXONOUS_RULES_REMINDER=0 or config.json rulesReminder:false', () => {
  const fx = fixture();
  assert.strictEqual(fx.run('claude', { EXONOUS_RULES_REMINDER: '0' }).stdout, '');
  assert.notStrictEqual(fx.run('claude', { EXONOUS_RULES_REMINDER: '1' }).stdout, '', 'only 0 opts out');
  fx.config({ rulesReminder: false });
  assert.strictEqual(fx.run('claude').stdout, '');
  fx.config({ rulesReminder: true, memory: false });
  assert.notStrictEqual(fx.run('claude').stdout, '');
});

test('an unreadable config.json never breaks the prompt', () => {
  const fx = fixture();
  fs.writeFileSync(path.join(fx.home, '.claude', 'exonous', 'config.json'), '{ broken');
  const res = fx.run('claude');
  assert.strictEqual(res.status, 0);
  assert.match(res.stdout, /nomos \+ praxis/);
});
