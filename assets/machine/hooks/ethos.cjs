#!/usr/bin/env node
'use strict';

// ethos — restates the always-on rule set on each prompt: --adapter <tool>. Always exits 0.
const REMINDER = 'exonous rules in force (nomos + praxis): terse replies; smallest change that works; locate before reading; test first, fix the cause, prove it; commit or push only when asked.';
// Prompt-submit output per tool; windsurf and opencode have no channel back to the model, so they are not wired.
const FORMATS = {
  claude: (text) => JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text } }),
  gemini: (text) => JSON.stringify({ hookSpecificOutput: { hookEventName: 'BeforeAgent', additionalContext: text } }),
  cursor: (text) => JSON.stringify({ additional_context: text }),
  copilot: (text) => JSON.stringify({ additionalContext: text }),
  codex: (text) => text,
};

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1] || null;
}

function readJson(file) {
  try {
    return JSON.parse(require('fs').readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Opted out with EXONOUS_RULES_REMINDER=0 or config.json `"rulesReminder": false`. */
function disabled(env = process.env) {
  if (env.EXONOUS_RULES_REMINDER === '0') return true;
  const path = require('path');
  const config = readJson(path.join(require('./lib/paths.cjs').exoDir(), 'config.json'));
  return Boolean(config) && typeof config === 'object' && config.rulesReminder === false;
}

function main() {
  if (disabled()) return;
  // hasOwn, or an inherited key (`toString`, `constructor`) would write junk into the model's context.
  const adapter = (arg('--adapter') || 'claude').replace(/[^\w-]/g, '');
  if (Object.hasOwn(FORMATS, adapter)) process.stdout.write(`${FORMATS[adapter](REMINDER)}\n`);
}

try {
  main();
} catch {
  // a prompt must go through even when the reminder cannot be written
}
process.exit(0);
