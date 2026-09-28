#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { ALWAYS_FOLDERS, SCOPED_FOLDERS, detectProjectScope } = require('./detect-project-scope');

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const RULES_ROOT = path.join(PACKAGE_ROOT, 'managed', 'tron-kit', 'rules');
const MANAGED_FOLDERS = [...new Set([...ALWAYS_FOLDERS, ...SCOPED_FOLDERS])];

function log(msg) {
  process.stdout.write(`[claude-config] ${msg}\n`);
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
  const manifestPath = path.join(projectRoot, '.claude', '.tron-scope.json');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const payload = {
    updatedAt: new Date().toISOString(),
    folders: scope.folders,
    scoped: scope.scoped,
    signals: scope.signals,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function removeLegacyRules(projectRoot, { dryRun, emit }) {
  const legacy = [
    path.join(projectRoot, '.claude', 'rules', 'ecc'),
    path.join(projectRoot, '.claude', '.ecc-scope.json'),
  ];
  for (const target of legacy) {
    if (!fs.existsSync(target)) continue;
    const rel = path.relative(projectRoot, target);
    if (dryRun) {
      emit(`DRY: would remove legacy ${rel}`);
      continue;
    }
    fs.rmSync(target, { recursive: true, force: true });
    emit(`removed legacy ${rel}`);
  }
}

/**
 * Sync tron-kit rules into the consumer project based on detected scope.
 * Sources rules from the bundled managed/tron-kit snapshot — no network.
 * @param {string} projectRoot
 * @param {{ dryRun?: boolean, silent?: boolean }} [options]
 */
function installTronRules(projectRoot, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const silent = Boolean(options.silent);
  const emit = silent ? () => {} : log;

  const scope = detectProjectScope(projectRoot);
  const targetRoot = path.join(projectRoot, '.claude', 'rules', 'tron');
  const desired = new Set(scope.folders);

  if (!fs.existsSync(RULES_ROOT)) {
    emit(`WARN: tron-kit rules missing at ${RULES_ROOT} — package is incomplete`);
    return { ok: false, scope };
  }

  removeLegacyRules(projectRoot, { dryRun, emit });

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
    emit(`DRY: would install tron-kit rules [${summary}] → .claude/rules/tron/`);
  } else {
    emit(`tron-kit rules synced [${summary}] → .claude/rules/tron/`);
  }

  if (missingFromKit.length > 0) {
    emit(`WARN: tron-kit snapshot missing rule folders: ${missingFromKit.join(', ')}`);
  }

  return { ok: true, scope: { ...scope, folders: toInstall }, dryRun };
}

module.exports = {
  MANAGED_FOLDERS,
  installTronRules,
  detectProjectScope,
};
