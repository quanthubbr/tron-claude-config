'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const paths = require('./paths');
const { writeAtomic } = require('./writers/markers');

const REGISTRY = 'obsidian.json';
const NOT_A_USER = new Set(['default', 'default user', 'public', 'all users']);

function runCmd(file, args) {
  return execFileSync(file, args, { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
}

/** Fills the injectable context: platform, env, fs, homedir, isWsl, exec, exoDir. */
function context(ctx = {}) {
  const platform = ctx.platform ?? process.platform;
  let wsl = ctx.isWsl;
  if (wsl === undefined) wsl = ctx.platform === undefined && platform === 'linux' && require('./atlas').isWsl();
  return {
    platform,
    env: ctx.env ?? process.env,
    fs: ctx.fs ?? fs,
    homedir: ctx.homedir ?? os.homedir(),
    isWsl: Boolean(wsl),
    exec: ctx.exec ?? runCmd,
    exoDir: ctx.exoDir ?? paths.exoDir(),
  };
}

const pathOf = (c) => (c.platform === 'win32' ? path.win32 : path.posix);

function readText(file, c) {
  try {
    return c.fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function isDir(p, c) {
  try {
    return c.fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listDir(p, c) {
  try {
    return c.fs.readdirSync(p);
  } catch {
    return [];
  }
}

/** WSL automount root from /etc/wsl.conf `[automount] root`, default `/mnt/`. */
function mountRoot(c) {
  const text = readText('/etc/wsl.conf', c);
  let section = '';
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.replace(/[#;].*$/, '').trim();
    const head = /^\[(.+)\]$/.exec(line);
    if (head) section = head[1].trim().toLowerCase();
    const kv = /^root\s*=\s*"?([^"]+?)"?$/.exec(line);
    if (section === 'automount' && kv && kv[1].startsWith('/')) return kv[1].endsWith('/') ? kv[1] : `${kv[1]}/`;
  }
  return '/mnt/';
}

/** On WSL maps `C:\x` to `/mnt/c/x` and `\\wsl$\<this distro>\x` to `/x`; identity elsewhere. */
function toLocalPath(p, ctx) {
  const c = context(ctx);
  if (!c.isWsl || typeof p !== 'string') return p;
  const drive = /^([A-Za-z]):(?:[\\/](.*))?$/.exec(p);
  if (drive) return `${mountRoot(c)}${drive[1].toLowerCase()}/${(drive[2] || '').replace(/\\/g, '/')}`.replace(/\/+$/, '') || '/';
  const unc = /^[\\/]{2}wsl(?:\$|\.localhost)[\\/]([^\\/]+)(?:[\\/](.*))?$/i.exec(p);
  const distro = c.env.WSL_DISTRO_NAME;
  if (unc && (!distro || distro.toLowerCase() === unc[1].toLowerCase())) return `/${(unc[2] || '').replace(/\\/g, '/')}`;
  return p;
}

function windowsProfile(c) {
  const fromEnv = c.env.WSL_USERPROFILE;
  if (fromEnv) return toLocalPath(fromEnv.trim(), c);
  let out = '';
  try {
    out = String(c.exec('cmd.exe', ['/c', 'echo %USERPROFILE%']) || '').trim();
  } catch {
    return null;
  }
  return /^[A-Za-z]:\\/.test(out) ? toLocalPath(out, c) : null;
}

function wslRegistries(c) {
  const tail = ['AppData', 'Roaming', 'obsidian', REGISTRY];
  const profile = windowsProfile(c);
  if (profile) return [path.posix.join(profile, ...tail)];
  const root = mountRoot(c);
  const found = [];
  for (const drive of listDir(root, c).filter((d) => /^[a-z]$/i.test(d)).sort()) {
    const users = path.posix.join(root, drive, 'Users');
    for (const user of listDir(users, c).sort()) {
      if (NOT_A_USER.has(user.toLowerCase())) continue;
      const file = path.posix.join(users, user, ...tail);
      if (c.fs.existsSync(file)) found.push(file);
    }
  }
  return found;
}

/** Ordered `obsidian.json` candidates for this platform. */
function registryPaths(ctx) {
  const c = context(ctx);
  const p = pathOf(c);
  const home = c.homedir;
  if (c.platform === 'darwin') return [p.join(home, 'Library', 'Application Support', 'obsidian', REGISTRY)];
  if (c.platform === 'win32') {
    const appData = c.env.APPDATA || p.join(c.env.USERPROFILE || home, 'AppData', 'Roaming');
    return [p.join(appData, 'obsidian', REGISTRY)];
  }
  const xdg = c.env.XDG_CONFIG_HOME && p.isAbsolute(c.env.XDG_CONFIG_HOME) ? c.env.XDG_CONFIG_HOME : p.join(home, '.config');
  const list = [
    p.join(xdg, 'obsidian', REGISTRY),
    p.join(home, '.var', 'app', 'md.obsidian.Obsidian', 'config', 'obsidian', REGISTRY),
    p.join(home, 'snap', 'obsidian', 'current', '.config', 'obsidian', REGISTRY),
  ];
  if (c.isWsl) list.push(...wslRegistries(c));
  return [...new Set(list)];
}

const byPreference = (a, b) => Number(b.open) - Number(a.open) || b.ts - a.ts;

/** Vaults Obsidian knows about that still exist: `[{ path, ts, open }]`, open first, then most recent. */
function detect(ctx) {
  const c = context(ctx);
  const seen = new Map();
  for (const file of registryPaths(c)) {
    const text = readText(file, c);
    if (text === null) continue;
    let registry;
    try {
      registry = JSON.parse(text);
    } catch {
      continue;
    }
    const vaults = registry && typeof registry.vaults === 'object' && registry.vaults ? Object.values(registry.vaults) : [];
    for (const entry of vaults) {
      if (!entry || typeof entry.path !== 'string') continue;
      const local = toLocalPath(entry.path, c);
      if (!pathOf(c).isAbsolute(local) || seen.has(local) || !c.fs.existsSync(local)) continue;
      seen.set(local, { path: local, ts: Number(entry.ts) || 0, open: entry.open === true });
    }
  }
  return [...seen.values()].sort(byPreference);
}

/** `~/Documents/exonous-vault`, or `~/exonous-vault` when there is no Documents dir. */
function fallbackPath(ctx) {
  const c = context(ctx);
  const p = pathOf(c);
  const docs = p.join(c.homedir, 'Documents');
  return p.join(isDir(docs, c) ? docs : c.homedir, 'exonous-vault');
}

const README = `# exonous vault

Plain Markdown notes written by exonous agents: project memory, session pages, handoffs and docs.
Each project has its own folder; automatic session pages live in \`<project>/sessions/\`.
Run \`exonous vault graph\` for an offline graph. Opening this folder in Obsidian later switches new session links to wikilinks.
`;

/** Creates the plain fallback folder (README stub, no `.obsidian/`: Obsidian is absent); never overwrites. */
function ensureFallback(dir, ctx) {
  const c = context(ctx);
  const p = pathOf(c);
  const existed = isDir(dir, c);
  c.fs.mkdirSync(dir, { recursive: true });
  let wroteReadme = false;
  try {
    c.fs.writeFileSync(p.join(dir, 'README.md'), README, { encoding: 'utf8', flag: 'wx' });
    wroteReadme = true;
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
  return { path: dir, created: !existed || wroteReadme };
}

function defaultAsk(question) {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((done) => rl.question(question, (answer) => {
    rl.close();
    done(answer);
  }));
}

/** 0 → null, 1 → it, many → numbered prompt on a TTY (default most recent), most recent otherwise. */
async function choose(candidates, { isTTY = Boolean(process.stdin.isTTY), ask = defaultAsk } = {}) {
  const list = [...(candidates || [])].sort(byPreference);
  if (list.length <= 1) return list[0] || null;
  if (!isTTY) return list[0];
  const menu = list.map((v, i) => `  ${i + 1}) ${v.path}${v.open ? ' (open)' : ''}`).join('\n');
  const answer = String((await ask(`Obsidian vaults found:\n${menu}\nUse which vault? [1] `)) ?? '').trim();
  const pick = Number(answer);
  return Number.isInteger(pick) && pick >= 1 && pick <= list.length ? list[pick - 1] : list[0];
}

const configFile = (c) => pathOf(c).join(c.exoDir, 'config.json');

/** Unified machine config; `{}` when absent, throws on malformed JSON. */
function readConfig(ctx) {
  const c = context(ctx);
  const file = configFile(c);
  let text;
  try {
    text = c.fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
  let config;
  try {
    config = JSON.parse(text);
  } catch (err) {
    throw new Error(`${file} is not valid JSON (${err.message}) — fix or delete it`);
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error(`${file} must hold a JSON object`);
  return config;
}

/** Sets (or with null removes) the `vault` key, keeping every other key. */
function writeConfig(vault, ctx) {
  const c = context(ctx);
  const config = { ...readConfig(c) };
  if (vault === null || vault === undefined) delete config.vault;
  else config.vault = path.resolve(String(vault));
  writeAtomic(configFile(c), `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

/** `PROJECT_MEMORY_VAULT` env, then config.json `vault`, else null. */
function resolve(ctx) {
  const c = context(ctx);
  if (c.env.PROJECT_MEMORY_VAULT) return c.env.PROJECT_MEMORY_VAULT;
  const { vault } = readConfig(c);
  return typeof vault === 'string' && vault ? vault : null;
}

module.exports = { registryPaths, toLocalPath, detect, fallbackPath, ensureFallback, choose, readConfig, writeConfig, resolve };
