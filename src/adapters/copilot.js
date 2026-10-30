'use strict';

// GitHub Copilot (Preview hooks): our own ~/.copilot/hooks/exonous.json; rules arrive through ~/.claude, which Copilot reads.
const fs = require('fs');
const path = require('path');
const paths = require('../lib/paths');
const { hookCommand } = require('../lib/runtime');
const { writeAtomic } = require('../lib/writers/markers');
const { readJson } = require('./shared');

const TOOL = 'copilot';

/** Copilot's home: $COPILOT_HOME for real-home installs; a redirected (test) home never follows it out. */
function copilotDir(env = process.env, { redirected = paths.redirectedHome(env), home = paths.home() } = {}) {
  return !redirected && env.COPILOT_HOME && path.isAbsolute(env.COPILOT_HOME) ? env.COPILOT_HOME : path.join(home, '.copilot');
}

const dir = () => copilotDir();
const hookFile = () => path.join(dir(), 'hooks', 'exonous.json');
const insideHome = (file) => !path.relative(paths.home(), file).startsWith('..');

function detect() {
  return fs.existsSync(dir());
}

function hookConfig(execPath) {
  const memory = (event) => hookCommand(execPath, 'anamnesis.cjs', `--event ${event} --adapter copilot`);
  return {
    version: 1,
    hooks: {
      preToolUse: [{ type: 'command', command: hookCommand(execPath, 'pyle.cjs', 'auto --adapter copilot'), timeoutSec: 30 }],
      sessionStart: [
        { type: 'command', command: hookCommand(execPath, 'kairos.cjs', '--adapter copilot'), timeoutSec: 10 },
        { type: 'command', command: memory('start'), timeoutSec: 10 },
      ],
      userPromptSubmitted: [
        { type: 'command', command: memory('prompt'), timeoutSec: 10 },
        { type: 'command', command: hookCommand(execPath, 'ethos.cjs', '--adapter copilot'), timeoutSec: 10 },
      ],
      postToolUse: [{ type: 'command', command: memory('tool'), timeoutSec: 10 }],
      sessionEnd: [{ type: 'command', command: memory('end'), timeoutSec: 10 }],
    },
  };
}

function install({ home, execPath, dryRun, log }) {
  const text = `${JSON.stringify(hookConfig(execPath), null, 2)}\n`;
  if (insideHome(hookFile())) home.write(hookFile(), text, { tool: TOOL });
  else if (dryRun) log(`DRY: would write ${hookFile()}`);
  else writeAtomic(hookFile(), text);
}

// Inside the home the ledger removes the file; a $COPILOT_HOME outside it is cleaned here, only if the file is ours.
function uninstall({ dryRun, log }) {
  const file = hookFile();
  if (insideHome(file) || !registeredCommand()) return;
  if (dryRun) log(`DRY: would remove ${file}`);
  else fs.rmSync(file, { force: true });
}

function registeredCommand() {
  const entry = (readJson(hookFile())?.hooks?.preToolUse || []).find((e) => e && typeof e.command === 'string' && e.command.includes('pyle.cjs'));
  return entry ? entry.command : null;
}

const selftestPayload = (command, cwd) => ({ toolName: 'bash', toolArgs: JSON.stringify({ command }), cwd });

function doctor() {
  const hooks = JSON.stringify(readJson(hookFile())?.hooks || {});
  const env = process.env.COPILOT_HOME;
  const elsewhere = env && path.resolve(env) !== dir();
  return [
    ...(elsewhere ? [{
      name: 'Copilot: COPILOT_HOME', ok: false, level: 'warn',
      status: `COPILOT_HOME=${env} but the hook file is in ${dir()} (EXONOUS_HOME redirects the install)`,
      fix: 'run exonous install without EXONOUS_HOME so the hook lands where Copilot reads it',
    }] : []),
    { name: 'Copilot: gate hook (Preview)', ok: hooks.includes('pyle.cjs'), status: '', fix: 'exonous install' },
    { name: 'Copilot: self-update hook (kairos)', ok: hooks.includes('kairos.cjs'), status: '', fix: 'exonous install' },
    { name: 'Copilot: memory hooks (anamnesis)', ok: hooks.includes('anamnesis.cjs'), status: '', fix: 'exonous install' },
    { name: 'Copilot: rules (nomos + praxis)', ok: ['nomos.md', 'praxis.md'].every((r) => fs.existsSync(path.join(paths.claudeDir(), 'rules', r))), status: 'read from ~/.claude (CLAUDE.md, rules/), nothing written for Copilot', fix: 'install the Claude Code adapter (exonous install --tools claude,copilot)' },
    { name: 'Copilot: rule reminder (ethos)', ok: hooks.includes('ethos.cjs'), status: '', fix: 'exonous install' },
  ];
}

module.exports = { id: TOOL, tier: 2, tierLabel: 'hard-reduced', gate: 'hard', detect, install, uninstall, doctor, registeredCommand, selftestPayload, copilotDir };
