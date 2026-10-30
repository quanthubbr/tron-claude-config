#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ensureEslintIgnore, IGNORE_ENTRY } = require('../src/lib/eslint-ignore');

function consumer(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-ignore-'));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(root, name), content);
  return root;
}

const read = (root, name) => fs.readFileSync(path.join(root, name), 'utf8');
const logs = [];
const log = (msg) => logs.push(msg);

const NEXT_CONFIG = `import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  { rules: { "react-hooks/set-state-in-effect": "warn" } },
  globalIgnores([
    ".next/**",
    "node_modules/**",
  ]),
]);
`;

// Adds the entry as the first globalIgnores item, keeping the file's indentation.
const next = consumer({ 'eslint.config.mjs': NEXT_CONFIG });
assert.strictEqual(ensureEslintIgnore(next, { log }), 'added');
assert.ok(read(next, 'eslint.config.mjs').includes(`globalIgnores([\n    "${IGNORE_ENTRY}",\n    ".next/**",`));

// Idempotent: second run leaves the file untouched.
const before = read(next, 'eslint.config.mjs');
assert.strictEqual(ensureEslintIgnore(next, { log }), 'present');
assert.strictEqual(read(next, 'eslint.config.mjs'), before);

// A config that already ignores .claude in any form is left alone.
const already = consumer({ 'eslint.config.js': `export default [{ ignores: [".claude/"] }];\n` });
assert.strictEqual(ensureEslintIgnore(already, { log }), 'present');

// No globalIgnores call: never rewrite the config, only warn with the fix.
const plain = consumer({ 'eslint.config.js': `export default [{ rules: {} }];\n` });
assert.strictEqual(ensureEslintIgnore(plain, { log }), 'warned');
assert.strictEqual(read(plain, 'eslint.config.js'), `export default [{ rules: {} }];\n`);
assert.ok(logs.some((m) => m.includes(IGNORE_ENTRY) && m.includes('eslint.config.js')));

// No flat config (legacy or no ESLint): nothing to do.
assert.strictEqual(ensureEslintIgnore(consumer({ '.eslintrc.json': '{}' }), { log }), 'none');

// Dry run reports but does not write.
const dry = consumer({ 'eslint.config.mjs': NEXT_CONFIG });
assert.strictEqual(ensureEslintIgnore(dry, { log, dryRun: true }), 'added');
assert.strictEqual(read(dry, 'eslint.config.mjs'), NEXT_CONFIG);

console.log('ensure-eslint-ignore: all tests passed');
