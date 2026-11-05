#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { test } = require('node:test');
const fx = require('./helpers/adapter-fixture');
const { installVault, promptVault } = require('../src/vault-cli');
const { install } = require('../src/install');
const { uninstall } = require('../src/uninstall');

fx.useFixtureHome();

const BIN = path.join(__dirname, '..', 'bin', 'exonous.js');
// Windows paths are relative under linux rules, so win32 keeps its own platform and registry location.
const NATIVE = process.platform === 'win32' ? { platform: 'win32' } : { platform: 'linux' };
const REGISTRY_DIR = process.platform === 'win32' ? ['AppData', 'Roaming', 'obsidian'] : ['.config', 'obsidian'];
const config = () => fx.home('.claude', 'exonous', 'config.json');

function cli(args, env = {}) {
  const res = spawnSync(process.execPath, [BIN, ...args], { cwd: os.tmpdir(), env: { ...process.env, ...env }, encoding: 'utf8' });
  return { code: res.status, out: res.stdout, err: res.stderr };
}

function registry(vaults) {
  const entries = {};
  vaults.forEach((v, i) => {
    fs.mkdirSync(v.path, { recursive: true });
    entries[`id${i}`] = v;
  });
  fx.write({ vaults: entries }, ...REGISTRY_DIR, 'obsidian.json');
}

function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out[path.relative(dir, full)] = fs.readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return out;
}

test('install picks the open Obsidian vault from the target home registry and records it', () => {
  const recent = fx.home('notes', 'recent');
  const open = fx.home('notes', 'open');
  registry([{ path: recent, ts: 200 }, { path: open, ts: 100, open: true }]);
  const logs = [];
  const result = installVault({ log: (m) => logs.push(m), ctx: NATIVE });
  assert.deepStrictEqual(result, { path: open, kind: 'obsidian' });
  assert.strictEqual(JSON.parse(fs.readFileSync(config(), 'utf8')).vault, open);
  assert.deepStrictEqual(logs, [`vault: ${open} (obsidian)`]);
});

test('install without Obsidian creates fallback, then consolidates into a later user vault', () => {
  fs.mkdirSync(fx.home('Documents'));
  const fallback = fx.home('Documents', 'exonous-vault');
  assert.deepStrictEqual(installVault({ ctx: NATIVE }), { path: fallback, kind: 'fallback' });
  assert.ok(fs.existsSync(path.join(fallback, 'README.md')));
  assert.ok(!fs.existsSync(path.join(fallback, '.obsidian')), 'no Obsidian: plain folder');
  fs.writeFileSync(path.join(fallback, 'README.md'), 'mine\n');
  fs.mkdirSync(path.join(fallback, 'demo', 'memory', 'doc'), { recursive: true });
  const original = path.join(fallback, 'demo', 'memory', 'doc', 'doc-0001.md');
  fs.writeFileSync(original, 'owned note');
  registry([{ path: fx.home('later'), ts: 1, open: true }]);
  const logs = [];
  assert.deepStrictEqual(installVault({ log: (m) => logs.push(m), ctx: NATIVE }), { path: fx.home('later'), kind: 'obsidian' });
  assert.deepStrictEqual(logs, [`vault: ${fx.home('later')} (obsidian)`]);
  assert.strictEqual(fs.readFileSync(path.join(fallback, 'README.md'), 'utf8'), 'mine\n');
  assert.ok(!fs.existsSync(original));
  assert.strictEqual(fs.readFileSync(fx.home('later', 'demo', 'memory', 'doc', 'doc-0001.md'), 'utf8'), 'owned note');
});

test('a configured vault whose folder is missing (unmounted drive) is kept with a warning, nothing created', () => {
  const gone = fx.home('unmounted', 'vault');
  const saved = `${JSON.stringify({ vault: gone, autoUpdate: false })}\n`;
  fx.write(saved, '.claude', 'exonous', 'config.json');
  registry([{ path: fx.home('other'), ts: 1, open: true }]);
  const logs = [];
  assert.deepStrictEqual(installVault({ log: (m) => logs.push(m), ctx: NATIVE }), { path: gone, kind: 'missing' });
  assert.deepStrictEqual(logs, [`WARN: vault: ${gone} not found — keeping config; fix with \`exonous vault detect\` / \`exonous vault set <path>\``]);
  assert.strictEqual(fs.readFileSync(config(), 'utf8'), saved);
  assert.ok(!fs.existsSync(gone));
  assert.ok(!fs.existsSync(fx.home('exonous-vault')));
  assert.match(cli(['vault', 'detect']).out, /configured vault .*unmounted.* \(exonous-config\) not found/);
  assert.match(cli(['doctor']).out, /✗ vault .*unmounted.* via exonous-config — missing\)/);
});

test('a legacy skill user vault is adopted into central config', () => {
  const legacy = fx.home('legacy-vault');
  fs.mkdirSync(legacy);
  fx.write({ vault: legacy }, '.claude', 'skills', 'project-memory', 'config.json');
  assert.deepStrictEqual(installVault({ ctx: NATIVE }), { path: legacy, kind: 'existing' });
  assert.strictEqual(JSON.parse(fs.readFileSync(config(), 'utf8')).vault, legacy);
});

test('dry run reports the choice and writes nothing', () => {
  const logs = [];
  const result = installVault({ dryRun: true, log: (m) => logs.push(m), ctx: NATIVE });
  assert.strictEqual(result.kind, 'fallback');
  assert.ok(!fs.existsSync(result.path));
  assert.ok(!fs.existsSync(config()));
  assert.match(logs[0], /dry run, nothing written/);
});

test('an explicit choice wins over detection', () => {
  registry([{ path: fx.home('a'), ts: 1, open: true }]);
  const picked = fx.home('b');
  fs.mkdirSync(picked);
  assert.deepStrictEqual(installVault({ choice: picked, ctx: NATIVE }), { path: picked, kind: 'obsidian' });
});

test('on a TTY with several vaults the user picks one', async () => {
  registry([{ path: fx.home('one'), ts: 2 }, { path: fx.home('two'), ts: 1 }]);
  const asked = [];
  const picked = await promptVault({ ctx: NATIVE, isTTY: true, ask: async (q) => { asked.push(q); return '2'; } });
  assert.strictEqual(picked, fx.home('two'));
  assert.strictEqual(asked.length, 1);
  installVault({ choice: picked, ctx: NATIVE });
  assert.strictEqual(await promptVault({ ctx: NATIVE, isTTY: true, ask: async () => assert.fail('configured: no prompt') }), null);
});

test('a malformed config.json is a warning: install goes on and the file is left alone', () => {
  fx.write('{oops', '.claude', 'exonous', 'config.json');
  const logs = [];
  const result = install({ external: false, vault: true, execPath: process.execPath, log: (m) => logs.push(m) });
  assert.ok(logs.some((m) => /^WARN: vault incomplete: .*not valid JSON/.test(m)), logs.join('\n'));
  assert.ok(logs.some((m) => /^install done/.test(m)));
  assert.ok(result);
  assert.strictEqual(fs.readFileSync(config(), 'utf8'), '{oops');
});

test('programmatic install leaves the vault alone unless asked', () => {
  const logs = [];
  install({ external: false, execPath: process.execPath, log: (m) => logs.push(m) });
  assert.ok(!logs.some((m) => /^vault:/.test(m)));
  assert.ok(!fs.existsSync(config()));
});

test('install --dry-run from the CLI creates no vault', () => {
  const res = cli(['install', '--dry-run']);
  assert.strictEqual(res.code, 0, res.err);
  assert.match(res.out, /vault: .*exonous-vault \(fallback\) — dry run/);
  assert.ok(!fs.existsSync(fx.home('exonous-vault')));
  assert.ok(!fs.existsSync(config()));
});

test('uninstall leaves the vault and config.json untouched', async () => {
  fs.mkdirSync(fx.home('.claude'));
  assert.strictEqual(cli(['install', '--quiet']).code, 0);
  const vault = fx.home('exonous-vault');
  fs.writeFileSync(path.join(vault, 'note.md'), '# note\n[[README]]\n');
  const before = snapshot(vault);
  const savedConfig = fs.readFileSync(config(), 'utf8');
  assert.strictEqual(await uninstall({ yes: true, log: () => {} }), 0);
  assert.deepStrictEqual(snapshot(vault), before);
  assert.strictEqual(fs.readFileSync(config(), 'utf8'), savedConfig);
  assert.ok(!/vault/i.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'uninstall.js'), 'utf8')), 'uninstall.js never touches the vault');
});

test('vault detect lists the registries searched and the vaults found, writing nothing', () => {
  const res = cli(['vault', 'detect']);
  assert.strictEqual(res.code, 0, res.err);
  assert.match(res.out, /Obsidian registries searched:/);
  assert.match(res.out, /no Obsidian vault found — install would create/);
  assert.ok(!fs.existsSync(config()));
});

test('vault set validates the path, expands ~ and records it', () => {
  const missing = cli(['vault', 'set', path.join(os.tmpdir(), 'no-such-vault-xyz')]);
  assert.strictEqual(missing.code, 1);
  assert.match(missing.err, /does not exist — create it first or pass --create/);
  fx.write('x', 'afile');
  const file = cli(['vault', 'set', fx.home('afile')]);
  assert.strictEqual(file.code, 1);
  assert.match(file.err, /is a file, not a folder/);
  assert.strictEqual(cli(['vault', 'set']).code, 2);
  const created = cli(['vault', 'set', '~/new-vault', '--create']);
  assert.strictEqual(created.code, 0, created.err);
  assert.ok(fs.statSync(fx.home('new-vault')).isDirectory());
  assert.strictEqual(JSON.parse(fs.readFileSync(config(), 'utf8')).vault, fx.home('new-vault'));
  const shown = cli(['vault']);
  assert.strictEqual(shown.code, 0);
  assert.match(shown.out, /source: exonous-config/);
  assert.match(shown.out, /exists: yes/);
  assert.match(cli(['vault', 'show'], { PROJECT_MEMORY_VAULT: fx.home('elsewhere') }).out, /source: env\nexists: no/);
});

test('vault graph writes graph.html and graph.json, and fails without a vault', () => {
  const none = cli(['vault', 'graph']);
  assert.strictEqual(none.code, 1);
  assert.match(none.err, /no vault configured/);
  const vault = fx.home('graph-vault');
  fs.mkdirSync(vault);
  fs.writeFileSync(path.join(vault, 'a.md'), '# A\nsee [[b]]\n');
  fs.writeFileSync(path.join(vault, 'b.md'), '# B\nback to [[a]]\n');
  assert.strictEqual(cli(['vault', 'set', vault]).code, 0);
  const res = cli(['vault', 'graph']);
  assert.strictEqual(res.code, 0, res.err);
  for (const file of ['graph.html', 'graph.json']) {
    assert.ok(fs.existsSync(path.join(vault, '.exonous', file)), file);
    assert.ok(res.out.includes(path.join(vault, '.exonous', file)), file);
    assert.ok(!fs.existsSync(path.join(vault, file)), `${file} not in the vault root`);
  }
  assert.ok(JSON.parse(fs.readFileSync(path.join(vault, '.exonous', 'graph.json'), 'utf8')).edges.length >= 1);
});

test('an unknown vault subcommand prints usage', () => {
  const res = cli(['vault', 'nope']);
  assert.strictEqual(res.code, 2);
  assert.match(res.err, /usage: exonous vault/);
});

test('consolidate CLI previews without writes, applies owned moves and set blocks conflicting switches', () => {
  const source = fx.home('exonous-vault'); const target = fx.home('central');
  fs.mkdirSync(path.join(source, 'demo', 'memory', 'doc'), { recursive: true }); fs.mkdirSync(target);
  const file = path.join(source, 'demo', 'memory', 'doc', 'a.md'); fs.writeFileSync(file, 'first');
  const preview = cli(['vault', 'consolidate', target, '--dry-run']);
  assert.strictEqual(preview.code, 0, preview.err);
  assert.strictEqual(JSON.parse(preview.out).entries.length, 1);
  assert.ok(!fs.existsSync(config()));
  assert.strictEqual(cli(['vault', 'consolidate', target]).code, 2);
  const applied = cli(['vault', 'consolidate', target, '--apply']);
  assert.strictEqual(applied.code, 0, applied.err);
  assert.strictEqual(JSON.parse(applied.out).status, 'complete');
  assert.ok(!fs.existsSync(file));
  const next = fx.home('next'); fs.mkdirSync(path.join(next, 'demo', 'memory', 'doc'), { recursive: true });
  fs.writeFileSync(path.join(next, 'demo', 'memory', 'doc', 'a.md'), 'different');
  assert.strictEqual(cli(['vault', 'set', next]).code, 1);
  assert.strictEqual(JSON.parse(fs.readFileSync(config(), 'utf8')).vault, target);
});
