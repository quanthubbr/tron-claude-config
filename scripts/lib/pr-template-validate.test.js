#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  validateBodyContent,
  validateGhPrCreateCommand,
  hasInlineBodyFlag,
  extractBodyFilePath,
} = require(path.join(__dirname, '../../managed/claude/hooks/lib/pr-template-validate'));

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

const english = VALID_BODY.replace('## Resumo', '## Summary');
assert.strictEqual(validateBodyContent(english).ok, false);

const missing = VALID_BODY.replace('## Roteiro de teste\n', '');
assert.strictEqual(validateBodyContent(missing).ok, false);

assert.strictEqual(hasInlineBodyFlag('gh pr create --body "foo"'), true);
assert.strictEqual(
  hasInlineBodyFlag('gh pr create --body-file .claude/.pr-body-draft.md'),
  false,
);

assert.strictEqual(
  extractBodyFilePath('gh pr create --body-file .claude/.pr-body-draft.md --title x'),
  '.claude/.pr-body-draft.md',
);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-body-'));
const bodyPath = path.join(tmp, '.claude', '.pr-body-draft.md');
fs.mkdirSync(path.dirname(bodyPath), { recursive: true });
fs.writeFileSync(bodyPath, VALID_BODY);

const cwd = tmp;
assert.strictEqual(
  validateGhPrCreateCommand(
    'gh pr create --base main --body-file .claude/.pr-body-draft.md',
    cwd,
  ).ok,
  true,
);

assert.strictEqual(
  validateGhPrCreateCommand('gh pr create --body "## Summary"', cwd).ok,
  false,
);

assert.strictEqual(
  validateGhPrCreateCommand('gh pr create --body-file /other/path.md', cwd).ok,
  false,
);

fs.rmSync(tmp, { recursive: true, force: true });

console.log('pr-template-validate: all tests passed');
