'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { workflowText } = require('../../src/workflow');
const token = require('../../assets/machine/hooks/lib/token.cjs');
const root = path.resolve(__dirname, '../..');
const binary = path.resolve(process.argv[2] || `target/debug/exonous${process.platform === 'win32' ? '.exe' : ''}`);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'exonous-parity-'));
const home = path.join(temporary, 'home');
const repo = path.join(temporary, 'repo');
fs.mkdirSync(home, { mode: 0o700 });
fs.mkdirSync(repo);
const env = { ...process.env, EXONOUS_HOME: home, HOME: home, USERPROFILE: home, EXONOUS_NO_UPDATE: '1', EXONOUS_RULES_REMINDER: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

function native(args, input) {
  const out = spawnSync(binary, args, { cwd: repo, env, input: input && JSON.stringify(input), encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  return out.stdout;
}

function legacy(file, args, input) {
  const out = spawnSync(process.execPath, [path.join(root, file), ...args], { cwd: repo, env, input: input && JSON.stringify(input), encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  return out.stdout;
}

try {
  execFileSync('git', ['init', '--quiet'], { cwd: repo, env });
  fs.writeFileSync(path.join(repo, 'file'), 'one');
  execFileSync('git', ['add', 'file'], { cwd: repo, env });
  for (const kind of ['commit', 'pr']) assert.equal(native(['workflow', kind]), workflowText(kind));
  for (const adapter of ['claude', 'cursor', 'gemini', 'codex', 'copilot', 'unknown']) {
    assert.equal(native(['hook', 'ethos', '--adapter', adapter]), legacy('assets/machine/hooks/ethos.cjs', ['--adapter', adapter]));
  }
  for (const adapter of ['claude', 'cursor']) {
    for (const input of [
      { hook_event_name: 'subagentStart', subagent_type: 'rogue' },
      { hook_event_name: 'subagentStart', subagent_type: 'planner' },
      { hook_event_name: 'subagentStart', subagent_type: 'exo-pm' },
      { hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'planner', prompt: 'plan it', model: 'opus' } },
      { hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'exo-backend', prompt: 'write it', model: 'sonnet' } },
    ]) {
      const a = native(['hook', 'taxis', '--adapter', adapter], input);
      const b = legacy('assets/agents/taxis.js', [adapter], input);
      assert.deepEqual(a ? JSON.parse(a) : null, b ? JSON.parse(b) : null);
    }
  }
  native(['token', 'commit']);
  const previous = process.env.EXONOUS_HOME;
  process.env.EXONOUS_HOME = home;
  try {
    assert.deepEqual(token.consume('commit', repo), { ok: true });
    assert.deepEqual(token.consume('commit', repo), { ok: false, reason: 'none' });
  } finally {
    if (previous === undefined) delete process.env.EXONOUS_HOME;
    else process.env.EXONOUS_HOME = previous;
  }
  console.log('Native/Node parity: workflows, six reminder hosts, ten spawn events and one-use token interoperability passed.');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
