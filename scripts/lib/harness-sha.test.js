#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const LIB = path.join(__dirname, '../../managed/claude/hooks/lib/harness-sha.cjs');
const { repoSlug, remoteUrl, installedSha } = require(LIB);

const SHA_A = 'f8e7d0c1b2a3948576a1b2c3d4e5f60718293a4b';
const SHA_B = '0123456789abcdef0123456789abcdef01234567';

function consumer({ spec, files = {}, installed = {} }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-sha-'));
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'consumer', devDependencies: spec ? { '@tron/claude-config': spec } : {} }),
  );
  const pkgDir = path.join(root, 'node_modules', '@tron', 'claude-config');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ version: '1.0.0', ...installed }));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(root, name), content);
  return root;
}

assert.strictEqual(repoSlug('github:zaqueu-1/tron-claude-config'), 'zaqueu-1/tron-claude-config');
assert.strictEqual(repoSlug('zaqueu-1/tron-claude-config#main'), 'zaqueu-1/tron-claude-config');
assert.strictEqual(repoSlug('git+https://github.com/zaqueu-1/tron-claude-config.git'), 'zaqueu-1/tron-claude-config');
assert.strictEqual(repoSlug('git+ssh://git@github.com:zaqueu-1/tron-claude-config.git#v1.7.0'), 'zaqueu-1/tron-claude-config');
assert.strictEqual(repoSlug('^1.0.0'), null);

const pnpmLock = [
  "  '@tron/claude-config':",
  '    specifier: github:zaqueu-1/tron-claude-config',
  `    version: https://codeload.github.com/zaqueu-1/tron-claude-config/tar.gz/${SHA_A}`,
].join('\n');
const pnpm = consumer({ spec: 'github:zaqueu-1/tron-claude-config', files: { 'pnpm-lock.yaml': pnpmLock } });
assert.strictEqual(installedSha(pnpm), SHA_A, 'pnpm: sha comes from the lockfile tarball URL');
assert.strictEqual(remoteUrl(pnpm), 'https://github.com/zaqueu-1/tron-claude-config.git');

const npm = consumer({
  spec: 'git+https://github.com/zaqueu-1/tron-claude-config.git',
  installed: { _resolved: `git+https://github.com/zaqueu-1/tron-claude-config.git#${SHA_B}` },
  files: { 'pnpm-lock.yaml': pnpmLock },
});
assert.strictEqual(installedSha(npm), SHA_B, 'npm: _resolved wins over lockfiles');

const unrelated = consumer({
  spec: 'github:zaqueu-1/tron-claude-config',
  files: { 'pnpm-lock.yaml': `other-pkg: https://codeload.github.com/x/other/tar.gz/${SHA_B}\n` },
});
assert.strictEqual(installedSha(unrelated), '', 'ignores commits of other packages');

const registry = consumer({ spec: '^1.0.0' });
assert.strictEqual(installedSha(registry), '');
assert.strictEqual(remoteUrl(registry), null);

const cli = (cmd) => execFileSync('node', [LIB, cmd], { cwd: pnpm, encoding: 'utf8' });
assert.strictEqual(cli('installed'), SHA_A);

console.log('harness-sha: all tests passed');
