#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const { test } = require('node:test');
const { install } = require('../src/install');
const { uninstall } = require('../src/uninstall');
const { selftest, ADAPTERS } = require('../src/adapters');
const { renderRules } = require('../src/lib/render-rules');
const fx = require('./helpers/adapter-fixture');

const osHome = fx.useFixtureHome();
const codex = ADAPTERS.find((a) => a.id === 'codex');
const USER_TOML = '# my codex config\nmodel = "gpt-5"  # pinned\n\n[profiles.fast]\nmodel = "gpt-5-mini"\n';
const USER_AGENTS = '# Global agent notes\n\nPrefer small diffs.\n';
const USER_HOOKS = { hooks: { PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'fmt' }] }] } };

function seed() {
  fx.write(USER_TOML, '.codex', 'config.toml');
  fx.write(USER_AGENTS, '.codex', 'AGENTS.md');
  fx.write(USER_HOOKS, '.codex', 'hooks.json');
  fx.write(fx.CLAUDE_MCP, '.claude', '.mcp.json');
}
const run = (opts = {}) => install({ external: false, execPath: process.execPath, tools: ['codex'], ...fx.quiet(), ...opts });

test('detects ~/.codex or codex on PATH only', () => {
  assert.strictEqual(codex.detect(), false);
  fs.mkdirSync(fx.home('.codex'));
  assert.strictEqual(codex.detect(), true);
  assert.strictEqual(codex.tier, 1);
});

test('install: inlined nomos section, PreToolUse Bash + SessionStart hooks, MCP tables in a marker block', () => {
  seed();
  run();
  const agents = fx.read('.codex', 'AGENTS.md');
  assert.ok(agents.startsWith(USER_AGENTS));
  assert.ok(agents.includes(renderRules('full').trim().split('\n')[0]));
  const hooks = fx.readJson('.codex', 'hooks.json').hooks;
  assert.deepStrictEqual(hooks.PostToolUse.slice(0, USER_HOOKS.hooks.PostToolUse.length), USER_HOOKS.hooks.PostToolUse);
  assert.match(hooks.PostToolUse.at(-1).hooks[0].command, /anamnesis\.cjs" --event tool --adapter codex$/);
  for (const [event, name] of [['SessionStart', 'start'], ['UserPromptSubmit', 'prompt'], ['Stop', 'stop'], ['SessionEnd', 'end']]) {
    const commands = hooks[event].flatMap((e) => e.hooks.map((h) => h.command));
    assert.ok(commands.some((c) => new RegExp(`anamnesis\\.cjs" --event ${name} --adapter codex$`).test(c)), event);
  }
  assert.ok(hooks.UserPromptSubmit.flatMap((e) => e.hooks).some((h) => /ethos\.cjs" --adapter codex$/.test(h.command)), 'rule reminder on prompt submit');
  assert.strictEqual(hooks.PreToolUse[0].matcher, 'Bash');
  assert.match(hooks.PreToolUse[0].hooks[0].command, /pyle\.cjs" auto --adapter codex$/);
  assert.match(hooks.SessionStart[0].hooks[0].command, /kairos\.cjs" --adapter codex$/);
  const toml = fx.read('.codex', 'config.toml');
  assert.ok(toml.startsWith(USER_TOML), 'user TOML bytes untouched');
  assert.match(toml, /# exonous:start\n\[mcp_servers\.atlas\]\ncommand = "\/usr\/local\/bin\/codebase-memory-mcp"\nargs = \["--stdio"\]\n/);
  assert.match(toml, /\[mcp_servers\.biblos\]\nurl = "https:\/\/mcp\.context7\.com\/mcp"\n/);
  assert.ok(!/secret/i.test(toml));
});

test('idempotent, and a user-defined mcp_servers table is never duplicated', () => {
  seed();
  fx.write(`${USER_TOML}\n[mcp_servers.atlas]\ncommand = "mine"\n`, '.codex', 'config.toml');
  const q = fx.quiet();
  install({ external: false, execPath: process.execPath, tools: ['codex'], ...q });
  const first = ['AGENTS.md', 'hooks.json', 'config.toml'].map((f) => fx.read('.codex', f));
  assert.strictEqual((first[2].match(/\[mcp_servers\.atlas\]/g) || []).length, 1);
  assert.ok(q.logs.some((m) => /already defines mcp_servers\.atlas/.test(m)));
  run();
  assert.deepStrictEqual(['AGENTS.md', 'hooks.json', 'config.toml'].map((f) => fx.read('.codex', f)), first);
});

test('invalid hooks.json aborts that file only', () => {
  seed();
  fx.write('{ nope', '.codex', 'hooks.json');
  run();
  assert.strictEqual(fx.read('.codex', 'hooks.json'), '{ nope');
  assert.ok(fx.read('.codex', 'AGENTS.md').includes('exonous:start'));
});

test('uninstall restores AGENTS.md, hooks.json and config.toml', async () => {
  seed();
  run();
  await uninstall({ yes: true, log: () => {} });
  assert.strictEqual(fx.read('.codex', 'config.toml'), USER_TOML);
  assert.strictEqual(fx.read('.codex', 'AGENTS.md'), USER_AGENTS);
  assert.deepStrictEqual(fx.readJson('.codex', 'hooks.json'), USER_HOOKS);
});

test('selftest denies; doctor asks the user to approve the hook in /hooks', () => {
  seed();
  run();
  const res = selftest(codex);
  assert.ok(res.ok, res.detail);
  assert.match(res.detail, /^script self-test \(does not prove the tool loads the hook\)/);
  const rows = codex.doctor({});
  const approval = rows.find((r) => /approved in \/hooks/.test(r.name));
  assert.strictEqual(approval.ok, false);
  assert.strictEqual(approval.level, 'warn');
  assert.match(approval.status, /^pending — approve the exonous hook in Codex `\/hooks`/);
  assert.ok(rows.filter((r) => r !== approval).every((r) => r.ok), JSON.stringify(rows));
  assert.deepStrictEqual(fs.readdirSync(osHome.osHome), []);
});
