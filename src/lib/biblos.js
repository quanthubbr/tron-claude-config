#!/usr/bin/env node
'use strict';

/**
 * Ensure biblos (live library/API documentation MCP) is registered as `biblos`
 * for Claude Code (~/.claude.json) and Cursor (~/.cursor/mcp.json). An existing engine entry
 * is renamed in place so its headers (API key) survive; header values are never logged.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SERVER_KEY = 'biblos';
const ENGINE_URL = 'https://mcp.context7.com/mcp';
const ENGINE_KEY_HINT = 'context7';

function log(msg) {
  process.stdout.write(`[exonous] ${msg}\n`);
}

function targets() {
  const home = os.homedir();
  return [
    { file: path.join(home, '.claude.json'), entry: { type: 'http', url: ENGINE_URL } },
    { file: path.join(home, '.cursor', 'mcp.json'), entry: { url: ENGINE_URL }, onlyIfDir: path.join(home, '.cursor') },
  ];
}

function isEngineEntry(name, entry) {
  return name.toLowerCase().includes(ENGINE_KEY_HINT) || String(entry?.url || '').includes('context7.com');
}

function ensureBiblos({ dryRun = false } = {}) {
  let changed = 0;
  for (const { file, entry, onlyIfDir } of targets()) {
    if (onlyIfDir && !fs.existsSync(onlyIfDir)) continue;
    if (!fs.existsSync(file)) continue;
    let config;
    try {
      config = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      log(`WARN: ${file} is not valid JSON — skipped ${SERVER_KEY} registration`);
      continue;
    }
    const servers = config.mcpServers || {};
    const legacy = Object.keys(servers).filter((name) => name !== SERVER_KEY && isEngineEntry(name, servers[name]));
    if (servers[SERVER_KEY] && !legacy.length) continue;

    const keyed = legacy.map((name) => servers[name]).find((e) => e?.headers && Object.keys(e.headers).length);
    const current = servers[SERVER_KEY];
    const next = Object.fromEntries(Object.entries(servers).filter(([name]) => !legacy.includes(name)));
    next[SERVER_KEY] = current
      ? (current.headers || !keyed ? current : { ...current, headers: keyed.headers })
      : keyed || servers[legacy[0]] || entry;
    changed++;
    if (dryRun) {
      log(`DRY: would register biblos → ${file}`);
      continue;
    }
    const tmp = `${file}.exonous-${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify({ ...config, mcpServers: next }, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, file);
    log(`registered biblos → ${file}`);
  }
  return { ok: true, changed };
}

module.exports = { ensureBiblos };

if (require.main === module) {
  ensureBiblos({ dryRun: process.argv.includes('--dry-run') });
}
