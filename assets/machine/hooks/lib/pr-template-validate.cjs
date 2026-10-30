#!/usr/bin/env node
'use strict';

// Required titles come from the resolved PR template; the size cap is fixed.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { resolveTemplate } = require('./template.cjs');
const { gitEnv } = require('./paths.cjs');

const MAX_CHANGED_FILES = 25;

function normalize(text) {
  return text.normalize('NFC').toLowerCase();
}

function missingSections(text, sections) {
  const haystack = normalize(text || '');
  return sections.filter((section) => !haystack.includes(normalize(section)));
}

/** @param {{ path: string | null, sections: string[] }} [template] */
function validateBodyContent(content, template = resolveTemplate()) {
  const missing = missingSections(content, template.sections);
  if (missing.length === 0) return { ok: true };
  return {
    ok: false,
    reason: `PR body is missing: ${missing.join(', ')}. Follow ${template.path} — all ${template.sections.length} titles must appear (write N/A under a section that does not apply).`,
  };
}

function validateBodyFile(filePath, cwd = process.cwd(), template = resolveTemplate(cwd)) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  if (!fs.existsSync(resolved)) {
    return { ok: false, reason: `PR body file not found: ${filePath}.` };
  }
  return validateBodyContent(fs.readFileSync(resolved, 'utf8'), template);
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, env: gitEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

// Pure moves (R100) cost no review, so only content changes count toward the size cap.
function countContentChanges(nameStatus) {
  return nameStatus.split('\n').filter((line) => line && !line.startsWith('R100')).length;
}

// Unknown base or missing refs → null; size gate must never block on git trouble.
function countChangedFiles({ base: givenBase, head: givenHead }, cwd) {
  try {
    const base = givenBase || git(cwd, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD').replace(/^origin\//, '');
    const head = givenHead || 'HEAD';
    const headRef = head === 'HEAD' ? head : `origin/${head.replace(/^[^:]+:/, '')}`;
    const out = git(cwd, 'diff', '--name-status', '-M100%', `origin/${base}...${headRef}`);
    return countContentChanges(out);
  } catch {
    return null;
  }
}

/** Last value given for each gh pr create option that matters here. */
function prFields(parsed) {
  const last = (name) => {
    const opt = parsed.opts.filter((o) => o.name === name).pop();
    return opt ? opt.value : null;
  };
  return { body: last('body'), bodyFile: last('body-file'), base: last('base'), head: last('head') };
}

/** @param {{ body: string | null, bodyFile: string | null, base: string | null, head: string | null }} fields */
function validatePrCreate(fields, cwd = process.cwd()) {
  const changed = countChangedFiles(fields, cwd);
  if (changed !== null && changed > MAX_CHANGED_FILES) {
    return {
      ok: false,
      reason: `PR has ${changed} changed files (max ${MAX_CHANGED_FILES}). Split it into smaller PRs, each with one cohesive goal (stack them if they depend on each other).`,
    };
  }
  const template = resolveTemplate(cwd);
  if (fields.bodyFile === '-') return { ok: false, reason: 'A PR body read from stdin cannot be checked; write it to a file and pass --body-file.' };
  if (fields.bodyFile) return validateBodyFile(fields.bodyFile, cwd, template);
  return validateBodyContent(fields.body || '', template);
}

function validateGhPrCreateCommand(command, cwd = process.cwd()) {
  const { analyze } = require('./shell.cjs');
  const { parseOptions, GH_PR_CREATE } = require('./cli-options.cjs');
  const call = command ? analyze(command, cwd).calls.find((c) => c.kind === 'pr') : null;
  if (!call) return { ok: false, reason: 'Not a gh pr create command.' };
  const parsed = parseOptions(call.args, GH_PR_CREATE);
  if (parsed.error) return { ok: false, reason: `Cannot read the gh pr create options: ${parsed.error}.` };
  return validatePrCreate(prFields(parsed), call.cwd);
}

module.exports = {
  MAX_CHANGED_FILES,
  validateBodyContent,
  validateBodyFile,
  validateGhPrCreateCommand,
  validatePrCreate,
  prFields,
};
