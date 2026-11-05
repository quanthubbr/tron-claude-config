'use strict';
require('./helpers/tmp-cleanup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const fx = require('./helpers/adapter-fixture');
fx.useFixtureHome();
function cli(args) { return spawnSync(process.execPath, [path.join(__dirname, '../bin/exonous.js'), 'handoff', ...args], { cwd: fx.home(), env: process.env, encoding: 'utf8' }); }
test('CLI save/latest emit structured results without creating absent vaults', () => {
  fx.write({ v: 1, k: 'pr', g: [['pr', 'result', 'https://example.test/pull/1'], ['pr', 'proof', 'checks passed'], ['pr', 'next', 'review']] }, 'body.json');
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
