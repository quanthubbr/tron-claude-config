'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHash } = require('crypto');
const { spawnSync } = require('child_process');

const USAGE = 'usage: exonous pr create --body-file <file> [--base <branch>] [--head <branch>] [--title <title>] [--draft]';
const LIMIT = 16 * 1024 * 1024;
const VALUE_FLAGS = ['--base', '--head', '--title', '--body-file'];
const PR_URL = /^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/;
const hooksLib = (name) => require(path.join(__dirname, '..', 'assets', 'machine', 'hooks', 'lib', name));

function parse(args) {
  if (args[0] !== 'create') return null;
  const values = {};
  let draft = false;
  for (let i = 1; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--draft' && !draft) { draft = true; continue; }
    const value = args[i + 1];
    if (!VALUE_FLAGS.includes(flag) || flag in values || !value || value.startsWith('-')) return null;
    values[flag] = value;
    i++;
  }
  return values['--body-file'] ? { values, draft } : null;
}

function readDraft(file) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) throw new Error('PR body must be a regular nonsymlink file');
  if (stat.size > LIMIT) throw new Error('PR body must be at most 16 MiB');
  return fs.readFileSync(file);
}

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function saveHandoff(url, original, bytes, cwd) {
  const graph = { v: 1, k: 'pr', g: [['pr', 'url', url], ['pr', 'proof', 'gh pr create exited 0'], ['pr', 'next', 'review the pull request']] };
  let saved;
  try {
    saved = require('./lib/handoff').save(graph, { cwd });
  } catch {
    console.error('exonous: PR created; handoff could not be saved; draft preserved; do not retry create');
    return;
  }
  if (!['saved', 'already-saved'].includes(saved.status)) {
    console.error('exonous: PR created; handoff not saved because no vault is configured; draft preserved');
    return;
  }
  let intact = false;
  try { intact = original === hooksLib('template.cjs').draftPath(cwd) && digest(readDraft(original)) === digest(bytes); } catch { intact = false; }
  if (!intact) return;
  try { fs.unlinkSync(original); } catch { console.error('exonous: handoff saved; PR draft cleanup failed'); }
}

function create({ values, draft }, cwd) {
  const original = path.resolve(cwd, values['--body-file']);
  const bytes = readDraft(original);
  const fields = { body: bytes.toString('utf8'), bodyFile: null, base: values['--base'] || null, head: values['--head'] || null };
  const verdict = hooksLib('pr-template-validate.cjs').validatePrCreate(fields, cwd);
  if (!verdict.ok) {
    console.error(`exonous pr create: ${verdict.reason} No PR was created.`);
    return 1;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exonous-pr-'));
  try {
    const snapshot = path.join(dir, 'body.md');
    fs.writeFileSync(snapshot, bytes, { flag: 'wx', mode: 0o600 });
    const ghArgs = ['pr', 'create'];
    for (const [flag, value] of Object.entries(values)) ghArgs.push(flag, flag === '--body-file' ? snapshot : value);
    if (draft) ghArgs.push('--draft');
    const result = spawnSync('gh', ghArgs, { cwd, stdio: ['inherit', 'pipe', 'pipe'], maxBuffer: LIMIT });
    if (result.error) {
      console.error('exonous pr create: cannot run gh; install and authenticate GitHub CLI. No PR was created.');
      return 1;
    }
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    const code = result.status === null ? 1 : result.status;
    if (code !== 0) return code;
    const url = result.stdout.toString('utf8').replace(/\r?\n$/, '');
    if (!PR_URL.test(url)) {
      console.error('exonous: PR handoff not saved: gh stdout must contain exactly one canonical GitHub PR URL; inspect the created PR without retrying create');
      return code;
    }
    saveHandoff(url, original, bytes, cwd);
    return code;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function prCommand(args, cwd = process.cwd()) {
  const parsed = parse(args);
  if (!parsed) {
    console.error(USAGE);
    return 2;
  }
  try {
    return create(parsed, cwd);
  } catch (err) {
    console.error(`exonous pr create: ${err.message}. No PR was created.`);
    return 1;
  }
}

module.exports = { prCommand };
