#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');
const vault = require('../src/lib/vault');

function memfs(files = {}, dirs = []) {
  const allDirs = new Set(dirs);
  for (const p of [...Object.keys(files), ...dirs]) {
    for (let d = path.posix.dirname(p); d !== path.posix.dirname(d); d = path.posix.dirname(d)) allDirs.add(d);
  }
  const enoent = (p) => Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
  return {
    existsSync: (p) => p in files || allDirs.has(p),
    readFileSync: (p) => {
      if (!(p in files)) throw enoent(p);
      return files[p];
    },
    statSync: (p) => {
      if (allDirs.has(p)) return { isDirectory: () => true };
      if (p in files) return { isDirectory: () => false };
      throw enoent(p);
    },
    readdirSync: (raw) => {
      const p = raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
      if (!allDirs.has(p)) throw enoent(p);
      const names = new Set();
      for (const q of [...Object.keys(files), ...allDirs]) if (path.posix.dirname(q) === p && q !== p) names.add(path.posix.basename(q));
      return [...names];
    },
  };
}

const noExec = () => {
  throw new Error('no cmd.exe');
};
const registry = (vaults) => JSON.stringify({ vaults });

test('darwin reads the registry under Application Support', () => {
  assert.deepStrictEqual(vault.registryPaths({ platform: 'darwin', homedir: '/Users/a', env: {} }), [
    '/Users/a/Library/Application Support/obsidian/obsidian.json',
  ]);
});

test('linux checks XDG (default ~/.config), Flatpak and Snap in order', () => {
  const tail = ['/home/a/.var/app/md.obsidian.Obsidian/config/obsidian/obsidian.json', '/home/a/snap/obsidian/current/.config/obsidian/obsidian.json'];
  assert.deepStrictEqual(vault.registryPaths({ platform: 'linux', homedir: '/home/a', env: {} }), ['/home/a/.config/obsidian/obsidian.json', ...tail]);
  assert.deepStrictEqual(vault.registryPaths({ platform: 'linux', homedir: '/home/a', env: { XDG_CONFIG_HOME: '/cfg' } }), ['/cfg/obsidian/obsidian.json', ...tail]);
  assert.deepStrictEqual(vault.registryPaths({ platform: 'linux', homedir: '/home/a', env: { XDG_CONFIG_HOME: 'relative' } })[0], '/home/a/.config/obsidian/obsidian.json');
});

test('win32 uses APPDATA, falling back to USERPROFILE\\AppData\\Roaming', () => {
  assert.deepStrictEqual(vault.registryPaths({ platform: 'win32', homedir: 'C:\\Users\\a', env: { APPDATA: 'D:\\Roam' } }), ['D:\\Roam\\obsidian\\obsidian.json']);
  assert.deepStrictEqual(vault.registryPaths({ platform: 'win32', homedir: 'C:\\Users\\h', env: { USERPROFILE: 'C:\\Users\\a' } }), [
    'C:\\Users\\a\\AppData\\Roaming\\obsidian\\obsidian.json',
  ]);
});

test('toLocalPath translates Windows paths only on WSL', () => {
  const wsl = { platform: 'linux', isWsl: true, env: {}, fs: memfs() };
  assert.strictEqual(vault.toLocalPath('C:\\Users\\a\\Vault', wsl), '/mnt/c/Users/a/Vault');
  assert.strictEqual(vault.toLocalPath('d:\\Notes', wsl), '/mnt/d/Notes');
  assert.strictEqual(vault.toLocalPath('\\\\wsl.localhost\\Ubuntu\\home\\a\\v', { ...wsl, env: { WSL_DISTRO_NAME: 'Ubuntu' } }), '/home/a/v');
  assert.strictEqual(vault.toLocalPath('\\\\wsl$\\Debian\\home\\a\\v', { ...wsl, env: { WSL_DISTRO_NAME: 'Ubuntu' } }), '\\\\wsl$\\Debian\\home\\a\\v');
  assert.strictEqual(vault.toLocalPath('C:\\Users\\a\\Vault', { platform: 'linux', isWsl: false }), 'C:\\Users\\a\\Vault');
  assert.strictEqual(vault.toLocalPath('/home/a/v', wsl), '/home/a/v');
});

test('toLocalPath honors the wsl.conf automount root', () => {
  const fsx = memfs({ '/etc/wsl.conf': '[boot]\nroot = /nope/\n[automount]\nenabled = true\nroot = /win # custom\n' });
  assert.strictEqual(vault.toLocalPath('C:\\V', { platform: 'linux', isWsl: true, env: {}, fs: fsx }), '/win/c/V');
});

test('WSL adds the Windows-side registry from WSL_USERPROFILE and translates its vault paths', () => {
  const win = '/mnt/c/Users/a/AppData/Roaming/obsidian/obsidian.json';
  const fsx = memfs({ [win]: registry({ x: { path: 'D:\\Vaults\\Work', ts: 5, open: true } }) }, ['/mnt/d/Vaults/Work']);
  const ctx = { platform: 'linux', isWsl: true, homedir: '/home/a', env: { WSL_USERPROFILE: 'C:\\Users\\a' }, fs: fsx, exec: noExec };
  assert.strictEqual(vault.registryPaths(ctx).at(-1), win);
  assert.deepStrictEqual(vault.detect(ctx), [{ path: '/mnt/d/Vaults/Work', ts: 5, open: true }]);
});

test('WSL asks cmd.exe for USERPROFILE when the env var is missing', () => {
  const ctx = { platform: 'linux', isWsl: true, homedir: '/home/a', env: {}, fs: memfs(), exec: () => 'C:\\Users\\Bob\r\n' };
  assert.strictEqual(vault.registryPaths(ctx).at(-1), '/mnt/c/Users/Bob/AppData/Roaming/obsidian/obsidian.json');
});

test('WSL scans /mnt/*/Users when no profile is known, skipping shared profiles', () => {
  const reg = (d, u) => `/mnt/${d}/Users/${u}/AppData/Roaming/obsidian/obsidian.json`;
  const fsx = memfs({ [reg('c', 'Public')]: '{}', [reg('c', 'Default')]: '{}', [reg('d', 'eve')]: '{}' }, ['/mnt/c/Users/All Users', '/mnt/wslg']);
  const ctx = { platform: 'linux', isWsl: true, homedir: '/home/a', env: {}, fs: fsx, exec: noExec };
  assert.deepStrictEqual(vault.registryPaths(ctx).slice(3), [reg('d', 'eve')]);
});

test('WSL without Obsidian anywhere detects nothing', () => {
  const ctx = { platform: 'linux', isWsl: true, homedir: '/home/a', env: {}, fs: memfs({}, ['/mnt/c/Users/a']), exec: noExec };
  assert.strictEqual(vault.registryPaths(ctx).length, 3);
  assert.deepStrictEqual(vault.detect(ctx), []);
});

test('detect drops stale entries and sorts open first, then most recent', () => {
  const reg = '/home/a/.config/obsidian/obsidian.json';
  const fsx = memfs({
    [reg]: registry({
      a: { path: '/v/old', ts: 1 },
      b: { path: '/v/new', ts: 9 },
      c: { path: '/v/open', ts: 3, open: true },
      d: { path: '/v/gone', ts: 99 },
      e: { ts: 1 },
    }),
  }, ['/v/old', '/v/new', '/v/open']);
  const found = vault.detect({ platform: 'linux', homedir: '/home/a', env: {}, fs: fsx });
  assert.deepStrictEqual(found.map((v) => v.path), ['/v/open', '/v/new', '/v/old']);
});

test('detect skips a malformed registry and keeps reading the others', () => {
  const fsx = memfs({
    '/home/a/.config/obsidian/obsidian.json': '{ not json',
    '/home/a/snap/obsidian/current/.config/obsidian/obsidian.json': registry({ s: { path: '/v/snap', ts: 2 } }),
  }, ['/v/snap']);
  assert.deepStrictEqual(vault.detect({ platform: 'linux', homedir: '/home/a', env: {}, fs: fsx }), [{ path: '/v/snap', ts: 2, open: false }]);
});

test('detect reads the Flatpak registry and a win32 registry', () => {
  const flat = memfs({ '/home/a/.var/app/md.obsidian.Obsidian/config/obsidian/obsidian.json': registry({ f: { path: '/v/f', ts: 1 } }) }, ['/v/f']);
  assert.deepStrictEqual(vault.detect({ platform: 'linux', homedir: '/home/a', env: {}, fs: flat }).map((v) => v.path), ['/v/f']);
  const files = { 'C:\\R\\obsidian\\obsidian.json': registry({ w: { path: 'C:\\V', ts: 1 } }) };
  const winFs = { ...memfs(), existsSync: (p) => p === 'C:\\V', readFileSync: (p) => files[p] ?? (() => { throw new Error('ENOENT'); })() };
  assert.deepStrictEqual(vault.detect({ platform: 'win32', homedir: 'C:\\Users\\a', env: { APPDATA: 'C:\\R' }, fs: winFs }).map((v) => v.path), ['C:\\V']);
});

test('detect skips registry entries whose path is not absolute', () => {
  const fsx = memfs({
    '/home/a/.config/obsidian/obsidian.json': registry({ r: { path: 'v/rel', ts: 9 }, u: { path: '../up', ts: 8 }, a: { path: '/v/abs', ts: 1 } }),
  }, ['v/rel', '../up', '/v/abs']);
  const linuxFs = { ...fsx, existsSync: () => true };
  assert.deepStrictEqual(vault.detect({ platform: 'linux', homedir: '/home/a', env: {}, fs: linuxFs }).map((v) => v.path), ['/v/abs']);
  const files = { 'C:\\R\\obsidian\\obsidian.json': registry({ r: { path: 'V\\rel', ts: 9 }, d: { path: 'C:rel', ts: 8 }, w: { path: 'C:\\V', ts: 1 } }) };
  const winFs = { ...memfs(), existsSync: () => true, readFileSync: (p) => files[p] ?? (() => { throw new Error('ENOENT'); })() };
  assert.deepStrictEqual(vault.detect({ platform: 'win32', homedir: 'C:\\Users\\a', env: { APPDATA: 'C:\\R' }, fs: winFs }).map((v) => v.path), ['C:\\V']);
});

test('detect with zero registries finds nothing', () => {
  assert.deepStrictEqual(vault.detect({ platform: 'darwin', homedir: '/Users/a', env: {}, fs: memfs() }), []);
});

test('choose: zero → null, one → it, many non-TTY → most recent', async () => {
  const a = { path: '/a', ts: 1, open: false };
  const b = { path: '/b', ts: 5, open: false };
  const never = () => assert.fail('must not prompt');
  assert.strictEqual(await vault.choose([], { isTTY: true, ask: never }), null);
  assert.strictEqual(await vault.choose([a], { isTTY: true, ask: never }), a);
  assert.strictEqual(await vault.choose([a, b], { isTTY: false, ask: never }), b);
});

test('choose on a TTY prompts with a numbered list, default most recent', async () => {
  const a = { path: '/a', ts: 1, open: false };
  const b = { path: '/b', ts: 5, open: false };
  let asked = '';
  assert.strictEqual(await vault.choose([a, b], { isTTY: true, ask: (q) => { asked = q; return '2'; } }), a);
  assert.match(asked, /1\) \/b\n {2}2\) \/a/);
  assert.strictEqual(await vault.choose([a, b], { isTTY: true, ask: async () => '' }), b);
  assert.strictEqual(await vault.choose([a, b], { isTTY: true, ask: () => '7' }), b);
});

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'));
}

test('fallbackPath prefers ~/Documents and drops to ~ without it', () => {
  const home = tmpHome();
  assert.strictEqual(vault.fallbackPath({ homedir: home, platform: process.platform }), path.join(home, 'exonous-vault'));
  fs.mkdirSync(path.join(home, 'Documents'));
  assert.strictEqual(vault.fallbackPath({ homedir: home, platform: process.platform }), path.join(home, 'Documents', 'exonous-vault'));
});

test('ensureFallback creates the vault once and never overwrites', () => {
  const dir = path.join(tmpHome(), 'Documents', 'exonous-vault');
  assert.deepStrictEqual(vault.ensureFallback(dir), { path: dir, created: true });
  assert.ok(fs.statSync(path.join(dir, '.obsidian')).isDirectory());
  assert.deepStrictEqual(fs.readdirSync(path.join(dir, '.obsidian')), []);
  assert.match(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), /\[\[README\]\]/);
  fs.writeFileSync(path.join(dir, 'README.md'), 'mine');
  assert.deepStrictEqual(vault.ensureFallback(dir), { path: dir, created: false });
  assert.strictEqual(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), 'mine');
});

test('config round-trip keeps foreign keys and honors EXONOUS_HOME', () => {
  const home = tmpHome();
  const prev = process.env.EXONOUS_HOME;
  process.env.EXONOUS_HOME = home;
  try {
    const file = path.join(home, '.claude', 'exonous', 'config.json');
    assert.deepStrictEqual(vault.readConfig(), {});
    assert.strictEqual(vault.resolve({ env: {} }), null);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ other: { keep: 1 } }));
    vault.writeConfig('/v/main');
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { other: { keep: 1 }, vault: path.resolve('/v/main') });
    assert.strictEqual(vault.resolve({ env: {} }), path.resolve('/v/main'));
    vault.writeConfig(null);
    assert.deepStrictEqual(vault.readConfig(), { other: { keep: 1 } });
    assert.deepStrictEqual(fs.readdirSync(path.dirname(file)), ['config.json']);
  } finally {
    if (prev === undefined) delete process.env.EXONOUS_HOME;
    else process.env.EXONOUS_HOME = prev;
  }
});

test('readConfig and resolve read through the injected fs', () => {
  const fsx = memfs({ '/exo/config.json': JSON.stringify({ vault: '/v/injected', other: 1 }) });
  const linux = { platform: 'linux', fs: fsx };
  assert.deepStrictEqual(vault.readConfig({ ...linux, exoDir: '/exo' }), { vault: '/v/injected', other: 1 });
  assert.strictEqual(vault.resolve({ ...linux, exoDir: '/exo', env: {} }), '/v/injected');
  assert.deepStrictEqual(vault.readConfig({ ...linux, exoDir: '/nowhere' }), {});
});

test('writeConfig creates the exonous dir', () => {
  const exoDir = path.join(tmpHome(), 'deep', 'exonous');
  vault.writeConfig('/v', { exoDir });
  assert.strictEqual(vault.readConfig({ exoDir }).vault, path.resolve('/v'));
});

test('resolve: PROJECT_MEMORY_VAULT beats config; malformed config fails loud', () => {
  const exoDir = tmpHome();
  vault.writeConfig('/from/config', { exoDir });
  assert.strictEqual(vault.resolve({ exoDir, env: { PROJECT_MEMORY_VAULT: '/from/env' } }), '/from/env');
  fs.writeFileSync(path.join(exoDir, 'config.json'), '{ nope');
  assert.throws(() => vault.resolve({ exoDir, env: {} }), /not valid JSON/);
  assert.throws(() => vault.writeConfig('/x', { exoDir }), /not valid JSON/);
  assert.strictEqual(fs.readFileSync(path.join(exoDir, 'config.json'), 'utf8'), '{ nope');
});
