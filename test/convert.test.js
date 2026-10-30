#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const { toTomlCommand } = require('../src/lib/convert/toml-command');
const { splitFrontmatter, toMdCommand, toOpencodeAgent } = require('../src/lib/convert/md-command');

// Reads the two string forms the converter emits: a JSON-compatible basic string or a ''' literal block.
function parseToml(text) {
  const out = {};
  const re = /^([A-Za-z_]+) = (?:'''\n([\s\S]*?)'''|("(?:[^"\\\n]|\\.)*"))$/gm;
  let m;
  while ((m = re.exec(text))) out[m[1]] = m[2] !== undefined ? m[2] : JSON.parse(m[3]);
  return out;
}

const SKILL = `---
description: Commit the "current" changes, then push.
argument-hint: [message]
model: sonnet
---

Run \`git status\`.
Message: $ARGUMENTS
Path C:\\tmp and ''' quotes and """ too.
`;

test('frontmatter splits into fields and body', () => {
  const { fields, body } = splitFrontmatter(SKILL);
  assert.deepStrictEqual(fields, { description: 'Commit the "current" changes, then push.', 'argument-hint': '[message]', model: 'sonnet' });
  assert.ok(body.startsWith('Run `git status`.'));
  assert.deepStrictEqual(splitFrontmatter('no frontmatter'), { fields: {}, body: 'no frontmatter' });
});

test('Gemini .toml: description + prompt, $ARGUMENTS → {{args}}, round-trips through a TOML string reader', () => {
  const toml = toTomlCommand(SKILL);
  const parsed = parseToml(toml);
  assert.strictEqual(parsed.description, 'Commit the "current" changes, then push.');
  assert.ok(parsed.prompt.includes('Message: {{args}}'));
  assert.ok(parsed.prompt.includes('C:\\tmp and \'\'\' quotes and """ too.'));
  assert.ok(!/^model/m.test(toml));
});

test('Gemini shell and file injection syntax in a skill body is neutralized', () => {
  const parsed = parseToml(toTomlCommand('---\ndescription: x\n---\nrun !{rm -rf ~} and read @{/etc/passwd}\n'));
  assert.ok(!parsed.prompt.includes('!{') && !parsed.prompt.includes('@{'));
  assert.ok(parsed.prompt.includes('! {rm -rf ~}'));
});

test('OpenCode command .md keeps description and body, drops Claude model ids and neutralizes !`cmd`', () => {
  const md = toMdCommand(`${SKILL}also !\`whoami\`\n`);
  const { fields, body } = splitFrontmatter(md);
  assert.deepStrictEqual(fields, { description: 'Commit the "current" changes, then push.' });
  assert.ok(body.includes('Message: $ARGUMENTS'));
  assert.ok(!body.includes('!`'));
});

test('OpenCode agents are subagents with no pinned model', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'agents', 'exo-backend.md'), 'utf8');
  const { fields, body } = splitFrontmatter(toOpencodeAgent(src));
  assert.strictEqual(fields.mode, 'subagent');
  assert.ok(fields.description.startsWith('Backend engineering'));
  assert.ok(!('model' in fields) && !('name' in fields));
  assert.ok(body.includes('You implement server-side behavior'));
});

test('every shipped command converts for both tools', () => {
  for (const name of ['commit-changes', 'make-pr', 'code-review', 'security-review']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'skills', name, 'SKILL.md'), 'utf8');
    assert.ok(parseToml(toTomlCommand(src)).prompt.length > 100, name);
    assert.ok(splitFrontmatter(toMdCommand(src)).fields.description, name);
  }
});

test('OpenCode @path file references are neutralized; emails and backticked names are left alone', () => {
  const { body } = splitFrontmatter(toMdCommand('---\ndescription: x\n---\nread @src/index.js and (@~/.ssh/id_rsa) but mail a@b.c about `@types/node`\n'));
  assert.ok(body.includes('read @ src/index.js and (@ ~/.ssh/id_rsa)'));
  assert.ok(body.includes('a@b.c') && body.includes('`@types/node`'));
});

test('no shipped skill or agent carries an executable or file-injecting sequence after conversion', () => {
  const root = path.join(__dirname, '..', 'assets');
  const skills = fs.readdirSync(path.join(root, 'skills')).map((d) => path.join(root, 'skills', d, 'SKILL.md')).filter((f) => fs.existsSync(f));
  const agents = fs.readdirSync(path.join(root, 'agents')).filter((f) => /^exo-.+\.md$/.test(f)).map((f) => path.join(root, 'agents', f));
  const fileRef = /(^|[\s(])@[\w./~-]/m;
  for (const file of skills) {
    const src = fs.readFileSync(file, 'utf8');
    const toml = toTomlCommand(src);
    assert.ok(!toml.includes('!{') && !toml.includes('@{'), `${file} (gemini)`);
    const md = toMdCommand(src);
    assert.ok(!md.includes('!`') && !fileRef.test(md), `${file} (opencode command)`);
  }
  for (const file of agents) {
    const md = toOpencodeAgent(fs.readFileSync(file, 'utf8'));
    assert.ok(!md.includes('!`') && !fileRef.test(md), `${file} (opencode agent)`);
  }
});

