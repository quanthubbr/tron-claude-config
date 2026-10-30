'use strict';

// Adapter registry: every tool is detected once, before anything is written.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const paths = require('../lib/paths');
const { selftestRepo, SELFTEST_DENY } = require('./shared');
const claude = require('./claude');
const cursor = require('./cursor');
const gemini = require('./gemini');
const codex = require('./codex');
const opencode = require('./opencode');
const windsurf = require('./windsurf');
const copilot = require('./copilot');
const cline = require('./cline');
const qwen = require('./qwen');
const kiro = require('./kiro');
const aider = require('./aider');

// Roo is skipped: no verified docs for any of its surfaces.
const ADAPTERS = [claude, cursor, gemini, codex, opencode, windsurf, copilot, cline, qwen, kiro, aider];

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(paths.exoDir(), 'config.json'), 'utf8'));
  } catch {
    return {};
  }
}

function detectAll() {
  return Object.fromEntries(ADAPTERS.map((a) => [a.id, Boolean(a.detect())]));
}

/**
 * @param {{ tools?: string[] | null, all?: boolean, skip?: string[] }} options --tools picks exactly; --all ignores detection.
 * @returns {{ selected: object[], detected: Record<string, boolean> }}
 */
function select({ tools = null, all = false, skip = [] } = {}) {
  const known = new Set(ADAPTERS.map((a) => a.id));
  for (const id of [...(tools || []), ...skip]) if (!known.has(id)) throw new Error(`unknown tool: ${id} (known: ${[...known].join(', ')})`);
  const detected = detectAll();
  const disabled = tools ? [] : readConfig().disabledTools || [];
  const selected = ADAPTERS.filter((a) => {
    if (skip.includes(a.id) || a.gate === 'none') return false;
    if (tools) return tools.includes(a.id);
    return (all || detected[a.id]) && !disabled.includes(a.id);
  });
  return { selected, detected };
}

const SCRIPT_ONLY = 'script self-test (does not prove the tool loads the hook)';

/** First quoted word of a registered hook command: the node binary captured at install. */
function commandNode(command) {
  const m = /^"((?:[^"\\]|\\.)*)"/.exec(command || '');
  return m ? m[1].replace(/\\(.)/g, '$1') : null;
}

/**
 * Pipes a synthetic `git commit` to the registered gate command and expects a deny. Proves the wiring, not that the tool honors it.
 * @returns {{ ok: boolean, detail: string }}
 */
function selftest(adapter) {
  if (adapter.selftest) return adapter.selftest();
  const command = adapter.registeredCommand();
  if (!command) return { ok: false, detail: 'gate hook not registered' };
  const node = commandNode(command);
  if (!node || !fs.existsSync(node)) return { ok: false, detail: `node binary from install is gone (${node || 'unreadable command'}) — rerun exonous install` };
  let repo;
  try {
    repo = selftestRepo();
  } catch (err) {
    return { ok: false, detail: `${SCRIPT_ONLY}: could not create a temp git repo (${err.message})` };
  }
  const input = JSON.stringify(adapter.selftestPayload('git commit -m exonous-selftest', repo));
  const shell = process.platform === 'win32' ? ['cmd.exe', ['/d', '/s', '/c', `"${command}"`]] : ['sh', ['-c', command]];
  const res = spawnSync(shell[0], shell[1], { input, encoding: 'utf8', timeout: 30000, windowsVerbatimArguments: true, cwd: repo });
  fs.rmSync(repo, { recursive: true, force: true });
  const output = `${res.stdout || ''}${res.stderr || ''}`;
  const denied = (res.status === 2 || /"permission(Decision)?":"deny"/.test(res.stdout || '')) && SELFTEST_DENY.test(output);
  return denied
    ? { ok: true, detail: `${SCRIPT_ONLY}: gate denies an unreviewed git commit` }
    : { ok: false, detail: `${SCRIPT_ONLY}: gate did not deny with a review hint (exit ${res.status}${res.error ? `, ${res.error.message}` : ''}${output.trim() ? `: ${output.trim().split('\n')[0].slice(0, 120)}` : ''})` };
}

module.exports = { ADAPTERS, select, detectAll, readConfig, selftest, commandNode, SCRIPT_ONLY };
