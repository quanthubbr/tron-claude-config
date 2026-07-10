#!/usr/bin/env node
'use strict';

/**
 * Ensure codebase-memory-mcp is installed and registered for Claude Code.
 * Official installers: https://github.com/DeusData/codebase-memory-mcp
 *
 * macOS/Linux: curl install.sh | bash
 * Windows:     install.ps1 (with Unblock-File)
 * Fallback:    npm install -g codebase-memory-mcp
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

const INSTALL_SH = 'https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh';
const INSTALL_PS1 = 'https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.ps1';
const DOCS_URL = 'https://github.com/DeusData/codebase-memory-mcp';
const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 120000;

function log(msg) {
  process.stdout.write(`[claude-config] ${msg}\n`);
}

function mcpConfigPath() {
  return path.join(os.homedir(), '.claude', '.mcp.json');
}

function isRegisteredInMcpJson() {
  try {
    const p = mcpConfigPath();
    if (!fs.existsSync(p)) return false;
    const config = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Object.keys(config.mcpServers || {}).some((k) => k.includes('codebase-memory'));
  } catch {
    return false;
  }
}

function binaryCandidates() {
  const home = os.homedir();
  const isWin = process.platform === 'win32';
  const exe = isWin ? 'codebase-memory-mcp.exe' : 'codebase-memory-mcp';
  return [
    path.join(home, '.local', 'bin', exe),
    path.join(home, 'bin', exe),
    path.join(home, '.codebase-memory-mcp', exe),
    path.join(home, 'AppData', 'Local', 'codebase-memory-mcp', exe),
  ];
}

function findBinaryOnDisk() {
  for (const candidate of binaryCandidates()) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function isBinaryOnPath() {
  try {
    if (process.platform === 'win32') {
      execSync('where codebase-memory-mcp', { stdio: 'ignore', timeout: 5000 });
    } else {
      execSync('command -v codebase-memory-mcp', { stdio: 'ignore', shell: true, timeout: 5000 });
    }
    return true;
  } catch {
    return Boolean(findBinaryOnDisk());
  }
}

/**
 * Installed = MCP registered for Claude Code (what agents need).
 * Binary presence alone is not enough — install must configure ~/.claude/.mcp.json.
 */
function isCodebaseMemoryReady() {
  return isRegisteredInMcpJson();
}

function runUnixInstaller() {
  execSync(`curl -fsSL "${INSTALL_SH}" | bash`, {
    stdio: 'ignore',
    shell: true,
    timeout: ATTEMPT_TIMEOUT_MS,
    env: process.env,
  });
}

function runWindowsInstaller() {
  const ps1 = path.join(os.tmpdir(), `cmm-install-${Date.now()}.ps1`);
  const script = [
    `$ErrorActionPreference = 'Stop'`,
    `Invoke-WebRequest -Uri '${INSTALL_PS1}' -OutFile '${ps1}'`,
    `Unblock-File -Path '${ps1}'`,
    `& '${ps1}'`,
  ].join('; ');

  const result = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { stdio: 'ignore', timeout: ATTEMPT_TIMEOUT_MS, env: process.env }
  );
  if (result.status !== 0) {
    throw new Error(`Windows installer exited with code ${result.status}`);
  }
}

function runNpmFallback() {
  const pmCmds = [
    'npm install -g codebase-memory-mcp',
    'pnpm add -g codebase-memory-mcp',
    'bun add -g codebase-memory-mcp',
  ];
  let lastError;
  for (const cmd of pmCmds) {
    try {
      execSync(cmd, { stdio: 'ignore', shell: true, timeout: ATTEMPT_TIMEOUT_MS });
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('npm/pnpm/bun global install failed');
}

function runPlatformInstaller() {
  if (process.platform === 'win32') {
    runWindowsInstaller();
  } else {
    runUnixInstaller();
  }
}

/**
 * Ensure codebase-memory-mcp is installed and registered.
 * @param {{ silent?: boolean, force?: boolean }} [options]
 * @returns {{ ok: boolean, alreadyReady?: boolean, attempts?: number }}
 */
function ensureCodebaseMemoryMcp(options = {}) {
  const silent = Boolean(options.silent);
  const emit = silent ? () => {} : log;

  if (!options.force && isCodebaseMemoryReady()) {
    return { ok: true, alreadyReady: true };
  }

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      emit(`codebase-memory-mcp: install attempt ${attempt}/${MAX_ATTEMPTS}…`);
      if (attempt < MAX_ATTEMPTS) {
        runPlatformInstaller();
      } else {
        // Final attempt: platform installer, then npm fallback if still missing
        try {
          runPlatformInstaller();
        } catch (err) {
          lastError = err;
          emit('codebase-memory-mcp: platform installer failed — trying npm global fallback…');
          runNpmFallback();
        }
      }

      if (isCodebaseMemoryReady()) {
        emit('codebase-memory-mcp installed and registered in ~/.claude/.mcp.json');
        if (!isBinaryOnPath()) {
          emit('WARN: binary may not be on PATH — restart shell / Claude Code if MCP fails to start');
        }
        return { ok: true, attempts: attempt };
      }

      lastError = new Error('installer finished but ~/.claude/.mcp.json still missing codebase-memory entry');
    } catch (err) {
      lastError = err;
    }
  }

  emit(`ERROR: codebase-memory-mcp install FAILED after ${MAX_ATTEMPTS} attempts`);
  emit(`  See: ${DOCS_URL}`);
  emit('  macOS/Linux: curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash');
  emit('  Windows:     irm https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.ps1 | iex');
  if (lastError && lastError.message) {
    emit(`  Last error: ${lastError.message}`);
  }

  return { ok: false, attempts: MAX_ATTEMPTS };
}

module.exports = {
  ensureCodebaseMemoryMcp,
  isCodebaseMemoryReady,
  isRegisteredInMcpJson,
  isBinaryOnPath,
};

if (require.main === module) {
  const force = process.argv.includes('--force');
  const result = ensureCodebaseMemoryMcp({ force });
  process.exit(result.ok ? 0 : 1);
}
