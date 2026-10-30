#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, beforeEach, afterEach } = require('node:test');
const { isolatedPath } = require('./helpers/adapter-fixture');
const { select, ADAPTERS } = require('../src/adapters');
const { install } = require('../src/install');
const { stripOwned } = require('../src/lib/settings');

const FOREIGN_CLAUDE = { model: 'opus', hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-guard' }] }], Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }] } };
const FOREIGN_CURSOR = { version: 1, hooks: { beforeShellExecution: [{ command: 'my-cursor-guard' }], afterFileEdit: [{ command: 'fmt' }] } };

let saved;
beforeEach(() => {
  saved = { home: process.env.EXONOUS_HOME, path: process.env.PATH };
  process.env.EXONOUS_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'adapters-home-'));
  process.env.PATH = isolatedPath();
});
afterEach(() => {
  for (const dir of [process.env.EXONOUS_HOME, process.env.PATH.split(path.delimiter)[0]]) {
    if (dir && dir.startsWith(os.tmpdir())) fs.rmSync(dir, { recursive: true, force: true });
  }
  for (const [key, value] of [['EXONOUS_HOME', saved.home], ['PATH', saved.path]]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const home = (...p) => path.join(process.env.EXONOUS_HOME, ...p);
const readJson = (...p) => JSON.parse(fs.readFileSync(home(...p), 'utf8'));
const writeJson = (value, ...p) => {
  fs.mkdirSync(path.dirname(home(...p)), { recursive: true });
  fs.writeFileSync(home(...p), `${JSON.stringify(value, null, 2)}\n`);
};
const quiet = () => {
  const logs = [];
  return { logs, log: (m) => logs.push(m) };
};
const run = (opts = {}) => install({ external: false, execPath: '/opt/node/bin/node', ...quiet(), ...opts });

test('every adapter implements the interface', () => {
  for (const a of ADAPTERS) {
    for (const key of ['id', 'tier', 'gate']) assert.ok(a[key] !== undefined, `${a.id}.${key}`);
    for (const fn of ['detect', 'install', 'uninstall', 'doctor']) assert.strictEqual(typeof a[fn], 'function', `${a.id}.${fn}`);
  }
});

test('selection: detected tools by default, flags narrow or widen, unknown names fail', () => {
  fs.mkdirSync(home('.claude'), { recursive: true });
  assert.deepStrictEqual(select({}).selected.map((a) => a.id), ['claude']);
  fs.mkdirSync(home('.cursor'), { recursive: true });
  assert.deepStrictEqual(select({}).selected.map((a) => a.id), ['claude', 'cursor']);
  assert.deepStrictEqual(select({ tools: ['cursor'] }).selected.map((a) => a.id), ['cursor']);
  assert.deepStrictEqual(select({ skip: ['cursor'] }).selected.map((a) => a.id), ['claude']);
  writeJson({ disabledTools: ['claude'] }, '.claude', 'exonous', 'config.json');
  assert.deepStrictEqual(select({}).selected.map((a) => a.id), ['cursor']);
  assert.deepStrictEqual(select({ tools: ['claude'] }).selected.map((a) => a.id), ['claude']);
  fs.rmSync(home('.cursor'), { recursive: true });
  assert.deepStrictEqual(select({ all: true }).selected.map((a) => a.id), ['cursor', 'gemini', 'codex', 'opencode', 'windsurf', 'copilot', 'cline', 'qwen', 'kiro'], '--all ignores detection, not disabledTools');
  fs.rmSync(home('.claude', 'exonous', 'config.json'));
  assert.deepStrictEqual(select({ all: true }).selected.map((a) => a.id), ['claude', 'cursor', 'gemini', 'codex', 'opencode', 'windsurf', 'copilot', 'cline', 'qwen', 'kiro']);
  assert.throws(() => select({ tools: ['vim'] }), /unknown tool: vim/);
});

test('claude: gate hooks join foreign hooks once, with the absolute node path', () => {
  writeJson(FOREIGN_CLAUDE, '.claude', 'settings.json');
  run();
  const first = fs.readFileSync(home('.claude', 'settings.json'), 'utf8');
  run();
  assert.strictEqual(fs.readFileSync(home('.claude', 'settings.json'), 'utf8'), first, 'idempotent');
  const settings = readJson('.claude', 'settings.json');
  assert.strictEqual(settings.model, 'opus');
  assert.deepStrictEqual(settings.hooks.Stop, FOREIGN_CLAUDE.hooks.Stop);
  const pre = settings.hooks.PreToolUse;
  assert.deepStrictEqual(pre[0], FOREIGN_CLAUDE.hooks.PreToolUse[0]);
  const gate = pre.filter((e) => JSON.stringify(e).includes('pyle.cjs'));
  assert.strictEqual(gate.length, 1);
  assert.strictEqual(gate[0].matcher, 'Bash');
  assert.strictEqual(gate[0].hooks[0].if, undefined);
  assert.strictEqual(gate[0].hooks[0].command, `"/opt/node/bin/node" "${home('.claude', 'exonous', 'hooks', 'pyle.cjs')}" auto --adapter claude`);
  assert.ok(pre.some((e) => e.matcher === 'Read' && JSON.stringify(e).includes('metron.cjs')));
  const taxis = Object.values(settings.hooks).flat().flatMap((e) => e.hooks || []).map((h) => h.command).filter((c) => c.includes('taxis.js'));
  assert.ok(taxis.length >= 2);
  for (const c of taxis) assert.strictEqual(c.startsWith(`"/opt/node/bin/node" "${home('.claude', 'exonous', 'taxis.js')}"`), true, c);
  assert.ok(!settings.permissions, 'no permissions without --permissions');
  assert.ok(fs.existsSync(home('.claude', 'rules', 'nomos.md')));
  assert.ok(fs.existsSync(home('.claude', 'commands', 'commit-changes.md')));
  assert.ok(fs.existsSync(home('.claude', 'rules', 'exonous', 'common')));
  assert.ok(fs.existsSync(home('.claude', 'exonous', 'hooks', 'pyle.cjs')));
});

test('claude: invalid settings.json is left byte-identical with a warning', () => {
  fs.mkdirSync(home('.claude'), { recursive: true });
  fs.writeFileSync(home('.claude', 'settings.json'), '{ broken');
  const out = quiet();
  install({ external: false, execPath: '/n', ...out });
  assert.strictEqual(fs.readFileSync(home('.claude', 'settings.json'), 'utf8'), '{ broken');
  assert.ok(out.logs.some((m) => /WARN/.test(m) && m.includes('settings.json')));
});

test('claude: --permissions adds only the read-only exonous CLI, never token minting; uninstall removes only ours', () => {
  writeJson({ permissions: { allow: ['Bash(make*)'] } }, '.claude', 'settings.json');
  run({ permissions: true });
  const allow = readJson('.claude', 'settings.json').permissions.allow;
  assert.deepStrictEqual(allow, ['Bash(make*)', 'Bash(exonous workflow*)', 'Bash(exonous template*)', 'Bash(exonous draft-path*)', 'Bash(exonous validate-pr*)']);
  ADAPTERS.find((a) => a.id === 'claude').uninstall({ dryRun: false, log: () => {} });
  const after = readJson('.claude', 'settings.json');
  assert.ok(after.permissions.allow.includes('Bash(make*)'));
  assert.ok(!after.permissions.allow.some((i) => i.startsWith('Bash(exonous ')));
  assert.ok(!JSON.stringify(after).includes('pyle.cjs'));
});

test('cursor: hooks, rule, skills; foreign hooks kept; nothing for cursor when it is absent', () => {
  fs.mkdirSync(home('.claude'), { recursive: true });
  run();
  assert.ok(!fs.existsSync(home('.cursor')), 'no ~/.cursor created when Cursor is not installed');
  writeJson(FOREIGN_CURSOR, '.cursor', 'hooks.json');
  run();
  run();
  const hooks = readJson('.cursor', 'hooks.json');
  assert.deepStrictEqual(hooks.hooks.afterFileEdit, FOREIGN_CURSOR.hooks.afterFileEdit);
  const shell = hooks.hooks.beforeShellExecution;
  assert.strictEqual(shell[0].command, 'my-cursor-guard');
  assert.strictEqual(shell.filter((e) => e.command.includes('pyle.cjs') && e.command.endsWith('auto --adapter cursor')).length, 1);
  assert.strictEqual(hooks.hooks.preToolUse.filter((e) => e.command.includes('/.agents/skills/ui-design/')).length, 1);
  assert.ok(fs.existsSync(home('.cursor', 'rules', 'nomos.mdc')));
  for (const name of ['commit-changes', 'make-pr', 'code-review', 'security-review']) {
    assert.match(fs.readFileSync(home('.cursor', 'skills', name, 'SKILL.md'), 'utf8'), new RegExp(`^---\\nname: ${name}\\n`), name);
  }
  const rows = ADAPTERS.find((a) => a.id === 'cursor').doctor({});
  assert.ok(rows.some((r) => /User Rules/.test(`${r.name} ${r.status || ''} ${r.fix || ''}`)));
  ADAPTERS.find((a) => a.id === 'cursor').uninstall({ dryRun: false, log: () => {} });
  const after = readJson('.cursor', 'hooks.json');
  assert.deepStrictEqual(after.hooks.beforeShellExecution, [{ command: 'my-cursor-guard' }]);
  assert.ok(!JSON.stringify(after).includes('ui-design/scripts'));
});

test('stripOwned leaves no empty hooks object behind on uninstall', () => {
  writeJson({ theme: 'x' }, '.claude', 'settings.json');
  run();
  ADAPTERS.find((a) => a.id === 'claude').uninstall({ dryRun: false, log: () => {} });
  const after = readJson('.claude', 'settings.json');
  assert.ok(!JSON.stringify(after.hooks || {}).includes('pyle'));
  assert.strictEqual(stripOwned(home('.claude', 'settings.json'), { format: 'claude', ownedMarker: '/.claude/exonous/hooks/' }).status, 'unchanged');
});

test('hook commands quote the node and hook paths for the shell', () => {
  const { hookCommand } = require('../src/lib/runtime');
  const cmd = hookCommand('/opt/we"ird $dir/`n`\\node', 'pyle.cjs', 'auto --adapter claude');
  assert.ok(cmd.startsWith('"/opt/we\\"ird \\$dir/\\`n\\`\\\\node" "'), cmd);
  const { execFileSync } = require('child_process');
  const echoed = execFileSync('/bin/sh', ['-c', `printf '%s\\n' ${cmd.replace(' auto --adapter claude', '')}`], { encoding: 'utf8' }).split('\n');
  assert.strictEqual(echoed[0], '/opt/we"ird $dir/`n`\\node');
});

test('selftest fails when the registered gate denies for the wrong reason or crashes', () => {
  const { selftest } = require('../src/adapters');
  fs.mkdirSync(home('.claude'), { recursive: true });
  run({ tools: ['claude'], execPath: process.execPath });
  const claude = ADAPTERS.find((a) => a.id === 'claude');
  assert.ok(selftest(claude).ok, selftest(claude).detail);
  const fake = home('fake-gate.sh');
  for (const body of ['echo "fatal: not a git repository" >&2; exit 2', 'exit 2', 'exit 0']) {
    fs.writeFileSync(fake, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    const settings = readJson('.claude', 'settings.json');
    for (const entry of settings.hooks.PreToolUse) for (const h of entry.hooks) if (h.command.includes('pyle.cjs')) h.command = `"${process.execPath}" "${home('noop.js')}" pyle.cjs; sh "${fake}"`;
    writeJson(settings, '.claude', 'settings.json');
    fs.writeFileSync(home('noop.js'), '');
    const res = selftest(claude);
    assert.strictEqual(res.ok, false, body);
    assert.match(res.detail, /did not deny with a review hint/);
  }
});
