#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const USAGE = `exonous — the mind outside your head, for coding agents

Usage: exonous <command> [flags]

  setup       install or repair the repo gates and the machine toolkit (runs on npm install)
  update      move to the latest release and re-run setup     --check: report only
  doctor      check every piece and say how to fix what is missing
  uninstall   remove exonous from this repo and this machine   --yes: skip the confirmation

Flags: --dry-run (setup) shows every change without writing anything.`;

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function writeNote(root, text) {
  const dir = path.join(root, '.claude', '.exonous');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'note'), `${text}\n`);
}

function runUpdate() {
  const { update } = require('../src/update');
  const root = process.env.INIT_CWD || process.cwd();
  const background = flag('background');
  let result;
  try {
    result = update({ root, check: flag('check') });
  } catch (err) {
    const message = `exonous update failed: ${err.message} — run \`npx exonous update\` to retry`;
    if (background) writeNote(root, message);
    else console.error(message);
    return 1;
  }
  const messages = {
    absent: 'exonous is not a dependency of this project.',
    pinned: `pinned to "${result.from}" — not updating (remove the #ref to follow releases).`,
    'unknown-source': 'dependency source is not a git URL — update it with your package manager.',
    'no-release': 'no vX.Y.Z release tag found on the remote.',
    current: `up to date (v${result.to}).`,
    available: `update available: v${result.from || '?'} → v${result.to}.`,
    updated: result.from === result.to ? `exonous now follows release v${result.to}.` : `exonous updated v${result.from || '?'} → v${result.to}.`,
    busy: 'another update is running.',
  };
  if (background) {
    if (result.status === 'updated') writeNote(root, messages.updated);
  } else {
    console.log(messages[result.status]);
  }
  return 0;
}

const commands = {
  setup: () => require('../src/setup').setup({ dryRun: flag('dry-run') }),
  update: runUpdate,
  doctor: () => require('../src/doctor').doctor(),
  uninstall: () => require('../src/uninstall').uninstall({ yes: flag('yes') }),
};

const command = process.argv[2];
if (!commands[command]) {
  console.log(USAGE);
  process.exit(command && !['help', '--help', '-h'].includes(command) ? 2 : 0);
}
Promise.resolve(commands[command]())
  .then((code) => process.exit(typeof code === 'number' ? code : 0))
  .catch((err) => {
    console.error(`exonous ${command}: ${err.message}`);
    process.exit(1);
  });
