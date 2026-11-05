'use strict';

// exonous vault show|detect|set|graph, and the install step that picks the vault agents write notes to.
const fs = require('fs');
const path = require('path');
const paths = require('./lib/paths');
const vault = require('./lib/vault');
const { writeGraph } = require('./lib/vault-graph');
const { isolatedHome } = require('./lib/runtime');

const USAGE = 'usage: exonous vault [show | detect | set <path> [--create] | graph | consolidate [target] <--dry-run|--apply>]';

/** Vault context rooted at the target home; an EXONOUS_HOME test home never sees the real Obsidian registry. */
function vaultContext(ctx = {}) {
  const home = paths.home();
  if (!isolatedHome()) return { homedir: home, ...ctx };
  const env = { ...process.env, APPDATA: path.join(home, 'AppData', 'Roaming'), USERPROFILE: home, XDG_CONFIG_HOME: path.join(home, '.config') };
  delete env.WSL_USERPROFILE;
  return { homedir: home, env, isWsl: false, ...ctx };
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function current(ctx) {
  return vault.central(vaultContext(ctx));
}

const configuredVault = (c) => {
  const found = vault.consolidationTarget({ ...c, env: { ...(c.env || process.env), PROJECT_MEMORY_VAULT: '' } });
  return ['exonous-config', 'skill-config'].includes(found.source) ? found.path : null;
};

/** On a TTY with several Obsidian vaults and none configured, asks which one install should use. */
async function promptVault({ ctx, isTTY, ask } = {}) {
  try {
    const c = vaultContext(ctx);
    if (configuredVault(c)) return null;
    const picked = await vault.choose(vault.detect(c).filter((entry) => path.basename(entry.path).toLowerCase() !== 'exonous-vault'), { isTTY, ask });
    return picked ? picked.path : null;
  } catch {
    return null;
  }
}

function installVault({ dryRun = false, log = () => {}, choice = null, ctx } = {}) {
  const c = vaultContext(ctx);
  const kept = configuredVault(c);
  if (kept && !isDir(kept)) {
    log(`WARN: vault: ${kept} not found — keeping config; fix with \`exonous vault detect\` / \`exonous vault set <path>\``);
    return { path: kept, kind: 'missing' };
  }
  const selected = vault.consolidationTarget({ ...c, env: { ...(c.env || process.env), PROJECT_MEMORY_VAULT: '' } });
  const detected = choice || kept || selected.source !== 'obsidian' ? null : selected;
  const target = choice || kept || (detected && detected.path) || vault.fallbackPath(c);
  const kind = choice || detected ? 'obsidian' : kept ? 'existing' : 'fallback';
  if (dryRun) {
    log(`vault: ${target} (${kind}) — dry run, nothing written`);
    return { path: target, kind };
  }
  if (kind === 'fallback') vault.ensureFallback(target, c);
  const result = require('./lib/vault-consolidation').consolidate({ target, ctx: c });
  if (result.status !== 'complete') {
    log(`WARN: vault consolidation ${result.status}: ${JSON.stringify(result)}`);
    return { path: target, kind: 'blocked' };
  }
  log(`vault: ${target} (${kind})`);
  return { path: target, kind };
}

function expand(input, c) {
  const raw = vault.toLocalPath(String(input), c);
  const home = /^~(?=$|[\\/])/.test(raw) ? path.join(c.homedir, raw.slice(1)) : raw;
  return path.resolve(home);
}

function show(c, out) {
  const found = current(c);
  if (!found.path) {
    out.err(`no vault configured — run \`exonous vault detect\`, then \`exonous vault set <path>\``);
    return 1;
  }
  out.log(`vault:  ${found.path}`);
  out.log(`source: ${found.source}`);
  out.log(`exists: ${isDir(found.path) ? 'yes' : 'no'}`);
  return 0;
}

function detect(c, out) {
  out.log('Obsidian registries searched:');
  for (const file of vault.registryPaths(c)) out.log(`  ${fs.existsSync(file) ? '✓' : '·'} ${file}`);
  const configured = current(c);
  if (configured.path && !isDir(configured.path)) out.log(`configured vault ${configured.path} (${configured.source}) not found — mount it or pick another below`);
  const found = vault.detect(c);
  if (!found.length) {
    out.log(`no Obsidian vault found — install would create ${vault.fallbackPath(c)}`);
    return 0;
  }
  out.log('Vaults (open first, then most recent):');
  for (const v of found) out.log(`  ${v.path}${v.open ? ' (open)' : ''}`);
  out.log('use one with `exonous vault set <path>`');
  return 0;
}

function set(args, c, out) {
  const input = args.find((a) => !a.startsWith('--'));
  if (!input) {
    out.err(USAGE);
    return 2;
  }
  const target = expand(input, c);
  if (fs.existsSync(target) && !isDir(target)) {
    out.err(`${target} is a file, not a folder`);
    return 1;
  }
  if (!fs.existsSync(target)) {
    if (!args.includes('--create')) {
      out.err(`${target} does not exist — create it first or pass --create`);
      return 1;
    }
    fs.mkdirSync(target, { recursive: true });
  }
  const result = require('./lib/vault-consolidation').consolidate({ target, ctx: c });
  if (result.status !== 'complete') {
    out.err(JSON.stringify(result));
    return 1;
  }
  out.log(`vault set: ${target}`);
  const effective = current(c);
  if (effective.source !== 'exonous-config') out.log(`note: ${effective.source} still wins (${effective.path})`);
  return 0;
}

function graph(c, out) {
  const found = current(c);
  if (!found.path || !isDir(found.path)) {
    out.err(found.path ? `vault ${found.path} does not exist` : 'no vault configured — run `exonous vault detect`, then `exonous vault set <path>`');
    return 1;
  }
  const result = writeGraph(found.path);
  out.log(`graph: ${result.nodes} notes, ${result.edges} links`);
  out.log(`  ${result.html}`);
  out.log(`  ${result.json}`);
  return 0;
}

const consoleOut = { log: (m) => console.log(m), err: (m) => console.error(m) };

/** @returns {number} exit code */
function vaultCommand(args = [], { ctx, out = consoleOut } = {}) {
  const [sub = 'show', ...rest] = args;
  const c = vaultContext(ctx);
  if (sub === 'show') return show(c, out);
  if (sub === 'detect') return detect(c, out);
  if (sub === 'set') return set(rest, c, out);
  if (sub === 'graph') return graph(c, out);
  if (sub === 'consolidate') {
    const positional = rest.filter((item) => !item.startsWith('--'));
    if (positional.length > 1 || rest.some((item) => item.startsWith('--') && !['--dry-run', '--apply'].includes(item)) || rest.includes('--dry-run') === rest.includes('--apply')) { out.err(USAGE); return 2; }
    const result = require('./lib/vault-consolidation').consolidate({ target: positional[0], dryRun: rest.includes('--dry-run'), ctx: c });
    out.log(JSON.stringify(result));
    return ['planned', 'complete'].includes(result.status) ? 0 : 1;
  }
  out.err(USAGE);
  return 2;
}

module.exports = { vaultCommand, installVault, promptVault, current, vaultContext };
