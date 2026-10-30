#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { test } = require('node:test');
const fx = require('./helpers/adapter-fixture');

fx.useFixtureHome();
process.env.GIT_CONFIG_GLOBAL = os.devNull;
process.env.GIT_CONFIG_NOSYSTEM = '1';

const BIN = path.join(__dirname, '..', 'bin', 'exonous.js');
const ALL_DIRS = ['.claude', '.cursor', '.gemini', '.codex', '.config/opencode', '.codeium/windsurf/memories', '.copilot', 'Documents/Cline', '.qwen', '.kiro'];

function cli(args, { cwd = os.tmpdir(), env = {} } = {}) {
  const res = spawnSync(process.execPath, [BIN, ...args], { cwd, env: { ...process.env, ...env }, encoding: 'utf8' });
  return { code: res.status, out: res.stdout + res.stderr };
}

function allTools() {
  for (const dir of ALL_DIRS) fs.mkdirSync(fx.home(dir), { recursive: true });
  fx.write('{}\n', '.codeium', 'windsurf', 'hooks.json');
  fx.write('', '.codeium', 'windsurf', 'memories', 'global_rules.md');
  fx.write('model: x\n', '.aider.conf.yml');
  assert.strictEqual(cli(['install', '--quiet']).code, 0);
}

const matrixRow = (out, tool) => out.split('\n').find((l) => new RegExp(`^\\s*${tool}\\s+\\|`).test(l));

test('the coverage matrix has a row per tool with tier, rules, gate, commands, MCP and update', () => {
  allTools();
  const { out } = cli(['doctor']);
  assert.match(out, /Tool\s+\| Tier\s+\| Rules\s*\| Gate\s+\| Commands\s*\| MCP\s*\| Update/);
  for (const tool of ['claude', 'cursor', 'gemini', 'codex', 'opencode', 'windsurf', 'copilot']) {
    assert.match(matrixRow(out, tool) || '', /hard \(registered, selftest ok\)/, tool);
  }
  for (const tool of ['cline', 'qwen', 'kiro']) assert.match(matrixRow(out, tool) || '', /soft: not enforced/, tool);
  assert.match(matrixRow(out, 'aider') || '', /unsupported/);
  assert.match(matrixRow(out, 'claude'), /\| full\s+\| ✓/);
  assert.match(matrixRow(out, 'windsurf'), /\| hard-reduced/);
  assert.match(matrixRow(out, 'gemini'), /\| ✓\s*\| [⚠✓]\s*\| ✓\s*$/, 'commands ok, MCP copied only from Claude, update ok');
});

test('tools not on the machine show "not installed"; disabled ones "skipped"', () => {
  fs.mkdirSync(fx.home('.claude'));
  fs.mkdirSync(fx.home('.gemini'));
  fx.write({ disabledTools: ['gemini'] }, '.claude', 'exonous', 'config.json');
  cli(['install', '--quiet']);
  const { out } = cli(['doctor']);
  assert.match(matrixRow(out, 'codex') || '', /not installed/);
  assert.match(matrixRow(out, 'gemini') || '', /skipped/);
});

test('a hook script edited after install is flagged against the ledger', () => {
  fs.mkdirSync(fx.home('.claude'));
  cli(['install', '--quiet']);
  assert.match(cli(['doctor']).out, /✓ hook scripts match the install/);
  fs.appendFileSync(fx.home('.claude', 'exonous', 'hooks', 'pyle.cjs'), '\n// edited\n');
  assert.match(cli(['doctor']).out, /✗ hook scripts match the install \(1 changed: hooks\/pyle\.cjs\)/);
});

test('files under ~/.claude/exonous owned by another uid are listed with the chown fix', () => {
  fs.mkdirSync(fx.home('.claude'));
  cli(['install', '--quiet']);
  assert.match(cli(['doctor']).out, /✓ files in ~\/\.claude\/exonous owned by you/);
  const { out } = cli(['doctor'], { env: { EXONOUS_TEST: '1', EXONOUS_TEST_UID: String(process.getuid() + 1) } });
  assert.match(out, /✗ files in ~\/\.claude\/exonous owned by you \(\d+ not: \., /);
  assert.match(out, /fix: sudo chown -R "\$\(id -un\)" ~\/\.claude\/exonous/);
});

test('no tracked hook entries is a warning to reinstall', () => {
  fs.mkdirSync(fx.home('.claude'));
  cli(['install', '--quiet']);
  fs.rmSync(fx.home('.claude', 'exonous', 'installed.json'));
  assert.match(cli(['doctor']).out, /⚠ hook scripts match the install \(no hook entries tracked — reinstall\)/);
});

test('install.json pm binary and a vanished packageRoot are reported with the global install command', () => {
  fs.mkdirSync(fx.home('.claude'));
  cli(['install', '--quiet']);
  const file = fx.home('.claude', 'exonous', 'install.json');
  const info = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...info, pm: 'pnpm', pmPath: null, packageRoot: path.join(os.tmpdir(), 'gone-repo', 'node_modules', 'exonous') }));
  const { out } = cli(['doctor']);
  assert.match(out, /✗ package manager \(pnpm\) on PATH/);
  assert.match(out, /⚠ exonous package location .*gone-repo.* is gone/);
  assert.match(out, /pnpm add -g github:zaqueu-1\/exonous/);
});

test('a repo-mode install in the current directory points to exonous migrate', () => {
  fs.mkdirSync(fx.home('.claude'));
  cli(['install', '--quiet']);
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'v2repo-')));
  fs.writeFileSync(path.join(repo, 'package.json'), '{"devDependencies":{"exonous":"github:zaqueu-1/exonous#v2.0.0"}}\n');
  const { out } = cli(['doctor'], { cwd: repo });
  assert.match(out, new RegExp(`✗ repo-mode install in ${repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(out, /fix: run `exonous migrate` here/);
  assert.ok(!/repo-mode install in/.test(cli(['doctor'], { cwd: os.tmpdir() }).out));
});
