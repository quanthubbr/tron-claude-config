#!/usr/bin/env node
'use strict';

// PreToolUse gate for gh pr create: template titles + PR size.

const {
  readHookCommandFromStdin,
  validateGhPrCreateCommand,
} = require('./pr-template-validate.cjs');

let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  stdin += chunk;
});
process.stdin.on('end', () => {
  const result = validateGhPrCreateCommand(readHookCommandFromStdin(stdin));
  if (!result.ok) {
    process.stderr.write(`${result.reason}\n`);
    process.exit(1);
  }
  process.exit(0);
});
