#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const { test } = require('node:test');
const payload = require('../assets/machine/hooks/lib/payload.cjs');

const CMD = 'git commit -m "x"';
const FIXTURES = {
  claude: { session_id: 's', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: CMD }, cwd: '/r' },
  cursor: { hook_event_name: 'beforeShellExecution', command: CMD, cwd: '/r', workspace_roots: ['/w'] },
  gemini: { hook_event_name: 'BeforeTool', tool_name: 'run_shell_command', tool_input: { command: CMD }, cwd: '/r' },
  codex: { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: CMD }, cwd: '/r' },
  windsurf: { agent_action_name: 'pre_run_command', tool_info: { command_line: CMD, cwd: '/r' } },
  copilot: { hookEventName: 'PreToolUse', tool_name: 'run_in_terminal', tool_input: { command: CMD }, cwd: '/r' },
  opencode: { tool: 'bash', args: { command: CMD }, cwd: '/r' },
};

test('every adapter fixture normalizes to the same command and cwd', () => {
  assert.deepStrictEqual(Object.keys(FIXTURES).sort(), [...payload.ADAPTERS].sort());
  for (const [adapter, fixture] of Object.entries(FIXTURES)) {
    assert.deepStrictEqual(payload.parse(adapter, JSON.stringify(fixture)), { command: CMD, cwd: '/r' }, adapter);
  }
});

test('Copilot CLI toolArgs strings and Codex argv arrays are understood', () => {
  const cli = { toolName: 'bash', toolArgs: JSON.stringify({ command: CMD }), cwd: '/r' };
  assert.deepStrictEqual(payload.parse('copilot', JSON.stringify(cli)), { command: CMD, cwd: '/r' });
  const argv = { tool_input: { command: ['bash', '-lc', "git commit -m 'it''s'"] }, cwd: '/r' };
  assert.strictEqual(payload.parse('codex', JSON.stringify(argv)).command, `bash -lc 'git commit -m '"'"'it'"'"''"'"'s'"'"''`);
});

test('cwd falls back to the workspace root, then the process cwd', () => {
  assert.strictEqual(payload.parse('cursor', JSON.stringify({ command: 'ls', workspace_roots: ['/w'] })).cwd, '/w');
  assert.strictEqual(payload.parse('claude', JSON.stringify({ tool_input: { command: 'ls' } })).cwd, process.cwd());
});

test('unparseable or command-less input yields null (fail open)', () => {
  for (const raw of ['', 'not json', '[]', 'null', '{"tool_input":{"file_path":"/x"}}', '{"tool_input":{"command":42}}']) {
    assert.strictEqual(payload.parse('claude', raw), null, raw);
  }
});

test('deny uses exit 2 and stderr for exit-code tools', () => {
  for (const adapter of ['claude', 'gemini', 'codex', 'windsurf', 'opencode']) {
    assert.deepStrictEqual(payload.deny(adapter, 'no'), { code: 2, stdout: '', stderr: 'no\n' }, adapter);
  }
});

test('Cursor gets its permission JSON plus exit 2', () => {
  const out = payload.deny('cursor', 'no');
  assert.strictEqual(out.code, 2);
  assert.deepStrictEqual(JSON.parse(out.stdout), { permission: 'deny', user_message: 'no', agent_message: 'no' });
  assert.deepStrictEqual(payload.allow('cursor'), { code: 0, stdout: '{"permission":"allow"}', stderr: '' });
});

test('Copilot gets a permissionDecision JSON on stdout', () => {
  const out = payload.deny('copilot', 'no');
  assert.strictEqual(out.code, 0);
  const json = JSON.parse(out.stdout);
  assert.strictEqual(json.permissionDecision, 'deny');
  assert.strictEqual(json.permissionDecisionReason, 'no');
  assert.strictEqual(json.hookSpecificOutput.permissionDecision, 'deny');
  assert.deepStrictEqual(payload.allow('copilot'), { code: 0, stdout: '', stderr: '' });
});

test('an unknown adapter still denies with the exit-code shape', () => {
  assert.strictEqual(payload.deny('vim', 'no').code, 2);
  assert.strictEqual(payload.parse('vim', JSON.stringify(FIXTURES.claude)).command, CMD);
});

test('Claude allow carries warnings as additionalContext; others keep them for stderr', () => {
  const out = payload.allow('claude', ['careful']);
  assert.deepStrictEqual(JSON.parse(out.stdout), { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: 'careful' } });
  assert.strictEqual(out.stderr, '');
  assert.deepStrictEqual(payload.allow('codex', ['careful']), { code: 0, stdout: '', stderr: 'careful\n' });
  assert.deepStrictEqual(payload.allow('claude'), { code: 0, stdout: '', stderr: '' });
});
