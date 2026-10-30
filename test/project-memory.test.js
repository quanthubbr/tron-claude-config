#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const { test } = require('node:test');

const CLI = path.join(__dirname, '../assets/skills/project-memory/project-memory.mjs');

function setup() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'project-memory-'));
  const repo = path.join(base, 'demo');
  const vault = path.join(base, 'vault');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.mkdirSync(path.join(vault, 'demo'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'src', 'store.js'), 'const a = 1\nfunction openStore() {\n  return wal()\n}\n');
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['add', '.'], { cwd: repo });
  fs.writeFileSync(path.join(vault, 'demo', 'CLAUDE.md'), '# Demo\nLegacy note about deploy pipelines.\n');
  const run = (...args) => spawnSync('node', [CLI, ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, PROJECT_MEMORY_VAULT: vault },
  });
  return { repo, vault, run };
}

test('add anchors evidence and search finds it locate-first', () => {
  const { run } = setup();
  const add = run('add', 'adr', '--title', 'Use WAL mode', '--body', 'Readers never block writers.',
    '--tag', 'db', '--link', 'symbol:openStore', '--evidence', 'src/store.js:2-4');
  assert.strictEqual(add.status, 0, add.stderr);
  assert.match(add.stdout, /^adr-0001 {2}memory\/adr\/adr-0001-use-wal-mode\.md/);

  const search = run('search', 'wal writers');
  assert.strictEqual(search.status, 0, search.stderr);
  assert.match(search.stdout.split('\n')[0], /^adr-0001 {2}\[adr \(active\)\] {2}Use WAL mode/);
  assert.doesNotMatch(search.stdout, /tags:/);

  const show = run('show', 'adr-0001');
  assert.match(show.stdout, /evidence: src\/store\.js:2-4#[0-9a-f]{8}/);
});

test('search also ranks plain vault notes', () => {
  const { run } = setup();
  const search = run('search', 'deploy pipelines');
  assert.match(search.stdout, /^CLAUDE\.md {2}\[note\]/);
});

test('validate reports moved and drifted evidence and unresolved symbols', () => {
  const { repo, run } = setup();
  run('add', 'doc', '--title', 'Store opening', '--body', 'x', '--evidence', 'src/store.js:2-4', '--link', 'symbol:openStore');
  assert.strictEqual(run('validate').status, 0);

  fs.writeFileSync(path.join(repo, 'src', 'store.js'), '// header\nconst a = 1\nfunction openStore() {\n  return wal()\n}\n');
  assert.match(run('validate').stdout, /moved src\/store\.js:2-4 → 3-5/);

  fs.writeFileSync(path.join(repo, 'src', 'store.js'), 'function openDb() {\n  return 1\n}\n// x\n');
  const out = run('validate');
  assert.strictEqual(out.status, 1);
  assert.match(out.stdout, /drift src\/store\.js:2-4/);
  assert.match(out.stdout, /unresolved symbol:openStore/);
});

test('plans are removable, durable kinds need --force, ids increment', () => {
  const { run } = setup();
  run('add', 'plan', '--title', 'Ship search', '--body', 'one query');
  assert.match(run('add', 'plan', '--title', 'Second', '--body', 'b').stdout, /^plan-0002/);
  assert.match(run('list', '--kind', 'plan', '--status', 'open').stdout, /plan-0001.*\n.*plan-0002/);
  assert.strictEqual(run('remove', 'plan-0001').status, 0);

  run('add', 'adr', '--title', 'Keep', '--body', 'b');
  assert.notStrictEqual(run('remove', 'adr-0001').status, 0);
  assert.strictEqual(run('remove', 'adr-0001', '--force').status, 0);
});

test('update merges tags and replaces body', () => {
  const { run } = setup();
  run('add', 'plan', '--title', 'Refactor: auth "flow"', '--body', 'old', '--tag', 'auth');
  assert.strictEqual(run('update', 'plan-0001', '--body', 'new body', '--add-tag', 'api', '--status', 'in-progress').status, 0);
  const show = run('show', 'plan-0001').stdout;
  assert.match(show, /Refactor: auth "flow"/);
  assert.match(show, /\[plan \(in-progress\)\]/);
  assert.match(show, /tags: auth, api/);
  assert.match(show, /new body/);
});

test('missing vault fails with exit 3', () => {
  const out = spawnSync('node', [CLI, 'list', '--project', 'x'], {
    encoding: 'utf8',
    env: { ...process.env, PROJECT_MEMORY_VAULT: path.join(os.tmpdir(), 'no-such-vault-xyz') },
  });
  assert.strictEqual(out.status, 3);
});

// Runs a copy of the CLI so the per-skill config.json lives in a temp dir, never in assets/.
function isolated({ skill, unified, env = {} } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'project-memory-cfg-'));
  const dirs = {
    skill: path.join(base, 'skill'),
    exonous: path.join(base, 'exo-home', '.claude', 'exonous'),
    unifiedVault: path.join(base, 'unified-vault'),
    skillVault: path.join(base, 'skill-vault'),
  };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(CLI, path.join(dirs.skill, 'project-memory.mjs'));
  const write = (dir, content) => content !== undefined && fs.writeFileSync(path.join(dir, 'config.json'), content);
  write(dirs.skill, skill && skill(dirs));
  write(dirs.exonous, unified && unified(dirs));
  const childEnv = { ...process.env, EXONOUS_HOME: path.join(base, 'exo-home'), HOME: path.join(base, 'home') };
  delete childEnv.PROJECT_MEMORY_VAULT;
  Object.assign(childEnv, env);
  const run = (...args) => spawnSync('node', [path.join(dirs.skill, 'project-memory.mjs'), ...args], {
    cwd: base,
    encoding: 'utf8',
    env: childEnv,
  });
  return { dirs, run };
}

const vaultJson = (key) => (dirs) => JSON.stringify({ vault: dirs[key] });
const addProbe = (run) => run('add', 'doc', '--project', 'demo', '--title', 'Probe', '--body', 'b');
const hasMemory = (vault) => fs.existsSync(path.join(vault, 'demo', 'memory', 'doc'));

test('unified exonous config under EXONOUS_HOME supplies the vault', () => {
  const { dirs, run } = isolated({ unified: vaultJson('unifiedVault') });
  const out = addProbe(run);
  assert.strictEqual(out.status, 0, out.stderr);
  assert.ok(hasMemory(dirs.unifiedVault));
});

test('per-skill config.json overrides the unified vault', () => {
  const { dirs, run } = isolated({ skill: vaultJson('skillVault'), unified: vaultJson('unifiedVault') });
  const out = addProbe(run);
  assert.strictEqual(out.status, 0, out.stderr);
  assert.ok(hasMemory(dirs.skillVault));
  assert.ok(!hasMemory(dirs.unifiedVault));
});

test('PROJECT_MEMORY_VAULT wins over both configs', () => {
  const envVault = fs.mkdtempSync(path.join(os.tmpdir(), 'project-memory-env-'));
  const { dirs, run } = isolated({
    skill: vaultJson('skillVault'),
    unified: vaultJson('unifiedVault'),
    env: { PROJECT_MEMORY_VAULT: envVault },
  });
  const out = addProbe(run);
  assert.strictEqual(out.status, 0, out.stderr);
  assert.ok(hasMemory(envVault));
  assert.ok(!hasMemory(dirs.skillVault) && !hasMemory(dirs.unifiedVault));
});

test('invalid JSON in the unified config fails loud', () => {
  const { run } = isolated({ unified: () => '{ not json' });
  const out = addProbe(run);
  assert.strictEqual(out.status, 3);
  assert.match(out.stderr, /Invalid .*config\.json/);
});

test('a non-string vault in the unified config fails loud', () => {
  const { run } = isolated({ unified: () => '{ "vault": 42 }' });
  const out = addProbe(run);
  assert.strictEqual(out.status, 3);
  assert.match(out.stderr, /"vault" must be a string/);
});

test('nothing configured exits 3 and points to exonous vault detect', () => {
  const { run } = isolated();
  const out = run('list', '--project', 'demo');
  assert.strictEqual(out.status, 3);
  assert.match(out.stderr, /exonous vault detect/);
});
