'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const vault = require('./vault');
const paths = require('./paths');
const { vaultContext } = require('../vault-cli');
const { sanitize } = require('../../assets/machine/hooks/lib/sanitize.cjs');
const { datedName, graphEnvelope } = require('./handoff-format');
const MAX_BYTES = 1024 * 1024;

function readText(file) {
  if (fs.statSync(file).size > MAX_BYTES) throw new Error('handoff file too large (maximum 1 MiB)');
  const content = fs.readFileSync(file, 'utf8');
  if (Buffer.byteLength(content) > MAX_BYTES) throw new Error('handoff file too large (maximum 1 MiB)');
  return content;
}

function roots(options = {}) {
  const ctx = vaultContext(options.ctx);
  let selected;
  try { selected = vault.central(ctx); } catch { throw new Error('handoff config.json invalid'); }
  if (!selected.path) return [];
  try { if (fs.statSync(selected.path).isDirectory()) return [selected.path]; } catch {}
  throw new Error('configured handoff vault is unavailable');
}

function identity(cwd = process.env.EXONOUS_HANDOFF_CWD || process.cwd()) {
  const top = paths.gitOut(cwd, ['rev-parse', '--show-toplevel']);
  if (!top) return { r: 'avulsas', b: '', h: '' };
  const root = top.trim();
  const list = paths.gitOut(root, ['worktree', 'list', '--porcelain']) || '';
  const main = list.split('\n')[0].replace(/^worktree /, '').trim() || root;
  const name = path.basename(main).replace(/\.git$/, '');
  if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) throw new Error('invalid handoff repository name');
  return { r: name, b: (paths.gitOut(root, ['branch', '--show-current']) || '').trim(), h: (paths.gitOut(root, ['rev-parse', '--verify', 'HEAD']) || '').trim() };
}

function fullTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const time = Date.parse(value);
  const date = value.slice(0, 10);
  const midnight = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) && Number.isFinite(midnight) && new Date(midnight).toISOString().slice(0, 10) === date ? time : null;
}

function graph(body) {
  if (!body || body.v !== 1 || !['full', 'pr'].includes(body.k) || !Array.isArray(body.g) || !body.g.length || !body.g.every((triple) => Array.isArray(triple) && triple.length === 3 && triple.every((value) => typeof value === 'string' && value.trim()))) throw new Error('invalid handoff graph: expected v=1, k=full|pr and nonempty string triples');
  if (body.g.length > 4096 || Buffer.byteLength(JSON.stringify(body)) > MAX_BYTES) throw new Error('handoff graph too large');
  for (const relation of ['next', 'proof']) if (!body.g.some((triple) => triple[1] === relation)) throw new Error(`invalid handoff graph: missing ${relation}`);
  return { v: 1, k: body.k, g: body.g.map((triple) => triple.map(sanitize)) };
}

function sessionFolder(root, name) {
  const folder = path.resolve(root, name);
  if (path.dirname(folder) !== path.resolve(root)) throw new Error('invalid handoff repository folder');
  return folder;
}

function save(body, options = {}) {
  const valid = graph(body);
  const ts = options.now || new Date().toISOString();
  if (fullTimestamp(ts) === null) throw new Error('invalid handoff timestamp');
  const root = roots(options)[0];
  if (!root) return { status: 'not-saved', reason: 'no-vault' };
  const repo = identity(options.cwd);
  const folder = sessionFolder(root, repo.r);
  fs.mkdirSync(folder, { recursive: true });
  if (fs.lstatSync(folder).isSymbolicLink()) throw new Error('handoff folder must not be a symlink');
  const file = path.join(folder, `${ts.replace(/:/g, '-')}-${valid.k}-${randomUUID()}.md`);
  const content = JSON.stringify({ v: valid.v, ts, k: valid.k, ...Object.fromEntries(Object.entries(repo).map(([key, value]) => [key, sanitize(value)])), g: valid.g });
  fs.writeFileSync(file, `${content}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { status: 'saved', vault: root, path: file, timestamp: ts, kind: valid.k };
}

function filenameTime(file) {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2})[:\-]?(\d{2})(?:[:\-]?(\d{2}))?/.exec(path.basename(file));
  return match ? Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4] || '00'}Z`) : NaN;
}

function note(file, root) {
  if (!datedName(path.basename(file)) && fs.statSync(file).size > MAX_BYTES) return null;
  const raw = readText(file);
  let content = sanitize(raw);
  let data;
  if (raw.trimStart().startsWith('{')) {
    try { data = JSON.parse(raw); } catch { data = null; }
    if (!graphEnvelope(data)) data = null;
    if (data) content = JSON.stringify(data, (key, value) => {
      if (typeof value === 'string') return sanitize(value);
      if (value && typeof value === 'object' && !Array.isArray(value)) return Object.fromEntries(Object.entries(value).map(([name, item]) => [sanitize(name), item]));
      return value;
    });
  }
  if (!data && !datedName(path.basename(file))) return null;
  let recorded = fullTimestamp(data?.ts);
  if (!data) {
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1] || '';
    for (const match of frontmatter.matchAll(/^(?:ts|timestamp|created|date|data):\s*["']?([^\r\n"']+)/gm)) {
      recorded = fullTimestamp(match[1].trim());
      if (recorded !== null) break;
    }
  }
  const filename = filenameTime(file);
  const time = recorded ?? (Number.isFinite(filename) ? filename : fs.statSync(file).mtimeMs);
  if (data && data.v !== 1) return { status: 'unsupported-version', version: Number.isSafeInteger(data.v) ? data.v : null, vault: root, path: file, timestamp: new Date(time).toISOString(), kind: 'unknown', content, time };
  if (data) graph(data);
  return { status: 'found', vault: root, path: file, timestamp: new Date(time).toISOString(), kind: data?.k || 'legacy', content, time };
}

function latest(options = {}) {
  const candidates = roots(options);
  const repo = identity(options.cwd);
  const notes = [];
  for (const root of candidates) {
    const folder = sessionFolder(root, repo.r);
    let entries;
    try {
      if (fs.lstatSync(folder).isSymbolicLink()) throw new Error('handoff folder must not be a symlink');
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw new Error(`cannot read handoff folder: ${folder}`);
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const candidate = note(path.join(folder, entry.name), root);
      if (!candidate) continue;
      if (candidate.kind !== 'legacy') {
        let data;
        try { data = JSON.parse(candidate.content); } catch { continue; }
        if (data.r && data.r !== repo.r) continue;
      }
      notes.push(candidate);
    }
  }
  notes.sort((a, b) => b.time - a.time || (a.path < b.path ? 1 : a.path > b.path ? -1 : 0));
  if (!notes.length) return { status: 'not-found', reason: candidates.length ? 'no-notes' : 'no-vault' };
  const { time, ...result } = notes[0];
  return result;
}

module.exports = { save, latest, readText };
