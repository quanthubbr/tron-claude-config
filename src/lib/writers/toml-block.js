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

/**
 * @param {Record<string, Record<string, unknown>>} servers
 * @param {{ dryRun?: boolean, log?: (msg: string) => void }} [options]
 * @returns {{ status: 'written'|'unchanged'|'malformed', written: string[], skipped: string[], hash?: string }}
 */
function upsertMcpServers(file, servers, { dryRun = false, log = () => {} } = {}) {
  for (const name of Object.keys(servers)) if (!NAME.test(name)) throw new Error(`invalid MCP server name: ${name}`);
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
  if (!written.length) {
    const res = outside.status === 'removed' ? markers.removeFile(file, { style: 'hash', dryRun, log }) : { status: 'absent' };
    return { status: res.status === 'removed' ? 'written' : 'unchanged', written, skipped };
  }
  const body = tables.filter(([name]) => written.includes(name)).map(([, table]) => table).join('\n');
  const res = markers.upsertFile(file, body, { style: 'hash', dryRun, log });
  return { status: res.status, written, skipped, hash: res.hash };
}

function removeMcpServers(file, options = {}) {
  return markers.removeFile(file, { ...options, style: 'hash' });
}

module.exports = { upsertMcpServers, removeMcpServers };
