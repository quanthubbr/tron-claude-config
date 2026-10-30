#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');
const { findDependency, legacyDependencies } = require('../src/update');

function repo(pkg) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'update-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg));
  return root;
}

test('a legacy name listed next to exonous is still reported for removal', () => {
  const root = repo({ devDependencies: { exonous: 'github:zaqueu-1/exonous#v2.0.0', '@tron/claude-config': 'github:zaqueu-1/exonous#v1.15.2' } });
  assert.strictEqual(findDependency(root).name, 'exonous');
  assert.deepStrictEqual(legacyDependencies(root), ['@tron/claude-config']);
});

test('a repo on exonous alone has no legacy dependencies', () => {
  const root = repo({ devDependencies: { exonous: 'github:zaqueu-1/exonous#v2.0.0' } });
  assert.deepStrictEqual(legacyDependencies(root), []);
});
