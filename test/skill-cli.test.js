'use strict';
require('./helpers/tmp-cleanup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const fx = require('./helpers/adapter-fixture');
fx.useFixtureHome();

const BIN = path.join(__dirname, '../bin/exonous.js');
const run = (args) => spawnSync(process.execPath, [BIN, ...args], { cwd: fx.home(), env: process.env, encoding: 'utf8' });
const ECHO = "console.log(JSON.stringify({ from: process.env.TAG, args: process.argv.slice(2) })); process.exit(7);\n";
function engine(dir, file, tag) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), `process.env.TAG = ${JSON.stringify(tag)};\n${ECHO}`);
}

test('skill commands run the installed engine, pass arguments through and keep its exit code', () => {
  engine(fx.home('.agents', 'skills', 'issue-board'), 'board.mjs', 'installed');
  const result = run(['issue-board', 'render', '--width', '100']);
  assert.equal(result.status, 7, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { from: 'installed', args: ['render', '--width', '100'] });
});

test('--skill-dir selects another copy and a missing engine fails without running anything', () => {
  const other = fx.home('elsewhere', 'ui-design');
  engine(other, path.join('scripts', 'ui-design.mjs'), 'explicit');
  const picked = run(['ui-design', '--skill-dir', other, 'context']);
  assert.equal(picked.status, 7, picked.stderr);
  assert.deepEqual(JSON.parse(picked.stdout), { from: 'explicit', args: ['context'] });
  const missing = run(['doc', '--skill-dir', fx.home('nope'), 'locate']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /doc\.mjs not found/);
  assert.equal(run(['doc', '--skill-dir']).status, 2);
});

test('without an install the packaged engine answers with its own no-vault exit', () => {
  const result = run(['project-memory', 'search', 'x', '--project', 'demo']);
  assert.equal(result.status, 3, result.stderr);
  assert.match(result.stdout + result.stderr, /No vault configured/);
});
