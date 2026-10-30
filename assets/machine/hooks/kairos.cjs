#!/usr/bin/env node
'use strict';

// kairos — session hook: prints the last update note (one line) and starts a detached daily update. Always exits 0.
const { spawn } = require('child_process');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1] || null;
}

// Tools that fire kairos where stdout reaches nobody (every prompt, a detached plugin spawn) only trigger the check.
const SILENT = ['windsurf', 'opencode'];
const FORMATS = {
  cursor: (note) => JSON.stringify({ additional_context: note }),
  gemini: (note) => JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: note } }),
  copilot: (note) => JSON.stringify({ additionalContext: note }),
};

function startUpdate(selfupdate, adapter) {
  if (selfupdate.optedOut() || !selfupdate.due()) return;
  selfupdate.markChecked();
  spawn(process.execPath, [__filename, '--run', '--adapter', adapter], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

function main() {
  const selfupdate = require('./lib/selfupdate.cjs');
  if (selfupdate.notOwner()) return;
  const adapter = (arg('--adapter') || 'claude').replace(/[^\w-]/g, '');
  if (process.argv.includes('--run')) {
    selfupdate.run({ background: true });
    return;
  }
  if (!SILENT.includes(adapter)) {
    const note = selfupdate.takeNote();
    if (note) process.stdout.write(`${FORMATS[adapter] ? FORMATS[adapter](note) : note}\n`);
  }
  startUpdate(selfupdate, adapter);
}

try {
  main();
} catch {
  // a session must start even when the hook breaks
}
process.exit(0);
