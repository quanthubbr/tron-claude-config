'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { UPSTREAM_ROOT, resolveRepository } = require('./sources');

const CACHE_ROOT = path.join(UPSTREAM_ROOT, '.cache');

function git(cwd, ...args) {
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'SystemRoot'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'https', GIT_LFS_SKIP_SMUDGE: '1' });
  try {
    return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'credential.helper=', '-c', 'http.followRedirects=false', ...args], {
      cwd,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 300000,
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } catch {
    throw new Error('source git operation failed');
  }
}

// Blobless bare mirror per source; blobs are fetched lazily when read.
function mirror(source, env = process.env) {
  const repository = resolveRepository(source, env);
  const dir = path.join(CACHE_ROOT, `${source.id}.git`);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(CACHE_ROOT, { recursive: true });
    git(CACHE_ROOT, 'clone', '--bare', '--filter=blob:none', '--quiet', repository, dir);
  }
  git(dir, 'remote', 'set-url', 'origin', repository);
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
