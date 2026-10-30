#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');
const { createHome, homeRel, sha256 } = require('../src/lib/home');

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'home-'));
  const src = path.join(dir, 'src.md');
  const dest = path.join(dir, 'dest.md');
  fs.writeFileSync(src, 'release v2\n');
  return { src, dest, logs: [] };
}

test('a user-edited file is backed up before it is replaced', () => {
  const { src, dest, logs } = sandbox();
  fs.writeFileSync(dest, 'my edits\n');
  const home = createHome({ log: (m) => logs.push(m), previous: { [homeRel(dest)]: sha256('release v1\n') } });
  home.sync(src, dest);
  assert.strictEqual(fs.readFileSync(dest, 'utf8'), 'release v2\n');
  assert.strictEqual(fs.readFileSync(`${dest}.bak`, 'utf8'), 'my edits\n');
});

test('an untouched file from the previous release is replaced without a backup', () => {
  const { src, dest, logs } = sandbox();
  fs.writeFileSync(dest, 'release v1\n');
  const home = createHome({ log: (m) => logs.push(m), previous: { [homeRel(dest)]: sha256('release v1\n') } });
  home.sync(src, dest);
  assert.strictEqual(fs.readFileSync(dest, 'utf8'), 'release v2\n');
  assert.ok(!fs.existsSync(`${dest}.bak`));
});

test('a missing source marks the ledger incomplete instead of throwing', () => {
  const { dest, logs } = sandbox();
  const home = createHome({ log: (m) => logs.push(m), previous: {} });
  home.sync(path.join(path.dirname(dest), 'missing.md'), dest);
  assert.strictEqual(home.ledger.complete, false);
  assert.ok(logs.some((m) => m.includes('not synced')));
});
