'use strict';

// Codex CLI: nomos and praxis inlined in AGENTS.md, PreToolUse/SessionStart in hooks.json, MCP tables in a config.toml marker block.
const fs = require('fs');
const path = require('path');
const paths = require('../lib/paths');
const { mergeOwned, stripOwned } = require('../lib/settings');
const { upsertMcpServers } = require('../lib/writers/toml-block');
const { renderAlwaysOn } = require('../lib/render-rules');
const { OWNED_MARKER, hookCommand } = require('../lib/runtime');
const { onPath, readJson, claudeMcp, mcpRow } = require('./shared');

const TOOL = 'codex';
const dir = () => path.join(paths.home(), '.codex');
const hooksFile = () => path.join(dir(), 'hooks.json');
// Codex keeps hook approvals where exonous cannot read them, so the gate stays pending until the user approves it.
const PENDING = 'pending — approve the exonous hook in Codex `/hooks` (exonous cannot read Codex approvals; the self-test checks the script only)';

function detect() {
  return fs.existsSync(dir()) || onPath('codex');
}

const mcpTables = (log) => Object.fromEntries(Object.entries(claudeMcp({ log }))
  .map(([key, e]) => [key, e.command ? { command: e.command, args: e.args } : { url: e.url }]));

function install({ home, dryRun, log, execPath }) {
  const opts = { tool: TOOL };
  home.section(path.join(dir(), 'AGENTS.md'), renderAlwaysOn('full'), opts);
  const memory = (event) => hookCommand(execPath, 'anamnesis.cjs', `--event ${event} --adapter codex`);
  const entries = {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: hookCommand(execPath, 'pyle.cjs', 'auto --adapter codex') }] }],
    SessionStart: [
      { hooks: [{ type: 'command', command: hookCommand(execPath, 'kairos.cjs', '--adapter codex') }] },
      { hooks: [{ type: 'command', command: memory('start') }] },
    ],
    UserPromptSubmit: [
      { hooks: [{ type: 'command', command: memory('prompt') }] },
      { hooks: [{ type: 'command', command: hookCommand(execPath, 'ethos.cjs', '--adapter codex') }] },
    ],
    PostToolUse: [{ hooks: [{ type: 'command', command: memory('tool') }] }],
    Stop: [{ hooks: [{ type: 'command', command: memory('stop') }] }],
    SessionEnd: [{ hooks: [{ type: 'command', command: memory('end') }] }],
  };
  mergeOwned(hooksFile(), { format: 'codex', entries, ownedMarker: OWNED_MARKER, dryRun, log });
  const tables = mcpTables(log);
  if (Object.keys(tables).length) {
    const writer = (file) => upsertMcpServers(file, tables, { dryRun, log });
    home.section(path.join(dir(), 'config.toml'), '', { style: 'hash', tool: TOOL, writer });
  }
}

function uninstall({ dryRun, log }) {
  stripOwned(hooksFile(), { format: 'codex', ownedMarker: OWNED_MARKER, dryRun, log });
}

function registeredCommand() {
  const entry = ((readJson(hooksFile())?.hooks || {}).PreToolUse || [])
    .find((e) => e && e.matcher === 'Bash' && JSON.stringify(e).includes('pyle.cjs'));
  return entry?.hooks?.[0]?.command || null;
}

const selftestPayload = (command, cwd) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd });

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function doctor() {
  let hooks = '';
  let agents = '';
  try {
    hooks = fs.readFileSync(hooksFile(), 'utf8');
    agents = fs.readFileSync(path.join(dir(), 'AGENTS.md'), 'utf8');
  } catch {
    // reported below
  }
  const row = (name, ok, status = '') => ({ name: `Codex CLI: ${name}`, ok, status, fix: 'exonous install' });
  return [
    row('gate hook registered (commit, push, pr)', hooks.includes('pyle.cjs') && hooks.includes('--adapter codex')),
    { name: 'Codex CLI: gate approved in /hooks', ok: false, level: 'warn', status: PENDING, fix: 'open Codex, run /hooks and approve the exonous PreToolUse hook' },
    row('self-update hook (kairos)', hooks.includes('kairos.cjs') && hooks.includes('--adapter codex')),
    row('memory hooks (anamnesis)', hooks.includes('anamnesis.cjs') && hooks.includes('--adapter codex')),
    row('nomos rule (AGENTS.md)', agents.includes('exonous:start')),
    row('praxis rule (AGENTS.md)', agents.includes('# Praxis')),
    row('rule reminder (ethos)', hooks.includes('ethos.cjs') && hooks.includes('--adapter codex')),
    mcpRow('Codex CLI', ['atlas', 'biblos'].filter((k) => new RegExp(`^\\[mcp_servers\\.${k}\\]`, 'm').test(readText(path.join(dir(), 'config.toml'))))),
  ];
}

module.exports = { id: TOOL, tier: 1, gate: 'hard', detect, install, uninstall, doctor, registeredCommand, selftestPayload };
