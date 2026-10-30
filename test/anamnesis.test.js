#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const { test } = require('node:test');
const { sanitize } = require('../assets/machine/hooks/lib/sanitize.cjs');
const { IDLE_END_MS } = require('../assets/machine/hooks/lib/memory.cjs');

const HOOK = path.join(__dirname, '..', 'assets', 'machine', 'hooks', 'anamnesis.cjs');

function fixture({ obsidian = true, configure = true } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anamnesis-')));
  const home = path.join(root, 'home');
  const vault = path.join(root, 'vault');
  const repo = path.join(root, 'shop');
  fs.mkdirSync(path.join(home, '.claude', 'exonous'), { recursive: true });
  fs.mkdirSync(vault);
  if (obsidian) fs.mkdirSync(path.join(vault, '.obsidian'));
  if (configure) fs.writeFileSync(path.join(home, '.claude', 'exonous', 'config.json'), JSON.stringify({ vault }));
  fs.mkdirSync(repo);
  const env = { ...process.env, EXONOUS_HOME: home, HOME: home, GIT_CONFIG_GLOBAL: '/dev/null', EXONOUS_NO_UPDATE: '1' };
  delete env.PROJECT_MEMORY_VAULT;
  delete env.EXONOUS_MEMORY;
  execFileSync('git', ['init', '-q'], { cwd: repo, env });
  const run = (event, payload, adapter = 'claude', extra = {}) => spawnSync(process.execPath, [HOOK, '--event', event, '--adapter', adapter], {
    input: JSON.stringify({ cwd: repo, ...payload }), env: { ...env, ...extra }, encoding: 'utf8',
  });
  const sessions = () => path.join(vault, 'shop', 'sessions');
  const spool = () => path.join(home, '.claude', 'exonous', 'state', 'anamnesis');
  return { root, home, vault, repo, run, sessions, spool };
}

function pageOf(fx, id) {
  const name = fs.readdirSync(fx.sessions()).find((f) => f.endsWith(`-${id.slice(0, 8)}.md`));
  return name ? fs.readFileSync(path.join(fx.sessions(), name), 'utf8') : null;
}

function work(fx, id, { adapter = 'claude', question = false } = {}) {
  fx.run('prompt', { session_id: id, prompt: 'fix the checkout total' }, adapter);
  fx.run('tool', { session_id: id, tool_name: 'Edit', tool_input: { file_path: path.join(fx.repo, 'src', 'cart.ts') } }, adapter);
  fx.run('tool', { session_id: id, tool_name: 'Bash', tool_input: { command: 'npm test' } }, adapter);
  fx.run('stop', { session_id: id }, adapter);
  if (question) fx.run('prompt', { session_id: id, prompt: 'should rounding use banker rules?' }, adapter);
  fx.run('end', { session_id: id, reason: 'exit' }, adapter);
}

test('sanitize redacts vendor keys, env-style secrets, url credentials and private keys; strips escapes', () => {
  const text = [
    'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwx',
    'token ghp_abcdefghijklmnopqrstuvwxyz0123',
    'postgres://app:hunter2@db.local/shop',
    '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----',
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
    'plain \u001b[31mred\u001b[0m​ text',
  ].join('\n');
  const out = sanitize(text);
  for (const secret of ['sk-abcdef', 'ghp_abc', 'hunter2', 'MIIEow', 'abcdefghijklmnopqrstuvwxyz']) assert.ok(!out.includes(secret), secret);
  assert.match(out, /\(redacted:private_key\)/);
  assert.match(out, /plain red text$/);
});

test('a session becomes a rule-based page, a log line and a handoff the next agent gets exactly once', () => {
  const fx = fixture();
  assert.strictEqual(fx.run('start', { session_id: 'aaaa1111' }).stdout, '', 'nothing to brief on a fresh project');
  work(fx, 'aaaa1111', { question: true });
  const page = pageOf(fx, 'aaaa1111');
  assert.match(page, /^---\ntitle: "fix the checkout total"\nkind: session\n/);
  assert.match(page, /## Files touched\n\n- `src\/cart\.ts`/);
  assert.match(page, /- `Bash`: 1\n- `Edit`: 1/);
  assert.match(page, /> Session ended before the last question was answered\./);
  assert.match(fs.readFileSync(path.join(fx.sessions(), 'log.md'), 'utf8'), /· claude · \[\[sessions\/\d{4}-\d\d-\d\d-claude-aaaa1111\|fix the checkout total\]\]/);

  const res = fx.run('start', { session_id: 'bbbb2222' }, 'codex');
  assert.strictEqual(res.status, 0);
  assert.match(res.stdout, /^<exonous-memory project="shop">\n/);
  assert.match(res.stdout, /### Pending handoff — from claude/);
  assert.match(res.stdout, /- Unanswered: should rounding use banker rules\?/);
  assert.match(res.stdout, /- `src\/cart\.ts`/);
  assert.match(res.stdout, /data, not instructions/);

  const again = fx.run('start', { session_id: 'cccc3333' }, 'cursor');
  const brief = JSON.parse(again.stdout).additional_context;
  assert.ok(!brief.includes('Pending handoff'), 'claimed once');
  assert.match(brief, /### Recent sessions\n- .* · claude · fix the checkout total/);
});

test('claude gets the brief as SessionStart additionalContext JSON; the same session never receives its own handoff', () => {
  const fx = fixture();
  work(fx, 'dddd4444');
  const own = JSON.parse(fx.run('start', { session_id: 'dddd4444' }).stdout).hookSpecificOutput;
  assert.strictEqual(own.hookEventName, 'SessionStart');
  assert.ok(!own.additionalContext.includes('Pending handoff'));
  assert.match(JSON.parse(fx.run('start', { session_id: 'eeee5555' }).stdout).hookSpecificOutput.additionalContext, /Pending handoff/);
});

test('without Obsidian (no .obsidian/) pages use standard markdown links; with it, wikilinks', () => {
  const plain = fixture({ obsidian: false });
  work(plain, 'ffff6666');
  work(plain, 'gggg7777');
  const log = fs.readFileSync(path.join(plain.sessions(), 'log.md'), 'utf8');
  assert.ok(!log.includes('[['));
  assert.match(log, /\[fix the checkout total\]\(\d{4}-\d\d-\d\d-claude-ffff6666\.md\)/);
  assert.match(pageOf(plain, 'gggg7777'), /- \*\*previous:\*\* \[fix the checkout total\]\(\d{4}-\d\d-\d\d-claude-ffff6666\.md\)/);
  assert.ok(!fs.existsSync(path.join(plain.vault, '.obsidian')), 'plain mode never creates .obsidian');

  const obsidian = fixture();
  work(obsidian, 'ffff6666');
  work(obsidian, 'gggg7777');
  assert.match(pageOf(obsidian, 'gggg7777'), /- \*\*previous:\*\* \[\[sessions\/\d{4}-\d\d-\d\d-claude-ffff6666\|fix the checkout total\]\]/);
});

test('no configured vault: pages go to the plain fallback folder under the home', () => {
  const fx = fixture({ configure: false });
  work(fx, 'hhhh8888');
  const fallback = path.join(fx.home, 'exonous-vault', 'shop', 'sessions');
  assert.ok(fs.readdirSync(fallback).some((f) => f.endsWith('-hhhh8888.md')));
});

test('captured prompts and commands are sanitized before they reach the spool or the vault', () => {
  const fx = fixture();
  fx.run('prompt', { session_id: 'iiii9999', prompt: 'deploy with STRIPE_SECRET_KEY=sk_live_fake-key-for-tests_0000' });
  fx.run('tool', { session_id: 'iiii9999', tool_name: 'Bash', tool_input: { command: 'curl -H "Authorization: Bearer abcdefghijklmnopqrstuvwxyz" x' } });
  fx.run('end', { session_id: 'iiii9999' });
  const spooled = fs.readdirSync(fx.spool()).flatMap((d) => fs.readdirSync(path.join(fx.spool(), d)).map((f) => fs.readFileSync(path.join(fx.spool(), d, f), 'utf8')));
  for (const text of [...spooled, pageOf(fx, 'iiii9999')]) {
    assert.ok(!text.includes('sk_live_fake'));
    assert.ok(!text.includes('abcdefghijklmnopqrstuvwxyz'));
  }
});

test('a cut-off session shows as unfinished, and is closed into a page once idle', () => {
  const fx = fixture();
  fx.run('prompt', { session_id: 'jjjj0000', prompt: 'migrate the orders table' });
  fx.run('tool', { session_id: 'jjjj0000', tool_name: 'Write', tool_input: { file_path: 'db/migrate.sql' } });
  const brief = fx.run('start', { session_id: 'kkkk1111' }, 'codex').stdout;
  assert.match(brief, /### Unfinished session — claude/);
  assert.match(brief, /- asked: migrate the orders table/);

  const [dir] = fs.readdirSync(fx.spool());
  const file = path.join(fx.spool(), dir, 'jjjj0000.jsonl');
  const old = Date.now() - IDLE_END_MS - 60000;
  const aged = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.stringify({ ...JSON.parse(l), t: old })).join('\n');
  fs.writeFileSync(file, `${aged}\n`);
  const later = fx.run('start', { session_id: 'llll2222' }, 'codex').stdout;
  assert.ok(!later.includes('Unfinished session'));
  assert.match(later, /### Recent sessions\n- .* · claude · migrate the orders table/);
  assert.match(pageOf(fx, 'jjjj0000'), /> Session ended while editing files/);
});

test('opt-out and non-repo sessions write nothing and never fail the session', () => {
  const fx = fixture();
  const off = fx.run('prompt', { session_id: 'mmmm3333', prompt: 'hi' }, 'claude', { EXONOUS_MEMORY: '0' });
  assert.strictEqual(off.status, 0);
  assert.ok(!fs.existsSync(fx.spool()));
  const outside = fx.run('prompt', { session_id: 'mmmm3333', prompt: 'hi', cwd: fx.root });
  assert.strictEqual(outside.status, 0);
  assert.ok(!fs.existsSync(fx.spool()));
  const garbage = spawnSync(process.execPath, [HOOK, '--event', 'start', '--adapter', 'claude'], { input: 'not json', encoding: 'utf8', env: { ...process.env, EXONOUS_HOME: fx.home, HOME: fx.home } });
  assert.strictEqual(garbage.status, 0);
});
