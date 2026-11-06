'use strict';
require('./helpers/tmp-cleanup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync, spawn } = require('node:child_process');
const fx = require('./helpers/adapter-fixture');
fx.useFixtureHome();
function cli(args) { return spawnSync(process.execPath, [path.join(__dirname, '../bin/exonous.js'), 'handoff', ...args], { cwd: fx.home(), env: process.env, encoding: 'utf8' }); }
test('CLI save/latest emit structured results without creating absent vaults', () => {
  fx.write({ v: 1, k: 'pr', g: [['pr', 'url', 'https://github.com/acme/project/pull/1'], ['pr', 'proof', 'checks passed'], ['pr', 'next', 'review']] }, 'body.json');
  const absent = cli(['save', '--body-file', fx.home('body.json')]);
  assert.equal(absent.status, 0, absent.stderr);
  assert.equal(JSON.parse(absent.stdout).reason, 'no-vault');
  fs.mkdirSync(fx.home('exonous-vault'));
  const saved = cli(['save', '--body-file', fx.home('body.json')]);
  assert.equal(saved.status, 0, saved.stderr);
  const latest = cli(['latest', '--json']);
  assert.equal(latest.status, 0, latest.stderr);
  assert.equal(JSON.parse(latest.stdout).path, JSON.parse(saved.stdout).path);
  assert.equal(cli(['save']).status, 2);
});

test('concurrent CLI PR saves publish one complete note without temporary leftovers', async () => {
  fs.mkdirSync(fx.home('exonous-vault'));
  fx.write({ v: 1, k: 'pr', g: [['pr', 'url', 'https://github.com/acme/project/pull/2'], ['pr', 'proof', 'created'], ['pr', 'next', 'review']] }, 'body.json');
  const save = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '../bin/exonous.js'), 'handoff', 'save', '--body-file', fx.home('body.json')], { cwd: fx.home(), env: process.env });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => { try { assert.equal(code, 0, stderr); resolve(JSON.parse(stdout)); } catch (error) { reject(error); } });
  });
  const results = await Promise.all([save(), save(), save(), save()]);
  assert.equal(results.filter((result) => result.status === 'saved').length, 1);
  assert.equal(results.filter((result) => result.status === 'already-saved').length, 3);
  assert.equal(new Set(results.map((result) => result.path)).size, 1);
  const file = results[0].path;
  const note = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(note.g[0][2], 'https://github.com/acme/project/pull/2');
  assert.deepEqual(fs.readdirSync(path.dirname(file)), [path.basename(file)]);
});

test('legacy PR command explains the native upgrade and performs no creation', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, '../bin/exonous.js'), 'pr', 'create', '--title', 'private title'], { cwd: fx.home(), env: process.env, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /requires the native CLI/);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.includes('private title'), false);
});
