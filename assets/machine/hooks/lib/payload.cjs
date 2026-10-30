'use strict';

// Per-tool hook stdin → { command, cwd }, and per-tool deny/allow output. Node builtins only.
const ADAPTERS = ['claude', 'cursor', 'gemini', 'codex', 'windsurf', 'copilot', 'opencode'];
const SAFE_WORD = /^[A-Za-z0-9_/.,:=@%+-]+$/;

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

function shellQuote(word) {
  const text = String(word);
  return SAFE_WORD.test(text) ? text : `'${text.replace(/'/g, `'"'"'`)}'`;
}

function asCommand(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length && value.every((w) => typeof w === 'string')) return value.map(shellQuote).join(' ');
  return null;
}

function toolArgs(input) {
  if (isObject(input.toolArgs)) return input.toolArgs;
  if (typeof input.toolArgs !== 'string') return null;
  try {
    const parsed = JSON.parse(input.toolArgs);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Shapes are tried in order for every adapter, so a tool that changes its payload still gets gated.
function extractCommand(input) {
  const sources = [input.tool_input, input.tool_info && { command: input.tool_info.command_line }, input, input.args, toolArgs(input)];
  for (const source of sources) {
    if (!isObject(source)) continue;
    const command = asCommand(source.command);
    if (command !== null) return command;
  }
  return null;
}

function extractCwd(input) {
  const options = [input.tool_info && input.tool_info.cwd, input.cwd, Array.isArray(input.workspace_roots) ? input.workspace_roots[0] : null];
  return options.find((c) => typeof c === 'string' && c) || process.cwd();
}

/** @returns {{ command: string, cwd: string } | null} null = not a shell call or unreadable: let it through. */
function parse(adapter, raw) {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(input)) return null;
  const command = extractCommand(input);
  return command === null ? null : { command, cwd: extractCwd(input) };
}

/** @returns {{ code: number, stdout: string, stderr: string }} */
function deny(adapter, reason) {
  if (adapter === 'cursor') {
    return { code: 2, stdout: JSON.stringify({ permission: 'deny', user_message: reason, agent_message: reason }), stderr: `${reason}\n` };
  }
  if (adapter === 'copilot') {
    const decision = { permissionDecision: 'deny', permissionDecisionReason: reason };
    return { code: 0, stdout: JSON.stringify({ ...decision, hookSpecificOutput: { hookEventName: 'PreToolUse', ...decision } }), stderr: '' };
  }
  return { code: 2, stdout: '', stderr: `${reason}\n` };
}

/** Warnings reach Claude's model as additionalContext; other tools get them on stderr. */
function allow(adapter, warnings = []) {
  const text = warnings.join('\n');
  if (adapter === 'claude' && text) {
    return { code: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } }), stderr: '' };
  }
  return { code: 0, stdout: adapter === 'cursor' ? JSON.stringify({ permission: 'allow' }) : '', stderr: text ? `${text}\n` : '' };
}

module.exports = { ADAPTERS, parse, deny, allow, shellQuote };
