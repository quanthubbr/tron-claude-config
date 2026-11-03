'use strict';

// Codex CLI: nomos and praxis inlined in AGENTS.md, PreToolUse/SessionStart in hooks.json, MCP tables in a config.toml marker block.
const fs = require('fs');
const path = require('path');
const paths = require('../lib/paths');
const { mergeOwned, stripOwned } = require('../lib/settings');
const { upsertMcpServers } = require('../lib/writers/toml-block');
const { renderAlwaysOn } = require('../lib/render-rules');
const { OWNED_MARKER, hookCommand } = require('../lib/runtime');
const { skillRows } = require('../lib/skill-map');
const { onPath, readJson, claudeMcp, mcpRow, MCP_KEYS } = require('./shared');
const trust = require('./codex-trust');

const TOOL = 'codex';
const dir = () => path.join(paths.home(), '.codex');
const hooksFile = () => path.join(dir(), 'hooks.json');
// AGENTS.md loads even when Codex skips unapproved hooks, so it carries the warning the hooks cannot.
const HOOKS_FALLBACK = `
## exonous hooks (Codex)
Each prompt should carry the hook line "exonous rules in force (nomos + praxis)". If it is missing (and the user has not turned that reminder off), tell the user once that the exonous hooks are not approved in this Codex profile, so the commit/push/PR gate is off: run \`/hooks\`, approve them, and check with \`exonous doctor\`.
`;

function detect() {
  return fs.existsSync(dir()) || onPath('codex');
}

const mcpTables = (log) => Object.fromEntries(Object.entries(claudeMcp({ log }))
  .map(([key, e]) => [key, e.command ? { command: e.command, args: e.args } : { url: e.url }]));

function install({ home, dryRun, log, execPath }) {
  const opts = { tool: TOOL };
  home.section(path.join(dir(), 'AGENTS.md'), `${renderAlwaysOn('full')}${HOOKS_FALLBACK}`, opts);
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
  if (!dryRun) reportApprovals(log);
  const tables = mcpTables(log);
  if (Object.keys(tables).length) {
    const writer = (file) => upsertMcpServers(file, tables, { dryRun, log, owned: MCP_KEYS });
    home.section(path.join(dir(), 'config.toml'), '', { style: 'hash', tool: TOOL, owned: MCP_KEYS, writer });
  }
}

/** Codex skips a new or changed hook until the user approves it in /hooks; say where that is still needed. */
function reportApprovals(log) {
  const all = trust.approvals(dir());
  if (!all.length) return;
  const pending = all.filter((p) => p.hooks.some((h) => h.verdict !== 'approved'));
  if (!pending.length) {
    log(`codex: exonous hooks approved in every Codex profile (${all.map(trust.profileLabel).join(', ')})`);
    return;
  }
  const where = pending.map((p) => `${trust.profileLabel(p)} (${trust.launch(p)})`).join(', ');
  log(`⚠ codex: hooks NOT approved — Codex skips them until you open /hooks and approve them in: ${where}. Approving in plain \`codex\` covers every profile without entries of its own; exonous never approves them for you`);
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
    ...trust.approvalRows(dir()),
    row('self-update hook (kairos)', hooks.includes('kairos.cjs') && hooks.includes('--adapter codex')),
    row('memory hooks (anamnesis)', hooks.includes('anamnesis.cjs') && hooks.includes('--adapter codex')),
    row('nomos rule (AGENTS.md)', agents.includes('exonous:start')),
    row('praxis rule (AGENTS.md)', agents.includes('# Praxis')),
    row('rule reminder (ethos)', hooks.includes('ethos.cjs') && hooks.includes('--adapter codex')),
    ...skillRows(TOOL),
    mcpRow('Codex CLI', ['atlas', 'biblos'].filter((k) => new RegExp(`^\\[mcp_servers\\.${k}\\]`, 'm').test(readText(path.join(dir(), 'config.toml'))))),
  ];
}

/** Matrix note: the profiles where the registered gate would not run. */
function gateNote() {
  const off = trust.pendingProfiles(dir()).filter((p) => p.hooks.some((h) => h.script === 'pyle' && h.verdict !== 'approved'));
  return off.length ? `unapproved in /hooks: ${off.map((p) => p.name || 'base').join(', ')}` : null;
}

module.exports = { id: TOOL, tier: 1, gate: 'hard', detect, install, uninstall, doctor, registeredCommand, selftestPayload, gateNote };
