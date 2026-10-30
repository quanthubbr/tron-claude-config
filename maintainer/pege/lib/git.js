'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { UPSTREAM_ROOT } = require('./sources');

const CACHE_ROOT = path.join(UPSTREAM_ROOT, '.cache');

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 300000,
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

// Blobless bare mirror per source; blobs are fetched lazily when read.
function mirror(source) {
  const dir = path.join(CACHE_ROOT, `${source.id}.git`);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(CACHE_ROOT, { recursive: true });
    git(CACHE_ROOT, 'clone', '--bare', '--filter=blob:none', '--quiet', source.repo, dir);
  }
  git(dir, 'fetch', '--quiet', '--filter=blob:none', 'origin', 'HEAD');
  const latest = git(dir, 'rev-parse', 'FETCH_HEAD');
  if (source.ref && source.ref !== 'HEAD') {
    try {
      git(dir, 'cat-file', '-e', `${source.ref}^{commit}`);
    } catch {
      git(dir, 'fetch', '--quiet', '--filter=blob:none', 'origin', source.ref);
    }
  }
  return { dir, latest };
}

module.exports = { CACHE_ROOT, git, mirror };
