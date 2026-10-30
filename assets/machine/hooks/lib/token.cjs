'use strict';

// One-shot gate tokens: commit binds the staged tree, push binds the pushed commit; both expire in 15 minutes.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { exoDir, stateDir, repoKey, gitOut, foreignOwner } = require('./paths.cjs');

const TTL_MS = 15 * 60 * 1000;
const BINDINGS = {
  commit: ['write-tree'],
  push: ['rev-parse', '--verify', 'HEAD^{commit}'],
};

function bindingArgs(kind) {
  const args = BINDINGS[kind];
  if (!args) throw new Error(`unknown token kind: ${kind}`);
  return args;
}

function currentSha(kind, cwd) {
  const out = gitOut(cwd, bindingArgs(kind));
  return out ? out.trim() : null;
}

function tokenFile(kind, cwd) {
  return path.join(stateDir(), kind, `${repoKey(cwd)}.json`);
}

const unique = () => `${process.pid}.${crypto.randomBytes(6).toString('hex')}`;

/** @param {{ now?: number }} [options] */
function mint(kind, cwd, { now = Date.now() } = {}) {
  bindingArgs(kind);
  for (const dir of [exoDir(), stateDir()]) {
    const owner = foreignOwner(dir);
    if (owner !== null) throw new Error(`${dir} is owned by uid ${owner}, not you — run exonous as that user, or fix it with sudo chown -R "$(id -un)" ~/.claude/exonous`);
  }
  const file = tokenFile(kind, cwd);
  const sha = currentSha(kind, cwd);
  if (!sha) throw new Error(`git could not read the ${kind === 'commit' ? 'staged tree' : 'HEAD commit'} in ${cwd}`);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${unique()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ sha, exp: now + TTL_MS }), { mode: 0o600, flag: 'wx' });
  fs.renameSync(tmp, file);
  return { file, sha, exp: now + TTL_MS };
}

function judge(raw, expected) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (!data || typeof data.sha !== 'string' || typeof data.exp !== 'number') return { ok: false, reason: 'invalid' };
  if (Date.now() > data.exp) return { ok: false, reason: 'expired' };
  return expected.length && expected.every((sha) => sha === data.sha) ? { ok: true } : { ok: false, reason: 'mismatch' };
}

function expectedShas(kind, cwd, expected) {
  if (expected) return expected;
  const sha = currentSha(kind, cwd);
  return sha ? [sha] : [];
}

/**
 * @param {string[]} [expected] shas the token must match; default: the current binding.
 * @returns {{ ok: true } | { ok: false, reason: 'none'|'expired'|'mismatch'|'invalid' }}
 */
function verify(kind, cwd, expected) {
  bindingArgs(kind);
  let file;
  let raw;
  try {
    file = tokenFile(kind, cwd);
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return { ok: false, reason: 'none' };
  }
  const result = judge(raw, expectedShas(kind, cwd, expected));
  if (result.reason === 'expired') fs.rmSync(file, { force: true });
  return result;
}

// The rename is the lock: only one consumer can move the file away, the rest see 'none'.
function consume(kind, cwd, expected) {
  bindingArgs(kind);
  let file;
  try {
    file = tokenFile(kind, cwd);
  } catch {
    return { ok: false, reason: 'none' };
  }
  const claim = `${file}.${unique()}.claim`;
  try {
    fs.renameSync(file, claim);
  } catch {
    return { ok: false, reason: 'none' };
  }
  let raw;
  try {
    raw = fs.readFileSync(claim, 'utf8');
  } finally {
    fs.rmSync(claim, { force: true });
  }
  return judge(raw, expectedShas(kind, cwd, expected));
}

module.exports = { mint, verify, consume, TTL_MS, KINDS: Object.keys(BINDINGS) };
