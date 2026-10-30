'use strict';

// Installs the 12 exo-* agents and enforces them as the only roster (Claude Code + Cursor).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const paths = require('./paths');
const { shellQuote } = require('./runtime');

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(PACKAGE_ROOT, 'assets', 'agents');
const GUARD = 'taxis.js';

// Cursor resolves models itself; Claude-only fields would pin a model Cursor may not offer.
function toCursorAgent(content) {
  return content.replace(/^model: .*$/m, 'model: inherit');
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw new Error(`${file} is not valid JSON — fix it before reinstalling (${err.message})`);
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.exonous-${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

function withoutGuard(entries = []) {
  return entries.filter((entry) => !JSON.stringify(entry).includes(GUARD));
}

function registerClaudeHooks(settingsPath, command) {
  const settings = readJson(settingsPath, {});
  const hooks = settings.hooks || {};
  hooks.PreToolUse = [...withoutGuard(hooks.PreToolUse), { matcher: 'Task|Agent', hooks: [{ type: 'command', command }] }];
  hooks.SessionStart = [...withoutGuard(hooks.SessionStart), { hooks: [{ type: 'command', command }] }];
  settings.hooks = hooks;
  writeJson(settingsPath, settings);
}

function registerCursorHooks(hooksPath, command) {
  const config = readJson(hooksPath, { version: 1, hooks: {} });
  const hooks = config.hooks || {};
  hooks.preToolUse = [...withoutGuard(hooks.preToolUse), { command, matcher: 'Task' }];
  hooks.subagentStart = [...withoutGuard(hooks.subagentStart), { command }];
  hooks.sessionStart = [...withoutGuard(hooks.sessionStart), { command }];
  config.version = config.version || 1;
  config.hooks = hooks;
  writeJson(hooksPath, config);
}

function installAgents({ dryRun = false, log = () => {}, hasCursor, execPath = process.execPath } = {}) {
  const home = paths.home();
  const stateDir = path.join(home, '.claude', 'exonous');
  const guardPath = path.join(stateDir, GUARD);
  const agentFiles = fs.readdirSync(SRC).filter((f) => /^exo-.+\.md$/.test(f));
  const cursorDir = path.join(home, '.cursor');
  if (hasCursor === undefined) hasCursor = fs.existsSync(cursorDir);

  if (dryRun) {
    log(`DRY: would install ${agentFiles.length} agents and taxis → ~/.claude/exonous/`);
    return;
  }

  fs.mkdirSync(stateDir, { recursive: true });
  fs.copyFileSync(path.join(SRC, GUARD), guardPath);
  fs.copyFileSync(path.join(SRC, 'roster.json'), path.join(stateDir, 'roster.json'));

  // taxis resolves the home from the OS, so it is told which home this install targets.
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  execFileSync(process.execPath, [guardPath, 'claude'], { input: '{"hook_event_name":"SessionStart"}', stdio: ['pipe', 'ignore', 'pipe'], env });

  for (const file of agentFiles) {
    const content = fs.readFileSync(path.join(SRC, file), 'utf8');
    const claudeDir = path.join(home, '.claude', 'agents');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, file), content, 'utf8');
    if (hasCursor) {
      fs.mkdirSync(path.join(cursorDir, 'agents'), { recursive: true });
      fs.writeFileSync(path.join(cursorDir, 'agents', file), toCursorAgent(content), 'utf8');
    }
  }

  registerClaudeHooks(path.join(home, '.claude', 'settings.json'), `${shellQuote(execPath)} ${shellQuote(guardPath)} claude`);
  if (hasCursor) {
    registerCursorHooks(path.join(cursorDir, 'hooks.json'), `${shellQuote(execPath)} ${shellQuote(guardPath)} cursor`);
  }
  log(`agents (${agentFiles.length}) installed and enforced → ~/.claude/agents${hasCursor ? ', ~/.cursor/agents' : ''}`);
}

module.exports = { installAgents };
