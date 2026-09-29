#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isCavemanOptedOut, cavemanOptOutMarker, stripCaveman } = require('./caveman-opt-out');

const RULES = path.join(__dirname, '../../managed/claude/rules');

// The opt-out follows the marker file, and only the marker file.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'caveman-opt-out-'));
assert.strictEqual(isCavemanOptedOut(home), false);
fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
fs.writeFileSync(cavemanOptOutMarker(home), '');
assert.strictEqual(isCavemanOptedOut(home), true);
fs.rmSync(home, { recursive: true, force: true });

// Every rule the package installs comes out of the strip with no caveman left in it.
for (const file of ['harness-enforcement.md', 'agent-isolation.md']) {
  const original = fs.readFileSync(path.join(RULES, file), 'utf8');
  assert.match(original, /caveman/i, `${file} no longer mentions caveman; this test is stale`);
  const stripped = stripCaveman(original);
  assert.doesNotMatch(stripped, /caveman/i, `${file} still mentions caveman`);
  assert.doesNotMatch(stripped, /\n---\n\n---\n/, `${file} kept a doubled separator`);
  assert.doesNotMatch(stripped, /\n{3,}/, `${file} kept a run of blank lines`);
}

// The strip removes lines, it never rewrites the ones that stay.
const table = '| a | b |\n|---|---|\n| Caveman | x |\n| Karpathy | y |\n';
assert.strictEqual(stripCaveman(table), '| a | b |\n|---|---|\n| Karpathy | y |\n');

console.log('caveman-opt-out: ok');
