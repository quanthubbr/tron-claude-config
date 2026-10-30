#!/usr/bin/env node
'use strict';

const { validateBodyFile } = require('./pr-template-validate.cjs');
const { resolveTemplate } = require('./template.cjs');

const file = process.argv[2];
if (!file) {
  process.stderr.write('Usage: node validate-pr-body.cjs <path-to-body-file>\n');
  process.exit(2);
}

const template = resolveTemplate(process.cwd());
const result = validateBodyFile(file, process.cwd(), template);
if (!result.ok) {
  process.stderr.write(`${result.reason}\n`);
  process.exit(1);
}

process.stdout.write(`PR body OK — all ${template.sections.length} template titles present (${template.path}).\n`);
process.exit(0);
