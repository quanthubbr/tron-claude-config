#!/usr/bin/env node
'use strict';

// Section titles — keep in sync with .claude/PR-TEMPLATE.md and make-pr skill.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REQUIRED_SECTIONS = [
  'Resumo',
  'Principais mudanças',
  'Arquitetura & implementação',
  'Antes → Agora',
  'Roteiro de teste',
];

const MAX_CHANGED_FILES = 25;

function normalize(text) {
  return text.normalize('NFC').toLowerCase();
}

function missingSections(text) {
  const haystack = normalize(text || '');
  return REQUIRED_SECTIONS.filter((section) => !haystack.includes(normalize(section)));
}

function validateBodyContent(content) {
  const missing = missingSections(content);
  if (missing.length === 0) return { ok: true };
  return {
    ok: false,
    reason: `PR body is missing: ${missing.join(', ')}. Follow .claude/PR-TEMPLATE.md — all 5 titles must appear (use "_N/A — não aplicável a esta mudança_" under a section that does not apply).`,
  };
}

function validateBodyFile(filePath, cwd = process.cwd()) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  if (!fs.existsSync(resolved)) {
    return { ok: false, reason: `PR body file not found: ${filePath}.` };
  }
  return validateBodyContent(fs.readFileSync(resolved, 'utf8'));
}

function flagValue(command, names) {
  const pattern = new RegExp(`(?:^|\\s)(?:${names.join('|')})(?:=|\\s+)("[^"]*"|'[^']*'|[^\\s]+)`);
  const match = command.match(pattern);
  if (!match) return null;
  return match[1].replace(/^(["'])(.*)\1$/, '$2') || null;
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

// Pure moves (R100) cost no review, so only content changes count toward the size cap.
function countContentChanges(nameStatus) {
  return nameStatus.split('\n').filter((line) => line && !line.startsWith('R100')).length;
}

// Unknown base or missing refs → null; size gate must never block on git trouble.
function countChangedFiles(command, cwd) {
  try {
    const base = flagValue(command, ['--base', '-B'])
      || git(cwd, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD').replace(/^origin\//, '');
    const head = flagValue(command, ['--head', '-H']) || 'HEAD';
    const headRef = head === 'HEAD' ? head : `origin/${head.replace(/^[^:]+:/, '')}`;
    const out = git(cwd, 'diff', '--name-status', '-M100%', `origin/${base}...${headRef}`);
    return countContentChanges(out);
  } catch {
    return null;
  }
}

function validateGhPrCreateCommand(command, cwd = process.cwd()) {
  if (!command || !/gh\s+pr\s+create/.test(command)) {
    return { ok: false, reason: 'Not a gh pr create command.' };
  }

  const changed = countChangedFiles(command, cwd);
  if (changed !== null && changed > MAX_CHANGED_FILES) {
    return {
      ok: false,
      reason: `PR has ${changed} changed files (max ${MAX_CHANGED_FILES}). Split it into smaller PRs, each with one cohesive goal (stack them if they depend on each other).`,
    };
  }

  const bodyFile = flagValue(command, ['--body-file', '-F']);
  if (bodyFile && bodyFile !== '-') return validateBodyFile(bodyFile, cwd);
  // Inline --body / heredoc: titles live in the command text itself.
  return validateBodyContent(command);
}

function readHookCommandFromStdin(stdin) {
  try {
    return JSON.parse(stdin)?.tool_input?.command || '';
  } catch {
    return '';
  }
}

module.exports = {
  REQUIRED_SECTIONS,
  MAX_CHANGED_FILES,
  validateBodyContent,
  validateBodyFile,
  validateGhPrCreateCommand,
  readHookCommandFromStdin,
};
