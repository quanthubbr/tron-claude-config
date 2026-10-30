'use strict';

// PR template resolution: repo template (any case) → ~/.claude/exonous/PR-TEMPLATE.md → copy shipped beside the hooks.
const fs = require('fs');
const path = require('path');
const { exoDir, stateDir, repoRoot, repoKey } = require('./paths.cjs');

const TEMPLATE_NAME = 'pull_request_template.md';
const REPO_DIRS = ['.github', 'docs', ''];
const BUNDLED = path.join(__dirname, '..', '..', 'PR-TEMPLATE.md');
const MAX_BYTES = 64 * 1024;

function sectionsOf(text) {
  const visible = String(text)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, '');
  return [...visible.matchAll(/^##(?!#)[ \t]+(.+?)[ \t#]*$/gm)].map((m) => m[1].trim());
}

function findInDir(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const matches = names.filter((n) => n.toLowerCase() === TEMPLATE_NAME).map((n) => path.join(dir, n));
  return matches.find(usable) || null;
}

// Symlinks could point outside the repo; huge files are not templates.
function usable(file) {
  try {
    const stat = fs.lstatSync(file);
    return stat.isFile() && stat.size <= MAX_BYTES;
  } catch {
    return false;
  }
}

function candidates(cwd) {
  let root = null;
  try {
    root = repoRoot(cwd);
  } catch {
    // outside a repo only the machine templates apply
  }
  const repo = root ? REPO_DIRS.map((d) => () => findInDir(path.join(root, d))) : [];
  return [...repo, () => path.join(exoDir(), 'PR-TEMPLATE.md'), () => BUNDLED];
}

/** @returns {{ path: string | null, sections: string[] }} */
function resolveTemplate(cwd = process.cwd()) {
  for (const candidate of candidates(cwd)) {
    const file = candidate();
    if (!file || !usable(file)) continue;
    try {
      return { path: file, sections: sectionsOf(fs.readFileSync(file, 'utf8')) };
    } catch {
      // unreadable: try the next one
    }
  }
  return { path: null, sections: [] };
}

function draftPath(cwd = process.cwd()) {
  return path.join(stateDir(), 'pr', `${repoKey(cwd)}.md`);
}

module.exports = { resolveTemplate, sectionsOf, draftPath };
