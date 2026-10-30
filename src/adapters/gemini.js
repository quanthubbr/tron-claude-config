'use strict';

// Gemini CLI: GEMINI.md imports nomos and praxis, BeforeTool gate, SessionStart kairos, anamnesis memory hooks and MCP in settings.json, .toml commands.
const fs = require('fs');
const path = require('path');
const paths = require('../lib/paths');
const { mergeOwned, stripOwned } = require('../lib/settings');
const { toTomlCommand } = require('../lib/convert/toml-command');
const { ASSETS, OWNED_MARKER, COMMANDS, hookCommand } = require('../lib/runtime');
const { onPath, readJson, claudeMcp, mergeMcp, removeMcp, mcpRow } = require('./shared');

const TOOL = 'gemini';
const dir = () => path.join(paths.home(), '.gemini');
const settingsFile = () => path.join(dir(), 'settings.json');
const RULES = ['nomos.md', 'praxis.md'];
const rulesFile = (name = 'nomos.md') => path.join(paths.exoDir(), 'rules', name);

function detect() {
  return fs.existsSync(dir()) || onPath('gemini');
}

// Gemini resolves `@<path>` imports, absolute paths included; a path with whitespace would not parse, so it is inlined.
function rulesSection() {
  return RULES.map((name) => {
    const file = rulesFile(name);
    return /\s/.test(file) ? fs.readFileSync(path.join(ASSETS, 'rules', name), 'utf8') : `@${file}`;
  }).join('\n');
}

const mcpEntries = (log) => Object.fromEntries(Object.entries(claudeMcp({ log }))
  .map(([key, e]) => [key, e.command ? { command: e.command, args: e.args } : { httpUrl: e.url }]));

function install({ home, dryRun, log, execPath, rewriteJsonc = false }) {
  const opts = { tool: TOOL };
  home.section(path.join(dir(), 'GEMINI.md'), rulesSection(), opts);
  const memory = (event) => hookCommand(execPath, 'anamnesis.cjs', `--event ${event} --adapter gemini`);
  const entries = {
    BeforeTool: [{ matcher: 'run_shell_command', hooks: [{ type: 'command', command: hookCommand(execPath, 'pyle.cjs', 'auto --adapter gemini') }] }],
    SessionStart: [
      { hooks: [{ type: 'command', command: hookCommand(execPath, 'kairos.cjs', '--adapter gemini') }] },
      { hooks: [{ type: 'command', command: memory('start') }] },
    ],
    BeforeAgent: [
      { hooks: [{ type: 'command', command: memory('prompt') }] },
      { hooks: [{ type: 'command', command: hookCommand(execPath, 'ethos.cjs', '--adapter gemini') }] },
    ],
    AfterTool: [{ hooks: [{ type: 'command', command: memory('tool') }] }],
    AfterAgent: [{ hooks: [{ type: 'command', command: memory('stop') }] }],
    SessionEnd: [{ hooks: [{ type: 'command', command: memory('end') }] }],
  };
  const hooks = mergeOwned(settingsFile(), { format: 'gemini', entries, ownedMarker: OWNED_MARKER, dryRun, log, jsonc: rewriteJsonc });
  if (hooks.status !== 'invalid') mergeMcp(settingsFile(), { tool: TOOL, key: 'mcpServers', entries: mcpEntries(log), dryRun, log, jsonc: rewriteJsonc });
  for (const name of COMMANDS) {
    const skill = fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8');
    home.write(path.join(dir(), 'commands', `${name}.toml`), toTomlCommand(skill), opts);
  }
}

function uninstall({ dryRun, log }) {
  stripOwned(settingsFile(), { format: 'gemini', ownedMarker: OWNED_MARKER, dryRun, log });
  removeMcp(settingsFile(), { tool: TOOL, key: 'mcpServers', dryRun, log });
}

function registeredCommand() {
  const entry = ((readJson(settingsFile())?.hooks || {}).BeforeTool || [])
    .find((e) => e && e.matcher === 'run_shell_command' && JSON.stringify(e).includes('pyle.cjs'));
  return entry?.hooks?.[0]?.command || null;
}

const selftestPayload = (command, cwd) => ({ hook_event_name: 'BeforeTool', tool_name: 'run_shell_command', tool_input: { command }, cwd });

function doctor() {
  const hooks = JSON.stringify(readJson(settingsFile())?.hooks || {});
  let md = '';
  try {
    md = fs.readFileSync(path.join(dir(), 'GEMINI.md'), 'utf8');
  } catch {
    // reported below
  }
  const row = (name, ok) => ({ name: `Gemini CLI: ${name}`, ok, status: '', fix: 'exonous install' });
  return [
    row('gate hook (commit, push, pr)', hooks.includes('pyle.cjs') && hooks.includes('--adapter gemini')),
    row('self-update hook (kairos)', hooks.includes('kairos.cjs') && hooks.includes('--adapter gemini')),
    row('memory hooks (anamnesis)', hooks.includes('anamnesis.cjs') && hooks.includes('--adapter gemini')),
    row('nomos rule (GEMINI.md)', md.includes('exonous:start') && fs.existsSync(rulesFile())),
    row('praxis rule (GEMINI.md)', md.includes('exonous:start') && fs.existsSync(rulesFile('praxis.md'))),
    row('rule reminder (ethos)', hooks.includes('ethos.cjs') && hooks.includes('--adapter gemini')),
    row('commands', COMMANDS.every((c) => fs.existsSync(path.join(dir(), 'commands', `${c}.toml`)))),
    mcpRow('Gemini CLI', Object.keys(readJson(settingsFile())?.mcpServers || {})),
  ];
}

module.exports = { id: TOOL, tier: 1, gate: 'hard', detect, install, uninstall, doctor, registeredCommand, selftestPayload };
