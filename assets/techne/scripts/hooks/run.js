#!/usr/bin/env node
// techne hook entry: node run.js <hook-id>, Claude Code hook payload on stdin.
// A hook module returns { block: reason } to stop the tool call (exit 2) or nothing to allow it.
'use strict';

const HOOKS = {
  'pre:config-guard': { load: () => require('./config-guard'), phase: 'pre' },
  'pre:bash:no-verify': { load: () => require('./no-verify-guard'), phase: 'pre' },
  'post:edit-tracker': { load: () => require('./edit-tracker'), phase: 'post' },
  'stop:checks': { load: () => require('./stop-checks'), phase: 'stop' },
};

const PROFILES = {
  minimal: new Set(),
  standard: new Set(Object.keys(HOOKS)),
  strict: new Set(Object.keys(HOOKS)),
};

const MAX_INPUT_BYTES = 1024 * 1024;

function enabled(id, env = process.env) {
  const profile = PROFILES[(env.EXONOUS_HOOK_PROFILE || 'standard').trim().toLowerCase()] || PROFILES.standard;
  const disabled = (env.EXONOUS_DISABLED_HOOKS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return profile.has(id) && !disabled.includes(id);
}

function readInput() {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let truncated = false;
    process.stdin.on('data', (chunk) => {
      if (truncated) return;
      size += chunk.length;
      if (size > MAX_INPUT_BYTES) truncated = true;
      else chunks.push(chunk);
    });
    process.stdin.on('end', () => resolve({ raw: truncated ? '' : Buffer.concat(chunks).toString('utf8'), truncated }));
    process.stdin.on('error', () => resolve({ raw: '', truncated: true }));
  });
}

function parse(raw) {
  try {
    const value = raw.trim() ? JSON.parse(raw) : {};
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

async function main() {
  const id = process.argv[2];
  const hook = HOOKS[id];
  if (!hook) {
    process.stderr.write(`[techne] unknown hook id: ${id || '(none)'}\n`);
    return 0;
  }
  const { raw, truncated } = await readInput();
  const payload = parse(raw);

  // Cursor feeds Claude plugin hooks its own payload shape; pre hooks stay neutral there.
  if (hook.phase === 'pre' && payload.cursor_version) {
    process.stdout.write('{}');
    return 0;
  }
  if (!enabled(id)) return 0;

  try {
    const result = hook.load()(payload, { truncated });
    if (result && result.block) {
      process.stderr.write(`[techne] ${result.block}\n`);
      return 2;
    }
  } catch (err) {
    process.stderr.write(`[techne] ${id} failed: ${err && err.message ? err.message : err}\n`);
    // Guards fail closed: an unreadable command is not a safe command.
    if (hook.phase === 'pre') {
      process.stderr.write('[techne] refusing the tool call; set EXONOUS_DISABLED_HOOKS to bypass only if the user asks.\n');
      return 2;
    }
  }
  return 0;
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}

module.exports = { enabled, HOOKS };
