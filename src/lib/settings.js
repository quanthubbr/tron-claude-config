'use strict';

const fs = require('fs');
const { writeAtomic } = require('./writers/markers');

const SKELETONS = {
  claude: () => ({}),
  gemini: () => ({}),
  codex: () => ({}),
  cursor: () => ({ version: 1 }),
  windsurf: () => ({}),
  copilot: () => ({ version: 1 }),
};

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

function skeleton(format) {
  if (!SKELETONS[format]) throw new Error(`unknown settings format: ${format}`);
  return SKELETONS[format]();
}

/** JSONC → JSON text: comments and trailing commas outside strings are dropped. */
function stripJsonc(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 1;
    } else if (c === ',' && /^\s*[}\]]/.test(text.slice(i + 1))) {
      // trailing comma: dropped
    } else {
      out += c;
    }
  }
  return out;
}

/**
 * Reads, mutates a copy and writes atomically; invalid JSON aborts the file untouched unless jsonc allows a rewrite.
 * @param {(config: Record<string, unknown>) => string | null} mutate returns a warning to abort.
 * @returns {{ status: 'written'|'unchanged'|'invalid'|'absent' }}
 */
function edit(file, mutate, { fallback, dryRun = false, log = () => {}, label, jsonc = false }) {
  let raw = null;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  if (raw === null && !fallback) return { status: 'absent' };
  const bom = raw !== null && raw.startsWith('\uFEFF') ? '\uFEFF' : '';
  let config;
  let rewrite = false;
  try {
    config = raw === null ? fallback() : JSON.parse(raw.slice(bom.length));
  } catch {
    if (jsonc) {
      try {
        config = JSON.parse(stripJsonc(raw.slice(bom.length)));
        rewrite = true;
      } catch {
        // not JSONC either: reported below
      }
    }
  }
  if (config === undefined) {
    let reason = '';
    try {
      JSON.parse(raw.slice(bom.length));
    } catch (err) {
      reason = err.message;
    }
    log(`WARN: ${file} is not valid JSON (${reason}) — ${label} not written; file left untouched`);
    return { status: 'invalid' };
  }
  if (!isObject(config)) {
    log(`WARN: ${file} is not a JSON object — ${label} not written; file left untouched`);
    return { status: 'invalid' };
  }
  const before = raw === null || rewrite ? null : JSON.stringify(config);
  const problem = mutate(config);
  if (problem) {
    log(`WARN: ${file} ${problem} — ${label} not written; file left untouched`);
    return { status: 'invalid' };
  }
  if (JSON.stringify(config) === before) return { status: 'unchanged' };
  if (dryRun) {
    log(`DRY: would write ${label} → ${file}`);
    return { status: 'written' };
  }
  if (rewrite) {
    fs.writeFileSync(`${file}.exonous-jsonc.bak`, raw, { encoding: 'utf8', mode: fs.statSync(file).mode & 0o7777 });
    log(`WARN: ${file} had JSONC comments or trailing commas — they were removed; original kept as ${file}.exonous-jsonc.bak`);
  }
  const backup = `${file}.exonous.bak`;
  if (raw !== null && !fs.existsSync(backup)) {
    const mode = fs.statSync(file).mode & 0o7777;
    fs.writeFileSync(backup, raw, { encoding: 'utf8', flag: 'wx', mode });
    fs.chmodSync(backup, mode);
  }
  writeAtomic(file, `${bom}${JSON.stringify(config, null, 2)}\n`);
  return { status: 'written' };
}

// JSON escapes a Windows backslash as two characters; both become one forward slash.
const slashes = (text) => text.replace(/\\\\|\\/g, '/');

function stripHooks(config, ownedMarker) {
  if (config.hooks === undefined) return null;
  const marker = slashes(ownedMarker);
  if (!isObject(config.hooks)) return 'has a "hooks" value that is not an object';
  let emptied = false;
  for (const [event, list] of Object.entries(config.hooks)) {
    if (!Array.isArray(list)) continue;
    const kept = list.filter((entry) => !slashes(JSON.stringify(entry)).includes(marker));
    if (kept.length === list.length) continue;
    if (kept.length) config.hooks[event] = kept;
    else delete config.hooks[event];
    emptied = true;
  }
  if (emptied && !Object.keys(config.hooks).length) delete config.hooks;
  return null;
}

/**
 * Replaces every hook entry whose JSON contains ownedMarker with `entries`; foreign entries keep their order.
 * @param {{ format: keyof SKELETONS, entries: Record<string, unknown[]>, ownedMarker: string, dryRun?: boolean, log?: (msg: string) => void }} options
 */
function mergeOwned(file, { format, entries, ownedMarker, dryRun, log, jsonc }) {
  skeleton(format);
  return edit(file, (config) => {
    const problem = stripHooks(config, ownedMarker);
    if (problem) return problem;
    config.hooks = config.hooks || {};
    for (const [event, list] of Object.entries(entries)) {
      const current = config.hooks[event] === undefined ? [] : config.hooks[event];
      if (!Array.isArray(current)) return `has a hooks.${event} value that is not a list`;
      config.hooks[event] = [...current, ...list];
    }
    return null;
  }, { fallback: () => skeleton(format), dryRun, log, label: 'exonous hooks', jsonc });
}

/** @param {{ format: keyof SKELETONS, ownedMarker: string, dryRun?: boolean, log?: (msg: string) => void }} options */
function stripOwned(file, { format, ownedMarker, dryRun, log, jsonc }) {
  skeleton(format);
  return edit(file, (config) => stripHooks(config, ownedMarker), { dryRun, log, label: 'exonous hooks', jsonc });
}

/**
 * Sets or (with null) deletes entries of a map such as `mcpServers` or `mcp`, owned by key.
 * @param {{ key: string, entries: Record<string, unknown>, dryRun?: boolean, log?: (msg: string) => void }} options
 */
function mergeKey(file, { key, entries, dryRun, log, jsonc }) {
  const adds = Object.values(entries).some((v) => v !== null);
  return edit(file, (config) => {
    if (config[key] === undefined && !adds) return null;
    if (config[key] === undefined) config[key] = {};
    if (!isObject(config[key])) return `has a "${key}" value that is not an object`;
    for (const [name, value] of Object.entries(entries)) {
      if (value === null) delete config[key][name];
      else config[key][name] = value;
    }
    return null;
  }, { fallback: adds ? () => ({}) : null, dryRun, log, label: `exonous ${key} entries`, jsonc });
}

/**
 * Claude `permissions.allow`: drops entries starting with ownedPrefix, then appends `add`; other entries keep their order.
 * @param {{ add: string[], ownedPrefix: string, dryRun?: boolean, log?: (msg: string) => void }} options
 */
function mergeAllow(file, { add, ownedPrefix, dryRun, log }) {
  return edit(file, (config) => {
    if (config.permissions === undefined && !add.length) return null;
    if (config.permissions === undefined) config.permissions = {};
    if (!isObject(config.permissions)) return 'has a "permissions" value that is not an object';
    const current = config.permissions.allow === undefined ? [] : config.permissions.allow;
    if (!Array.isArray(current)) return 'has a "permissions.allow" value that is not a list';
    const kept = current.filter((item) => !(typeof item === 'string' && item.startsWith(ownedPrefix)));
    config.permissions.allow = [...kept, ...add.filter((item) => !kept.includes(item))];
    return null;
  }, { fallback: add.length ? () => ({}) : null, dryRun, log, label: 'exonous permissions' });
}

/**
 * A top-level list of strings (OpenCode `instructions`): drops items containing ownedMarker, then appends `add`.
 * @param {{ key: string, add: string[], ownedMarker: string, dryRun?: boolean, log?: (msg: string) => void }} options
 */
function mergeList(file, { key, add, ownedMarker, dryRun, log, jsonc }) {
  return edit(file, (config) => {
    if (config[key] === undefined && !add.length) return null;
    const current = config[key] === undefined ? [] : config[key];
    if (!Array.isArray(current)) return `has a "${key}" value that is not a list`;
    const kept = current.filter((item) => !(typeof item === 'string' && slashes(item).includes(slashes(ownedMarker))));
    if (!add.length && !kept.length && config[key] !== undefined && current.length) delete config[key];
    else config[key] = [...kept, ...add.filter((item) => !kept.includes(item))];
    return null;
  }, { fallback: add.length ? () => ({}) : null, dryRun, log, label: `exonous ${key}`, jsonc });
}

module.exports = { mergeOwned, stripOwned, mergeKey, mergeAllow, mergeList, stripJsonc, FORMATS: Object.keys(SKELETONS) };
