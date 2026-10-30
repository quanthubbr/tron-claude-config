#!/usr/bin/env node
'use strict';

// anamnesis — automatic session memory hook: --event start|prompt|tool|stop|end --adapter <tool>. Always exits 0.
const EVENTS = ['start', 'prompt', 'tool', 'stop', 'end'];
// Session-start output per tool; windsurf and opencode have no channel back to the model.
const FORMATS = {
  claude: (text) => JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }),
  gemini: (text) => JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }),
  cursor: (text) => JSON.stringify({ additional_context: text }),
  copilot: (text) => JSON.stringify({ additionalContext: text }),
  codex: (text) => text,
};

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1] || null;
}

function readStdin() {
  try {
    return require('fs').readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function logError(err) {
  try {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(require('./lib/paths.cjs').stateDir(), 'anamnesis');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(dir, 'last-error'), `${new Date().toISOString()} ${arg('--event')} ${arg('--adapter')}: ${err && err.stack ? err.stack : err}\n`);
  } catch {
    // nowhere left to report
  }
}

function main() {
  const event = arg('--event');
  const adapter = (arg('--adapter') || 'claude').replace(/[^\w-]/g, '');
  if (!EVENTS.includes(event)) return;
  let input = {};
  try {
    const parsed = JSON.parse(readStdin() || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) input = parsed;
  } catch {
    // unreadable payload: cwd falls back to the process cwd
  }
  const brief = require('./lib/memory.cjs').handle(event, input, { agent: adapter });
  if (brief && FORMATS[adapter]) process.stdout.write(`${FORMATS[adapter](brief)}\n`);
}

try {
  main();
} catch (err) {
  // a session must go on even when memory breaks
  logError(err);
}
process.exit(0);
