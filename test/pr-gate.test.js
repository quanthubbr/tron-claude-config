#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

process.env.EXONOUS_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-gate-home-'));
const {
  validateBodyContent,
  validateGhPrCreateCommand,
} = require(path.join(__dirname, '../assets/machine/hooks/lib/pr-template-validate.cjs'));

const VALID_BODY = `## Resumo
Objetivo da PR.

## Principais mudanças
- item

## Arquitetura & implementação
decisão

## Antes → Agora
_N/A — não aplicável a esta mudança_

## Roteiro de teste
1. rodar testes
`;

assert.strictEqual(validateBodyContent(VALID_BODY).ok, true);
assert.strictEqual(validateBodyContent(VALID_BODY.replace(/## /g, '### ')).ok, true, 'any heading level');
assert.strictEqual(validateBodyContent(`${VALID_BODY}\n## Summary\nextra`).ok, true, 'extra sections allowed');
assert.strictEqual(validateBodyContent(VALID_BODY.replace('## Roteiro de teste\n', '')).ok, false);
assert.strictEqual(validateBodyContent('').ok, false);

const run = (cmd, cwd) => execFileSync('git', cmd, { cwd, stdio: 'ignore' });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-body-'));
const remote = path.join(tmp, 'remote.git');
const repo = path.join(tmp, 'repo');
run(['init', '-q', '--bare', '-b', 'main', remote], tmp);
run(['init', '-q', '-b', 'main', repo], tmp);
const commit = (msg) => run(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-gpg-sign', '-m', msg], repo);
fs.writeFileSync(path.join(repo, 'a.txt'), 'a');
run(['add', '.'], repo);
commit('init');
run(['remote', 'add', 'origin', remote], repo);
run(['push', '-q', 'origin', 'main'], repo);
run(['fetch', '-q', 'origin'], repo);
run(['checkout', '-q', '-b', 'feat/x'], repo);

fs.mkdirSync(path.join(repo, '.claude'));
fs.writeFileSync(path.join(repo, '.claude', 'body.md'), VALID_BODY);
const ok = (cmd) => validateGhPrCreateCommand(cmd, repo).ok;

assert.strictEqual(ok('gh pr create --base main --body-file .claude/body.md'), true, 'any body file path');
assert.strictEqual(ok(`gh pr create --base main --body "${VALID_BODY}"`), true, 'inline body');
assert.strictEqual(ok('gh pr create --base main --body "fix stuff"'), false, 'inline body without titles');
assert.strictEqual(ok('gh pr create --base main --fill'), false, 'no body');

for (let i = 0; i < 31; i += 1) fs.writeFileSync(path.join(repo, `f${i}.txt`), String(i));
run(['add', '.'], repo);
commit('big');
assert.strictEqual(ok('gh pr create --base main --body-file .claude/body.md'), false, '31+ files blocked');
assert.strictEqual(ok('gh pr create --base missing-branch --body-file .claude/body.md'), true, 'unknown base never blocks');
assert.strictEqual(ok('gh pr create --title "x --base missing-branch" --base main --body-file .claude/body.md'), false, 'base comes from the option, not the title');

run(['checkout', '-q', 'main'], repo);
run(['merge', '-q', '--ff-only', 'feat/x'], repo);
run(['push', '-q', 'origin', 'main'], repo);
run(['fetch', '-q', 'origin'], repo);
run(['checkout', '-q', '-b', 'feat/move'], repo);
fs.mkdirSync(path.join(repo, 'moved'));
for (let i = 0; i < 31; i += 1) run(['mv', `f${i}.txt`, `moved/f${i}.txt`], repo);
commit('move');
assert.strictEqual(ok('gh pr create --base main --body-file .claude/body.md'), true, 'pure renames do not count');
fs.writeFileSync(path.join(repo, 'moved', 'f0.txt'), 'edited');
for (let i = 0; i < 30; i += 1) fs.writeFileSync(path.join(repo, `n${i}.txt`), `new ${i}`);
run(['add', '.'], repo);
commit('edit');
assert.strictEqual(ok('gh pr create --base main --body-file .claude/body.md'), false, 'a rename with edits counts');

fs.rmSync(tmp, { recursive: true, force: true });

console.log('pr-template-validate: all tests passed');
