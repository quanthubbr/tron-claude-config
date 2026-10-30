#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const paths = require('./paths');
const { findOnPath } = require('./runtime');

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const KIT_SRC = path.join(PACKAGE_ROOT, 'assets', 'techne');
const kitDest = () => path.join(paths.claudeDir(), 'techne');
const settingsPath = () => path.join(paths.claudeDir(), 'settings.json');
const MARKETPLACE = 'exonous';
const PLUGIN_ID = `techne@${MARKETPLACE}`;
// `claude plugin update` skips same-version reinstalls, so content changes are detected by hash.
const HASH_FILE = '.techne-hash';


function defaultLog(msg) {
  process.stdout.write(`[exonous] ${msg}\n`);
}

function packageVersion() {
  return JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;
}

function cmdQuote(arg) {
  if (/["%!\r\n]/.test(arg)) throw new Error(`refusing to pass ${JSON.stringify(arg)} through cmd.exe`);
  // CommandLineToArgvW: backslashes right before the closing quote must be doubled or they escape it.
  return /^[\w@.:\\/=-]+$/.test(arg) ? arg : `"${arg.replace(/(\\+)$/, '$1$1')}"`;
}

// npm on Windows ships claude.cmd, which Node only spawns through cmd.exe.
function claudeInvocation(args, { platform = process.platform, which = (name) => findOnPath(name) } = {}) {
  if (platform !== 'win32') return { file: 'claude', args, shell: false };
  const file = which('claude');
  if (!file) return null;
  if (!/\.(cmd|bat)$/i.test(file)) return { file, args, shell: false };
  return { file: [file, ...args].map(cmdQuote).join(' '), args: [], shell: true };
}

function runClaude(args, timeout = 120000) {
  let call;
  try {
    call = claudeInvocation(args);
  } catch (err) {
    return { ok: false, missing: false, output: err.message };
  }
  if (!call) return { ok: false, missing: true, output: 'claude not found on PATH' };
  const res = spawnSync(call.file, call.args, { encoding: 'utf8', timeout, shell: call.shell, stdio: ['ignore', 'pipe', 'pipe'] });
  if (res.error) {
    return { ok: false, missing: res.error.code === 'ENOENT', output: res.error.message };
  }
  return { ok: res.status === 0, missing: false, output: `${res.stdout || ''}${res.stderr || ''}`.trim() };
}

function claudeOrThrow(args) {
  const res = runClaude(args);
  if (!res.ok) throw new Error(`\`claude ${args.join(' ')}\` failed: ${res.output || 'no output'}`);
  return res.output;
}

function hasClaudeCli() {
  return runClaude(['--version'], 15000).ok;
}

function listJson(args) {
  const output = claudeOrThrow([...args, '--json']);
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed)) throw new Error(`\`claude ${args.join(' ')} --json\` returned non-array output`);
  return parsed;
}

function readSettings() {
  if (!fs.existsSync(settingsPath())) return {};
  const raw = fs.readFileSync(settingsPath(), 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${settingsPath()} is not valid JSON (${err.message}) — fix it manually; not overwriting`);
  }
}

// Applies mutate() to ~/.claude/settings.json; returns change descriptions. Writes only when something changed.
function editSettings(mutate, { dryRun, log }) {
  const settings = readSettings();
  const changes = mutate(settings);
  if (changes.length === 0) return changes;
  if (dryRun) {
    for (const change of changes) log(`DRY: would update ~/.claude/settings.json: ${change}`);
    return changes;
  }
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  for (const change of changes) log(`~/.claude/settings.json: ${change}`);
  return changes;
}

function stampVersion(root, version) {
  const pluginPath = path.join(root, '.claude-plugin', 'plugin.json');
  const marketplacePath = path.join(root, '.claude-plugin', 'marketplace.json');
  const plugin = JSON.parse(fs.readFileSync(pluginPath, 'utf8'));
  plugin.version = version;
  fs.writeFileSync(pluginPath, `${JSON.stringify(plugin, null, 2)}\n`, 'utf8');

  const marketplace = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
  const entry = (marketplace.plugins || []).find((p) => p.name === plugin.name);
  if (!entry) throw new Error(`${marketplacePath} has no plugin entry named ${plugin.name}`);
  entry.version = version;
  fs.writeFileSync(marketplacePath, `${JSON.stringify(marketplace, null, 2)}\n`, 'utf8');
}

function hashKit(root) {
  const hash = crypto.createHash('sha256');
  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        hash.update(path.relative(root, full));
        hash.update(fs.readFileSync(full));
      }
    }
  };
  walk(root);
  return hash.digest('hex').slice(0, 16);
}

function readInstalledHash(installPath) {
  const file = installPath && path.join(installPath, HASH_FILE);
  return file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : null;
}

function copyKit(version, { dryRun, log }) {
  if (!fs.existsSync(path.join(KIT_SRC, '.claude-plugin', 'plugin.json'))) {
    throw new Error(`techne missing at ${KIT_SRC} — package is incomplete`);
  }
  const contentHash = hashKit(KIT_SRC);
  if (dryRun) {
    log(`DRY: would replace ~/.claude/techne/ with assets/techne (version ${version}, hash ${contentHash})`);
    return contentHash;
  }
  fs.rmSync(kitDest(), { recursive: true, force: true });
  fs.cpSync(KIT_SRC, kitDest(), { recursive: true, verbatimSymlinks: true });
  stampVersion(kitDest(), version);
  fs.writeFileSync(path.join(kitDest(), HASH_FILE), `${contentHash}\n`, 'utf8');
  log(`techne copied → ~/.claude/techne/ (version ${version}, hash ${contentHash})`);
  return contentHash;
}

function installViaCli(contentHash, { dryRun, log }) {
  const marketplaces = listJson(['plugin', 'marketplace', 'list']);
  const existing = marketplaces.find((m) => m.name === MARKETPLACE);
  const existingPath = existing && (existing.path || existing.installLocation);
  const pointsElsewhere = existing && existingPath && path.resolve(existingPath) !== path.resolve(kitDest());

  const steps = [];
  if (pointsElsewhere) steps.push(['plugin', 'marketplace', 'remove', MARKETPLACE]);
  if (!existing || pointsElsewhere) steps.push(['plugin', 'marketplace', 'add', kitDest(), '--scope', 'user']);
  steps.push(['plugin', 'marketplace', 'update', MARKETPLACE]);

  const installed = listJson(['plugin', 'list']).find((p) => p.id === PLUGIN_ID && p.scope === 'user');
  const installedHash = installed ? readInstalledHash(installed.installPath) : null;
  if (!installed) {
    steps.push(['plugin', 'install', PLUGIN_ID, '--scope', 'user']);
  } else if (installedHash !== contentHash) {
    log(`techne content changed (${installedHash || 'no hash'} → ${contentHash}) — reinstalling`);
    steps.push(['plugin', 'uninstall', PLUGIN_ID, '--scope', 'user']);
    steps.push(['plugin', 'install', PLUGIN_ID, '--scope', 'user']);
  } else {
    steps.push(['plugin', 'update', PLUGIN_ID, '--scope', 'user']);
  }

  for (const args of steps) {
    if (dryRun) {
      log(`DRY: would run claude ${args.join(' ')}`);
      continue;
    }
    claudeOrThrow(args);
    log(`claude ${args.join(' ')} ✓`);
  }
}

function registerViaSettings({ dryRun, log }) {
  editSettings((settings) => {
    const changes = [];
    settings.extraKnownMarketplaces = settings.extraKnownMarketplaces || {};
    const current = settings.extraKnownMarketplaces[MARKETPLACE];
    if (current?.source?.source !== 'directory' || current?.source?.path !== kitDest()) {
      settings.extraKnownMarketplaces[MARKETPLACE] = { source: { source: 'directory', path: kitDest() } };
      changes.push(`extraKnownMarketplaces.${MARKETPLACE} → ${kitDest()}`);
    }
    settings.enabledPlugins = settings.enabledPlugins || {};
    if (settings.enabledPlugins[PLUGIN_ID] !== true) {
      settings.enabledPlugins[PLUGIN_ID] = true;
      changes.push(`enabledPlugins["${PLUGIN_ID}"] = true`);
    }
    return changes;
  }, { dryRun, log });
  log(`WARN: techne registered via settings.json only — run \`claude plugin install ${PLUGIN_ID}\` or /plugin in Claude Code to finish`);
}

/**
 * Installs the techne plugin at user scope from ~/.claude/techne.
 * Throws when the kit cannot be copied; CLI failures fall back to settings.json registration.
 * @param {{ dryRun?: boolean, log?: (msg: string) => void }} [options]
 * @returns {{ via: 'cli' | 'settings' }}
 */
function installTechne(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const log = options.log || defaultLog;
  const version = packageVersion();

  const contentHash = copyKit(version, { dryRun, log });

  if (!hasClaudeCli()) {
    log('WARN: claude CLI not found on PATH — falling back to settings.json registration');
    registerViaSettings({ dryRun, log });
    return { via: 'settings' };
  }

  try {
    installViaCli(contentHash, { dryRun, log });
    log(`techne plugin ${dryRun ? 'would be ' : ''}installed (${PLUGIN_ID}, user scope)`);
    return { via: 'cli' };
  } catch (err) {
    log(`WARN: techne CLI install failed: ${err.message}`);
    registerViaSettings({ dryRun, log });
    return { via: 'settings' };
  }
}

function uninstallViaCli(ids, marketplaces, { dryRun, log }) {
  const installed = listJson(['plugin', 'list']).filter((p) => ids.includes(p.id));
  const known = listJson(['plugin', 'marketplace', 'list']).filter((m) => marketplaces.includes(m.name));
  const steps = [
    ...installed.map((p) => ['plugin', 'uninstall', p.id, '--scope', p.scope || 'user']),
    ...known.map((m) => ['plugin', 'marketplace', 'remove', m.name]),
  ];
  for (const args of steps) {
    if (dryRun) {
      log(`DRY: would run claude ${args.join(' ')}`);
      continue;
    }
    claudeOrThrow(args);
    log(`claude ${args.join(' ')} ✓`);
  }
}

function cleanPluginSettings(ids, marketplaces, { dryRun, log }) {
  editSettings((settings) => {
    const changes = [];
    const drop = (key, names, label) => {
      const map = settings[key];
      if (!map || typeof map !== 'object') return;
      const hits = names.filter((n) => n in map);
      for (const n of hits) {
        delete map[n];
        changes.push(`removed ${key}${label(n)}`);
      }
      // Registration created the container; once our entry leaves it empty, it goes too.
      if (hits.length && !Object.keys(map).length) delete settings[key];
    };
    drop('enabledPlugins', ids, (id) => `["${id}"]`);
    drop('extraKnownMarketplaces', marketplaces, (name) => `.${name}`);
    return changes;
  }, { dryRun, log });
}

/**
 * Uninstalls plugins and their marketplaces (CLI when available) and drops their settings.json entries. Idempotent.
 * @param {string[]} ids plugin ids, e.g. `name@marketplace`
 * @param {string[]} marketplaces marketplace names
 * @param {{ dryRun?: boolean, log?: (msg: string) => void }} [options]
 */
function removePlugins(ids, marketplaces, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const log = options.log || defaultLog;
  if (hasClaudeCli()) {
    try {
      uninstallViaCli(ids, marketplaces, { dryRun, log });
    } catch (err) {
      log(`WARN: plugin CLI removal failed: ${err.message} — cleaning settings.json directly`);
    }
  }
  cleanPluginSettings(ids, marketplaces, { dryRun, log });
}

function disableViaSettings(id, { dryRun, log }) {
  editSettings((settings) => {
    settings.enabledPlugins = settings.enabledPlugins || {};
    if (settings.enabledPlugins[id] === false) return [];
    settings.enabledPlugins[id] = false;
    return [`enabledPlugins["${id}"] = false`];
  }, { dryRun, log });
}

/**
 * Disables a Claude Code plugin at every scope where it is installed and enabled.
 * Falls back to enabledPlugins[id] = false in ~/.claude/settings.json when the CLI is missing or fails. Idempotent.
 * @param {string} id plugin id, e.g. `name@marketplace`
 * @param {{ dryRun?: boolean, log?: (msg: string) => void }} [options]
 */
function disablePlugin(id, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const log = options.log || defaultLog;

  if (!hasClaudeCli()) {
    log(`WARN: claude CLI not found on PATH — disabling ${id} via settings.json`);
    disableViaSettings(id, { dryRun, log });
    return;
  }

  try {
    const enabled = listJson(['plugin', 'list']).filter((p) => p.id === id && p.enabled);
    if (enabled.length === 0) {
      log(`${id}: not installed or already disabled`);
      return;
    }
    for (const p of enabled) {
      const args = ['plugin', 'disable', id, '--scope', p.scope || 'user'];
      if (dryRun) {
        log(`DRY: would run claude ${args.join(' ')}`);
        continue;
      }
      claudeOrThrow(args);
      log(`claude ${args.join(' ')} ✓`);
    }
  } catch (err) {
    log(`WARN: ${id} CLI disable failed: ${err.message} — disabling via settings.json`);
    disableViaSettings(id, { dryRun, log });
  }
}

module.exports = {
  installTechne,
  removePlugins,
  disablePlugin,
  claudeInvocation,
  PLUGIN_ID,
  MARKETPLACE,
};
