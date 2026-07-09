#!/usr/bin/env node
// postinstall.js — installs Claude enforcement harness into consumer repo
// Runs automatically on: npm install @tron/claude-config
// Idempotent: safe to run multiple times

'use strict';

const fs = require('fs');
const path = require('path');

const DRY = process.env.DRY === '1';
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const CONSUMER_ROOT = process.env.INIT_CWD || process.cwd();

// Files that lived under node_modules/.../managed/ → consumer dest
// Each entry: [src relative to PACKAGE_ROOT, dest relative to CONSUMER_ROOT]
const MANAGED_FILES = [
  ['managed/claude/settings.json',           '.claude/settings.json'],
  ['managed/claude/hooks/bypass-check.sh',   '.claude/hooks/bypass-check.sh'],
  ['managed/claude/hooks/bootstrap-check.sh','.claude/hooks/bootstrap-check.sh'],
];

const GIT_HOOKS = [
  ['managed/git-hooks/pre-commit', '.git/hooks/pre-commit'],
  ['managed/git-hooks/pre-push',   '.git/hooks/pre-push'],
];

// Entries to add to .gitignore if not already present
const GITIGNORE_ENTRIES = [
  '.claude/.commit-authorized',
  '.claude/.pr-authorized',
  '.claude/.harness-last-update',
];

function log(msg) {
  process.stdout.write(`[claude-config] ${msg}\n`);
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!DRY) fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, destRel) {
  const srcAbs = path.join(PACKAGE_ROOT, src);
  const destAbs = path.join(CONSUMER_ROOT, destRel);
  if (!fs.existsSync(srcAbs)) {
    log(`WARN: source not found: ${src}`);
    return;
  }
  ensureDir(destAbs);
  if (DRY) {
    log(`DRY: would copy ${src} → ${destRel}`);
    return;
  }
  fs.copyFileSync(srcAbs, destAbs);
  // Make shell scripts executable
  if (destAbs.endsWith('.sh') || destRel.startsWith('.git/hooks/')) {
    fs.chmodSync(destAbs, 0o755);
  }
}

function installGitIgnoreEntries() {
  const gitignorePath = path.join(CONSUMER_ROOT, '.gitignore');
  if (!fs.existsSync(gitignorePath)) return;
  let content = fs.readFileSync(gitignorePath, 'utf8');
  let changed = false;
  for (const entry of GITIGNORE_ENTRIES) {
    if (!content.includes(entry)) {
      content += `\n${entry}`;
      changed = true;
    }
  }
  if (changed) {
    if (!DRY) fs.writeFileSync(gitignorePath, content, 'utf8');
    else log(`DRY: would add entries to .gitignore`);
  }
}

// Skip if not in a consumer repo (e.g. installing inside the package itself)
const isConsumerRepo = fs.existsSync(path.join(CONSUMER_ROOT, '.git'));
if (!isConsumerRepo) {
  process.exit(0);
}

// Also skip if CONSUMER_ROOT === PACKAGE_ROOT (self-install)
if (path.resolve(CONSUMER_ROOT) === path.resolve(PACKAGE_ROOT)) {
  process.exit(0);
}

// Copy managed files
for (const [src, dest] of MANAGED_FILES) {
  copyFile(src, dest);
}

// Install git hooks
for (const [src, dest] of GIT_HOOKS) {
  copyFile(src, dest);
}

// Update .gitignore
installGitIgnoreEntries();
