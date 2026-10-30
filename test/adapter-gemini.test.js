#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const { test } = require('node:test');
const { install } = require('../src/install');
const { uninstall } = require('../src/uninstall');
const { selftest, ADAPTERS } = require('../src/adapters');
const fx = require('./helpers/adapter-fixture');

const osHome = fx.useFixtureHome();
const gemini = ADAPTERS.find((a) => a.id === 'gemini');
const USER_SETTINGS = {
  theme: 'dark',
  hooks: { BeforeTool: [{ matcher: 'write_file', hooks: [{ type: 'command', command: 'my-lint' }] }] },
  mcpServers: { github: { command: 'gh-mcp' } },
};
const USER_MD = '# My Gemini notes\n\nAlways answer in Portuguese.\n';

function seed() {
  fx.write(USER_SETTINGS, '.gemini', 'settings.json');
  fx.write(USER_MD, '.gemini', 'GEMINI.md');
  fx.write(fx.CLAUDE_MCP, '.claude', '.mcp.json');
}
const run = (opts = {}) => install({ external: false, execPath: process.execPath, tools: ['gemini'], ...fx.quiet(), ...opts });

test('detects ~/.gemini or gemini on PATH', () => {
  assert.strictEqual(gemini.detect(), false);
  fs.mkdirSync(fx.home('.gemini'));
  assert.strictEqual(gemini.detect(), true);
  assert.strictEqual(gemini.tier, 1);
  assert.strictEqual(gemini.gate, 'hard');
});

test('install: rules import, gate + kairos hooks, owned MCP entries, commands; user content kept', () => {
  seed();
  run();
  const md = fx.read('.gemini', 'GEMINI.md');
  assert.ok(md.startsWith(USER_MD), 'user text first, untouched');
  assert.ok(md.includes(`@${fx.home('.claude', 'exonous', 'rules', 'nomos.md')}`));
  assert.ok(fx.exists('.claude', 'exonous', 'rules', 'nomos.md'), 'the imported file exists');
  const s = fx.readJson('.gemini', 'settings.json');
  assert.strictEqual(s.theme, 'dark');
  assert.deepStrictEqual(s.hooks.BeforeTool[0], USER_SETTINGS.hooks.BeforeTool[0]);
  const gate = s.hooks.BeforeTool[1];
  assert.strictEqual(gate.matcher, 'run_shell_command');
  assert.match(gate.hooks[0].command, /pyle\.cjs" auto --adapter gemini$/);
  assert.match(s.hooks.SessionStart[0].hooks[0].command, /kairos\.cjs" --adapter gemini$/);
  assert.deepStrictEqual(s.mcpServers.github, { command: 'gh-mcp' });
  assert.deepStrictEqual(s.mcpServers.atlas, { command: '/usr/local/bin/codebase-memory-mcp', args: ['--stdio'] });
  assert.deepStrictEqual(s.mcpServers.biblos, { httpUrl: 'https://mcp.context7.com/mcp' });
  assert.ok(!JSON.stringify(s).includes('secret'), 'no headers or env copied');
  for (const name of ['commit-changes', 'make-pr', 'code-review', 'security-review']) {
    assert.match(fx.read('.gemini', 'commands', `${name}.toml`), /^description = /);
  }
});

test('idempotent: a second install changes nothing', () => {
  seed();
  run();
  const snap = ['GEMINI.md', 'settings.json', 'commands/make-pr.toml'].map((f) => fx.read('.gemini', f));
  run();
  assert.deepStrictEqual(['GEMINI.md', 'settings.json', 'commands/make-pr.toml'].map((f) => fx.read('.gemini', f)), snap);
});

test('no MCP entries without a Claude registration; a user-owned atlas is never replaced or removed', async () => {
  fx.write({ mcpServers: { atlas: { command: 'my-atlas' } } }, '.gemini', 'settings.json');
  run();
  assert.deepStrictEqual(fx.readJson('.gemini', 'settings.json').mcpServers, { atlas: { command: 'my-atlas' } });
  fx.write(fx.CLAUDE_MCP, '.claude', '.mcp.json');
  run();
  assert.deepStrictEqual(fx.readJson('.gemini', 'settings.json').mcpServers.atlas, { command: 'my-atlas' });
  await uninstall({ yes: true, log: () => {} });
  assert.deepStrictEqual(fx.readJson('.gemini', 'settings.json').mcpServers, { atlas: { command: 'my-atlas' } });
});

test('an MCP entry whose args or URL look secret-bearing is not copied, and the user is told', () => {
  fx.write({ mcpServers: {
    atlas: { command: 'atlas', args: ['--api-key', 'abc123'] },
    biblos: { type: 'http', url: 'https://mcp.context7.com/mcp?token=abc' },
  } }, '.claude', '.mcp.json');
  fs.mkdirSync(fx.home('.gemini'));
  const q = fx.quiet();
  install({ external: false, execPath: process.execPath, tools: ['gemini'], ...q });
  assert.strictEqual(fx.readJson('.gemini', 'settings.json').mcpServers, undefined);
  assert.ok(!fx.read('.gemini', 'settings.json').includes('abc'));
  assert.ok(q.logs.some((m) => /atlas MCP not copied/.test(m)) && q.logs.some((m) => /biblos MCP not copied/.test(m)));
});

test('invalid settings.json aborts that file with a warning and leaves it byte-identical', () => {
  fx.write('{ "theme": "dark", // comment\n}', '.gemini', 'settings.json');
  const q = fx.quiet();
  install({ external: false, execPath: process.execPath, tools: ['gemini'], ...q });
  assert.strictEqual(fx.read('.gemini', 'settings.json'), '{ "theme": "dark", // comment\n}');
  assert.ok(q.logs.some((m) => /WARN: .*settings\.json is not valid JSON/.test(m)));
  assert.ok(q.logs.some((m) => /^⚠ gemini: gate NOT active — .*not valid JSON.*; fix: .*--rewrite-jsonc/.test(m)), q.logs.join('\n'));
});

test('--rewrite-jsonc turns a commented settings.json into JSON (backup kept) and the gate becomes active', () => {
  const raw = '{\n  // mine\n  "theme": "dark",\n}\n';
  fx.write(raw, '.gemini', 'settings.json');
  const q = fx.quiet();
  const res = install({ external: false, execPath: process.execPath, tools: ['gemini'], rewriteJsonc: true, ...q });
  assert.deepStrictEqual(res.inactive, []);
  const s = fx.readJson('.gemini', 'settings.json');
  assert.strictEqual(s.theme, 'dark');
  assert.ok(JSON.stringify(s.hooks).includes('pyle.cjs'));
  assert.strictEqual(fx.read('.gemini', 'settings.json.exonous-jsonc.bak'), raw);
  assert.ok(q.logs.some((m) => /comments or trailing commas — they were removed/.test(m)));
  assert.ok(!q.logs.some((m) => m.startsWith('⚠')));
});

test('uninstall restores the user files', async () => {
  seed();
  run();
  await uninstall({ yes: true, log: () => {} });
  assert.strictEqual(fx.read('.gemini', 'GEMINI.md'), USER_MD);
  assert.deepStrictEqual(fx.readJson('.gemini', 'settings.json'), USER_SETTINGS);
  assert.ok(!fx.exists('.gemini', 'commands', 'make-pr.toml'));
});

test('selftest pipes a Gemini BeforeTool payload to the registered gate and gets a deny', () => {
  seed();
  run();
  const res = selftest(gemini);
  assert.ok(res.ok, res.detail);
  assert.ok(gemini.doctor({}).every((r) => r.ok), JSON.stringify(gemini.doctor({})));
  assert.deepStrictEqual(fs.readdirSync(osHome.osHome), [], 'os.homedir() untouched');
});
