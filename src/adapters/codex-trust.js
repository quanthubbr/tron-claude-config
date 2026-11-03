'use strict';

// Read-only: Codex runs a hook only when [hooks.state."<file>:<event>:<group>:<handler>"] trusted_hash equals hook_hash
// (codex-rs/hooks/src/engine/discovery.rs). exonous never writes trusted_hash; approving stays with the user in /hooks.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { OWNED_MARKER } = require('../lib/runtime');

// Codex drops the matcher for these events before hashing (codex-rs/hooks/src/events/common.rs, matcher_pattern_for_event).
const NO_MATCHER = new Set(['UserPromptSubmit', 'Stop', 'Interrupt', 'PreModelRequest', 'PostModelRequest']);
const SHORT_TIMEOUT = new Set(['SessionEnd', 'Interrupt']);
const CONTEXT_EVENTS = new Set(['PreToolUse', 'PostToolUse', 'SessionStart', 'UserPromptSubmit', 'SubagentStart']);
const DEFAULT_CONTEXT_LIMIT = 2500;
const GATE_SCRIPT = 'pyle';

const snake = (event) => event.replace(/(?<=[a-z0-9])(?=[A-Z])/g, '_').toLowerCase();
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
const slashes = (text) => text.replace(/\\/g, '/');

function timeoutFor(event, timeout) {
  if (SHORT_TIMEOUT.has(event)) return Math.min(Math.max(timeout ?? 1, 1), 3);
  return Math.max(timeout ?? 600, 1);
}

/** sha256 of the declaration Codex trusts: event, matcher and the normalized handler (command included), never its position. */
function hookHash(event, matcher, handler, platform = process.platform) {
  const command = platform === 'win32' && typeof handler.commandWindows === 'string' ? handler.commandWindows : handler.command;
  const normalized = { type: 'command', command, timeout: timeoutFor(event, handler.timeout), async: Boolean(handler.async) };
  if (typeof handler.statusMessage === 'string') normalized.statusMessage = handler.statusMessage;
  const limit = handler.additionalContextLimit;
  if (CONTEXT_EVENTS.has(event) && Number.isInteger(limit) && limit !== DEFAULT_CONTEXT_LIMIT) normalized.additionalContextLimit = limit;
  const identity = { event_name: snake(event), hooks: [normalized] };
  if (!NO_MATCHER.has(event) && typeof matcher === 'string') identity.matcher = matcher;
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(sortKeys(identity))).digest('hex')}`;
}

/**
 * The exonous command hooks in a parsed hooks.json, with the state key and hash Codex uses for each.
 * @returns {{ key: string, event: string, script: string, hash: string }[]}
 */
function exonousHooks(config, hooksFile, platform = process.platform) {
  const events = config && typeof config.hooks === 'object' && config.hooks ? config.hooks : {};
  const out = [];
  for (const [event, groups] of Object.entries(events)) {
    if (!Array.isArray(groups)) continue;
    groups.forEach((group, gi) => (Array.isArray(group?.hooks) ? group.hooks : []).forEach((handler, hi) => {
      if (handler?.type !== 'command' || typeof handler.command !== 'string' || !slashes(handler.command).includes(OWNED_MARKER)) return;
      const script = (/([\w-]+)\.cjs/.exec(handler.command) || [])[1] || 'hook';
      out.push({ key: `${hooksFile}:${snake(event)}:${gi}:${hi}`, event, script, hash: hookHash(event, group.matcher, handler, platform) });
    }));
  }
  return out;
}

function tomlString(raw) {
  if (raw.startsWith("'")) return raw.slice(1, -1);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const STRING = String.raw`"(?:[^"\\]|\\.)*"|'[^']*'`;
const KEY = String.raw`${STRING}|[A-Za-z0-9_-]+`;
const STATE_TABLE = new RegExp(String.raw`^\[\s*hooks\s*\.\s*state\s*\.\s*(${KEY})\s*\]$`);
const STATE_ROOT = /^\[\s*hooks\s*\.\s*state\s*\]$/;
const FIELD = new RegExp(String.raw`(trusted_hash|enabled)\s*=\s*(${STRING}|true|false)`, 'g');
const INLINE = new RegExp(String.raw`^(${KEY})\s*=\s*\{(.*)\}$`);

const keyOf = (raw) => (/^["']/.test(raw) ? tomlString(raw) : raw);

function fields(text) {
  const state = {};
  for (const [, name, value] of text.matchAll(FIELD)) {
    if (name === 'enabled') state.enabled = value === 'true';
    else state.trusted_hash = tomlString(value);
  }
  return state;
}

/**
 * [hooks.state.*] entries from a Codex config TOML, both as tables and inline under [hooks.state]. Read-only.
 * @returns {Map<string, { trusted_hash?: string, enabled?: boolean }>}
 */
function parseHookStates(text) {
  const states = new Map();
  let key = null;
  let inRoot = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[')) {
      const table = STATE_TABLE.exec(line);
      key = table ? keyOf(table[1]) : null;
      inRoot = STATE_ROOT.test(line);
      if (key) states.set(key, { ...states.get(key) });
      continue;
    }
    if (key) {
      Object.assign(states.get(key), fields(line));
    } else if (inRoot) {
      const inline = INLINE.exec(line);
      const name = inline && keyOf(inline[1]);
      if (name) states.set(name, { ...states.get(name), ...fields(inline[2]) });
    }
  }
  return states;
}

/** Later layers win field by field, as in codex-rs/hooks/src/config_rules.rs (hook_states_from_stack). */
function mergeStates(base, profile) {
  const merged = new Map([...base].map(([k, v]) => [k, { ...v }]));
  for (const [k, v] of profile) merged.set(k, { ...merged.get(k), ...v });
  return merged;
}

/** @returns {'approved'|'new'|'changed'|'disabled'} */
function hookVerdict(hook, states) {
  const state = states.get(hook.key);
  if (state?.enabled === false) return 'disabled';
  if (!state?.trusted_hash) return 'new';
  return state.trusted_hash === hook.hash ? 'approved' : 'changed';
}

/** Base config.toml plus every <name>.config.toml profile Codex layers over it. */
function profileFiles(dir) {
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((f) => /^[^.].*\.config\.toml$/.test(f)).sort();
  } catch {
    // no ~/.codex: base only
  }
  return [{ name: null, file: path.join(dir, 'config.toml') }, ...names.map((f) => ({ name: f.slice(0, -'.config.toml'.length), file: path.join(dir, f) }))];
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Per profile, the verdict of each exonous hook. `own` says the profile file carries entries for those hooks itself.
 * @returns {{ name: string|null, file: string, own: boolean, hooks: { script: string, key: string, verdict: string }[] }[]}
 */
function approvals(dir, { platform = process.platform } = {}) {
  const hooksFile = path.join(dir, 'hooks.json');
  let config = null;
  try {
    config = JSON.parse(readText(hooksFile));
  } catch {
    return [];
  }
  const hooks = exonousHooks(config, hooksFile, platform);
  if (!hooks.length) return [];
  const [base, ...profiles] = profileFiles(dir);
  const baseStates = parseHookStates(readText(base.file));
  return [{ ...base, states: baseStates, own: true }, ...profiles.map((p) => {
    const own = parseHookStates(readText(p.file));
    return { ...p, states: mergeStates(baseStates, own), own: hooks.some((h) => own.has(h.key)) };
  })].map(({ states, ...p }) => ({ ...p, hooks: hooks.map((h) => ({ script: h.script, key: h.key, verdict: hookVerdict(h, states) })) }));
}

const isApproved = (profile) => profile.hooks.every((h) => h.verdict === 'approved');
const profileLabel = (p) => (p.name === null ? 'base config.toml' : `profile ${p.name}`);
const launch = (p) => (p.name === null ? '`codex`' : `\`codex -p ${p.name}\``);

function describe(p) {
  const bad = p.hooks.filter((h) => h.verdict !== 'approved');
  if (!bad.length) return `${p.hooks.length}/${p.hooks.length} exonous hooks approved, hashes match hooks.json`;
  const gateOff = bad.some((h) => h.script === GATE_SCRIPT) ? 'commit/push/PR gate OFF — ' : '';
  const verdicts = new Set(bad.map((h) => h.verdict));
  if (bad.length === p.hooks.length && verdicts.size === 1) return `${gateOff}none of the ${bad.length} exonous hooks approved (all ${bad[0].verdict})`;
  return `${gateOff}${bad.map((h) => `✗ ${h.script} ${h.verdict} (${h.key.split(':').slice(-3).join(':')})`).join(', ')}`;
}

function fixFor(p) {
  const action = 'open /hooks and approve the exonous hooks (exonous never approves them for you)';
  if (p.name === null) return `run ${launch(p)}, ${action}; that approval also covers every profile without entries of its own`;
  if (p.own) return `run ${launch(p)}, ${action} — this profile's own [hooks.state] entries override the base config.toml`;
  return `run \`codex\` (covers every profile) or ${launch(p)}, then ${action}`;
}

/** One doctor row per Codex profile. */
function approvalRows(dir, opts) {
  return approvals(dir, opts).map((p) => ({
    name: `Codex CLI: hooks approved in /hooks (${profileLabel(p)})`,
    ok: isApproved(p),
    status: describe(p),
    fix: fixFor(p),
  }));
}

/** Profiles where exonous hooks would not run, for install/update output and the doctor matrix. */
function pendingProfiles(dir, opts) {
  return approvals(dir, opts).filter((p) => !isApproved(p));
}

module.exports = { hookHash, exonousHooks, parseHookStates, mergeStates, hookVerdict, profileFiles, approvals, approvalRows, pendingProfiles, profileLabel, launch };
