#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { ALWAYS_FOLDERS, SCOPED_FOLDERS, detectProjectScope } = require('./scope');

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const RULES_ROOT = path.join(PACKAGE_ROOT, 'assets', 'techne', 'rules');
const MANAGED_FOLDERS = [...new Set([...ALWAYS_FOLDERS, ...SCOPED_FOLDERS])];

function log(msg) {
  process.stdout.write(`[exonous] ${msg}\n`);
}

function removeDir(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
}

function listAvailableFolders(rulesRoot) {
  return new Set(
    fs.readdirSync(rulesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  );
}

function writeScopeManifest(projectRoot, scope) {
  const manifestPath = path.join(projectRoot, '.claude', '.exonous-scope.json');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const payload = {
    updatedAt: new Date().toISOString(),
    folders: scope.folders,
    scoped: scope.scoped,
    signals: scope.signals,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

/**
 * Sync techne rules into the consumer project based on detected scope.
 * Sources rules from the bundled assets/techne/rules — no network.
 * @param {string} projectRoot
 * @param {{ dryRun?: boolean, silent?: boolean }} [options]
 */
function installRules(projectRoot, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const silent = Boolean(options.silent);
  const emit = silent ? () => {} : log;

  const scope = detectProjectScope(projectRoot);
  const targetRoot = path.join(projectRoot, '.claude', 'rules', 'exonous');
  const desired = new Set(scope.folders);

  if (!fs.existsSync(RULES_ROOT)) {
    emit(`WARN: techne rules missing at ${RULES_ROOT} — package is incomplete`);
    return { ok: false, scope };
  }

  const available = listAvailableFolders(RULES_ROOT);
  const toInstall = scope.folders.filter((folder) => available.has(folder));
  const missingFromKit = scope.folders.filter((folder) => !available.has(folder));

  if (!dryRun) {
    fs.mkdirSync(targetRoot, { recursive: true });

    for (const folder of toInstall) {
      removeDir(path.join(targetRoot, folder));
      copyDir(path.join(RULES_ROOT, folder), path.join(targetRoot, folder));
    }

    const installed = fs.readdirSync(targetRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    for (const folder of installed) {
      if (!MANAGED_FOLDERS.includes(folder)) continue;
      if (!desired.has(folder)) {
        removeDir(path.join(targetRoot, folder));
      }
    }

    writeScopeManifest(projectRoot, { ...scope, folders: toInstall });
  }

  const summary = toInstall.join(', ') || '(common only)';
  if (dryRun) {
    emit(`DRY: would install techne rules [${summary}] → .claude/rules/exonous/`);
  } else {
    emit(`techne rules synced [${summary}] → .claude/rules/exonous/`);
  }

  if (missingFromKit.length > 0) {
    emit(`WARN: techne is missing rule folders: ${missingFromKit.join(', ')}`);
  }

  return { ok: true, scope: { ...scope, folders: toInstall }, dryRun };
}

module.exports = { installRules };
