'use strict';

const fs = require('fs');
const path = require('path');
const { createHash, randomUUID } = require('crypto');
const vault = require('./vault');
const paths = require('./paths');
const { datedName, graphEnvelope, legacyHandoff } = require('./handoff-format');

const OMIT = new Set(['.obsidian', '.git', '.trash', '.DS_Store', 'node_modules']);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const inside = (root, file) => file === root || (!path.relative(root, file).startsWith(`..${path.sep}`) && path.relative(root, file) !== '..' && !path.isAbsolute(path.relative(root, file)));

function owned(relative, io, file, dedicated = false) {
  const parts = relative.split(path.sep);
  if (parts.length < 2 || parts.some((part) => !part || part === '.' || part === '..' || OMIT.has(part))) return false;
  if (parts.length >= 3 && ['memory', 'sessions'].includes(parts[1])) return true;
  if (parts.length !== 2 || !relative.endsWith('.md')) return false;
  if (dedicated && datedName(parts[1])) return true;
  try {
    if (io.lstatSync(file).size > 1024 * 1024) return false;
    const content = io.readFileSync(file, 'utf8');
    if (datedName(parts[1]) && legacyHandoff(content)) return true;
    const note = JSON.parse(content);
    return graphEnvelope(note) && note.v === 1 && ['full', 'pr'].includes(note.k) && Array.isArray(note.g);
  } catch { return false; }
}

function ancestors(io, root, file) {
  if (!inside(root, file)) throw new Error(`path outside vault: ${file}`);
  let cursor = root;
  for (const part of ['', ...path.relative(root, file).split(path.sep).filter(Boolean)]) {
    if (part) cursor = path.join(cursor, part);
    try { if (io.lstatSync(cursor).isSymbolicLink()) throw new Error(`symlink: ${cursor}`); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  }
}

function fingerprint(io, file) {
  const stat = io.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`not a regular file: ${file}`);
  const bytes = io.readFileSync(file);
  return { size: bytes.length, hash: hash(bytes), dev: stat.dev, ino: stat.ino, mtimeMs: stat.mtimeMs };
}

function same(a, b) { return a.size === b.size && a.hash === b.hash; }
function unchanged(a, b) { return same(a, b) && a.dev === b.dev && a.ino === b.ino && a.mtimeMs === b.mtimeMs; }

function atomic(io, file, data) {
  io.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  io.writeFileSync(temp, `${JSON.stringify(data)}\n`, { flag: 'wx', mode: 0o600 });
  io.renameSync(temp, file);
}

function consolidate({ target, dryRun = false, ctx = {}, fs: io = fs } = {}) {
  const result = { status: 'planned', target: null, entries: [], moved: [], identical: [], pending: [], skipped: [], conflicts: [], errors: [] };
  try {
    const selected = target ? { path: vault.localPath(target, ctx) } : vault.consolidationTarget(ctx);
    if (!selected.path) return { ...result, status: 'no-vault' };
    target = path.resolve(selected.path);
    result.target = target;
    if (!io.statSync(target).isDirectory()) throw new Error(`target is not an existing directory: ${target}`);
    if (io.lstatSync(target).isSymbolicLink()) throw new Error(`symlink target: ${target}`);
    const targetReal = io.realpathSync(target);
    const state = path.join(ctx.exoDir || paths.exoDir(), 'state', 'vault-consolidation.json');
    const previous = vault.readConfig(ctx);
    let journal = null;
    try {
      const stat = io.lstatSync(state);
      if (stat.isSymbolicLink() || stat.size > 16 * 1024 * 1024) throw new Error('invalid consolidation journal');
      journal = JSON.parse(io.readFileSync(state, 'utf8'));
      if (journal.v !== 1 || !Array.isArray(journal.entries) || !Array.isArray(journal.sources)) throw new Error('invalid consolidation journal');
      if (journal.phase === 'complete') journal = null;
      else if (journal.target !== targetReal) throw new Error('another vault consolidation has pending cleanup');
    } catch (err) { if (err.code !== 'ENOENT') throw err; }
    const sourceValues = vault.legacyRoots(ctx);
    const sources = [];
    const seen = new Set([targetReal]);
    for (const raw of sourceValues) {
      let source;
      try {
        source = path.resolve(raw);
        if (!io.statSync(source).isDirectory()) continue;
        if (io.lstatSync(source).isSymbolicLink()) throw new Error(`symlink source: ${source}`);
        source = io.realpathSync(source);
      } catch (err) { if (err.code === 'ENOENT') continue; throw err; }
      if (seen.has(source)) continue;
      if (inside(source, targetReal)) throw new Error(`target lies inside source vault: ${source} and ${targetReal}`);
      if (sources.some((other) => inside(other, source) || inside(source, other))) throw new Error(`nested source vaults: ${source}`);
      sources.push(source); seen.add(source);
    }
    sources.sort();
    if (journal?.sources.some((source) => !sources.includes(source))) throw new Error('journal contains an unconfigured source root');
    const entries = new Map();
    for (const source of sources) {
      const walk = (dir) => {
        for (const item of io.readdirSync(dir).sort()) {
          const file = path.join(dir, item);
          const relative = path.relative(source, file);
          const stat = io.lstatSync(file);
          if (stat.isSymbolicLink()) throw new Error(`symlink: ${file}`);
          if (OMIT.has(item)) { result.skipped.push(file); continue; }
          if (stat.isDirectory()) { walk(file); continue; }
          if (!stat.isFile() || !owned(relative, io, file, path.basename(source).toLowerCase() === 'exonous-vault')) { result.skipped.push(file); continue; }
          entries.set(file, { source, relative, ...fingerprint(io, file) });
        }
      };
      walk(source);
    }
    for (const entry of journal?.entries || []) {
      if (!sources.includes(entry.source) || typeof entry.relative !== 'string') throw new Error('invalid journal source');
      const file = path.resolve(entry.source, entry.relative);
      const destination = path.resolve(targetReal, entry.relative);
      if (sources.some((source) => inside(source, destination))) throw new Error('journal destination aliases a source vault');
      ancestors(io, entry.source, file); ancestors(io, targetReal, destination);
      if (!inside(entry.source, file) || !owned(entry.relative, io, io.existsSync(file) ? file : destination, path.basename(entry.source).toLowerCase() === 'exonous-vault')) throw new Error('invalid journal entry');
      if (!io.existsSync(file) && !same(entry, fingerprint(io, destination))) throw new Error(`journal destination changed: ${destination}`);
      if (!entries.has(file) && io.existsSync(file)) throw new Error(`journal source changed: ${file}`);
      if (entries.has(file) && !unchanged(entry, entries.get(file))) throw new Error(`journal source changed: ${file}`);
    }
    result.entries = [...entries.values()].sort((a, b) => a.source.localeCompare(b.source) || a.relative.localeCompare(b.relative));
    const destinations = new Map();
    for (const entry of result.entries) {
      const file = path.join(entry.source, entry.relative);
      const destination = path.resolve(targetReal, entry.relative);
      if (sources.some((source) => inside(source, destination))) throw new Error(`destination aliases a source vault: ${destination}`);
      ancestors(io, targetReal, destination);
      const planned = destinations.get(destination);
      if (planned && !same(entry, planned)) result.conflicts.push({ source: file, destination, otherSource: path.join(planned.source, planned.relative) });
      destinations.set(destination, entry);
      if (io.existsSync(destination)) {
        if (same(entry, fingerprint(io, destination))) result.identical.push(destination);
        else result.conflicts.push({ source: file, destination });
      }
    }
    if (result.conflicts.length) return { ...result, status: 'conflict' };
    if (dryRun) return result;
    const retained = new Map((journal?.entries || []).map((entry) => [path.join(entry.source, entry.relative), entry]));
    for (const entry of result.entries) retained.set(path.join(entry.source, entry.relative), entry);
    journal = { v: 1, target: targetReal, oldVault: journal?.oldVault ?? previous.vault ?? null, sources, entries: [...retained.values()], phase: 'copy' };
    const stateRoot = ctx.exoDir || paths.exoDir();
    ancestors(io, stateRoot, state);
    atomic(io, state, journal);
    for (const entry of result.entries) {
      const file = path.join(entry.source, entry.relative);
      const destination = path.join(targetReal, entry.relative);
      ancestors(io, entry.source, file); ancestors(io, targetReal, destination);
      if (!unchanged(entry, fingerprint(io, file))) throw new Error(`source changed: ${file}`);
      if (!io.existsSync(destination)) {
        io.mkdirSync(path.dirname(destination), { recursive: true });
        io.copyFileSync(file, destination, fs.constants.COPYFILE_EXCL);
        io.utimesSync(destination, entry.mtimeMs / 1000, entry.mtimeMs / 1000);
      }
      if (!same(entry, fingerprint(io, destination)) || !unchanged(entry, fingerprint(io, file))) throw new Error(`copy verification failed: ${file}`);
    }
    for (const entry of result.entries) {
      const file = path.join(entry.source, entry.relative);
      const destination = path.join(targetReal, entry.relative);
      ancestors(io, entry.source, file); ancestors(io, targetReal, destination);
      if (!unchanged(entry, fingerprint(io, file)) || !same(entry, fingerprint(io, destination))) throw new Error(`source changed before switch: ${file}`);
    }
    vault.writeConfig(target, ctx, sources);
    journal.phase = 'cleanup'; atomic(io, state, journal);
    for (const entry of result.entries) {
      const file = path.join(entry.source, entry.relative);
      const destination = path.join(targetReal, entry.relative);
      try {
        ancestors(io, entry.source, file); ancestors(io, targetReal, destination);
        if (!unchanged(entry, fingerprint(io, file)) || !same(entry, fingerprint(io, destination))) throw new Error(`cleanup verification failed: ${file}`);
        io.unlinkSync(file); result.moved.push(file);
      } catch (err) { result.pending.push(file); result.errors.push(err.message); }
    }
    journal.phase = result.pending.length ? 'cleanup' : 'complete'; atomic(io, state, journal);
    return { ...result, status: result.pending.length ? 'pending-cleanup' : 'complete' };
  } catch (err) {
    result.errors.push(err.message);
    return { ...result, status: 'blocked' };
  }
}

module.exports = { consolidate };
