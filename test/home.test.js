#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');
const { createHome, homeRel, readLedger, sha256, ledgerPath } = require('../src/lib/home');

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'home-'));
  const src = path.join(dir, 'src.md');
  const dest = path.join(dir, 'dest.md');
  fs.writeFileSync(src, 'release v2\n');
  return { src, dest, logs: [] };
}

test('a user-edited file is backed up before it is replaced', () => {
  const { src, dest, logs } = sandbox();
  fs.writeFileSync(dest, 'my edits\n');
  const home = createHome({ log: (m) => logs.push(m), previous: { [homeRel(dest)]: sha256('release v1\n') } });
  home.sync(src, dest);
  assert.strictEqual(fs.readFileSync(dest, 'utf8'), 'release v2\n');
  assert.strictEqual(fs.readFileSync(`${dest}.bak`, 'utf8'), 'my edits\n');
});

test('an untouched file from the previous release is replaced without a backup', () => {
  const { src, dest, logs } = sandbox();
  fs.writeFileSync(dest, 'release v1\n');
  const home = createHome({ log: (m) => logs.push(m), previous: { [homeRel(dest)]: sha256('release v1\n') } });
  home.sync(src, dest);
  assert.strictEqual(fs.readFileSync(dest, 'utf8'), 'release v2\n');
  assert.ok(!fs.existsSync(`${dest}.bak`));
});

test('a missing source marks the ledger incomplete instead of throwing', () => {
  const { dest, logs } = sandbox();
  const home = createHome({ log: (m) => logs.push(m), previous: {} });
  home.sync(path.join(path.dirname(dest), 'missing.md'), dest);
  assert.strictEqual(home.ledger.complete, false);
  assert.ok(logs.some((m) => m.includes('not synced')));
});

test('EXONOUS_HOME set after load moves the ledger and home-relative paths', () => {
  const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'home-env-'));
  const prev = process.env.EXONOUS_HOME;
  process.env.EXONOUS_HOME = fake;
  try {
    const ledger = path.join(fake, '.claude', 'exonous', 'installed.json');
    fs.mkdirSync(path.dirname(ledger), { recursive: true });
    fs.writeFileSync(ledger, JSON.stringify({ files: { '.claude/x.md': 'abc' } }));
    assert.deepStrictEqual(readLedger(), { '.claude/x.md': 'abc' });
    assert.strictEqual(homeRel(path.join(fake, '.claude', 'x.md')), '.claude/x.md');
  } finally {
    if (prev === undefined) delete process.env.EXONOUS_HOME;
    else process.env.EXONOUS_HOME = prev;
  }
});

function sectionHome() {
  const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'home-sec-'));
  const prev = process.env.EXONOUS_HOME;
  process.env.EXONOUS_HOME = fake;
  const restore = () => {
    if (prev === undefined) delete process.env.EXONOUS_HOME;
    else process.env.EXONOUS_HOME = prev;
  };
  const file = path.join(fake, '.gemini', 'GEMINI.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '# mine\n');
  return { fake, file, restore, logs: [] };
}

test('a section is written into a user file and recorded in the ledger', () => {
  const { file, restore, logs } = sectionHome();
  try {
    const home = createHome({ log: (m) => logs.push(m), previous: {}, previousSections: [] });
    home.section(file, 'rules v1\n', { tool: 'gemini' });
    home.prune('2.1.0');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '# mine\n\n<!-- exonous:start v2 -->\nrules v1\n<!-- exonous:end -->\n');
    const ledger = JSON.parse(fs.readFileSync(ledgerPath(), 'utf8'));
    assert.deepStrictEqual(ledger.sections, [{ path: '.gemini/GEMINI.md', marker: 'html', hash: sha256('rules v1\n'), tool: 'gemini' }]);
    assert.deepStrictEqual(ledger.files, {});
  } finally {
    restore();
  }
});

test('a retired section that still matches its hash is removed and the rest of the file kept', () => {
  const { file, restore, logs } = sectionHome();
  try {
    createHome({ log: () => {}, previous: {}, previousSections: [] }).section(file, 'rules v1\n', { tool: 'gemini' });
    const previousSections = [{ path: '.gemini/GEMINI.md', marker: 'html', hash: sha256('rules v1\n'), tool: 'gemini' }];
    createHome({ log: (m) => logs.push(m), previous: {}, previousSections }).prune('2.1.0');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '# mine\n');
    assert.ok(!fs.existsSync(`${file}.exonous-section.bak`));
  } finally {
    restore();
  }
});

test('an edited retired section is removed and its content kept as a .bak', () => {
  const { file, restore, logs } = sectionHome();
  try {
    createHome({ log: () => {}, previous: {}, previousSections: [] }).section(file, 'rules v1\n', { tool: 'gemini' });
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('rules v1', 'rules v1 + my note'));
    const previousSections = [{ path: '.gemini/GEMINI.md', marker: 'html', hash: sha256('rules v1\n'), tool: 'gemini' }];
    createHome({ log: (m) => logs.push(m), previous: {}, previousSections }).prune('2.1.0');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '# mine\n');
    assert.strictEqual(fs.readFileSync(`${file}.exonous-section.bak`, 'utf8'), 'rules v1 + my note\n');
    assert.ok(logs.some((m) => m.includes('.exonous-section.bak')));
  } finally {
    restore();
  }
});

test('sections of tools outside this run are carried over, not retired', () => {
  const { file, restore } = sectionHome();
  try {
    createHome({ log: () => {}, previous: {}, previousSections: [] }).section(file, 'rules v1\n', { tool: 'gemini' });
    const entry = { path: '.gemini/GEMINI.md', marker: 'html', hash: sha256('rules v1\n'), tool: 'gemini' };
    const home = createHome({ log: () => {}, previous: {}, previousSections: [entry] });
    home.prune('2.1.0', { tools: ['claude'] });
    assert.match(fs.readFileSync(file, 'utf8'), /rules v1/);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(ledgerPath(), 'utf8')).sections, [entry]);
  } finally {
    restore();
  }
});

test('a malformed section keeps its previous ledger entry instead of retiring it', () => {
  const { file, restore, logs } = sectionHome();
  try {
    fs.writeFileSync(file, '# mine\n<!-- exonous:start v2 -->\nhalf\n');
    const entry = { path: '.gemini/GEMINI.md', marker: 'html', hash: sha256('x\n'), tool: 'gemini' };
    const home = createHome({ log: (m) => logs.push(m), previous: {}, previousSections: [entry] });
    home.section(file, 'rules v2\n', { tool: 'gemini' });
    home.prune('2.1.0');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '# mine\n<!-- exonous:start v2 -->\nhalf\n');
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(ledgerPath(), 'utf8')).sections, [entry]);
  } finally {
    restore();
  }
});

test('an unedited section in a CRLF file retires without a .bak', () => {
  const { file, restore } = sectionHome();
  try {
    fs.writeFileSync(file, '# mine\r\n');
    const home = createHome({ log: () => {}, previous: {}, previousSections: [] });
    home.section(file, 'rules v1\n', { tool: 'gemini' });
    home.prune('2.1.0');
    const [entry] = JSON.parse(fs.readFileSync(ledgerPath(), 'utf8')).sections;
    assert.strictEqual(entry.hash, sha256('rules v1\n'));
    createHome({ log: () => {}, previous: {}, previousSections: [entry] }).prune('2.1.0');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '# mine\r\n');
    assert.ok(!fs.existsSync(`${file}.exonous-section.bak`));
  } finally {
    restore();
  }
});

test('file entries carry their tool and prune skips tools outside this run', () => {
  const { fake, restore } = sectionHome();
  try {
    const claudeFile = path.join(fake, '.claude', 'rules', 'nomos.md');
    const cursorFile = path.join(fake, '.cursor', 'rules', 'nomos.mdc');
    const first = createHome({ log: () => {}, previous: {}, previousSections: [] });
    first.write(claudeFile, 'c\n', { tool: 'claude' });
    first.write(cursorFile, 'k\n', { tool: 'cursor' });
    first.prune('2.1.0');
    const ledger = JSON.parse(fs.readFileSync(ledgerPath(), 'utf8'));
    assert.deepStrictEqual(ledger.files['.claude/rules/nomos.md'], { hash: sha256('c\n'), tool: 'claude' });
    const second = createHome({ log: () => {} });
    second.write(claudeFile, 'c\n', { tool: 'claude' });
    second.prune('2.1.0', { tools: ['claude'] });
    assert.ok(fs.existsSync(cursorFile), 'cursor file kept when cursor was not part of the run');
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(ledgerPath(), 'utf8')).files['.cursor/rules/nomos.mdc'], { hash: sha256('k\n'), tool: 'cursor' });
    const third = createHome({ log: () => {} });
    third.write(claudeFile, 'c\n', { tool: 'claude' });
    third.prune('2.1.0', { tools: ['claude', 'cursor'] });
    assert.ok(!fs.existsSync(cursorFile), 'cursor file retired when cursor ran and no longer wrote it');
    assert.deepStrictEqual(readLedger(), { '.claude/rules/nomos.md': { hash: sha256('c\n'), tool: 'claude' } });
  } finally {
    restore();
  }
});

test('a v2.0 ledger with bare hashes still prunes and keeps edits', () => {
  const { fake, restore } = sectionHome();
  try {
    const old = path.join(fake, '.claude', 'commands', 'old.md');
    fs.mkdirSync(path.dirname(old), { recursive: true });
    fs.writeFileSync(old, 'v1\n');
    createHome({ log: () => {}, previous: { '.claude/commands/old.md': sha256('v1\n') }, previousSections: [] }).prune('2.1.0', { tools: ['claude'] });
    assert.ok(!fs.existsSync(old));
  } finally {
    restore();
  }
});

test('removing the only section keeps a file the user had (even empty) and deletes one exonous created', () => {
  const { fake, file, restore } = sectionHome();
  try {
    fs.writeFileSync(file, '');
    const created = path.join(fake, '.qwen', 'QWEN.md');
    const home = createHome({ log: () => {}, previous: {}, previousSections: [] });
    home.section(file, 'rules v1\n', { tool: 'gemini' });
    home.section(created, 'rules v1\n', { tool: 'qwen' });
    home.prune('2.1.0');
    const again = createHome({ log: () => {} });
    again.section(created, 'rules v1\n', { tool: 'qwen' });
    again.prune('2.1.0');
    const sections = JSON.parse(fs.readFileSync(ledgerPath(), 'utf8')).sections;
    assert.strictEqual(sections.find((s) => s.path === '.qwen/QWEN.md').created, true, 'carried across reinstalls');
    const final = createHome({ log: () => {} });
    for (const entry of sections) final.removeSection(entry);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '', 'the user\'s empty file survives');
    assert.ok(!fs.existsSync(created));
  } finally {
    restore();
  }
});
