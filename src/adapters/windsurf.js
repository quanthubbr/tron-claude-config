'use strict';

// Windsurf (Devin Desktop): writes only into files that already exist, since its config paths are moving.
const fs = require('fs');
const path = require('path');
const paths = require('../lib/paths');
const markers = require('../lib/writers/markers');
const { mergeOwned, stripOwned } = require('../lib/settings');
const { renderRules } = require('../lib/render-rules');
const { OWNED_MARKER, hookCommand } = require('../lib/runtime');
const { readJson, claudeMcp, mergeMcp, removeMcp, mcpRow } = require('./shared');

const TOOL = 'windsurf';
const RULES_CAP = 6000;
const dir = () => path.join(paths.home(), '.codeium', 'windsurf');
const hooksFile = () => path.join(dir(), 'hooks.json');
const rulesFile = () => path.join(dir(), 'memories', 'global_rules.md');
/** Devin Desktop MCP config candidates; XDG/APPDATA are followed only for real-home installs. */
function devinMcpFiles(env = process.env, { platform = process.platform, redirected = paths.redirectedHome(env), home = paths.home() } = {}) {
  const roots = redirected ? [] : [
    env.XDG_CONFIG_HOME && path.isAbsolute(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : null,
    platform === 'win32' && env.APPDATA ? env.APPDATA : null,
  ];
  const files = [...roots.filter(Boolean).map((r) => path.join(r, 'devin', 'mcp_config.json')), path.join(home, '.config', 'devin', 'mcp_config.json')];
  return [...new Set(files)];
}

// Legacy Cascade path and the Devin Desktop ones; every one that exists is used, each owned separately.
const mcpFiles = () => [path.join(dir(), 'mcp_config.json'), ...devinMcpFiles()].map((file) => ({ file, owner: `windsurf:${file}` }));

function detect() {
  return fs.existsSync(dir());
}

const mcpEntries = (log) => Object.fromEntries(Object.entries(claudeMcp({ log }))
  .map(([key, e]) => [key, e.command ? { command: e.command, args: e.args } : { serverUrl: e.url }]));

function installRules(home, problems) {
  const file = rulesFile();
  if (!fs.existsSync(file)) {
    problems.push({ what: 'rules', reason: '~/.codeium/windsurf/memories/global_rules.md does not exist', fix: 'create it (it may be empty) and rerun `exonous install`' });
    return;
  }
  const body = renderRules('min');
  const next = markers.upsert(fs.readFileSync(file, 'utf8'), body, 'html');
  if (next.status !== 'malformed' && next.text.length > RULES_CAP) {
    problems.push({ what: 'rules', reason: `global_rules.md would exceed Windsurf's ${RULES_CAP}-char cap (${next.text.length})`, fix: 'shorten your global rules, then rerun `exonous install`' });
    return;
  }
  home.section(file, body, { tool: TOOL });
}

function install({ home, dryRun, log, execPath }) {
  const problems = [];
  if (fs.existsSync(hooksFile())) {
    const entries = {
      pre_run_command: [{ command: hookCommand(execPath, 'pyle.cjs', 'auto --adapter windsurf'), show_output: true }],
      pre_user_prompt: [{ command: hookCommand(execPath, 'kairos.cjs', '--adapter windsurf') }],
    };
    mergeOwned(hooksFile(), { format: 'windsurf', entries, ownedMarker: OWNED_MARKER, dryRun, log });
  } else {
    problems.push({ what: 'gate', reason: '~/.codeium/windsurf/hooks.json does not exist', fix: 'create ~/.codeium/windsurf/hooks.json (e.g. `{}`) and rerun' });
  }
  installRules(home, problems);
  for (const { file, owner } of mcpFiles()) {
    if (fs.existsSync(file)) mergeMcp(file, { tool: owner, key: 'mcpServers', entries: mcpEntries(log), dryRun, log });
  }
  return { problems };
}

function uninstall({ dryRun, log }) {
  stripOwned(hooksFile(), { format: 'windsurf', ownedMarker: OWNED_MARKER, dryRun, log });
  for (const { file, owner } of mcpFiles()) {
    if (fs.existsSync(file)) removeMcp(file, { tool: owner, key: 'mcpServers', dryRun, log });
  }
}

function registeredCommand() {
  const entry = ((readJson(hooksFile())?.hooks || {}).pre_run_command || []).find((e) => e && typeof e.command === 'string' && e.command.includes('pyle.cjs'));
  return entry ? entry.command : null;
}

const selftestPayload = (command, cwd) => ({ agent_action_name: 'pre_run_command', tool_info: { command_line: command, cwd } });

// Install skips rules on purpose when the file is missing or would pass the cap; doctor matches that with a warning.
function rulesRow(rules) {
  const name = 'Windsurf: nomos min rules (global_rules.md)';
  if (rules.includes('exonous:start')) return { name, ok: true, status: '', fix: 'exonous install' };
  if (!fs.existsSync(rulesFile())) return { name, ok: false, level: 'warn', status: '~/.codeium/windsurf/memories/global_rules.md does not exist', fix: 'create it (it may be empty) and rerun exonous install' };
  const size = markers.upsert(rules, renderRules('min'), 'html').text.length;
  if (size > RULES_CAP) return { name, ok: false, level: 'warn', status: `would exceed Windsurf's ${RULES_CAP}-char cap (${size})`, fix: 'shorten your global rules, then exonous install' };
  return { name, ok: false, status: '', fix: 'exonous install' };
}

function doctor() {
  const hooks = JSON.stringify(readJson(hooksFile())?.hooks || {});
  let rules = '';
  try {
    rules = fs.readFileSync(rulesFile(), 'utf8');
  } catch {
    // reported below
  }
  const row = (name, ok, fix = 'exonous install') => ({ name: `Windsurf: ${name}`, ok, status: '', fix });
  return [
    row('gate hook (pre_run_command)', hooks.includes('pyle.cjs') && hooks.includes('--adapter windsurf'), 'create ~/.codeium/windsurf/hooks.json (e.g. `{}`) and rerun exonous install'),
    row('self-update trigger (pre_user_prompt)', hooks.includes('kairos.cjs')),
    rulesRow(rules),
    mcpRow('Windsurf', mcpFiles().flatMap(({ file }) => Object.keys(readJson(file)?.mcpServers || {}))),
    { name: 'Windsurf: config paths', ok: false, level: 'warn', status: 'paths are moving to Devin Desktop (docs.devin.ai); exonous writes only into files that already exist', fix: 'rerun exonous install after Windsurf updates' },
  ];
}

module.exports = { id: TOOL, tier: 2, tierLabel: 'hard-reduced', gate: 'hard', detect, install, uninstall, doctor, registeredCommand, selftestPayload, devinMcpFiles };
