#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const { renderRules, VARIANTS } = require('../src/lib/render-rules');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'assets', 'rules', 'nomos.md'), 'utf8');
const headings = (text) => text.split('\n').filter((l) => l.startsWith('## '));

test('full is the source unchanged', () => {
  assert.strictEqual(renderRules('full'), SOURCE);
});

test('no-agents drops the roster section and keeps every other section', () => {
  const out = renderRules('no-agents');
  assert.ok(!out.includes('## Agents'));
  assert.ok(!/\| `exo-/.test(out));
  assert.deepStrictEqual(headings(out), headings(SOURCE).filter((h) => !h.startsWith('## Agents')));
  assert.ok(out.endsWith('\n') && !out.endsWith('\n\n'));
});

test('min keeps the gates and core discipline inside 3 KB', () => {
  const out = renderRules('min');
  assert.ok(Buffer.byteLength(out) <= 3072, `${Buffer.byteLength(out)} B`);
  assert.ok(out.startsWith('# Nomos'));
  assert.match(out, /Pillars/);
  for (const h of ['## Communication', '## Engineering', '## Verify', '## Git']) assert.ok(out.includes(h), h);
  for (const h of ['## Agents', '## UI work', '## Context economy']) assert.ok(!out.includes(h), h);
});

test('unknown variants and a source missing a required section throw', () => {
  assert.deepStrictEqual(VARIANTS, ['full', 'no-agents', 'min']);
  assert.throws(() => renderRules('tiny'), /variant/);
  assert.throws(() => renderRules('min', '# Nomos\n\n## Communication\n- x\n'), /Engineering/);
});
