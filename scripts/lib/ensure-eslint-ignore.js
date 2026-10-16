#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// Harness .cjs hook libs land in .claude/; configs with a global rules block (Next) crash linting them.
const IGNORE_ENTRY = '.claude/**';
const FLAT_CONFIGS = ['eslint.config.mjs', 'eslint.config.js', 'eslint.config.cjs', 'eslint.config.ts', 'eslint.config.mts'];
const GLOBAL_IGNORES = /globalIgnores\(\s*\[(\s*)/;

/** Returns 'added' | 'present' | 'warned' | 'none'. */
function ensureEslintIgnore(root, { dryRun = false, log = () => {} } = {}) {
  const name = FLAT_CONFIGS.find((file) => fs.existsSync(path.join(root, file)));
  if (!name) return 'none';

  const file = path.join(root, name);
  const content = fs.readFileSync(file, 'utf8');
  if (/["'`]\.claude(\/|["'`])/.test(content)) return 'present';

  const match = content.match(GLOBAL_IGNORES);
  if (!match) {
    log(`WARN: ${name} lints .claude/ — add globalIgnores(["${IGNORE_ENTRY}"]) if ESLint fails on harness files`);
    return 'warned';
  }

  const indent = match[1].includes('\n') ? match[1] : '\n    ';
  const updated = content.replace(GLOBAL_IGNORES, `${match[0]}"${IGNORE_ENTRY}",${indent}`);
  if (dryRun) log(`DRY: would add "${IGNORE_ENTRY}" to ${name} globalIgnores`);
  else fs.writeFileSync(file, updated, 'utf8');
  return 'added';
}

module.exports = { ensureEslintIgnore, IGNORE_ENTRY };
