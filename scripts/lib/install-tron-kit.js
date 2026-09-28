#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const KIT_SRC = path.join(PACKAGE_ROOT, 'managed', 'tron-kit');
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const KIT_DEST = path.join(CLAUDE_DIR, 'tron-kit');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');
const MARKETPLACE = 'tron';
const PLUGIN_ID = `tron-kit@${MARKETPLACE}`;
// `claude plugin update` skips same-version reinstalls, so content changes are detected by hash.
const HASH_FILE = '.tron-kit-hash';

// Legacy upstream plugin this package replaces; removed only after tron-kit is in place.
const LEGACY_PLUGIN_IDS = ['ecc@ecc', 'everything-claude-code@everything-claude-code'];
const LEGACY_MARKETPLACES = ['ecc', 'everything-claude-code'];
const LEGACY_RULES_DIR = path.join(CLAUDE_DIR, 'rules', 'ecc');
const TRON_RULES_DIR = path.join(CLAUDE_DIR, 'rules', 'tron');

function defaultLog(msg) {
  process.stdout.write(`[claude-config] ${msg}\n`);
}

function packageVersion() {
  return JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;
}

function runClaude(args, timeout = 120000) {
  const res = spawnSync('claude', args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] });
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
  if (!fs.existsSync(SETTINGS_PATH)) return {};
  const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${SETTINGS_PATH} is not valid JSON (${err.message}) — fix it manually; not overwriting`);
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
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
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
    throw new Error(`tron-kit snapshot missing at ${KIT_SRC} — package is incomplete`);
  }
  const contentHash = hashKit(KIT_SRC);
  if (dryRun) {
    log(`DRY: would replace ~/.claude/tron-kit/ with managed/tron-kit (version ${version}, hash ${contentHash})`);
    return contentHash;
  }
  fs.rmSync(KIT_DEST, { recursive: true, force: true });
  fs.cpSync(KIT_SRC, KIT_DEST, { recursive: true, verbatimSymlinks: true });
  stampVersion(KIT_DEST, version);
  fs.writeFileSync(path.join(KIT_DEST, HASH_FILE), `${contentHash}\n`, 'utf8');
  log(`tron-kit copied → ~/.claude/tron-kit/ (version ${version}, hash ${contentHash})`);
  return contentHash;
}

function installViaCli(contentHash, { dryRun, log }) {
  const marketplaces = listJson(['plugin', 'marketplace', 'list']);
  const existing = marketplaces.find((m) => m.name === MARKETPLACE);
  const existingPath = existing && (existing.path || existing.installLocation);
  const pointsElsewhere = existing && existingPath && path.resolve(existingPath) !== path.resolve(KIT_DEST);

  const steps = [];
  if (pointsElsewhere) steps.push(['plugin', 'marketplace', 'remove', MARKETPLACE]);
  if (!existing || pointsElsewhere) steps.push(['plugin', 'marketplace', 'add', KIT_DEST, '--scope', 'user']);
  steps.push(['plugin', 'marketplace', 'update', MARKETPLACE]);

  const installed = listJson(['plugin', 'list']).find((p) => p.id === PLUGIN_ID && p.scope === 'user');
  const installedHash = installed ? readInstalledHash(installed.installPath) : null;
  if (!installed) {
    steps.push(['plugin', 'install', PLUGIN_ID, '--scope', 'user']);
  } else if (installedHash !== contentHash) {
    log(`tron-kit content changed (${installedHash || 'no hash'} → ${contentHash}) — reinstalling`);
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
    if (current?.source?.source !== 'directory' || current?.source?.path !== KIT_DEST) {
      settings.extraKnownMarketplaces[MARKETPLACE] = { source: { source: 'directory', path: KIT_DEST } };
      changes.push(`extraKnownMarketplaces.${MARKETPLACE} → ${KIT_DEST}`);
    }
    settings.enabledPlugins = settings.enabledPlugins || {};
    if (settings.enabledPlugins[PLUGIN_ID] !== true) {
      settings.enabledPlugins[PLUGIN_ID] = true;
      changes.push(`enabledPlugins["${PLUGIN_ID}"] = true`);
    }
    return changes;
  }, { dryRun, log });
  log(`WARN: tron-kit registered via settings.json only — run \`claude plugin install ${PLUGIN_ID}\` or /plugin in Claude Code to finish`);
}

/**
 * Installs the tron-kit plugin at user scope from ~/.claude/tron-kit.
 * Throws when the kit cannot be copied; CLI failures fall back to settings.json registration.
 * @param {{ dryRun?: boolean, log?: (msg: string) => void }} [options]
 * @returns {{ via: 'cli' | 'settings' }}
 */
function installTronKitPlugin(options = {}) {
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
    log(`tron-kit plugin ${dryRun ? 'would be ' : ''}installed (${PLUGIN_ID}, user scope)`);
    return { via: 'cli' };
  } catch (err) {
    log(`WARN: tron-kit CLI install failed: ${err.message}`);
    registerViaSettings({ dryRun, log });
    return { via: 'settings' };
  }
}

function uninstallLegacyViaCli({ dryRun, log }) {
  const installed = listJson(['plugin', 'list']).filter((p) => LEGACY_PLUGIN_IDS.includes(p.id));
  const marketplaces = listJson(['plugin', 'marketplace', 'list']).filter((m) => LEGACY_MARKETPLACES.includes(m.name));

  const steps = [
    ...installed.map((p) => ['plugin', 'uninstall', p.id, '--scope', p.scope || 'user']),
    ...marketplaces.map((m) => ['plugin', 'marketplace', 'remove', m.name]),
  ];
  if (steps.length === 0) {
    log('legacy plugin: nothing installed via CLI');
    return;
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

function cleanLegacySettings({ dryRun, log }) {
  editSettings((settings) => {
    const changes = [];
    for (const id of LEGACY_PLUGIN_IDS) {
      if (settings.enabledPlugins && id in settings.enabledPlugins) {
        delete settings.enabledPlugins[id];
        changes.push(`removed enabledPlugins["${id}"]`);
      }
    }
    for (const name of LEGACY_MARKETPLACES) {
      if (settings.extraKnownMarketplaces && name in settings.extraKnownMarketplaces) {
        delete settings.extraKnownMarketplaces[name];
        changes.push(`removed extraKnownMarketplaces.${name}`);
      }
    }
    return changes;
  }, { dryRun, log });
}

function migrateLegacyRules({ dryRun, log }) {
  if (!fs.existsSync(LEGACY_RULES_DIR)) return;
  const folders = fs.readdirSync(LEGACY_RULES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const folder of folders) {
    const src = path.join(KIT_SRC, 'rules', folder);
    if (!fs.existsSync(src)) {
      log(`WARN: ~/.claude/rules/ecc/${folder} has no tron-kit equivalent — not migrated`);
      continue;
    }
    const dest = path.join(TRON_RULES_DIR, folder);
    if (dryRun) {
      log(`DRY: would copy tron-kit rules/${folder} → ~/.claude/rules/tron/${folder}`);
      continue;
    }
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(TRON_RULES_DIR, { recursive: true });
    fs.cpSync(src, dest, { recursive: true });
    log(`rules migrated → ~/.claude/rules/tron/${folder}`);
  }

  if (dryRun) {
    log('DRY: would remove ~/.claude/rules/ecc/');
    return;
  }
  fs.rmSync(LEGACY_RULES_DIR, { recursive: true, force: true });
  log('removed ~/.claude/rules/ecc/');
}

/**
 * Removes the legacy upstream plugin, its marketplace, settings entries and user-level rules.
 * Call only after installTronKitPlugin() succeeded. Idempotent.
 * @param {{ dryRun?: boolean, log?: (msg: string) => void }} [options]
 */
function removeLegacyEcc(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const log = options.log || defaultLog;

  if (hasClaudeCli()) {
    try {
      uninstallLegacyViaCli({ dryRun, log });
    } catch (err) {
      log(`WARN: legacy plugin CLI removal failed: ${err.message} — cleaning settings.json directly`);
    }
  }
  cleanLegacySettings({ dryRun, log });
  migrateLegacyRules({ dryRun, log });
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
  PLUGIN_ID,
  installTronKitPlugin,
  removeLegacyEcc,
  disablePlugin,
};
