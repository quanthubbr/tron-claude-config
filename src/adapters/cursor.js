'use strict';

// Cursor: nomos.mdc, skills for the commit/PR flow, design stack links, and the gate in ~/.cursor/hooks.json.
const fs = require('fs');
const path = require('path');
const paths = require('../lib/paths');
const { onPath, readJson, mcpRow, installDesignLinks } = require('./shared');
const { mergeOwned, stripOwned } = require('../lib/settings');
const { ASSETS, OWNED_MARKER, COMMANDS, DESIGN_SKILLS, hookCommand, uiDesignBin } = require('../lib/runtime');

const TOOL = 'cursor';
const hooksFile = () => path.join(paths.cursorDir(), 'hooks.json');

function detect() {
  return fs.existsSync(paths.cursorDir()) || onPath('cursor');
}

// Cursor skills need a `name:`; the shared SKILL.md files only carry it when the folder name differs.
function withName(content, name) {
  if (!content.startsWith('---\n')) return `---\nname: ${name}\n---\n\n${content}`;
  const end = content.indexOf('\n---', 4);
  return /^name:/m.test(content.slice(0, end)) ? content : `---\nname: ${name}\n${content.slice(4)}`;
}

function nomosRule() {
  const rule = fs.readFileSync(path.join(ASSETS, 'rules', 'nomos.md'), 'utf8');
  return `---\ndescription: Exonous nomos — core rules and agent roster (enforced)\nalwaysApply: true\n---\n\n${rule}`;
}

function uiDesignEntries() {
  const template = fs.readFileSync(path.join(ASSETS, 'editors', 'hooks', 'cursor', 'hooks.json'), 'utf8').replaceAll('__UI_DESIGN_BIN__', uiDesignBin());
  return JSON.parse(template).hooks;
}

function install({ home, dryRun, log, execPath }) {
  const opts = { tool: TOOL };
  home.write(path.join(paths.cursorDir(), 'rules', 'nomos.mdc'), nomosRule(), opts);
  home.sync(path.join(ASSETS, 'editors', 'cursor', 'frontend-skills.mdc'), path.join(paths.cursorDir(), 'rules', 'frontend-skills.mdc'), opts);
  for (const name of COMMANDS) {
    const content = fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8');
    home.write(path.join(paths.cursorDir(), 'skills', name, 'SKILL.md'), withName(content, name), opts);
  }
  installDesignLinks(home, paths.cursorDir(), { dryRun });
  const gate = {
    beforeShellExecution: [{ command: hookCommand(execPath, 'pyle.cjs', 'auto --adapter cursor') }],
    sessionStart: [{ command: hookCommand(execPath, 'kairos.cjs', '--adapter cursor') }],
  };
  mergeOwned(hooksFile(), { format: 'cursor', entries: gate, ownedMarker: OWNED_MARKER, dryRun, log });
  mergeOwned(hooksFile(), { format: 'cursor', entries: uiDesignEntries(), ownedMarker: '/.agents/skills/ui-design/scripts/', dryRun, log });
}

function uninstall({ dryRun, log }) {
  for (const marker of [OWNED_MARKER, '/.agents/skills/ui-design/scripts/']) stripOwned(hooksFile(), { format: 'cursor', ownedMarker: marker, dryRun, log });
}

function registeredCommand() {
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(hooksFile(), 'utf8'));
  } catch {
    return null;
  }
  const entry = ((config.hooks || {}).beforeShellExecution || []).find((e) => e && typeof e.command === 'string' && e.command.includes('pyle.cjs'));
  return entry ? entry.command : null;
}

const selftestPayload = (command, cwd) => ({ hook_event_name: 'beforeShellExecution', command, cwd });

const USER_RULES = 'Cursor reads User Rules only from its settings: paste ~/.claude/exonous/rules/nomos.md into Cursor Settings → Rules → User Rules (manual, once per release)';

function doctor() {
  let hooks = '';
  try {
    hooks = fs.readFileSync(hooksFile(), 'utf8');
  } catch {
    // missing file: reported below
  }
  const row = (name, ok, status = '') => ({ name: `Cursor: ${name}`, ok, status, fix: 'exonous install' });
  return [
    row('gate hook (commit, push, pr)', hooks.includes('pyle.cjs') && hooks.includes('auto --adapter cursor')),
    row('self-update hook (kairos)', hooks.includes('kairos.cjs') && hooks.includes('--adapter cursor')),
    row('nomos.mdc rule', fs.existsSync(path.join(paths.cursorDir(), 'rules', 'nomos.mdc'))),
    row('skills', COMMANDS.every((c) => fs.existsSync(path.join(paths.cursorDir(), 'skills', c, 'SKILL.md')))),
    mcpRow('Cursor', Object.keys(readJson(path.join(paths.cursorDir(), 'mcp.json'))?.mcpServers || {})),
    { name: 'Cursor: User Rules', ok: false, level: 'warn', status: 'cannot verify — Cursor keeps User Rules in its own settings', fix: USER_RULES },
  ];
}

module.exports = { id: TOOL, tier: 1, gate: 'hard', detect, install, uninstall, doctor, registeredCommand, selftestPayload };
