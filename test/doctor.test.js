#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { test } = require('node:test');
const fx = require('./helpers/adapter-fixture');

fx.useFixtureHome();
process.env.GIT_CONFIG_GLOBAL = '/dev/null';
process.env.GIT_CONFIG_NOSYSTEM = '1';

const BIN = path.join(__dirname, '..', 'bin', 'exonous.js');
const posixUid = process.platform === 'win32' ? 'posix uid' : false;
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

test('files under ~/.claude/exonous owned by another uid are listed with the chown fix', { skip: posixUid }, () => {
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

test('old repo-install files in the current directory point to setup or migrate; the dependency alone is repo mode', () => {
  fs.mkdirSync(fx.home('.claude'));
  cli(['install', '--quiet']);
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'v2repo-')));
  fs.writeFileSync(path.join(repo, 'package.json'), '{"devDependencies":{"exonous":"github:zaqueu-1/exonous#v2.0.0"}}\n');
  fs.mkdirSync(path.join(repo, '.claude', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.claude', 'hooks', 'pyle.sh'), '#!/bin/sh\n');
  assert.ok(!/old repo-install files in/.test(cli(['doctor'], { cwd: repo }).out), 'not a git repo yet');
  execFileSync('git', ['init', '-q', repo], { env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
  const { out } = cli(['doctor'], { cwd: repo });
  assert.match(out, new RegExp(`✗ old repo-install files in ${repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(out, /fix: run `npx exonous setup` here \(keeps the dependency\) or `exonous migrate` \(drops it\)/);
  fs.rmSync(path.join(repo, '.claude'), { recursive: true });
  assert.ok(!/old repo-install files in/.test(cli(['doctor'], { cwd: repo }).out), 'the dependency alone is repo mode, not a leftover');
  assert.ok(!/old repo-install files in/.test(cli(['doctor'], { cwd: os.tmpdir() }).out));
});

test('the home is never a repo: doctor stays quiet there and migrate refuses it', () => {
  fs.mkdirSync(fx.home('.claude'));
  cli(['install', '--quiet']);
  const home = fx.home();
  const rules = path.join(home, '.claude', 'rules', 'exonous');
  const before = fs.readdirSync(rules).length;
  execFileSync('git', ['init', '-q', home], { env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
  assert.ok(!/old repo-install files in/.test(cli(['doctor'], { cwd: home }).out));
  const res = cli(['migrate', '--repo', home]);
  assert.match(res.out, /home directory \(or above it\), not a repo/);
  assert.strictEqual(fs.readdirSync(rules).length, before);
});

test('the vault row shows the resolved path and where it came from', () => {
  fs.mkdirSync(fx.home('.claude'));
  cli(['install', '--quiet']);
  const fallback = fx.home('exonous-vault');
  assert.match(cli(['doctor']).out, new RegExp(`✓ vault \\(project memory, handoffs, docs\\) \\(${fallback.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} via exonous-config\\)`));
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'env-vault-'));
  try {
    assert.match(cli(['doctor'], { env: { PROJECT_MEMORY_VAULT: elsewhere } }).out, /✓ vault .* via env\)/);
  } finally {
    fs.rmSync(elsewhere, { recursive: true, force: true });
  }
  fx.write({ vault: path.join(os.tmpdir(), 'no-such-vault-xyz') }, '.claude', 'skills', 'project-memory', 'config.json');
  const { out } = cli(['doctor']);
  assert.match(out, /✗ vault .*no-such-vault-xyz via skill-config — missing\)/);
  assert.match(out, /fix: exonous vault detect, then exonous vault set <path>/);
  fx.write('{oops', '.claude', 'exonous', 'config.json');
  fs.rmSync(fx.home('.claude', 'skills', 'project-memory', 'config.json'));
  assert.match(cli(['doctor']).out, /✗ vault .*not valid JSON/);
});
