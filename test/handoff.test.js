'use strict';

require('./helpers/tmp-cleanup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const fx = require('./helpers/adapter-fixture');
const { vaultContext } = require('../src/vault-cli');
fx.useFixtureHome();
const handoff = () => require('../src/lib/handoff');
const body = (k = 'full') => ({ v: 1, k, g: [['work', 'state', 'implemented'], ['work', 'proof', 'node --test: passed'], ['work', 'next', 'review']] });
const opts = () => ({ cwd: fx.home(), ctx: vaultContext({ platform: process.platform === 'win32' ? 'win32' : 'linux', homedir: fx.home(), isWsl: false }) });
const REGISTRY_DIR = process.platform === 'win32' ? ['AppData', 'Roaming', 'obsidian'] : ['.config', 'obsidian'];
function vault(name) { const p = fx.home(name); fs.mkdirSync(p, { recursive: true }); return p; }
function config(value) { fx.write(value, '.claude', 'exonous', 'config.json'); }

test('save and latest use the central vault and ignore newer unmigrated legacy notes', () => {
  const preferred = vault('exonous-vault');
  const legacy = vault('legacy');
  config({ vault: preferred, sessionsVault: legacy });
  const saved = handoff().save(body(), { ...opts(), now: '2026-11-05T12:00:00Z' });
  assert.equal(saved.status, 'saved');
  assert.equal(saved.vault, preferred);
  fs.mkdirSync(path.join(legacy, 'avulsas'));
  const newer = path.join(legacy, 'avulsas', 'new.md');
  fs.writeFileSync(newer, JSON.stringify({ ...body('pr'), ts: '2026-11-05T13:00:00Z', r: 'avulsas', b: '', h: '' }));
  assert.equal(handoff().latest(opts()).path, saved.path);
});

test('missing explicit roots stay observable without redirect; existing registry works when unconfigured', () => {
  config({ vault: fx.home('missing') });
  assert.throws(() => handoff().save(body(), opts()), /unavailable/);
  assert.equal(fs.existsSync(fx.home('missing')), false);
  assert.equal(fs.existsSync(fx.home('exonous-vault')), false);
  const root = vault('obsidian');
  fx.write({ vaults: { x: { path: root, open: true } } }, ...REGISTRY_DIR, 'obsidian.json');
  config({});
  assert.equal(handoff().save(body(), opts()).vault, root);
});

test('legacy filename precision beats date-only metadata and touched mtime', () => {
  const root = vault('exonous-vault');
  const dir = path.join(root, 'avulsas'); fs.mkdirSync(dir);
  const older = path.join(dir, '2026-11-04 2359 — old.md');
  const newer = path.join(dir, '2026-11-05 1200 — new.md');
  fs.writeFileSync(older, '---\ndata: 2026-11-04\n---\nold');
  fs.writeFileSync(newer, '---\ndata: 2026-11-05\n---\nnew');
  fs.utimesSync(older, new Date('2030-01-01'), new Date('2030-01-01'));
  assert.equal(handoff().latest(opts()).path, newer);
});

test('save validates graphs, preserves colliding timestamps and reports unsupported versions', () => {
  const root = vault('exonous-vault');
  assert.throws(() => handoff().save({ v: 1, k: 'full', g: [] }, opts()), /graph/);
  const settings = { ...opts(), now: '2026-11-05T12:00:00Z' };
  const one = handoff().save(body(), settings);
  const two = handoff().save(body(), settings);
  assert.notEqual(one.path, two.path);
  assert.equal(fs.readFileSync(one.path, 'utf8').split('\n').filter(Boolean).length, 1);
  fs.writeFileSync(path.join(root, 'avulsas', 'future.md'), JSON.stringify({ v: 2, ts: '2027-01-01T00:00:00Z' }));
  assert.equal(handoff().latest(opts()).status, 'unsupported-version');
});

test('timestamps reject impossible calendar dates and malformed graphs fail without echoing data', () => {
  vault('exonous-vault');
  assert.throws(() => handoff().save(body(), { ...opts(), now: '2026-02-30T12:00:00Z' }), /timestamp/);
  assert.throws(() => handoff().save({ ...body(), g: [['x', 'next', 'secret-value']] }, opts()), /proof/);
  fx.write('{"secret":"secret-value", bad}', '.claude', 'exonous', 'config.json');
  assert.throws(() => handoff().latest(opts()), (err) => !err.message.includes('secret-value'));
});

test('a session folder symlink cannot redirect writes outside the selected vault', { skip: process.platform === 'win32' }, () => {
  const root = vault('exonous-vault');
  const outside = vault('outside');
  fs.symlinkSync(outside, path.join(root, 'avulsas'));
  assert.throws(() => handoff().save(body(), opts()), /folder/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('resume ranks recorded timestamps over mtime, deduplicates roots and breaks ties by full path', () => {
  const root = vault('exonous-vault');
  config({ vault: root, sessionsVault: `${root}${path.sep}.` });
  const folder = path.join(root, 'avulsas'); fs.mkdirSync(folder);
  const note = (name, ts) => { const file = path.join(folder, name); fs.writeFileSync(file, JSON.stringify({ ...body(), ts, r: 'avulsas', b: '', h: '' })); return file; };
  const old = note('old.md', '2026-11-05T12:00:00Z');
  const a = note('a.md', '2026-11-06T12:00:00Z');
  const z = note('z.md', '2026-11-06T12:00:00Z');
  fs.utimesSync(old, new Date('2030-01-01'), new Date('2030-01-01'));
  assert.equal(handoff().latest(opts()).path, z);
  assert.ok(fs.existsSync(a));
});

test('main checkout and worktree share repo identity and unrelated graph notes are ignored', () => {
  vault('exonous-vault');
  const main = vault('project');
  const git = (args, cwd = main) => execFileSync('git', args, { cwd, env: { ...process.env, GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' }, stdio: 'pipe' });
  git(['init', '-q']);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'fixture', '--allow-empty']);
  const worktree = fx.home('worktree');
  git(['worktree', 'add', '-qb', 'feature', worktree]);
  const saved = handoff().save(body(), { ...opts(), cwd: worktree });
  assert.equal(path.basename(path.dirname(saved.path)), 'project');
  const content = JSON.parse(fs.readFileSync(saved.path, 'utf8'));
  assert.equal(content.r, 'project');
  assert.equal(content.b, 'feature');
  assert.match(content.h, /^[a-f0-9]{40,64}$/);
  fs.writeFileSync(path.join(path.dirname(saved.path), 'unrelated.md'), JSON.stringify({ ...content, ts: '2030-01-01T00:00:00Z', r: 'other' }));
  assert.equal(handoff().latest({ ...opts(), cwd: main }).path, saved.path);
});

test('legacy session roots are migration inputs, not destinations', () => {
  const legacy = vault('legacy');
  fx.write({ sessionsVault: legacy }, '.agents', 'skills', 'session-handoff', 'config.json');
  assert.deepEqual(handoff().save(body(), opts()), { status: 'not-saved', reason: 'no-vault' });
  const registered = vault(path.join('elsewhere', 'exonous-vault'));
  fx.write({ vaults: { a: { path: registered } } }, ...REGISTRY_DIR, 'obsidian.json');
  config({ vault: registered });
  assert.equal(handoff().save(body(), opts()).vault, registered);
});

test('existing home exonous vault stays discoverable when Documents appears', () => {
  const root = vault('exonous-vault');
  vault('Documents');
  assert.equal(handoff().save(body(), opts()).vault, root);
});

test('git suffix cannot turn repository folder into traversal', () => {
  const root = vault('exonous-vault');
  const repo = vault('...git');
  execFileSync('git', ['init', '-q'], { cwd: repo, stdio: 'pipe' });
  assert.throws(() => handoff().save(body(), { ...opts(), cwd: repo }), /repository/);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('graph secrets are scrubbed on save and legacy secrets on resume; oversize notes fail explicitly', () => {
  const root = vault('exonous-vault');
  const secret = `ghp_${'a'.repeat(30)}`;
  const saved = handoff().save({ ...body(), g: [...body().g, ['work', 'evidence', secret]] }, opts());
  assert.equal(fs.readFileSync(saved.path, 'utf8').includes(secret), false);
  const legacy = path.join(root, 'avulsas', '2030-01-01 1200 legacy.md');
  fs.writeFileSync(legacy, `old ${secret}`);
  assert.equal(handoff().latest(opts()).content.includes(secret), false);
  fs.writeFileSync(legacy, 'x'.repeat(1024 * 1024 + 1));
  assert.throws(() => handoff().latest(opts()), /too large/);
});

test('unsupported foreign version is reported without emitting hostile version data', () => {
  const root = vault('exonous-vault');
  fs.mkdirSync(path.join(root, 'avulsas'));
  const secret = `ghp_${'b'.repeat(30)}`;
  fs.writeFileSync(path.join(root, 'avulsas', 'future.md'), JSON.stringify({ v: { token: secret, [secret]: 'hostile key' }, ts: '2030-01-01T00:00:00Z' }));
  const result = handoff().latest(opts());
  assert.equal(result.status, 'unsupported-version');
  assert.equal(result.version, null);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('unrelated repo Markdown never outranks or blocks a real legacy handoff', () => {
  const root = vault('exonous-vault'); const folder = path.join(root, 'avulsas'); fs.mkdirSync(folder);
  const actual = path.join(folder, '2026-11-05 1200 handoff.md'); fs.writeFileSync(actual, '# work');
  fs.writeFileSync(path.join(folder, 'README.md'), '# fresh project documentation');
  fs.writeFileSync(path.join(folder, 'architecture.md'), '{ ordinary Markdown');
  assert.equal(handoff().latest(opts()).path, actual);
});

const prBody = (url = 'https://github.com/acme/project/pull/42') => ({ v: 1, k: 'pr', g: [['pr', 'url', url], ['pr', 'proof', 'created'], ['pr', 'next', 'review']] });

test('PR handoffs publish one complete deterministic note and preserve the first record', () => {
  const root = vault('exonous-vault');
  const one = handoff().save(prBody(), { ...opts(), now: '2026-11-05T12:00:00Z' });
  const before = fs.readFileSync(one.path, 'utf8');
  const two = handoff().save({ ...prBody(), g: [...prBody().g, ['pr', 'did', 'later value']] }, { ...opts(), now: '2026-11-05T13:00:00Z' });
  assert.equal(two.status, 'already-saved');
  assert.equal(two.path, one.path);
  assert.equal(fs.readFileSync(one.path, 'utf8'), before);
  assert.match(path.basename(one.path), /^pr-[a-f0-9]{64}\.md$/);
  assert.deepEqual(fs.readdirSync(path.join(root, 'avulsas')), [path.basename(one.path)]);
});

test('PR handoffs reject noncanonical and ambiguous URLs and corrupted existing envelopes', () => {
  vault('exonous-vault');
  for (const url of ['https://example.test/acme/project/pull/42', 'https://github.com/acme/project/pull/0', 'https://github.com/acme/project/pull/01', 'https://github.com/acme/project/pull/42?token=secret', 'https://github.com/acme/../pull/1', 'https://github.com/acme/project/pull/42\n']) assert.throws(() => handoff().save(prBody(url), opts()), /URL/);
  assert.throws(() => handoff().save(body('pr'), opts()), /URL/);
  assert.throws(() => handoff().save({ ...prBody(), g: [...prBody().g, ['pr', 'url', 'https://github.com/acme/project/pull/43']] }, opts()), /URL/);
  const saved = handoff().save(prBody(), opts());
  fs.writeFileSync(saved.path, '{broken');
  assert.throws(() => handoff().save(prBody(), opts()), /existing PR handoff/);
  assert.equal(fs.readFileSync(saved.path, 'utf8'), '{broken');
});
