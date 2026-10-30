#!/usr/bin/env node
'use strict';

// Removes the external workflow engine deliver replaced: its files (per its own manifest plus the
// gsd-* namespace), its hooks/statusline/permissions in Claude settings and its Cursor hooks.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const paths = require('../lib/paths');

const RUNTIMES = ['.claude', '.cursor'];
const ROOT_ENTRIES = [
  'gsd-core', 'gsd-file-manifest.json', 'gsd-install-state.json', 'gsd-migration-journal',
  '.gsd-profile', '.gsd-source', '.gsd-staging',
];
const NAMESPACED_DIRS = ['skills', 'hooks', 'agents', 'commands', 'scripts'];
const ENGINE_REF = /[\\/]hooks[\\/]gsd-|gsd-core|gsd-tools/;

function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// Only files still byte-identical to what the engine wrote; anything edited since is kept.
function manifestFiles(configDir) {
  const manifest = path.join(configDir, 'gsd-file-manifest.json');
  if (!fs.existsSync(manifest)) return [];
  let files;
  try {
    files = JSON.parse(fs.readFileSync(manifest, 'utf8')).files || {};
  } catch {
    return [];
  }
  return Object.entries(files)
    .map(([rel, hash]) => [path.join(configDir, rel), hash])
    .filter(([abs, hash]) => isInside(configDir, abs) && fs.existsSync(abs) && fs.statSync(abs).isFile() && sha256(abs) === hash)
    .map(([abs]) => abs);
}

function removeEmptyParents(file, stopAt) {
  let dir = path.dirname(file);
  while (isInside(stopAt, dir) && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
}

function engineTargets(configDir) {
  const targets = new Set(manifestFiles(configDir));
  for (const name of ROOT_ENTRIES) targets.add(path.join(configDir, name));
  for (const dir of NAMESPACED_DIRS) {
    const abs = path.join(configDir, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs)) if (name.startsWith('gsd-') || name === 'gsd') targets.add(path.join(abs, name));
  }
  targets.add(path.join(configDir, 'tron', 'agent-roles', 'gsd'));
  return [...targets].filter((abs) => fs.existsSync(abs));
}

function pruneClaudeHooks(hooks = {}) {
  const changes = [];
  for (const [event, groups] of Object.entries(hooks)) {
    const kept = groups
      .map((group) => ({ ...group, hooks: (group.hooks || []).filter((h) => !ENGINE_REF.test(h.command || '')) }))
      .filter((group) => group.hooks.length > 0);
    const removed = groups.reduce((n, g) => n + (g.hooks || []).length, 0) - kept.reduce((n, g) => n + g.hooks.length, 0);
    if (removed) changes.push(`${event}: ${removed} hook(s)`);
    if (kept.length) hooks[event] = kept;
    else delete hooks[event];
  }
  return changes;
}

function cleanClaudeSettings(settings) {
  const changes = pruneClaudeHooks(settings.hooks).map((c) => `removed ${c}`);
  if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
  if (ENGINE_REF.test(settings.statusLine?.command || '')) {
    delete settings.statusLine;
    changes.push('removed statusLine');
  }
  const allow = settings.permissions?.allow;
  if (Array.isArray(allow)) {
    const kept = allow.filter((rule) => !/gsd-core|gsd-tools|Skill\(gsd-/.test(rule));
    if (kept.length !== allow.length) changes.push(`removed ${allow.length - kept.length} permission(s)`);
    settings.permissions.allow = kept;
  }
  return changes;
}

function cleanCursorHooks(config) {
  const changes = [];
  for (const [event, entries] of Object.entries(config.hooks || {})) {
    const kept = entries.filter((e) => !e['gsd-managed'] && !ENGINE_REF.test(e.command || ''));
    if (kept.length !== entries.length) changes.push(`removed ${event}: ${entries.length - kept.length} hook(s)`);
    if (kept.length) config.hooks[event] = kept;
    else delete config.hooks[event];
  }
  return changes;
}

function editJson(file, mutate, { dryRun, log }) {
  if (!fs.existsSync(file)) return;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    log(`WARN: ${file} is not valid JSON (${err.message}) — workflow engine entries left in place`);
    return;
  }
  const changes = mutate(data);
  if (!changes.length) return;
  const shown = `~/${path.relative(paths.home(), file)}`;
  if (dryRun) {
    for (const change of changes) log(`DRY: would update ${shown}: ${change}`);
    return;
  }
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  for (const change of changes) log(`${shown}: ${change}`);
}

function removeWorkflowEngine({ dryRun = false, log = () => {}, home = paths.home() } = {}) {
  for (const runtime of RUNTIMES) {
    const configDir = path.join(home, runtime);
    if (!fs.existsSync(configDir)) continue;

    const settingsFile = runtime === '.claude' ? 'settings.json' : 'hooks.json';
    editJson(path.join(configDir, settingsFile), runtime === '.claude' ? cleanClaudeSettings : cleanCursorHooks, { dryRun, log });

    const targets = engineTargets(configDir);
    if (!targets.length) continue;
    if (dryRun) {
      log(`DRY: would remove ${targets.length} workflow engine path(s) from ~/${runtime}`);
      continue;
    }
    for (const target of targets) {
      fs.rmSync(target, { recursive: true, force: true });
      removeEmptyParents(target, configDir);
    }
    log(`workflow engine removed from ~/${runtime} (${targets.length} paths) — replaced by /deliver`);
  }
}

module.exports = { removeWorkflowEngine, cleanClaudeSettings, cleanCursorHooks };
