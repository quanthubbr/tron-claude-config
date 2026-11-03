#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const { install } = require('../src/install');
const { ADAPTERS } = require('../src/adapters');
const { SKILLS, TOOLS, skillForms, skillRows } = require('../src/lib/skill-map');
const { ASSETS, COMMANDS } = require('../src/lib/runtime');
const fx = require('./helpers/adapter-fixture');

fx.useFixtureHome();
const SURFACES = Object.keys(TOOLS);
const run = (opts = {}) => install({ external: false, execPath: process.execPath, tools: SURFACES, ...fx.quiet(), ...opts });
const frontmatter = (text) => /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] || '';
const field = (fm, key) => new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(fm)?.[1]?.trim() || '';
const rowsOf = (tool) => ADAPTERS.find((a) => a.id === tool).doctor({}).filter((r) => /: (skills|\/ commands) \(/.test(r.name));

test('mapping: one entry per shipped skill, every mapped tool is an adapter', () => {
  assert.deepStrictEqual([...SKILLS].sort(), fs.readdirSync(path.join(ASSETS, 'skills')).filter((d) => !d.startsWith('.')).sort());
  assert.strictEqual(new Set(SKILLS).size, SKILLS.length);
  for (const tool of SURFACES) assert.ok(ADAPTERS.some((a) => a.id === tool), tool);
  assert.deepStrictEqual(SURFACES.sort(), ['claude', 'codex', 'copilot', 'cursor', 'gemini', 'opencode', 'windsurf']);
  assert.throws(() => skillForms('aider'), /no skill mapping/);
});

test('mapping: Claude gets commands for the commit/PR set and skills for the rest; Codex reads ~/.agents/skills', () => {
  const claude = skillForms('claude');
  assert.deepStrictEqual(claude.filter((f) => f.kind === 'command').map((f) => f.name), COMMANDS);
  assert.ok(claude.filter((f) => f.kind === 'skill').every((f) => f.link && !COMMANDS.includes(f.name)));
  for (const tool of ['codex', 'copilot', 'windsurf']) {
    assert.ok(skillForms(tool).every((f) => f.kind === 'skill' && f.file === fx.home('.agents', 'skills', f.name, 'SKILL.md')), tool);
  }
  for (const tool of ['gemini', 'opencode']) assert.strictEqual(skillForms(tool).filter((f) => f.kind === 'command').length, SKILLS.length, tool);
});

test('install: every skill reaches every tool in its native form', () => {
  run();
  for (const tool of SURFACES) {
    for (const f of skillForms(tool)) assert.ok(fs.existsSync(f.file), `${tool}: ${f.name} → ${f.file}`);
  }
  for (const base of ['.claude', '.cursor']) {
    for (const f of skillForms(base.slice(1)).filter((x) => x.link)) {
      const dir = path.dirname(f.file);
      assert.ok(fs.lstatSync(dir).isSymbolicLink(), `${dir} is a link`);
      assert.strictEqual(fs.realpathSync(dir), fs.realpathSync(fx.home('.agents', 'skills', f.name)));
    }
  }
  assert.strictEqual(fs.readFileSync(fx.home('.claude', 'commands', 'commit-changes.md'), 'utf8'), fs.readFileSync(path.join(ASSETS, 'skills', 'commit-changes', 'SKILL.md'), 'utf8'));
  assert.ok(!fs.existsSync(fx.home('.claude', 'skills', 'commit-changes')), 'Claude keeps the commit/PR set as commands only');
});

test('install: every shared SKILL.md is loadable by Codex/Cursor/OpenCode (frontmatter, name = folder, description)', () => {
  run();
  for (const name of SKILLS) {
    const fm = frontmatter(fx.read('.agents', 'skills', name, 'SKILL.md'));
    assert.strictEqual(field(fm, 'name'), name, name);
    assert.ok(field(fm, 'description'), `${name}: description`);
  }
});

test('install: Gemini and OpenCode launchers name the skill; the commit/PR set keeps its full prompt', () => {
  run();
  const toml = fx.read('.gemini', 'commands', 'deliver.toml');
  assert.match(toml, /^description = "Delivery workflow/);
  assert.match(toml, /Activate the `deliver` skill \(activate_skill\)/);
  assert.match(toml, /\{\{args\}\}/);
  const md = fx.read('.config', 'opencode', 'commands', 'ui-patterns.md');
  assert.match(md, /^---\ndescription: /);
  assert.match(md, /Load the `ui-patterns` skill with the skill tool/);
  assert.match(md, /\$ARGUMENTS/);
  assert.ok(fx.read('.gemini', 'commands', 'make-pr.toml').length > toml.length, 'make-pr is the full converted skill');
});

test('install: an old Cursor copy becomes a link; a dir with the user\'s own files stays and is reported', () => {
  fx.write('---\nname: make-pr\n---\nold release\n', '.cursor', 'skills', 'make-pr', 'SKILL.md');
  fx.write(fs.readFileSync(path.join(ASSETS, 'skills', 'ui-patterns', 'SKILL.md'), 'utf8'), '.cursor', 'skills', 'ui-patterns', 'SKILL.md');
  fx.write('mine\n', '.cursor', 'skills', 'doc', 'notes.md');
  const { logs, log } = fx.quiet();
  run({ log });
  assert.ok(fs.lstatSync(fx.home('.cursor', 'skills', 'ui-patterns')).isSymbolicLink(), 'shipped copy replaced by a link');
  assert.ok(!fs.lstatSync(fx.home('.cursor', 'skills', 'make-pr')).isSymbolicLink(), 'unknown content is not ours');
  assert.strictEqual(fx.read('.cursor', 'skills', 'doc', 'notes.md'), 'mine\n');
  assert.ok(logs.some((m) => /WARN: ~\/\.cursor\/skills\/doc holds files exonous did not write/.test(m)), logs.join('\n'));
  assert.deepStrictEqual(rowsOf('cursor').map((r) => [r.ok, r.status]), [[false, 'missing: doc']]);
});

test('install: a copy written by the previous install (ledger hash) is replaced by a link', () => {
  run({ tools: ['cursor'] });
  const ledger = JSON.parse(fx.read('.claude', 'exonous', 'installed.json'));
  fs.unlinkSync(fx.home('.cursor', 'skills', 'make-pr'));
  const old = '---\nname: make-pr\n---\nolder release\n';
  fx.write(old, '.cursor', 'skills', 'make-pr', 'SKILL.md');
  ledger.files['.cursor/skills/make-pr/SKILL.md'] = { hash: require('../src/lib/home').sha256(old), tool: 'cursor' };
  fx.write(ledger, '.claude', 'exonous', 'installed.json');
  run({ tools: ['cursor'] });
  assert.ok(fs.lstatSync(fx.home('.cursor', 'skills', 'make-pr')).isSymbolicLink());
});

test('install: a foreign skill already in ~/.agents/skills is never replaced or linked', () => {
  fx.write('---\nname: someone-else\ndescription: x\n---\n', '.agents', 'skills', 'code-review', 'SKILL.md');
  const { logs, log } = fx.quiet();
  run({ log });
  assert.match(fx.read('.agents', 'skills', 'code-review', 'SKILL.md'), /someone-else/);
  assert.ok(!fs.existsSync(fx.home('.cursor', 'skills', 'code-review')));
  assert.ok(logs.some((m) => /~\/\.agents\/skills\/code-review\/ holds a different skill/.test(m)));
});

test('doctor: each tool names the missing skills; all present is ✓', () => {
  run();
  for (const tool of SURFACES) assert.ok(rowsOf(tool).every((r) => r.ok && r.status === ''), tool);
  assert.deepStrictEqual(rowsOf('codex').map((r) => r.name), [`Codex CLI: skills (${SKILLS.length}/${SKILLS.length} in ~/.agents/skills/)`]);
  fs.rmSync(fx.home('.agents', 'skills', 'make-pr'), { recursive: true });
  fs.rmSync(fx.home('.agents', 'skills', 'ui-patterns'), { recursive: true });
  fs.rmSync(fx.home('.gemini', 'commands', 'deliver.toml'));
  const codex = rowsOf('codex');
  assert.deepStrictEqual(codex.map((r) => [r.name, r.ok, r.status, r.fix]), [
    [`Codex CLI: skills (${SKILLS.length - 2}/${SKILLS.length} in ~/.agents/skills/)`, false, 'missing: make-pr, ui-patterns', 'exonous install'],
  ]);
  assert.deepStrictEqual(rowsOf('gemini').map((r) => r.status), ['missing: make-pr, ui-patterns', 'missing: deliver']);
  assert.deepStrictEqual(rowsOf('claude').map((r) => [r.name.replace(/ \(.*/, ''), r.status]), [
    ['Claude Code: skills', 'missing: ui-patterns'],
    ['Claude Code: / commands', ''],
  ]);
  assert.strictEqual(rowsOf('cursor')[0].status, 'missing: make-pr, ui-patterns', 'dangling links count as missing');
  assert.deepStrictEqual(skillRows('copilot').map((r) => r.ok), [false]);
});
