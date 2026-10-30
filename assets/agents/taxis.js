#!/usr/bin/env node
// taxis — enforces the 12 exo-* agents in Claude Code and Cursor.
// Usage (hook command): node taxis.js <claude|cursor>
//   PreToolUse (Task/Agent) · Cursor subagentStart → allow roster/builtins, remap legacy names, deny the rest.
//   SessionStart → move stray agent files (other plugins) out of ~/.claude/agents and ~/.cursor/agents
//   into ~/.claude/exonous/agent-roles/, where exo-* agents load them as role briefs.
// Fails open: a guard bug must never block the user's session.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const ROLES_DIR = path.join(HOME, '.claude', 'exonous', 'agent-roles');
const AGENT_DIRS = [path.join(HOME, '.claude', 'agents'), path.join(HOME, '.cursor', 'agents')];
const runtime = process.argv[2] === 'cursor' ? 'cursor' : 'claude';

function loadRoster() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'roster.json'), 'utf8'));
}

function routeByDomain(roster, text) {
  for (const [agent, pattern] of Object.entries(roster.domainHints)) {
    if (new RegExp(pattern, 'i').test(text)) return agent;
  }
  return roster.defaultImplementer;
}

function resolve(roster, requested, prompt) {
  if (!requested) return { action: 'allow' };
  const bare = requested.includes(':') ? requested.split(':').pop() : requested;
  if (roster.agents.includes(bare)) {
    return bare === requested ? { action: 'allow' } : { action: 'remap', target: bare };
  }
  if (roster.builtins[runtime].includes(requested)) return { action: 'allow' };

  for (const [target, names] of Object.entries(roster.legacy)) {
    if (names.includes(bare)) return { action: 'remap', target, legacy: bare };
  }
  if (roster.implementers.includes(bare)) {
    return { action: 'remap', target: routeByDomain(roster, prompt), legacy: bare };
  }
  const lower = bare.toLowerCase();
  for (const [target, pattern] of roster.nameKeywords) {
    if (!new RegExp(pattern).test(lower)) continue;
    const routed = target === roster.defaultImplementer ? routeByDomain(roster, prompt) : target;
    return { action: 'remap', target: routed, legacy: bare };
  }
  return { action: 'deny' };
}

function findBrief(name) {
  let groups;
  try {
    groups = fs.readdirSync(ROLES_DIR, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    return null;
  }
  for (const group of groups) {
    const candidate = path.join(ROLES_DIR, group.name, `${name}.md`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function remapPrompt(prompt, legacy) {
  if (!legacy) return prompt;
  const brief = findBrief(legacy);
  const header = brief
    ? `[taxis] Running the legacy \`${legacy}\` role. Read ${brief} first and follow its contract (inputs, outputs, files written); your exo-* agent guidelines still apply.`
    : `[taxis] Requested as \`${legacy}\`.`;
  return `${header}\n\n${prompt || ''}`;
}

function denyMessage(roster, requested) {
  return `Agent "${requested}" is outside the Exonous roster. Use one of: ${roster.agents.join(', ')}.`;
}

function freeName(dir, file) {
  const base = file.slice(0, -3);
  let candidate = path.join(dir, file);
  for (let n = 1; fs.existsSync(candidate); n += 1) candidate = path.join(dir, `${base}.${n}.md`);
  return candidate;
}

function sweep(roster) {
  let moved = 0;
  for (const dir of AGENT_DIRS) {
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const file of entries) {
      if (!file.endsWith('.md') || roster.agents.includes(file.slice(0, -3))) continue;
      const src = path.join(dir, file);
      if (!fs.lstatSync(src).isFile()) continue;
      const group = file.startsWith('impeccable-') ? 'impeccable' : 'quarantine';
      fs.mkdirSync(path.join(ROLES_DIR, group), { recursive: true });
      fs.copyFileSync(src, group === 'quarantine' ? freeName(path.join(ROLES_DIR, group), file) : path.join(ROLES_DIR, group, file));
      fs.unlinkSync(src);
      moved += 1;
    }
  }
  return moved;
}

function emit(obj) {
  if (obj) process.stdout.write(JSON.stringify(obj));
  process.exit(0);
}

// Model governance: in Claude Code a per-call `model` override must match the agent's tier.
// Cursor model slugs are user-selected, so its calls keep their model.
function governModel(roster, input) {
  const tier = roster.tiers[input.subagent_type];
  if (runtime !== 'claude' || !tier || !input.model || input.model === tier) return input;
  return { ...input, model: tier };
}

function handleSpawn(roster, toolInput) {
  const requested = toolInput.subagent_type;
  const decision = resolve(roster, requested, toolInput.prompt || '');

  if (decision.action === 'allow') {
    const governed = governModel(roster, toolInput);
    if (governed !== toolInput) {
      emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: `taxis: ${requested} runs on ${governed.model}`, updatedInput: governed } });
    }
    emit(runtime === 'cursor' ? { permission: 'allow' } : null);
  }

  if (decision.action === 'remap') {
    const updated = governModel(roster, { ...toolInput, subagent_type: decision.target, prompt: remapPrompt(toolInput.prompt, decision.legacy) });
    const reason = `taxis: ${requested} → ${decision.target}`;
    emit(runtime === 'cursor'
      ? { permission: 'allow', updated_input: updated }
      : { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: reason, updatedInput: updated } });
  }

  const message = denyMessage(roster, requested);
  emit(runtime === 'cursor'
    ? { permission: 'deny', user_message: message, agent_message: message }
    : { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: message } });
}

function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    emit(runtime === 'cursor' ? { permission: 'allow' } : null);
  }
  // Cursor also runs ~/.claude/settings.json hooks; the native ~/.cursor/hooks.json entry does the work there.
  if (runtime === 'claude' && input.cursor_version) emit({});

  const roster = loadRoster();
  const event = String(input.hook_event_name || '').toLowerCase();

  if (event === 'sessionstart') {
    sweep(roster);
    emit(runtime === 'cursor' ? {} : null);
  }

  if (event === 'subagentstart') {
    const decision = resolve(roster, input.subagent_type, input.task || '');
    if (decision.action === 'allow') emit({ permission: 'allow' });
    const message = decision.action === 'remap'
      ? `Agent "${input.subagent_type}" is folded into ${decision.target}; spawn ${decision.target} instead.`
      : denyMessage(roster, input.subagent_type);
    emit({ permission: 'deny', user_message: message });
  }

  if (event === 'pretooluse' && ['Task', 'Agent'].includes(input.tool_name)) {
    handleSpawn(roster, input.tool_input || {});
  }

  emit(runtime === 'cursor' ? { permission: 'allow' } : null);
}

try {
  main();
} catch (err) {
  process.stderr.write(`[taxis] guard error (failing open): ${err.message}\n`);
  emit(runtime === 'cursor' ? { permission: 'allow' } : null);
}
