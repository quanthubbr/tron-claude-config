'use strict';

// Helpers every tool adapter shares: detection on PATH, Claude's MCP registrations, and owned MCP entries.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const paths = require('../lib/paths');
const { mergeKey } = require('../lib/settings');

const MCP_KEYS = ['atlas', 'biblos'];
const SECRETISH = /key|token|secret|password|auth/i;

const onPath = (bin) => (process.env.PATH || '').split(path.delimiter).some((dir) => dir && fs.existsSync(path.join(dir, bin)));

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * atlas/biblos as registered for Claude Code, reduced to what other tools need. Headers and env are never copied.
 * @returns {Record<string, { command: string, args: string[] } | { url: string }>}
 */
function claudeMcp({ log = () => {} } = {}) {
  const files = [path.join(paths.claudeDir(), '.mcp.json'), path.join(paths.home(), '.claude.json')];
  const out = {};
  for (const key of MCP_KEYS) {
    const entry = files.map((f) => readJson(f)?.mcpServers?.[key]).find(Boolean);
    if (!entry) continue;
    if (typeof entry.command === 'string') {
      const args = Array.isArray(entry.args) ? entry.args.filter((a) => typeof a === 'string') : [];
      // A credential passed as an argument would be copied into every tool's config.
      if (args.some((a) => SECRETISH.test(a))) {
        log(`${key} MCP not copied to other tools: its arguments look like they carry a credential — register it there by hand`);
        continue;
      }
      out[key] = { command: entry.command, args };
    } else if (typeof entry.url === 'string' && /^https:\/\//.test(entry.url)) {
      if (SECRETISH.test(entry.url.replace(/^[^?#]*/, ''))) {
        log(`${key} MCP not copied to other tools: its URL query looks like it carries a credential — register it there by hand`);
        continue;
      }
      out[key] = { url: entry.url };
    }
  }
  return out;
}

const ownedFile = () => path.join(paths.stateDir(), 'mcp-owned.json');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * MCP entries in a JSON map (`mcpServers`, `mcp`), ours only while unchanged since exonous wrote them; a user's own entry is never touched.
 * @param {{ tool: string, key: string, entries: Record<string, unknown>, dryRun?: boolean, log?: (m: string) => void, jsonc?: boolean }} options
 */
function mergeMcp(file, { tool, key, entries, dryRun = false, log = () => {}, jsonc = false }) {
  const owned = readJson(ownedFile()) || {};
  const mine = owned[tool] || {};
  const current = readJson(file)?.[key] || {};
  const changes = {};
  const next = {};
  for (const name of new Set([...Object.keys(entries), ...Object.keys(mine)])) {
    const theirs = name in current && !(name in mine && same(current[name], mine[name]));
    if (theirs) {
      if (name in entries) log(`${file} already has its own ${key}.${name} — left as is`);
      continue;
    }
    if (name in entries) {
      changes[name] = entries[name];
      next[name] = entries[name];
    } else if (name in current) {
      changes[name] = null;
    }
  }
  if (!Object.keys(changes).length) return { status: 'unchanged' };
  const res = mergeKey(file, { key, entries: changes, dryRun, log, jsonc });
  if (res.status !== 'invalid' && !dryRun) {
    owned[tool] = next;
    fs.mkdirSync(paths.stateDir(), { recursive: true, mode: 0o700 });
    fs.writeFileSync(ownedFile(), `${JSON.stringify(owned, null, 2)}\n`, { mode: 0o600 });
  }
  return res;
}

/** Removes only the MCP entries exonous wrote for this tool, unchanged since. */
const removeMcp = (file, options) => mergeMcp(file, { ...options, entries: {} });

// A real deny names the review step; "not a git repository" or a crash must not pass as one.
const SELFTEST_DENY = /exonous (token|workflow)/;

/** Temp git repo with a staged file, so the self-test commit reaches the token check. Caller removes it. */
function selftestRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'exonous-selftest-')));
  // Git for Windows maps the literal /dev/null; os.devNull (\\.\nul) fails its config access check.
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
  execFileSync('git', ['init', '-q'], { cwd: dir, env, stdio: 'ignore' });
  fs.writeFileSync(path.join(dir, 'selftest.txt'), 'exonous self-test\n');
  execFileSync('git', ['add', 'selftest.txt'], { cwd: dir, env, stdio: 'ignore' });
  return dir;
}

/** Self-test temp cleanup: Windows can hold the dir briefly after the child exits; a leftover temp dir must not fail doctor. */
function removeSelftestDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch {}
}

/** MCP coverage row: atlas/biblos are copied only when Claude Code has them, so a gap is a warning, not a failure. */
function mcpRow(label, names) {
  const have = MCP_KEYS.filter((k) => names.includes(k));
  return have.length === MCP_KEYS.length
    ? { name: `${label}: MCP (atlas, biblos)`, ok: true, status: '', fix: 'exonous install' }
    : { name: `${label}: MCP (atlas, biblos)`, ok: false, level: 'warn', status: `${have.join(', ') || 'none'} registered; copied only from Claude Code's registrations`, fix: 'register atlas/biblos for Claude Code, then exonous install' };
}

/** True when every file in a real skill dir is one exonous wrote: shipped bytes, or the hash the last install recorded. */
function ownSkillDir(home, dir, name) {
  const { ASSETS, withName } = require('../lib/runtime');
  const { sha256, homeRel } = require('../lib/home');
  const files = (rel = '') => fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) => {
    const child = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) return files(child);
    return e.name === '.DS_Store' || e.name === '__pycache__' ? [] : [child];
  });
  const ours = (rel) => {
    const bytes = fs.readFileSync(path.join(dir, rel));
    const shipped = path.join(ASSETS, 'skills', name, rel);
    if (fs.existsSync(shipped) && sha256(fs.readFileSync(shipped)) === sha256(bytes)) return true;
    if (rel === 'SKILL.md' && fs.existsSync(shipped) && withName(fs.readFileSync(shipped, 'utf8'), name) === bytes.toString('utf8')) return true;
    return home.ledger.previous[`${homeRel(dir)}/${rel}`]?.hash === sha256(bytes);
  };
  try {
    return files().every(ours);
  } catch {
    return false;
  }
}

/** Links each skill from ~/.agents/skills into the tool's skills dir; a real dir with files exonous did not write stays and is reported. */
function linkSkills(home, toolDir, names, { log = () => {} } = {}) {
  for (const name of names) {
    const dest = path.join(toolDir, 'skills', name);
    let stat = null;
    try {
      stat = fs.lstatSync(dest);
    } catch {
      // nothing there yet
    }
    const { foreignSkill } = require('../lib/runtime');
    if (foreignSkill(path.join(paths.home(), '.agents', 'skills', name), name)) continue;
    if (stat && !stat.isSymbolicLink() && !(stat.isDirectory() && ownSkillDir(home, dest, name))) {
      log(`WARN: ${dest.replace(paths.home(), '~').replace(/\\/g, '/')} holds files exonous did not write — left as is (not linked); move them, then rerun`);
      continue;
    }
    home.link(path.join(paths.home(), '.agents', 'skills', name), dest);
  }
}

/** Doctor row every soft-tier tool shows: rules may load, nothing blocks a commit. */
const softRow = (label, what = 'rules only') => ({
  name: `${label}: gate`, ok: false, level: 'warn', status: `soft: not enforced — ${what}`,
  fix: 'commit through a hard-gated tool, or run `exonous workflow commit` and review by hand',
});

module.exports = { onPath, readJson, claudeMcp, mergeMcp, removeMcp, softRow, mcpRow, linkSkills, selftestRepo, removeSelftestDir, SELFTEST_DENY, MCP_KEYS };
