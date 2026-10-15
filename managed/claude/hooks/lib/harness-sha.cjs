#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PACKAGE_NAME = '@tron/claude-config';
const LOCKFILES = ['pnpm-lock.yaml', 'bun.lock', 'package-lock.json', 'yarn.lock'];
const SHA = /[0-9a-f]{40}/;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function dependencySpec(root) {
  const pkg = readJson(path.join(root, 'package.json')) || {};
  return (pkg.dependencies || {})[PACKAGE_NAME] || (pkg.devDependencies || {})[PACKAGE_NAME] || '';
}

/** Repository slug ("owner/repo") the consumer installs the harness from. */
function repoSlug(spec) {
  const bare = spec.split('#')[0];
  const match =
    bare.match(/^(?:github:)?([\w.-]+\/[\w.-]+)$/) ||
    bare.match(/github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
  return match ? match[1] : null;
}

function remoteUrl(root) {
  const slug = repoSlug(dependencySpec(root));
  return slug ? `https://github.com/${slug}.git` : null;
}

/** npm keeps the commit in `_resolved`, a git checkout in .git, pnpm/bun/yarn only in the lockfile. */
function installedSha(root) {
  const pkgDir = path.join(root, 'node_modules', PACKAGE_NAME);
  const resolved = (readJson(path.join(pkgDir, 'package.json')) || {})._resolved || '';
  const fromResolved = resolved.split('#')[1];
  if (fromResolved && SHA.test(fromResolved)) return fromResolved;

  if (fs.existsSync(path.join(pkgDir, '.git'))) {
    try {
      return execFileSync('git', ['-C', pkgDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
      /* fall through to lockfiles */
    }
  }

  const slug = repoSlug(dependencySpec(root));
  if (!slug) return '';
  const repo = slug.split('/')[1].replace(/\.git$/, '');
  for (const lock of LOCKFILES) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, lock), 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n')) {
      if (!line.includes(repo)) continue;
      const sha = line.slice(line.indexOf(repo)).match(SHA);
      if (sha) return sha[0];
    }
  }
  return '';
}

module.exports = { dependencySpec, repoSlug, remoteUrl, installedSha };

if (require.main === module) {
  const root = process.cwd();
  const commands = {
    installed: () => installedSha(root),
    'remote-url': () => remoteUrl(root) || '',
  };
  const run = commands[process.argv[2]];
  if (!run) {
    process.stderr.write('usage: harness-sha.cjs installed|remote-url\n');
    process.exit(2);
  }
  process.stdout.write(run());
}
