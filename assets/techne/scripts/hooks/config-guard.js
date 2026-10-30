// PreToolUse(Write|Edit|MultiEdit): keep agents from loosening lint/format configs to make checks pass.
// Creating a config that does not exist yet is allowed; editing an existing one is not.
'use strict';

const fs = require('fs');
const path = require('path');

const EXACT = new Set([
  '.eslintrc', '.eslintignore',
  '.prettierrc', '.prettierignore',
  'biome.json', 'biome.jsonc', '.biome.json', '.biome.jsonc',
  'ruff.toml', '.ruff.toml', '.flake8', '.pylintrc',
  '.stylelintrc', '.stylelintignore',
  '.markdownlintrc', '.markdownlintignore',
  '.shellcheckrc',
  '.golangci.yml', '.golangci.yaml', '.golangci.toml', '.golangci.json',
  '.rubocop.yml', '.swiftlint.yml', '.oxlintrc.json',
]);

const PATTERNS = [
  // eslint.config.mjs, prettier.config.base.cjs, stylelint.config.shared.ts, …
  /^(eslint|prettier|stylelint|commitlint|oxlint)\.config(\.[\w-]+)*\.(js|mjs|cjs|ts|mts|cts)$/,
  // .eslintrc.json, .prettierrc.shared.yml, .stylelintrc.base.cjs, .markdownlint.jsonc, …
  /^\.(eslintrc|prettierrc|stylelintrc|markdownlintrc|markdownlint|markdownlint-cli2)(\.[\w-]+)*\.(js|mjs|cjs|ts|json|jsonc|yml|yaml|toml)$/,
];

function isGuarded(file) {
  const name = path.basename(file).toLowerCase();
  return EXACT.has(name) || PATTERNS.some((re) => re.test(name));
}

module.exports = function configGuard(payload, { truncated }) {
  if (process.env.EXONOUS_ALLOW_CONFIG_EDITS === '1') return null;
  if (truncated) return { block: 'Hook payload too large to inspect; refusing the edit. Make a smaller edit.' };
  const input = payload?.tool_input || {};
  const file = input.file_path || input.path;
  if (typeof file !== 'string' || !isGuarded(file)) return null;

  const absolute = path.resolve(payload.cwd || process.cwd(), file);
  try {
    fs.lstatSync(absolute);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
  }
  return {
    block: `${path.basename(file)} is a lint/format config. Fix the code so it satisfies the rules instead of weakening them. If the user asked for this config change, they can allow it with EXONOUS_ALLOW_CONFIG_EDITS=1.`,
  };
};

module.exports.isGuarded = isGuarded;
