'use strict';
require('./helpers/tmp-cleanup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const fx = require('./helpers/adapter-fixture');
const { current, vaultContext } = require('../src/vault-cli');
fx.useFixtureHome();
const ctx = () => vaultContext({ platform: process.platform === 'win32' ? 'win32' : 'linux', homedir: fx.home(), isWsl: false });
const REGISTRY_DIR = process.platform === 'win32' ? ['AppData', 'Roaming', 'obsidian'] : ['.config', 'obsidian'];
function root(name) { const p = fx.home(name); fs.mkdirSync(p, { recursive: true }); return p; }
function write(base, relative, content = 'fixture') { const p = path.join(base, relative); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); return p; }
const run = (options = {}) => require('../src/lib/vault-consolidation').consolidate({ ctx: ctx(), ...options });

test('canonical current stays on persisted root until successful consolidation chooses the user target', () => {
  const fallback = root('exonous-vault');
  const central = root('central');
  fx.write({ vault: fallback }, '.claude', 'skills', 'project-memory', 'config.json');
  fx.write({ vault: central }, '.claude', 'exonous', 'config.json');
  assert.equal(current(ctx()).path, central);
  fx.write({ vault: fallback }, '.claude', 'exonous', 'config.json');
  fx.write({ vaults: { x: { path: central, open: true } } }, ...REGISTRY_DIR, 'obsidian.json');
  assert.equal(current(ctx()).path, fallback);
  assert.equal(run({ dryRun: true }).target, central);
  assert.equal(run().status, 'complete');
  assert.equal(current(ctx()).path, central);
});

test('dry-run manifests only owned content, mutates nothing; apply moves it and keeps personal notes', () => {
  const source = root('exonous-vault'); const target = root('central');
  const owned = write(source, 'repo/memory/adr/adr-0001.md', 'decision');
  write(source, 'repo/sessions/id.md', 'automatic');
  write(source, 'repo/2026-11-05 1200 handoff.md', 'legacy');
  write(source, 'README.md', 'keep'); write(source, 'repo/personal.md', 'personal');
  const preview = run({ target, dryRun: true });
  assert.equal(preview.status, 'planned', JSON.stringify(preview)); assert.equal(preview.entries.length, 3);
  assert.equal(fs.existsSync(path.join(target, 'repo')), false);
  assert.equal(fs.existsSync(fx.home('.claude', 'exonous', 'config.json')), false);
  const result = run({ target });
  assert.equal(result.status, 'complete');
  assert.equal(fs.existsSync(owned), false);
  assert.equal(fs.readFileSync(path.join(target, 'repo/memory/adr/adr-0001.md'), 'utf8'), 'decision');
  assert.equal(fs.readFileSync(path.join(source, 'repo/personal.md'), 'utf8'), 'personal');
  assert.equal(fx.readJson('.claude', 'exonous', 'config.json').vault, target);
  assert.equal(run({ target }).status, 'complete');
});

test('conflicts block all copying, cleanup and config changes', () => {
  const source = root('exonous-vault'); const target = root('central');
  write(source, 'repo/memory/doc/a.md', 'old'); write(target, 'repo/memory/doc/a.md', 'different');
  const untouched = write(source, 'repo/sessions/b.md');
  fx.write({ vault: source }, '.claude', 'exonous', 'config.json');
  const result = run({ target });
  assert.equal(result.status, 'conflict', JSON.stringify(result)); assert.equal(result.conflicts.length, 1);
  assert.equal(fx.readJson('.claude', 'exonous', 'config.json').vault, source);
  assert.equal(fs.existsSync(untouched), true);
  assert.equal(fs.existsSync(path.join(target, 'repo/sessions/b.md')), false);
});

test('nested roots and source/destination symlinks are rejected without mutation', { skip: process.platform === 'win32' }, () => {
  const source = root('exonous-vault'); const target = root('central');
  write(source, 'repo/memory/doc/a.md');
  assert.equal(run({ target: root('exonous-vault/inside') }).status, 'blocked');
  fs.symlinkSync(root('outside'), path.join(target, 'repo'));
  assert.equal(run({ target }).status, 'blocked');
  fs.unlinkSync(path.join(target, 'repo'));
  fs.symlinkSync(fx.home('outside'), path.join(source, 'repo', 'sessions'));
  assert.equal(run({ target }).status, 'blocked');
});

test('cleanup interruption resumes from journal after central config switch and preserves mtime', () => {
  const source = root('previous-custom'); const target = root('central');
  fx.write({ vault: source, memory: false }, '.claude', 'exonous', 'config.json');
  const file = write(source, 'repo/memory/doc/a.md', 'unchanged');
  const when = new Date('2024-01-01T00:00:00Z'); fs.utimesSync(file, when, when);
  const io = Object.create(fs); io.unlinkSync = () => { throw new Error('simulated cleanup crash'); };
  const interrupted = run({ target, fs: io });
  assert.equal(interrupted.status, 'pending-cleanup', JSON.stringify(interrupted));
  assert.equal(fx.readJson('.claude', 'exonous', 'config.json').vault, target);
  assert.equal(fx.readJson('.claude', 'exonous', 'config.json').memory, false);
  assert.equal(fs.existsSync(file), true);
  assert.equal(fs.statSync(path.join(target, 'repo/memory/doc/a.md')).mtimeMs, when.getTime());
  assert.equal(run({ target }).status, 'complete');
  assert.equal(fs.existsSync(file), false);
});

test('copy interruption and partial cleanup resume idempotently without losing originals', () => {
  const source = root('exonous-vault'); const target = root('central');
  const first = write(source, 'repo/memory/doc/a.md', 'first');
  const second = write(source, 'repo/sessions/b.md', 'second');
  const copyCrash = Object.create(fs);
  copyCrash.copyFileSync = (...args) => { fs.copyFileSync(...args); throw new Error('copy crash'); };
  assert.equal(run({ target, fs: copyCrash }).status, 'blocked');
  assert.equal(fs.existsSync(first), true); assert.equal(fs.existsSync(second), true);
  assert.equal(fs.existsSync(fx.home('.claude', 'exonous', 'config.json')), false);
  let count = 0;
  const cleanupCrash = Object.create(fs);
  cleanupCrash.unlinkSync = (file) => { if (++count === 2) throw new Error('partial crash'); fs.unlinkSync(file); };
  assert.equal(run({ target, fs: cleanupCrash }).status, 'pending-cleanup');
  assert.equal(fs.existsSync(first), false); assert.equal(fs.existsSync(second), true);
  assert.equal(run({ target }).status, 'complete');
  assert.equal(fs.existsSync(second), false);
});

test('changed source aborts switch and hostile journal never authorizes an unrelated deletion', () => {
  const source = root('exonous-vault'); const target = root('central');
  const file = write(source, 'repo/memory/doc/a.md', 'initial');
  const changed = Object.create(fs);
  changed.copyFileSync = (...args) => { fs.copyFileSync(...args); fs.writeFileSync(file, 'changed'); };
  assert.equal(run({ target, fs: changed }).status, 'blocked');
  assert.equal(fs.readFileSync(file, 'utf8'), 'changed');
  assert.equal(fs.existsSync(fx.home('.claude', 'exonous', 'config.json')), false);
  const journal = fx.readJson('.claude', 'exonous', 'state', 'vault-consolidation.json');
  const personal = write(source, 'repo/personal.md', 'keep');
  journal.entries[0].relative = '../personal.md';
  fx.write(journal, '.claude', 'exonous', 'state', 'vault-consolidation.json');
  assert.equal(run({ target }).status, 'blocked');
  assert.equal(fs.readFileSync(personal, 'utf8'), 'keep');
});

test('both fallbacks and shared legacy roots contribute only owned files', () => {
  const first = root('exonous-vault'); const second = root('Documents/exonous-vault');
  const shared = root('personal-vault'); const target = root('central');
  write(first, 'one/memory/plan/a.md'); write(second, 'two/sessions/b.md');
  write(shared, 'three/memory/doc/c.md'); write(shared, 'three/private.md', 'personal');
  write(shared, 'journal/2026-11-05 1200 personal.md', 'personal journal');
  fx.write({ sessionsVault: shared }, '.agents', 'skills', 'session-handoff', 'config.json');
  const result = run({ target });
  assert.equal(result.status, 'complete', JSON.stringify(result));
  assert.equal(result.moved.length, 3);
  assert.equal(fs.readFileSync(path.join(shared, 'three/private.md'), 'utf8'), 'personal');
  assert.equal(fs.readFileSync(path.join(shared, 'journal/2026-11-05 1200 personal.md'), 'utf8'), 'personal journal');
});

test('journal cannot introduce an unconfigured source root even with recognizable files', () => {
  const source = root('exonous-vault'); const target = root('central');
  write(source, 'repo/memory/doc/a.md');
  const stop = Object.create(fs); stop.unlinkSync = () => { throw new Error('interruption'); };
  assert.equal(run({ target, fs: stop }).status, 'pending-cleanup');
  const unrelated = root('unrelated-vault');
  const personal = write(unrelated, 'private/memory/doc/a.md', 'personal');
  const journal = fx.readJson('.claude', 'exonous', 'state', 'vault-consolidation.json');
  journal.sources.push(fs.realpathSync(unrelated));
  fx.write(journal, '.claude', 'exonous', 'state', 'vault-consolidation.json');
  assert.equal(run({ target }).status, 'blocked');
  assert.equal(fs.readFileSync(personal, 'utf8'), 'personal');
});

test('replaced source identity blocks resumed cleanup even when bytes and timestamp match', () => {
  const source = root('exonous-vault'); const target = root('central');
  const file = write(source, 'repo/memory/doc/a.md', 'original');
  const stop = Object.create(fs); stop.unlinkSync = () => { throw new Error('interruption'); };
  assert.equal(run({ target, fs: stop }).status, 'pending-cleanup');
  const stat = fs.statSync(file);
  const replacement = write(source, 'replacement.tmp', 'original');
  fs.utimesSync(replacement, stat.atime, stat.mtime); fs.renameSync(replacement, file);
  assert.equal(run({ target }).status, 'blocked');
  assert.equal(fs.readFileSync(file, 'utf8'), 'original');
});

test('resume reverifies journal destinations whose original was already cleaned up', () => {
  const source = root('exonous-vault'); const target = root('central');
  write(source, 'repo/memory/doc/a.md', 'first');
  const pending = write(source, 'repo/sessions/b.md', 'second');
  let count = 0; const io = Object.create(fs);
  io.unlinkSync = (file) => { if (++count === 2) throw new Error('stop'); fs.unlinkSync(file); };
  assert.equal(run({ target, fs: io }).status, 'pending-cleanup');
  fs.writeFileSync(path.join(target, 'repo/memory/doc/a.md'), 'corrupted');
  assert.equal(run({ target }).status, 'blocked');
  assert.equal(fs.existsSync(pending), true);
});

test('conflicting transition keeps current, handoff and project-memory on old root until verified switch', () => {
  const source = root('exonous-vault'); const target = root('central');
  fx.write({ vault: source }, '.claude', 'exonous', 'config.json');
  write(source, 'repo/memory/doc/conflict.md', 'source');
  const conflict = write(target, 'repo/memory/doc/conflict.md', 'target');
  const pm = (...args) => execFileSync(process.execPath, [path.join(__dirname, '../assets/skills/project-memory/project-memory.mjs'), ...args, '--project', 'repo'], { cwd: fx.home(), env: process.env, encoding: 'utf8' });
  pm('add', 'doc', '--title', 'Original proof', '--body', 'old central content');
  const handoff = require('../src/lib/handoff');
  const options = { ctx: ctx(), cwd: fx.home() };
  const saved = handoff.save({ v: 1, k: 'full', g: [['work', 'proof', 'test passed'], ['work', 'next', 'review']] }, options);
  assert.equal(run({ target }).status, 'conflict');
  assert.equal(current(ctx()).path, source);
  assert.equal(handoff.latest(options).path, saved.path);
  assert.match(pm('list'), /Original proof/);
  fs.unlinkSync(conflict);
  assert.equal(run({ target }).status, 'complete');
  assert.equal(current(ctx()).path, target);
  assert.equal(path.dirname(path.dirname(handoff.latest(options).path)), target);
  assert.match(pm('list'), /Original proof/);
  assert.equal(fs.existsSync(saved.path), false);
});

test('known child session source flattens safely into central target and resumes interrupted cleanup', () => {
  const target = root('central'); const source = root('central/sessoes');
  fx.write({ sessionsVault: source }, '.agents', 'skills', 'session-handoff', 'config.json');
  const name = 'avulsas/2025-01-01 1200 handoff.md';
  const file = write(source, name, '---\ntipo: sessao\n---\nlegacy state');
  const when = new Date('2025-01-01T12:00:00Z'); fs.utimesSync(file, when, when);
  const stop = Object.create(fs); stop.unlinkSync = () => { throw new Error('interrupted'); };
  assert.equal(run({ target, fs: stop }).status, 'pending-cleanup');
  assert.equal(fs.statSync(path.join(target, name)).mtimeMs, when.getTime());
  assert.equal(run({ target }).status, 'complete');
  assert.equal(fs.existsSync(file), false);
  const latest = require('../src/lib/handoff').latest({ ctx: ctx(), cwd: fx.home() });
  assert.equal(latest.path, path.join(target, name));
  assert.equal(run({ target }).status, 'complete');
});

test('a child-source destination cannot alias any source root', () => {
  const target = root('central'); const source = root('central/sessoes');
  fx.write({ sessionsVault: source }, '.agents', 'skills', 'session-handoff', 'config.json');
  const file = write(source, 'sessoes/memory/doc/a.md', 'source alias');
  assert.equal(run({ target }).status, 'blocked');
  assert.equal(fs.existsSync(file), true);
  assert.equal(fs.existsSync(fx.home('.claude', 'exonous', 'config.json')), false);
  assert.equal(fs.existsSync(path.join(source, 'memory/doc/a.md')), false);
});

test('destinations cannot map into a different known source root', () => {
  const target = root('central'); const first = root('central/sessoes'); const second = root('central/archive');
  fx.write({ sessionsVault: first }, '.agents', 'skills', 'session-handoff', 'config.json');
  fx.write({ sessionsVault: second }, '.claude', 'skills', 'session-handoff', 'config.json');
  const file = write(first, 'archive/memory/doc/a.md', 'cross-source alias');
  assert.equal(run({ target }).status, 'blocked');
  assert.equal(fs.existsSync(file), true);
  assert.equal(fs.existsSync(path.join(second, 'memory/doc/a.md')), false);
});
