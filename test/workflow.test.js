#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const { workflow, workflowText } = require('../src/workflow');

const SKILLS = path.join(__dirname, '..', 'assets', 'skills');

test('commit and pr print their skill body without frontmatter', () => {
  for (const [kind, skill] of [['commit', 'commit-changes'], ['pr', 'make-pr']]) {
    const source = fs.readFileSync(path.join(SKILLS, skill, 'SKILL.md'), 'utf8');
    const text = workflowText(kind);
    assert.ok(!text.startsWith('---'), kind);
    assert.doesNotMatch(text, /^description:/m, kind);
    assert.ok(source.endsWith(text), kind);
    assert.ok(text.trim().length > 200, kind);
  }
});

test('workflow writes the text to the given stream', () => {
  let out = '';
  workflow('commit', { write: (s) => { out += s; } });
  assert.strictEqual(out, workflowText('commit'));
});

test('unknown workflows are rejected with the valid names', () => {
  assert.throws(() => workflowText('deploy'), /commit, pr/);
});
