#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');
const { advise, LINE_LIMIT } = require('../assets/machine/hooks/lib/metron.cjs');

function fixture(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metron-'));
  const file = path.join(dir, 'f.txt');
  fs.writeFileSync(file, Array.from({ length: lines }, (_, i) => `line ${i}`).join('\n'));
  return file;
}

test('advises on a whole-file read of a large file', () => {
  const file = fixture(LINE_LIMIT + 50);
  assert.match(advise({ tool_input: { file_path: file } }), /locate first/);
});

test('stays silent for small files', () => {
  assert.strictEqual(advise({ tool_input: { file_path: fixture(10) } }), null);
});

test('stays silent when a range is requested', () => {
  const file = fixture(LINE_LIMIT + 50);
  assert.strictEqual(advise({ tool_input: { file_path: file, offset: 10, limit: 20 } }), null);
});

test('stays silent for missing files and bad input', () => {
  assert.strictEqual(advise({ tool_input: { file_path: '/nope/missing.txt' } }), null);
  assert.strictEqual(advise({}), null);
});
