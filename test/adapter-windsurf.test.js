#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const { install } = require('../src/install');
const { uninstall } = require('../src/uninstall');
const { selftest, ADAPTERS } = require('../src/adapters');
const { renderRules } = require('../src/lib/render-rules');
const fx = require('./helpers/adapter-fixture');

const osHome = fx.useFixtureHome();
const windsurf = ADAPTERS.find((a) => a.id === 'windsurf');
const W = ['.codeium', 'windsurf'];
const USER_HOOKS = { hooks: { post_write_code: [{ command: 'fmt', show_output: true }] } };
const USER_RULES = '# my global rules\n\nBe brief.\n';
const USER_MCP = { mcpServers: { github: { command: 'gh-mcp' } } };

function seed() {
  fx.write(USER_HOOKS, ...W, 'hooks.json');
  fx.write(USER_RULES, ...W, 'memories', 'global_rules.md');
  fx.write(USER_MCP, ...W, 'mcp_config.json');
  fx.write(fx.CLAUDE_MCP, '.claude', '.mcp.json');
}
const run = (q = fx.quiet()) => install({ external: false, execPath: process.execPath, tools: ['windsurf'], ...q });

test('detects ~/.codeium/windsurf; hard gate, reduced tier', () => {
  assert.strictEqual(windsurf.detect(), false);
  fs.mkdirSync(fx.home(...W), { recursive: true });
  assert.strictEqual(windsurf.detect(), true);
  assert.strictEqual(windsurf.gate, 'hard');
  assert.strictEqual(windsurf.tierLabel, 'hard-reduced');
});

test('install into existing files: pre_run_command gate, pre_user_prompt kairos, min rules section, owned MCP', () => {
  seed();
  run();
  const hooks = fx.readJson(...W, 'hooks.json').hooks;
  assert.deepStrictEqual(hooks.post_write_code, USER_HOOKS.hooks.post_write_code);
  assert.match(hooks.pre_run_command[0].command, /pyle\.cjs" auto --adapter windsurf$/);
  assert.strictEqual(hooks.pre_run_command[0].show_output, true);
  assert.match(hooks.pre_user_prompt[0].command, /kairos\.cjs" --adapter windsurf$/);
  const rules = fx.read(...W, 'memories', 'global_rules.md');
  assert.ok(rules.startsWith(USER_RULES));
  assert.ok(rules.includes(renderRules('min').trim().split('\n').pop()));
  assert.ok(rules.length <= 6000);
  const mcp = fx.readJson(...W, 'mcp_config.json').mcpServers;
  assert.deepStrictEqual(mcp.github, USER_MCP.mcpServers.github);
  assert.deepStrictEqual(mcp.atlas, { command: '/usr/local/bin/codebase-memory-mcp', args: ['--stdio'] });
  assert.deepStrictEqual(mcp.biblos, { serverUrl: 'https://mcp.context7.com/mcp' });
});

test('only existing files are written: a bare tool dir gets nothing and two ⚠ lines', () => {
  fs.mkdirSync(fx.home(...W), { recursive: true });
  fx.write(fx.CLAUDE_MCP, '.claude', '.mcp.json');
  const q = fx.quiet();
  const res = run(q);
  assert.deepStrictEqual(fs.readdirSync(fx.home(...W)), []);
  assert.ok(!fx.exists('.config', 'devin'));
  assert.ok(q.logs.some((m) => /^⚠ windsurf: gate NOT active — .*hooks\.json does not exist; fix: create ~\/\.codeium\/windsurf\/hooks\.json \(e\.g\. `\{\}`\) and rerun/.test(m)), q.logs.join('\n'));
  assert.ok(q.logs.some((m) => /^⚠ windsurf: rules NOT active — /.test(m)));
  assert.strictEqual(res.inactive.filter((p) => p.what === 'gate').length, 1, 'one gate line, not two');
});

test('MCP goes to whichever config exists, the Devin path included', () => {
  fs.mkdirSync(fx.home(...W), { recursive: true });
  fx.write(fx.CLAUDE_MCP, '.claude', '.mcp.json');
  fx.write({}, '.config', 'devin', 'mcp_config.json');
  run();
  assert.ok(fx.readJson('.config', 'devin', 'mcp_config.json').mcpServers.atlas);
  assert.ok(!fx.exists(...W, 'mcp_config.json'));
});

test('rules over the 6000-char cap are skipped with a ⚠ line and the file is left as is', () => {
  seed();
  const big = `${'x'.repeat(5500)}\n`;
  fx.write(big, ...W, 'memories', 'global_rules.md');
  const q = fx.quiet();
  run(q);
  assert.strictEqual(fx.read(...W, 'memories', 'global_rules.md'), big);
  assert.ok(q.logs.some((m) => /^⚠ windsurf: rules NOT active — global_rules\.md would exceed Windsurf's 6000-char cap/.test(m)));
});

test('idempotent, and uninstall restores every file byte-identically', async () => {
  seed();
  run();
  const files = [['hooks.json'], ['memories', 'global_rules.md'], ['mcp_config.json']];
  const snap = files.map((f) => fx.read(...W, ...f));
  run();
  assert.deepStrictEqual(files.map((f) => fx.read(...W, ...f)), snap);
  await uninstall({ yes: true, log: () => {} });
  assert.deepStrictEqual(fx.readJson(...W, 'hooks.json'), USER_HOOKS);
  assert.strictEqual(fx.read(...W, 'memories', 'global_rules.md'), USER_RULES);
  assert.deepStrictEqual(fx.readJson(...W, 'mcp_config.json'), USER_MCP);
});

test('selftest pipes a pre_run_command payload and gets exit 2', () => {
  seed();
  run();
  const res = selftest(windsurf);
  assert.ok(res.ok, res.detail);
  assert.ok(windsurf.doctor({}).every((r) => r.ok || r.level === 'warn'), JSON.stringify(windsurf.doctor({})));
  assert.deepStrictEqual(fs.readdirSync(osHome.osHome), []);
});

test('Devin MCP candidates: XDG_CONFIG_HOME and %APPDATA% only for real-home installs', () => {
  const { devinMcpFiles } = windsurf;
  const home = '/h';
  const homeFile = path.join(home, '.config', 'devin', 'mcp_config.json');
  assert.deepStrictEqual(devinMcpFiles({ XDG_CONFIG_HOME: '/x' }, { platform: 'linux', redirected: false, home }), [path.join('/x', 'devin', 'mcp_config.json'), homeFile]);
  assert.deepStrictEqual(devinMcpFiles({ APPDATA: 'C:\\Users\\u\\AppData\\Roaming' }, { platform: 'win32', redirected: false, home }).length, 2);
  assert.deepStrictEqual(devinMcpFiles({ XDG_CONFIG_HOME: '/x', APPDATA: '/a' }, { platform: 'win32', redirected: true, home }), [homeFile]);
});

test('doctor: a missing global_rules.md is a warning, matching install', () => {
  fs.mkdirSync(fx.home(...W), { recursive: true });
  fx.write({}, ...W, 'hooks.json');
  run();
  const row = windsurf.doctor({}).find((r) => /global_rules/.test(r.name));
  assert.strictEqual(row.ok, false);
  assert.strictEqual(row.level, 'warn');
  assert.match(row.status, /does not exist/);
});

