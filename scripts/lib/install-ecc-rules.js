#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { ALWAYS_FOLDERS, SCOPED_FOLDERS, detectProjectScope } = require('./detect-project-scope');

const ECC_REPO = 'https://github.com/affaan-m/ECC.git';
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

function cloneEccRulesRoot() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-'));
  try {
    execSync(`git clone --depth=1 ${ECC_REPO} "${path.join(tmpDir, 'ECC')}"`, {
      stdio: 'ignore',
      timeout: 30000,
    });
    const rulesRoot = path.join(tmpDir, 'ECC', 'rules');
    if (!fs.existsSync(rulesRoot)) {
      throw new Error('ECC rules directory missing after clone');
    }
    return { rulesRoot, tmpDir };
  } catch (error) {
    removeDir(tmpDir);
    throw error;
  }
}

function listAvailableEccFolders(rulesRoot) {
  return new Set(
    fs.readdirSync(rulesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  );
}

function writeScopeManifest(projectRoot, scope) {
  const manifestPath = path.join(projectRoot, '.claude', '.ecc-scope.json');
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
 * Sync ECC rules into the consumer project based on detected scope.
 * @param {string} projectRoot
 * @param {{ dryRun?: boolean, silent?: boolean }} [options]
 */
function installEccRules(projectRoot, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const silent = Boolean(options.silent);
  const emit = silent ? () => {} : log;

  const scope = detectProjectScope(projectRoot);
  const targetRoot = path.join(projectRoot, '.claude', 'rules', 'ecc');
  const desired = new Set(scope.folders);

  let rulesRoot;
  let tmpDir;
  try {
    ({ rulesRoot, tmpDir } = cloneEccRulesRoot());
  } catch {
    emit('WARN: ECC install failed (check internet / git)');
    return { ok: false, scope };
  }

  const available = listAvailableEccFolders(rulesRoot);
  const toInstall = scope.folders.filter((folder) => available.has(folder));
  const missingFromRepo = scope.folders.filter((folder) => !available.has(folder));

  if (!dryRun) {
    fs.mkdirSync(targetRoot, { recursive: true });

    for (const folder of toInstall) {
      copyDir(path.join(rulesRoot, folder), path.join(targetRoot, folder));
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

  try {
    removeDir(tmpDir);
  } catch {
    // best-effort cleanup
  }

  const summary = toInstall.join(', ') || '(common only)';
  if (dryRun) {
    emit(`DRY: would install ECC rules [${summary}] → .claude/rules/ecc/`);
  } else {
    emit(`ECC rules synced [${summary}] → .claude/rules/ecc/`);
  }

  if (missingFromRepo.length > 0) {
    emit(`WARN: ECC repo missing folders: ${missingFromRepo.join(', ')}`);
  }

  return { ok: true, scope: { ...scope, folders: toInstall }, dryRun };
}

module.exports = {
  MANAGED_FOLDERS,
  installEccRules,
  detectProjectScope,
};
