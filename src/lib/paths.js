'use strict';

const fs = require('fs');
const path = require('path');
const base = require('../../assets/machine/hooks/lib/paths.cjs');

/** @returns {'npm'|'pnpm'|'bun'} */
function detectPm(env = process.env, packageRoot = path.join(__dirname, '..', '..')) {
  const agent = /^(npm|pnpm|bun)\//.exec(String(env.npm_config_user_agent || ''));
  if (agent) return agent[1];
  let root = packageRoot;
  try {
    root = fs.realpathSync(packageRoot);
  } catch {
    // missing root: match the path as given
  }
  root = root.split(path.sep).join('/');
  if (root.includes('/.bun/')) return 'bun';
  if (root.includes('/pnpm/')) return 'pnpm';
  return 'npm';
}

module.exports = { ...base, detectPm };
