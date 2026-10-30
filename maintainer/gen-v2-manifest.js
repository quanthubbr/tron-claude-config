#!/usr/bin/env node
'use strict';

// Writes src/legacy/v2-manifest.json: sha256 of every version of every file the old installers copied into repos.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'legacy', 'v2-manifest.json');

// [ref, source in this repo at that ref, destination in the consumer repo]; a trailing slash maps a whole tree.
const ERAS = {
  'v2.0.0': [
    ['assets/repo/AGENTS.md', 'AGENTS.md'],
    ['assets/repo/claude/settings.json', '.claude/settings.json'],
    ['assets/repo/claude/PR-TEMPLATE.md', '.claude/PR-TEMPLATE.md'],
    ['assets/repo/claude/hooks/pyle.sh', '.claude/hooks/pyle.sh'],
    ['assets/repo/claude/hooks/kairos.cjs', '.claude/hooks/kairos.cjs'],
    ['assets/repo/claude/hooks/lib/pr-template-validate.cjs', '.claude/hooks/lib/pr-template-validate.cjs'],
    ['assets/repo/claude/hooks/lib/validate-pr-body.cjs', '.claude/hooks/lib/validate-pr-body.cjs'],
    ['assets/repo/claude/hooks/lib/pr-create-gate.cjs', '.claude/hooks/lib/pr-create-gate.cjs'],
    ['assets/repo/claude/hooks/lib/metron.cjs', '.claude/hooks/lib/metron.cjs'],
    ['assets/repo/git-hooks/pre-commit', 'git-hooks:pre-commit'],
    ['assets/repo/git-hooks/pre-push', 'git-hooks:pre-push'],
    ['assets/techne/rules/', '.claude/rules/exonous/'],
  ],
  db1af8d: [
    ['managed/AGENTS.md', 'AGENTS.md'],
    ['managed/claude/settings.json', '.claude/settings.json'],
    ['managed/claude/PR-TEMPLATE.md', '.claude/PR-TEMPLATE.md'],
    ['managed/claude/hooks/bypass-check.sh', '.claude/hooks/bypass-check.sh'],
    ['managed/claude/hooks/bootstrap-check.sh', '.claude/hooks/bootstrap-check.sh'],
    ['managed/claude/hooks/lib/pr-template-validate.cjs', '.claude/hooks/lib/pr-template-validate.cjs'],
    ['managed/claude/hooks/lib/validate-pr-body.cjs', '.claude/hooks/lib/validate-pr-body.cjs'],
    ['managed/claude/hooks/lib/pr-create-gate.cjs', '.claude/hooks/lib/pr-create-gate.cjs'],
    ['managed/claude/hooks/lib/harness-sha.cjs', '.claude/hooks/lib/harness-sha.cjs'],
    ['managed/claude/hooks/lib/pr-template-validate.js', '.claude/hooks/lib/pr-template-validate.js'],
    ['managed/claude/hooks/lib/validate-pr-body.js', '.claude/hooks/lib/validate-pr-body.js'],
    ['managed/claude/hooks/lib/pr-create-gate.js', '.claude/hooks/lib/pr-create-gate.js'],
    ['managed/claude/hooks/lib/read-budget.cjs', '.claude/hooks/lib/read-budget.cjs'],
    ['managed/setup-claude-harness.sh', 'scripts/setup-claude-harness.sh'],
    ['managed/git-hooks/pre-commit', 'git-hooks:pre-commit'],
    ['managed/git-hooks/pre-push', 'git-hooks:pre-push'],
    ['managed/tron-kit/rules/', '.claude/rules/tron/'],
  ],
};

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
const text = (args) => git(args).toString('utf8');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Every source path that ever existed under `src` (a file, or a tree when it ends with `/`) up to ref. */
function sourcesAt(ref, src) {
  if (!src.endsWith('/')) return [src];
  return [...new Set(text(['log', '--root', '--format=', '--name-only', ref, '--', src]).split('\n').filter((f) => f.startsWith(src)))].sort();
}

/** sha256 of every distinct content `file` had in the history of ref. */
function versions(ref, file) {
  const commits = text(['log', '--root', '--format=%H', ref, '--', file]).split('\n').filter(Boolean);
  const blobs = new Set();
  for (const commit of commits) {
    try {
      blobs.add(text(['rev-parse', `${commit}:${file}`]).trim());
    } catch {
      // deleted in that commit
    }
  }
  return [...blobs].map((blob) => sha256(git(['cat-file', 'blob', blob])));
}

/** Hook commands from every shipped settings.json, so a user-edited copy can be stripped of exactly ours. */
function settingsCommands(ref, file) {
  const out = new Set();
  for (const commit of text(['log', '--root', '--format=%H', ref, '--', file]).split('\n').filter(Boolean)) {
    let config;
    try {
      config = JSON.parse(text(['show', `${commit}:${file}`]));
    } catch {
      continue;
    }
    for (const list of Object.values(config.hooks || {})) {
      for (const entry of Array.isArray(list) ? list : []) for (const h of entry.hooks || []) if (typeof h.command === 'string') out.add(h.command);
    }
  }
  return out;
}

function build() {
  const files = {};
  const commands = new Set();
  const refs = {};
  for (const [ref, map] of Object.entries(ERAS)) {
    refs[ref] = text(['rev-parse', `${ref}^{commit}`]).trim();
    for (const [src, dest] of map) {
      for (const file of sourcesAt(ref, src)) {
        const target = src.endsWith('/') ? dest + file.slice(src.length) : dest;
        files[target] = [...new Set([...(files[target] || []), ...versions(ref, file)])].sort();
        if (!files[target].length) delete files[target];
      }
      if (dest === '.claude/settings.json') for (const c of settingsCommands(ref, src)) commands.add(c);
    }
  }
  const sorted = Object.fromEntries(Object.keys(files).sort().map((k) => [k, files[k]]));
  return { refs, files: sorted, settingsCommands: [...commands].sort() };
}

if (require.main === module) {
  fs.writeFileSync(OUT, `${JSON.stringify(build(), null, 2)}\n`);
  process.stdout.write(`wrote ${path.relative(ROOT, OUT)}\n`);
}

module.exports = { build };
