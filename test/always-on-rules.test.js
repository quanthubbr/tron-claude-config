#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

// The always-on set (nomos + praxis) must reach every tool exonous writes rules for, and rule files an older
// home install left behind must be retired instead of competing with it.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const { install } = require('../src/install');
const { uninstall } = require('../src/uninstall');
const { ADAPTERS } = require('../src/adapters');
const { doctor } = require('../src/doctor');
const { renderPraxis } = require('../src/lib/render-rules');
const { ORPHANS, findOrphanRules, retireOrphanRules } = require('../src/lib/orphan-rules');
const fx = require('./helpers/adapter-fixture');

fx.useFixtureHome();

const TOOL_DIRS = ['.cursor', '.gemini', '.codex', '.config/opencode', '.codeium/windsurf/memories', '.copilot', 'Documents/Cline', '.qwen'];
const ALL = ['claude', 'cursor', 'gemini', 'codex', 'opencode', 'windsurf', 'copilot', 'cline', 'qwen'];

function seedTools() {
  for (const dir of ['.claude', ...TOOL_DIRS]) fs.mkdirSync(fx.home(...dir.split('/')), { recursive: true });
  fx.write('{}\n', '.codeium', 'windsurf', 'hooks.json');
  fx.write('', '.codeium', 'windsurf', 'memories', 'global_rules.md');
}

const runAll = (q = fx.quiet()) => install({ external: false, execPath: process.execPath, tools: ALL, ...q });

/** The first marker phrase of each orphan, plus a line of its own, is enough to be recognized. */
const orphanText = (orphan) => `${orphan.phrases.join('\n\n')}\n\nmore text from the old install\n`;

test('praxis lands in every target that carries nomos, and the reminder hook is wired where it can be read', () => {
  seedTools();
  runAll();
  assert.ok(fx.read('.claude', 'rules', 'praxis.md').startsWith('# Praxis'));
  assert.ok(fx.read('.claude', 'exonous', 'rules', 'praxis.md').startsWith('# Praxis'));
  assert.match(fx.read('.cursor', 'rules', 'praxis.mdc'), /^---\ndescription: .*\nalwaysApply: true\n---\n\n# Praxis/);
  assert.ok(fx.read('.gemini', 'GEMINI.md').includes(`@${fx.home('.claude', 'exonous', 'rules', 'praxis.md')}`));
  assert.ok(fx.read('.codex', 'AGENTS.md').includes('# Praxis'));
  assert.ok(fx.readJson('.config', 'opencode', 'opencode.json').instructions.includes(fx.home('.claude', 'exonous', 'rules', 'praxis.md')));
  assert.strictEqual(fx.read('Documents', 'Cline', 'Rules', 'exonous-praxis.md'), renderPraxis('no-agents'));
  for (const file of [['.qwen', 'QWEN.md'], ['.codeium', 'windsurf', 'memories', 'global_rules.md']]) {
    const text = fx.read(...file);
    assert.ok(text.includes('# Nomos') && text.includes('# Praxis'), file.join('/'));
  }
  const reminders = {
    claude: JSON.stringify(fx.readJson('.claude', 'settings.json').hooks.UserPromptSubmit),
    cursor: JSON.stringify(fx.readJson('.cursor', 'hooks.json').hooks.beforeSubmitPrompt),
    gemini: JSON.stringify(fx.readJson('.gemini', 'settings.json').hooks.BeforeAgent),
    codex: JSON.stringify(fx.readJson('.codex', 'hooks.json').hooks.UserPromptSubmit),
    copilot: JSON.stringify(fx.readJson('.copilot', 'hooks', 'exonous.json').hooks.userPromptSubmitted),
  };
  for (const [tool, text] of Object.entries(reminders)) {
    assert.ok(text.includes('ethos.cjs') && text.includes(`--adapter ${tool}`), tool);
  }
  for (const id of ALL) {
    const rows = ADAPTERS.find((a) => a.id === id).doctor({});
    const praxis = rows.filter((r) => /praxis/i.test(r.name));
    assert.ok(praxis.length && praxis.every((r) => r.ok), `${id}: ${JSON.stringify(praxis)}`);
  }
});

test('uninstall takes praxis back out of every target', async () => {
  seedTools();
  runAll();
  await uninstall({ yes: true, log: () => {} });
  for (const file of [['.claude', 'rules', 'praxis.md'], ['.claude', 'exonous', 'rules', 'praxis.md'], ['.cursor', 'rules', 'praxis.mdc'], ['Documents', 'Cline', 'Rules', 'exonous-praxis.md']]) {
    assert.ok(!fx.exists(...file), file.join('/'));
  }
  // Files exonous created go with their section; one the user had keeps everything but the section.
  for (const [file, gone] of [[['.codex', 'AGENTS.md'], '# Praxis'], [['.qwen', 'QWEN.md'], '# Praxis'], [['.gemini', 'GEMINI.md'], 'praxis.md']]) {
    assert.ok(!fx.exists(...file) || !fx.read(...file).includes(gone), file.join('/'));
  }
  for (const file of [['.claude', 'settings.json'], ['.cursor', 'hooks.json'], ['.codex', 'hooks.json'], ['.copilot', 'hooks', 'exonous.json']]) {
    assert.ok(!fx.exists(...file) || !JSON.stringify(fx.readJson(...file)).includes('ethos.cjs'), file.join('/'));
  }
});

test('install retires the rule files an older home install left behind, keeping a .bak copy', () => {
  fs.mkdirSync(fx.home('.claude', 'rules'), { recursive: true });
  for (const orphan of ORPHANS) fx.write(orphanText(orphan), '.claude', 'rules', orphan.file);
  const q = fx.quiet();
  install({ external: false, execPath: process.execPath, tools: ['claude'], ...q });
  for (const orphan of ORPHANS) {
    assert.ok(!fx.exists('.claude', 'rules', orphan.file), orphan.file);
    assert.strictEqual(fx.read('.claude', 'rules', `${orphan.file}.bak`), orphanText(orphan));
    assert.ok(q.logs.some((m) => m === `retired ~/.claude/rules/${orphan.file} from an older install — every byte of it, your additions included, kept as ~/.claude/rules/${orphan.file}.bak`), orphan.file);
  }
  assert.deepStrictEqual(findOrphanRules(), []);
});

test('an orphan the user rewrote is kept and reported, never deleted', () => {
  fs.mkdirSync(fx.home('.claude', 'rules'), { recursive: true });
  const mine = '# Terse Mode — always active\n\nmy own version, nothing of theirs left\n';
  fx.write(mine, '.claude', 'rules', 'terse.md');
  const q = fx.quiet();
  const result = retireOrphanRules({ log: q.log });
  assert.deepStrictEqual(result, { retired: [], kept: ['terse.md'] });
  assert.strictEqual(fx.read('.claude', 'rules', 'terse.md'), mine);
  assert.ok(!fx.exists('.claude', 'rules', 'terse.md.bak'));
  assert.ok(q.logs.some((m) => /^WARN: ~\/\.claude\/rules\/terse\.md .* it was edited — left alone/.test(m)), q.logs.join('\n'));
});

test('lines you added to an orphan survive in the .bak, which is why it is still retired', () => {
  fs.mkdirSync(fx.home('.claude', 'rules'), { recursive: true });
  const mine = `${orphanText(ORPHANS[0])}\n## My own addition\n\nkeep this\n`;
  fx.write(mine, '.claude', 'rules', ORPHANS[0].file);
  const q = fx.quiet();
  assert.deepStrictEqual(retireOrphanRules({ log: q.log }), { retired: [ORPHANS[0].file], kept: [] });
  assert.strictEqual(fx.read('.claude', 'rules', `${ORPHANS[0].file}.bak`), mine);
  assert.ok(q.logs.some((m) => /every byte of it, your additions included/.test(m)), q.logs.join('\n'));
});

test('a .bak that is already there is never replaced or written through, and the orphan stays', () => {
  fs.mkdirSync(fx.home('.claude', 'rules'), { recursive: true });
  const outside = fx.home('my-notes.md');
  fs.writeFileSync(outside, 'notes I keep outside the rules dir\n');
  const mine = 'a backup I made myself\n';
  for (const orphan of [ORPHANS[0], ORPHANS[1]]) fx.write(orphanText(orphan), '.claude', 'rules', orphan.file);
  fx.write(mine, '.claude', 'rules', `${ORPHANS[0].file}.bak`);
  fs.symlinkSync(outside, fx.home('.claude', 'rules', `${ORPHANS[1].file}.bak`));
  const q = fx.quiet();
  const result = retireOrphanRules({ log: q.log });
  assert.deepStrictEqual(result, { retired: [], kept: [ORPHANS[0].file, ORPHANS[1].file] });
  for (const orphan of [ORPHANS[0], ORPHANS[1]]) {
    assert.strictEqual(fx.read('.claude', 'rules', orphan.file), orphanText(orphan), orphan.file);
    assert.ok(q.logs.some((m) => m === `WARN: ~/.claude/rules/${orphan.file} not retired (~/.claude/rules/${orphan.file}.bak already exists) — left alone; move ~/.claude/rules/${orphan.file}.bak aside and rerun \`exonous install\`, or delete ~/.claude/rules/${orphan.file} by hand`), orphan.file);
  }
  assert.strictEqual(fx.read('.claude', 'rules', `${ORPHANS[0].file}.bak`), mine, 'my own backup kept byte for byte');
  assert.strictEqual(fs.readFileSync(outside, 'utf8'), 'notes I keep outside the rules dir\n', 'the symlink target is never written');
});

test('rules the user wrote and the rules exonous ships are never candidates', () => {
  fs.mkdirSync(fx.home('.claude', 'rules'), { recursive: true });
  const files = { 'staycloud.md': '# StayCloud — deploy playbook\n', 'nomos.md': '# Nomos — always on\n', 'praxis.md': '# Praxis — always on\n' };
  for (const [name, text] of Object.entries(files)) fx.write(text, '.claude', 'rules', name);
  assert.deepStrictEqual(findOrphanRules(), []);
  retireOrphanRules({ log: () => {} });
  for (const [name, text] of Object.entries(files)) assert.strictEqual(fx.read('.claude', 'rules', name), text, name);
  assert.ok(!ORPHANS.some((o) => Object.keys(files).includes(o.file)));
});

test('a dry run only says what it would retire; doctor names what is still there', () => {
  fs.mkdirSync(fx.home('.claude', 'rules'), { recursive: true });
  fx.write(orphanText(ORPHANS[0]), '.claude', 'rules', ORPHANS[0].file);
  fx.write('# Harness Patterns\n\nmy own notes\n', '.claude', 'rules', 'harness-patterns.md');
  const q = fx.quiet();
  retireOrphanRules({ dryRun: true, log: q.log });
  assert.ok(fx.exists('.claude', 'rules', ORPHANS[0].file));
  assert.ok(q.logs.some((m) => m === `DRY: would retire ~/.claude/rules/${ORPHANS[0].file} (every byte kept as ~/.claude/rules/${ORPHANS[0].file}.bak)`), q.logs.join('\n'));
  const lines = [];
  const stdout = console.log;
  console.log = (m) => lines.push(String(m));
  try {
    doctor({ cwd: fx.home() });
  } finally {
    console.log = stdout;
  }
  const report = lines.join('\n');
  assert.match(report, /✗ no rule files from older installs in ~\/\.claude\/rules \(terse\.md, harness-patterns\.md \(edited\)\)/);
  assert.match(report, /read and delete the edited ones by hand/);
});
