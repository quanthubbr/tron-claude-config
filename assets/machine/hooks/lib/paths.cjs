'use strict';

// Self-contained: copied to ~/.claude/exonous/hooks/lib/, node builtins only.
const crypto = require('crypto');
const fs = require('fs');
const { homedir, devNull } = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function home() {
  return process.env.EXONOUS_HOME || homedir();
}

function claudeDir() {
  return path.join(home(), '.claude');
}

function cursorDir() {
  return path.join(home(), '.cursor');
}

function exoDir() {
  return path.join(claudeDir(), 'exonous');
}

function stateDir() {
  return path.join(exoDir(), 'state');
}

/** EXONOUS_HOME set and resolving somewhere other than the OS home. */
function redirectedHome(env = process.env) {
  if (!env.EXONOUS_HOME) return false;
  try {
    return fs.realpathSync(env.EXONOUS_HOME) !== fs.realpathSync(homedir());
  } catch {
    return true;
  }
}

/** Test-only overrides (release source, pm shims) need EXONOUS_TEST=1 and a redirected home. */
const testMode = (env = process.env) => env.EXONOUS_TEST === '1' && redirectedHome(env);

/** Effective uid (tests may stub it in test mode); null where uids do not exist (Windows). */
function currentUid(env = process.env) {
  if (testMode(env) && /^\d+$/.test(env.EXONOUS_TEST_UID || '')) return Number(env.EXONOUS_TEST_UID);
  return typeof process.getuid === 'function' ? process.getuid() : null;
}

/** Uid owning target when it differs from ours, else null: a root session must not leave root-owned files in a user's home. */
function foreignOwner(target, env = process.env) {
  const uid = currentUid(env);
  if (uid === null) return null;
  try {
    const owner = fs.statSync(target).uid;
    return owner === uid ? null : owner;
  } catch {
    return null;
  }
}

/** Env for git calls in a repo under review: repo config must not run commands (fsmonitor, hooks). */
function gitEnv(base = process.env) {
  const env = { ...base, GIT_TERMINAL_PROMPT: '0' };
  let n = Number.parseInt(env.GIT_CONFIG_COUNT || '0', 10);
  if (!Number.isInteger(n) || n < 0) n = 0;
  for (const [key, value] of [['core.fsmonitor', 'false'], ['core.hooksPath', devNull]]) {
    env[`GIT_CONFIG_KEY_${n}`] = key;
    env[`GIT_CONFIG_VALUE_${n}`] = value;
    n += 1;
  }
  env.GIT_CONFIG_COUNT = String(n);
  return env;
}

/** Read-only git query in cwd with the hardened env; null on failure. */
function gitOut(cwd, args) {
  try {
    return execFileSync('git', ['--no-optional-locks', ...args], { cwd, env: gitEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 });
  } catch {
    return null;
  }
}

/** Real path of the git toplevel containing cwd; throws outside a repo. */
function repoRoot(cwd) {
  let out;
  try {
    out = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, env: gitEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new Error(`not inside a git repository: ${cwd}`);
  }
  return fs.realpathSync(out);
}

function repoKey(cwd) {
  return crypto.createHash('sha1').update(repoRoot(cwd)).digest('hex');
}

module.exports = { home, claudeDir, cursorDir, exoDir, stateDir, redirectedHome, testMode, currentUid, foreignOwner, gitEnv, gitOut, repoRoot, repoKey };
