#!/usr/bin/env node
'use strict';

// Installs the atlas engine from a pinned, checksum-verified release and registers it as `atlas` for Claude Code and Cursor.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, execSync, spawnSync } = require('child_process');
const paths = require('./paths');

const SERVER_KEY = 'atlas';
const ENGINE = 'codebase-memory-mcp';
// Bump together: tag, the three digests (installers + release checksums.txt) and the npm fallback version.
const ENGINE_VERSION = '0.12.1';
const ENGINE_SOURCE = `https://raw.githubusercontent.com/DeusData/${ENGINE}/v${ENGINE_VERSION}`;
const ENGINE_RELEASE = `https://github.com/DeusData/${ENGINE}/releases/download/v${ENGINE_VERSION}`;
const INSTALLERS = {
  sh: { url: `${ENGINE_SOURCE}/install.sh`, sha256: '13049c7cc51bc508d68b8ecb8a9fd9574ecb7c6f2c9dd5a19bf7d4c187321145' },
  ps1: { url: `${ENGINE_SOURCE}/install.ps1`, sha256: 'edc5e194702e21b01d38648a25d44d783022bba992b5fb62b08528e2c71ca370' },
};
// The installers verify the binary archive against this file, so pinning it pins the binary.
const RELEASE_CHECKSUMS = {
  url: `${ENGINE_RELEASE}/checksums.txt`,
  sha256: '103ddf75ccbe4e4de9faa57f074ee5f16b88edab6fd2f7dfd34e50d147dddffe',
};
const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 120000;

function log(msg) {
  process.stdout.write(`[exonous] ${msg}\n`);
}

function mcpConfigPaths() {
  const home = paths.home();
  return [
    { file: path.join(home, '.claude', '.mcp.json'), required: true },
    { file: path.join(home, '.claude.json'), required: false },
    { file: path.join(home, '.cursor', 'mcp.json'), required: true, onlyIfDir: path.join(home, '.cursor') },
  ];
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.exonous-${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

function isRegisteredInMcpJson() {
  const config = readJson(mcpConfigPaths()[0].file);
  return Boolean(config?.mcpServers?.[SERVER_KEY]);
}

function binaryCandidates() {
  const home = paths.home();
  const exe = process.platform === 'win32' ? `${ENGINE}.exe` : ENGINE;
  return [
    path.join(home, '.local', 'bin', exe),
    path.join(home, 'bin', exe),
    path.join(home, `.${ENGINE}`, exe),
    path.join(home, 'AppData', 'Local', ENGINE, exe),
  ];
}

function findBinary() {
  const onDisk = binaryCandidates().find((candidate) => fs.existsSync(candidate));
  if (onDisk) return onDisk;
  try {
    const cmd = process.platform === 'win32' ? `where ${ENGINE}` : `command -v ${ENGINE}`;
    return execSync(cmd, { encoding: 'utf8', shell: true, timeout: 5000 }).split(/\r?\n/)[0].trim() || null;
  } catch {
    return null;
  }
}

function isBinaryOnPath() {
  return Boolean(findBinary());
}

function isEngineEntry(name, entry) {
  return name === SERVER_KEY || name.includes('codebase-memory') || String(entry?.command || '').includes(ENGINE);
}

/** Register the engine under `atlas` and drop the engine's own key in every MCP config. */
function normalizeRegistration(binary, { dryRun = false } = {}) {
  const changed = [];
  for (const { file, required, onlyIfDir } of mcpConfigPaths()) {
    if (onlyIfDir && !fs.existsSync(onlyIfDir)) continue;
    const exists = fs.existsSync(file);
    if (!exists && !required) continue;
    const config = (exists ? readJson(file) : {}) || null;
    if (!config) {
      log(`WARN: ${file} is not valid JSON — skipped ${SERVER_KEY} registration`);
      continue;
    }
    const servers = config.mcpServers || {};
    const legacy = Object.keys(servers).filter((name) => name !== SERVER_KEY && isEngineEntry(name, servers[name]));
    const entry = servers[SERVER_KEY] || (legacy.length ? servers[legacy[0]] : null) || { command: binary };
    const next = Object.fromEntries(Object.entries(servers).filter(([name]) => !legacy.includes(name)));
    next[SERVER_KEY] = entry;
    if (JSON.stringify(next) === JSON.stringify(servers)) continue;

    changed.push(file);
    if (dryRun) continue;
    writeJsonAtomic(file, { ...config, mcpServers: next });
  }
  return changed;
}

function verifySha256(file, expected) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (actual !== expected) {
    throw new Error(`${path.basename(file)} checksum mismatch (expected ${expected}, got ${actual}) — refusing to run it`);
  }
}

/** Downloads a pinned file to a private temp dir and hands it on only if its digest matches. */
function withVerifiedDownload({ url, sha256 }, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-'));
  const file = path.join(dir, path.basename(url));
  try {
    execFileSync('curl', ['-fsSL', '--proto', '=https', '--max-redirs', '5', '-o', file, url], {
      stdio: 'ignore',
      timeout: ATTEMPT_TIMEOUT_MS,
    });
    verifySha256(file, sha256);
    run(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const installerEnv = () => ({ ...process.env, CBM_DOWNLOAD_URL: ENGINE_RELEASE });

/** Runs a pinned installer only after the release's checksums.txt still matches its pin. */
function withVerifiedInstaller(installer, run) {
  withVerifiedDownload(RELEASE_CHECKSUMS, () => withVerifiedDownload(installer, run));
}

function runUnixInstaller() {
  withVerifiedInstaller(INSTALLERS.sh, (script) => {
    execFileSync('bash', [script], { stdio: 'ignore', timeout: ATTEMPT_TIMEOUT_MS, env: installerEnv() });
  });
}

function runWindowsInstaller() {
  withVerifiedInstaller(INSTALLERS.ps1, (script) => {
    const result = spawnSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
      { stdio: 'ignore', timeout: ATTEMPT_TIMEOUT_MS, env: installerEnv() }
    );
    if (result.status !== 0) throw new Error(`Windows installer exited with code ${result.status}`);
  });
}

function runNpmFallback() {
  const pkg = `${ENGINE}@${ENGINE_VERSION}`;
  const pmCmds = [['npm', ['install', '-g', pkg]], ['pnpm', ['add', '-g', pkg]], ['bun', ['add', '-g', pkg]]];
  let lastError;
  for (const [bin, args] of pmCmds) {
    try {
      execFileSync(bin, args, { stdio: 'ignore', shell: process.platform === 'win32', timeout: ATTEMPT_TIMEOUT_MS });
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('npm/pnpm/bun global install failed');
}

function isWsl() {
  if (process.platform !== 'linux') return false;
  try {
    return fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
}

function runPlatformInstaller() {
  if (process.platform === 'win32') {
    runWindowsInstaller();
    return;
  }
  try {
    runUnixInstaller();
  } catch (err) {
    if (!isWsl()) throw err;
    log('atlas: Unix installer failed in WSL — trying npm global fallback…');
    runNpmFallback();
  }
}

function isAtlasReady() {
  return isRegisteredInMcpJson() && isBinaryOnPath();
}

/**
 * Ensure atlas is installed and registered.
 * @param {{ silent?: boolean, force?: boolean, dryRun?: boolean }} [options]
 * @returns {{ ok: boolean, alreadyReady?: boolean, attempts?: number }}
 */
function ensureAtlas(options = {}) {
  const emit = options.silent ? () => {} : log;

  if (!options.force) {
    const binary = findBinary();
    if (binary) {
      const changed = normalizeRegistration(binary, { dryRun: options.dryRun });
      for (const file of changed) emit(`${options.dryRun ? 'DRY: would register' : 'registered'} atlas → ${file}`);
      if (isAtlasReady() || (options.dryRun && changed.length)) return { ok: true, alreadyReady: !changed.length };
    }
  }
  if (options.dryRun) {
    emit('DRY: would install atlas engine and register it');
    return { ok: true };
  }

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      emit(`atlas: install attempt ${attempt}/${MAX_ATTEMPTS}…`);
      try {
        runPlatformInstaller();
      } catch (err) {
        if (attempt < MAX_ATTEMPTS && process.platform !== 'win32' && !isWsl()) throw err;
        lastError = err;
        emit('atlas: platform installer failed — trying npm global fallback…');
        runNpmFallback();
      }

      const binary = findBinary();
      if (binary) normalizeRegistration(binary);
      if (isAtlasReady()) {
        emit('atlas installed and registered');
        return { ok: true, attempts: attempt };
      }
      lastError = new Error('installer finished but atlas is still not registered');
    } catch (err) {
      lastError = err;
    }
  }

  emit(`ERROR: atlas install FAILED after ${MAX_ATTEMPTS} attempts`);
  emit(`  Manual: download ${INSTALLERS.sh.url} (Windows: install.ps1), check its sha256, run it`);
  emit(`          with CBM_DOWNLOAD_URL=${ENGINE_RELEASE}, then re-run: npx exonous setup`);
  if (lastError?.message) emit(`  Last error: ${lastError.message}`);
  return { ok: false, attempts: MAX_ATTEMPTS };
}

module.exports = { ensureAtlas, verifySha256, isWsl, INSTALLERS, RELEASE_CHECKSUMS, ENGINE_RELEASE };

if (require.main === module) {
  const result = ensureAtlas({ force: process.argv.includes('--force'), dryRun: process.argv.includes('--dry-run') });
  process.exit(result.ok ? 0 : 1);
}
