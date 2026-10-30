#!/usr/bin/env node
'use strict';

// kairos — SessionStart hook. Prints the workspace map and the last update note, and starts a background
// update at most once a day. Never blocks the session and never fails it.
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const ROOT = process.cwd();
const STATE = path.join(ROOT, '.claude', '.exonous');
const NOTE = path.join(STATE, 'note');
const LAST_CHECK = path.join(STATE, 'last-check');
const DAY_MS = 24 * 60 * 60 * 1000;
const PACKAGE_DIRS = ['exonous', '@tron/claude-config'];

function packageBin() {
  for (const dir of PACKAGE_DIRS) {
    const bin = path.join(ROOT, 'node_modules', dir, 'bin', 'exonous.js');
    if (fs.existsSync(bin)) return bin;
  }
  return null;
}

function packageManager() {
  if (['bun.lockb', 'bun.lock'].some((f) => fs.existsSync(path.join(ROOT, f)))) return 'bun';
  return fs.existsSync(path.join(ROOT, 'pnpm-lock.yaml')) ? 'pnpm' : 'npm';
}

function branch() {
  try {
    return execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function takeNote() {
  try {
    const note = fs.readFileSync(NOTE, 'utf8').trim();
    fs.rmSync(NOTE, { force: true });
    return note;
  } catch {
    return '';
  }
}

function updateDue() {
  if (process.env.CI || process.env.EXONOUS_NO_UPDATE) return false;
  try {
    return Date.now() - Number(fs.readFileSync(LAST_CHECK, 'utf8')) > DAY_MS;
  } catch {
    return true;
  }
}

function startBackgroundUpdate(bin) {
  fs.mkdirSync(STATE, { recursive: true });
  fs.writeFileSync(LAST_CHECK, String(Date.now()));
  spawn(process.execPath, [bin, 'update', '--background'], { cwd: ROOT, detached: true, stdio: 'ignore' }).unref();
}

function main() {
  const bin = packageBin();
  const lines = [];
  const note = takeNote();
  if (note) lines.push(note);
  const current = branch();
  lines.push(`## Exonous workspace\n  root:   ${ROOT.replace(require('os').homedir(), '~')}\n  pm:     ${packageManager()}${current ? `\n  branch: ${current}` : ''}`);
  if (!bin) lines.push(`exonous is not installed in node_modules — run \`${packageManager()} install\` to restore the gates.`);
  else if (updateDue()) startBackgroundUpdate(bin);
  process.stdout.write(`${lines.join('\n')}\n`);
}

try {
  main();
} catch {
  // a session must start even when the hook breaks
}
process.exit(0);
