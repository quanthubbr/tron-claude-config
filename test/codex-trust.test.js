#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, beforeEach, afterEach } = require('node:test');
const trust = require('../src/adapters/codex-trust');

// Golden vectors: hooks.json commands and the trusted_hash codex-cli 0.166.0 wrote for them after /hooks approval.
const NODE = '"/Users/zaq/.nvm/versions/node/v24.14.1/bin/node"';
const script = (name, args) => `${NODE} "/Users/zaq/.claude/exonous/hooks/${name}.cjs" ${args}`;
const GOLDEN = [
  ['PreToolUse', 'Bash', script('pyle', 'auto --adapter codex'), 'sha256:d018721c115ed364492dd0ca9fd876347d92b9bbd811f06f85e884f289202ae0'],
  ['UserPromptSubmit', undefined, script('ethos', '--adapter codex'), 'sha256:4ade3152eb64c3588d3e5132129ca6c0a935f3575e4369b3cad395e7b61c69d3'],
  ['SessionEnd', undefined, script('anamnesis', '--event end --adapter codex'), 'sha256:3a1c4d4ac1cc02928dfe31a08b1ad50c000befa0073b87ba73ec50d809497e9e'],
];

test('hookHash reproduces the hash Codex stores as trusted_hash', () => {
  for (const [event, matcher, command, hash] of GOLDEN) {
    assert.strictEqual(trust.hookHash(event, matcher, { type: 'command', command }, 'darwin'), hash, event);
  }
});

test('hookHash covers the command, matcher and timeout, and ignores defaults Codex fills in', () => {
  const [event, matcher, command, hash] = GOLDEN[0];
  const at = (h, m = matcher) => trust.hookHash(event, m, { type: 'command', command, ...h }, 'darwin');
  assert.strictEqual(at({ timeout: 600, async: false }), hash, 'explicit defaults hash the same');
  assert.strictEqual(at({ additionalContextLimit: 2500 }), hash, 'default context limit is dropped');
  assert.notStrictEqual(at({ command: command.replace('/bin/node', '/bin/../bin/node') }), hash, 'a node path change drops trust');
  assert.notStrictEqual(at({}, 'Shell'), hash);
  assert.notStrictEqual(at({ timeout: 30 }), hash);
  assert.strictEqual(trust.hookHash('UserPromptSubmit', 'ignored', { type: 'command', command: GOLDEN[1][2] }, 'darwin'), GOLDEN[1][3], 'matcher ignored where Codex ignores it');
});

test('parseHookStates reads table and inline entries and stops at the next table', () => {
  const text = [
    'model = "x"',
    '[hooks.state]',
    '"/h/hooks.json:stop:0:0" = { trusted_hash = "sha256:inline", enabled = false }',
    '',
    '[hooks.state."/h/hooks.json:pre_tool_use:0:0"]',
    'trusted_hash = "sha256:aaa"  # approved',
    "[hooks.state.'C:\\h\\hooks.json:session_end:0:0']",
    'enabled = true',
    '[hooks.state."C:\\\\h\\\\hooks.json:session_start:0:0"]',
    'trusted_hash = "sha256:win"',
    '[tui]',
    'trusted_hash = "sha256:not-a-hook"',
  ].join('\r\n');
  const states = trust.parseHookStates(text);
  assert.deepStrictEqual([...states], [
    ['/h/hooks.json:stop:0:0', { trusted_hash: 'sha256:inline', enabled: false }],
    ['/h/hooks.json:pre_tool_use:0:0', { trusted_hash: 'sha256:aaa' }],
    ['C:\\h\\hooks.json:session_end:0:0', { enabled: true }],
    ['C:\\h\\hooks.json:session_start:0:0', { trusted_hash: 'sha256:win' }],
  ]);
  assert.strictEqual(trust.parseHookStates('').size, 0);
});

test('mergeStates: the profile wins field by field over the base', () => {
  const base = new Map([['k', { trusted_hash: 'a', enabled: false }], ['b', { trusted_hash: 'b' }]]);
  const merged = trust.mergeStates(base, new Map([['k', { trusted_hash: 'z' }]]));
  assert.deepStrictEqual(merged.get('k'), { trusted_hash: 'z', enabled: false });
  assert.deepStrictEqual(merged.get('b'), { trusted_hash: 'b' });
  assert.deepStrictEqual(base.get('k'), { trusted_hash: 'a', enabled: false }, 'base untouched');
});

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-trust-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const HOOKS = {
  hooks: {
    PreToolUse: [
      { matcher: 'Edit', hooks: [{ type: 'command', command: 'fmt' }] },
      { matcher: 'Bash', hooks: [{ type: 'command', command: GOLDEN[0][2] }] },
    ],
    UserPromptSubmit: [{ hooks: [{ type: 'command', command: GOLDEN[1][2] }] }],
  },
};
const file = (name, text) => fs.writeFileSync(path.join(dir, name), text);
const keyFor = (event, gi) => `${path.join(dir, 'hooks.json')}:${event}:${gi}:0`;
const approve = (entries) => entries.map(([key, hash]) => `[hooks.state."${key.replace(/\\/g, '\\\\')}"]\ntrusted_hash = "${hash}"\n`).join('\n');
const all = () => [[keyFor('pre_tool_use', 1), GOLDEN[0][3]], [keyFor('user_prompt_submit', 0), GOLDEN[1][3]]];
const verdicts = () => Object.fromEntries(trust.approvals(dir, { platform: 'darwin' }).map((p) => [p.name ?? 'base', p.hooks.map((h) => `${h.script}:${h.verdict}`).join(' ')]));

test('only exonous hooks are checked, keyed by their position in hooks.json', () => {
  file('hooks.json', JSON.stringify(HOOKS));
  const hooks = trust.exonousHooks(HOOKS, path.join(dir, 'hooks.json'), 'darwin');
  assert.deepStrictEqual(hooks.map((h) => [h.key, h.script]), [[all()[0][0], 'pyle'], [all()[1][0], 'ethos']]);
});

test('per profile: base approval is inherited, a stripped profile is new, a stale own entry overrides the base', () => {
  file('hooks.json', JSON.stringify(HOOKS));
  file('config.toml', `model = "x"\n${approve(all())}`);
  file('plain.config.toml', 'model = "y"\n');
  file('stale.config.toml', approve([[all()[0][0], 'sha256:old']]));
  file('off.config.toml', `[hooks.state."${all()[1][0]}"]\nenabled = false\n`);
  file('.hidden.config.toml', '');
  assert.deepStrictEqual(verdicts(), {
    base: 'pyle:approved ethos:approved',
    off: 'pyle:approved ethos:disabled',
    plain: 'pyle:approved ethos:approved',
    stale: 'pyle:changed ethos:approved',
  });
  fs.writeFileSync(path.join(dir, 'config.toml'), 'model = "x"\n');
  assert.deepStrictEqual(verdicts().plain, 'pyle:new ethos:new');
});

test('a hook inserted before ours moves the gate to a new key, which starts unapproved', () => {
  file('config.toml', approve(all()));
  file('hooks.json', JSON.stringify(HOOKS));
  assert.strictEqual(verdicts().base, 'pyle:approved ethos:approved');
  const moved = structuredClone(HOOKS);
  moved.hooks.PreToolUse.unshift({ matcher: 'Read', hooks: [{ type: 'command', command: 'lint' }] });
  file('hooks.json', JSON.stringify(moved));
  assert.strictEqual(verdicts().base, 'pyle:new ethos:approved');
});

test('approvalRows: ✗ with the profile-specific fix, ✓ with the hash note; files are only read', () => {
  file('hooks.json', JSON.stringify(HOOKS));
  file('or.config.toml', approve(all()));
  file('stale.config.toml', approve([[all()[0][0], 'sha256:old'], all()[1]]));
  const before = fs.readdirSync(dir).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]);
  const rows = Object.fromEntries(trust.approvalRows(dir, { platform: 'darwin' }).map((r) => [r.name, r]));
  const base = rows['Codex CLI: hooks approved in /hooks (base config.toml)'];
  assert.strictEqual(base.ok, false);
  assert.strictEqual(base.status, 'commit/push/PR gate OFF — none of the 2 exonous hooks approved (all new)');
  assert.match(base.fix, /^run `codex`, open \/hooks and approve the exonous hooks .*covers every profile without entries of its own$/);
  const or = rows['Codex CLI: hooks approved in /hooks (profile or)'];
  assert.deepStrictEqual([or.ok, or.status], [true, '2/2 exonous hooks approved, hashes match hooks.json']);
  const stale = rows['Codex CLI: hooks approved in /hooks (profile stale)'];
  assert.strictEqual(stale.ok, false);
  assert.strictEqual(stale.status, 'commit/push/PR gate OFF — ✗ pyle changed (pre_tool_use:1:0)');
  assert.match(stale.fix, /^run `codex -p stale`, .*own \[hooks\.state\] entries override the base config\.toml$/);
  assert.deepStrictEqual(trust.pendingProfiles(dir, { platform: 'darwin' }).map((p) => p.name), [null, 'stale']);
  assert.deepStrictEqual(fs.readdirSync(dir).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]), before);
});

test('no hooks.json, invalid JSON or no exonous hook: nothing to report', () => {
  assert.deepStrictEqual(trust.approvalRows(dir), []);
  file('hooks.json', '{ nope');
  assert.deepStrictEqual(trust.approvalRows(dir), []);
  file('hooks.json', JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'fmt' }] }] } }));
  assert.deepStrictEqual(trust.approvalRows(dir), []);
});
