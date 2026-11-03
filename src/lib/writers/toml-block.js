'use strict';

const fs = require('fs');
const markers = require('./markers');

const NAME = /^[A-Za-z0-9_-]+$/;
const BARE_KEY = /^[A-Za-z0-9_-]+$/;

function tomlKey(key) {
  return BARE_KEY.test(key) ? key : JSON.stringify(key);
}

function tomlValue(value, where) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return `[${value.map((v) => tomlValue(v, where)).join(', ')}]`;
  if (value && typeof value === 'object') {
    const pairs = Object.entries(value).map(([k, v]) => `${tomlKey(k)} = ${tomlValue(v, where)}`);
    return pairs.length ? `{ ${pairs.join(', ')} }` : '{}';
  }
  throw new Error(`${where}: value ${JSON.stringify(value)} has no TOML form`);
}

function renderTable(name, fields) {
  const lines = Object.entries(fields).map(([k, v]) => `${tomlKey(k)} = ${tomlValue(v, `mcp_servers.${name}.${k}`)}`);
  return `[mcp_servers.${name}]\n${lines.join('\n')}\n`;
}

const quoted = (name) => `(?:${name}|"${name}"|'${name}')`;

// A table defined anywhere else would make our copy a duplicate-table TOML error.
function definedOutside(text, name) {
  const header = new RegExp(`^\\s*\\[\\s*mcp_servers\\s*\\.\\s*${quoted(name)}\\s*[\\].]`, 'm');
  if (/^\s*mcp_servers\s*=/m.test(text)) return true;
  const dotted = new RegExp(`^\\s*mcp_servers\\s*\\.\\s*${quoted(name)}\\s*[.=]`, 'm');
  if (header.test(text) || dotted.test(text)) return true;
  const parent = /^\s*\[\s*mcp_servers\s*\]\s*(?:#.*)?$/m.exec(text);
  if (!parent) return false;
  const rest = text.slice(parent.index + parent[0].length);
  const next = /^\s*\[/m.exec(rest);
  const body = next ? rest.slice(0, next.index) : rest;
  return new RegExp(`^\\s*${quoted(name)}\\s*[.=]`, 'm').test(body);
}

/** Tables in an old block body that are not mcp_servers.<owned>: Codex appends its own ([projects.*], [hooks.state.*]) before `# exonous:end`. */
function splitBlock(body, owned) {
  const mine = new RegExp(`^\\s*\\[\\s*mcp_servers\\s*\\.\\s*(?:${owned.map(quoted).join('|')})\\s*[\\].]`);
  const chunks = String(body || '').split(/^(?=[ \t]*\[)/m).filter((c) => /^[ \t]*\[/.test(c));
  return {
    ours: markers.normalizeBody(chunks.filter((c) => mine.test(c)).join('')),
    foreign: chunks.filter((c) => !mine.test(c)).map((c) => c.replace(/\s+$/, '')).join('\n\n'),
  };
}

const foreignTables = (body, owned) => splitBlock(body, owned).foreign;

/**
 * @param {Record<string, Record<string, unknown>>} servers
 * @param {{ dryRun?: boolean, log?: (msg: string) => void, owned?: string[] }} [options] owned: server names whose tables the block holds (default: servers).
 * @returns {{ status: 'written'|'unchanged'|'malformed', written: string[], skipped: string[], hash?: string }}
 */
function upsertMcpServers(file, servers, { dryRun = false, log = () => {}, owned = Object.keys(servers) } = {}) {
  for (const name of [...Object.keys(servers), ...owned]) if (!NAME.test(name)) throw new Error(`invalid MCP server name: ${name}`);
  const tables = Object.entries(servers).map(([name, fields]) => [name, renderTable(name, fields)]);
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const outside = markers.remove(text, 'hash');
  if (outside.status === 'malformed') {
    log(`WARN: ${file} has an unmatched exonous marker — fix it by hand; file left untouched`);
    return { status: 'malformed', written: [], skipped: Object.keys(servers) };
  }
  const foreign = foreignTables(outside.body, owned);
  if (foreign) log(`kept the tables another tool wrote inside the exonous block of ${file} (moved out of it)`);
  const written = [];
  const skipped = [];
  for (const [name] of tables) {
    if (definedOutside(outside.text, name)) {
      skipped.push(name);
      log(`WARN: ${file} already defines mcp_servers.${name} — left as is, exonous entry skipped`);
    } else {
      written.push(name);
    }
  }
  const body = tables.filter(([name]) => written.includes(name)).map(([, table]) => table).join('\n');
  if (foreign) return rescue(file, { outside: outside.text, foreign, body, eol: text.includes('\r\n') ? '\r\n' : '\n', dryRun, log, written, skipped });
  if (!written.length) {
    const res = outside.status === 'removed' ? markers.removeFile(file, { style: 'hash', dryRun, log }) : { status: 'absent' };
    return { status: res.status === 'removed' ? 'written' : 'unchanged', written, skipped };
  }
  const res = markers.upsertFile(file, body, { style: 'hash', dryRun, log });
  return { status: res.status, written, skipped, hash: res.hash };
}

/** Rewrites the file with the foreign tables kept outside the block, and the block (if any) appended after them. */
function rescue(file, { outside, foreign, body, eol, dryRun, log, written, skipped }) {
  const sep = outside ? `${outside.endsWith('\n') ? '' : eol}${eol}` : '';
  const kept = `${outside}${sep}${foreign.replace(/\r?\n/g, eol)}${eol}`;
  const next = written.length ? markers.upsert(kept, body, 'hash').text : kept;
  if (dryRun) log(`DRY: would write exonous section → ${file}`);
  else markers.writeAtomic(file, next);
  return { status: 'written', written, skipped, ...(written.length ? { hash: markers.hashSection(markers.normalizeBody(body)) } : {}) };
}

/**
 * Drops the block; tables another tool wrote inside it stay in the file.
 * @param {{ dryRun?: boolean, log?: (msg: string) => void, keepEmpty?: boolean, owned?: string[] }} [options]
 * @returns {{ status: 'removed'|'absent'|'malformed', body?: string }}
 */
function removeMcpServers(file, { owned = [], ...options } = {}) {
  for (const name of owned) if (!NAME.test(name)) throw new Error(`invalid MCP server name: ${name}`);
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const outside = markers.remove(text, 'hash');
  const foreign = outside.status === 'removed' && owned.length ? foreignTables(outside.body, owned) : '';
  if (!foreign) return markers.removeFile(file, { ...options, style: 'hash' });
  const { dryRun = false, log = () => {} } = options;
  log(`kept the tables another tool wrote inside the exonous block of ${file} (moved out of it)`);
  rescue(file, { outside: outside.text, foreign, body: '', eol: text.includes('\r\n') ? '\r\n' : '\n', dryRun, log, written: [], skipped: [] });
  return { status: 'removed', body: outside.body };
}

module.exports = { upsertMcpServers, removeMcpServers, splitBlock };
