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
