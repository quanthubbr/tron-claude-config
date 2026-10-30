#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');
const markers = require('../src/lib/writers/markers');
const { upsertMcpServers, removeMcpServers } = require('../src/lib/writers/toml-block');

function fixture(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'writers-'));
  const file = path.join(dir, name);
  if (content !== undefined) fs.writeFileSync(file, content);
  return { dir, file, logs: [], read: () => fs.readFileSync(file, 'utf8') };
}

const USER_MD = '# My rules\n\nBe kind.\n';

test('a new section is appended and every byte before it is kept', () => {
  const fx = fixture('GEMINI.md', USER_MD);
  const res = markers.upsertFile(fx.file, 'rule one\nrule two');
  assert.strictEqual(res.status, 'written');
  const out = fx.read();
  assert.ok(out.startsWith(USER_MD));
  assert.strictEqual(out.slice(USER_MD.length), '\n<!-- exonous:start v2 -->\nrule one\nrule two\n<!-- exonous:end -->\n');
  assert.strictEqual(markers.readSection(out), 'rule one\nrule two\n');
  assert.strictEqual(res.hash, markers.hashSection('rule one\nrule two\n'));
});

test('an update rewrites only the span between the markers', () => {
  const before = 'top\n';
  const after = '\n## after\nuser text\n';
  const fx = fixture('AGENTS.md', `${before}<!-- exonous:start v1 -->\nold\n<!-- exonous:end -->${after}`);
  markers.upsertFile(fx.file, 'new body\n');
  assert.strictEqual(fx.read(), `${before}<!-- exonous:start v2 -->\nnew body\n<!-- exonous:end -->${after}`);
  assert.strictEqual(markers.upsertFile(fx.file, 'new body\n').status, 'unchanged');
});

test('remove after upsert restores the original bytes', () => {
  const fx = fixture('GEMINI.md', USER_MD);
  markers.upsertFile(fx.file, 'x');
  assert.strictEqual(markers.removeFile(fx.file).status, 'removed');
  assert.strictEqual(fx.read(), USER_MD);
  assert.strictEqual(markers.removeFile(fx.file).status, 'absent');
});

test('upsert then remove is byte-identical with or without a trailing newline, LF and CRLF', () => {
  for (const original of ['a', 'a\n', 'a\nb', 'a\r\nb', 'a\r\nb\r\n', 'a\n\n', 'x\r\n\r\n']) {
    for (const style of ['html', 'hash']) {
      const added = markers.upsert(original, 'body', style);
      assert.strictEqual(added.status, 'written');
      assert.strictEqual(markers.upsert(added.text, 'body', style).status, 'unchanged');
      assert.strictEqual(markers.remove(added.text, style).text, original, `${JSON.stringify(original)} ${style}`);
    }
  }
});

test('remove keeps text after the section byte-identical', () => {
  const fx = fixture('AGENTS.md', 'a\n<!-- exonous:start v2 -->\nx\n<!-- exonous:end -->\nb\n');
  markers.removeFile(fx.file);
  assert.strictEqual(fx.read(), 'a\nb\n');
});

test('a file that held only the section is deleted on remove', () => {
  const fx = fixture('global_rules.md');
  markers.upsertFile(fx.file, 'only ours');
  markers.removeFile(fx.file);
  assert.ok(!fs.existsSync(fx.file));
});

test('a start marker without an end aborts the file with a warning', () => {
  const broken = 'mine\n<!-- exonous:start v2 -->\nhalf\n';
  const fx = fixture('GEMINI.md', broken);
  const log = (m) => fx.logs.push(m);
  assert.strictEqual(markers.upsertFile(fx.file, 'new', { log }).status, 'malformed');
  assert.strictEqual(markers.removeFile(fx.file, { log }).status, 'malformed');
  assert.strictEqual(fx.read(), broken);
  assert.strictEqual(fx.logs.filter((m) => m.startsWith('WARN')).length, 2);
});

test('an end marker before any start is malformed too', () => {
  const fx = fixture('GEMINI.md', 'x\n<!-- exonous:end -->\n');
  assert.strictEqual(markers.upsertFile(fx.file, 'new', { log: () => {} }).status, 'malformed');
});

test('hash-style markers serve TOML and YAML files', () => {
  const fx = fixture('config.yaml', 'key: 1\n');
  markers.upsertFile(fx.file, 'other: 2', { style: 'hash' });
  assert.strictEqual(fx.read(), 'key: 1\n\n# exonous:start\nother: 2\n# exonous:end\n');
  assert.strictEqual(markers.readSection(fx.read(), 'hash'), 'other: 2\n');
});

test('dry run writes nothing', () => {
  const fx = fixture('GEMINI.md', USER_MD);
  const logs = [];
  assert.strictEqual(markers.upsertFile(fx.file, 'x', { dryRun: true, log: (m) => logs.push(m) }).status, 'written');
  assert.strictEqual(fx.read(), USER_MD);
  assert.ok(logs.some((m) => m.startsWith('DRY')));
});

const USER_TOML = '# my codex config\nmodel = "gpt-5"  # keep this comment\n\n[profiles.fast]\nmodel = "mini"\n';
const SERVERS = {
  atlas: { command: '/home/u/.local/bin/atlas', args: ['--stdio'], env: { ATLAS_MODE: 'ro' } },
  biblos: { url: 'https://mcp.context7.com/mcp', enabled: true, startup_timeout_sec: 20 },
};

test('MCP servers go into an appended block and the user TOML is never rewritten', () => {
  const fx = fixture('config.toml', USER_TOML);
  const res = upsertMcpServers(fx.file, SERVERS);
  assert.deepStrictEqual(res, { status: 'written', written: ['atlas', 'biblos'], skipped: [], hash: res.hash });
  const out = fx.read();
  assert.ok(out.startsWith(USER_TOML));
  assert.strictEqual(markers.readSection(out, 'hash'), [
    '[mcp_servers.atlas]',
    'command = "/home/u/.local/bin/atlas"',
    'args = ["--stdio"]',
    'env = { ATLAS_MODE = "ro" }',
    '',
    '[mcp_servers.biblos]',
    'url = "https://mcp.context7.com/mcp"',
    'enabled = true',
    'startup_timeout_sec = 20',
    '',
  ].join('\n'));
  assert.strictEqual(upsertMcpServers(fx.file, SERVERS).status, 'unchanged');
});

test('a same-name table outside the block is skipped with a warning', () => {
  const user = `${USER_TOML}\n[mcp_servers.atlas]\ncommand = "mine"\n\n[mcp_servers."biblos".env]\nKEY = "v"\n`;
  const fx = fixture('config.toml', user);
  const logs = [];
  const res = upsertMcpServers(fx.file, SERVERS, { log: (m) => logs.push(m) });
  assert.deepStrictEqual(res.skipped, ['atlas', 'biblos']);
  assert.strictEqual(res.status, 'unchanged');
  assert.strictEqual(fx.read(), user);
  assert.strictEqual(logs.filter((m) => m.startsWith('WARN')).length, 2);
});

test('dotted keys and inline entries under [mcp_servers] also count as taken', () => {
  const fx = fixture('config.toml', '[mcp_servers]\natlas = { command = "mine" }\n');
  const res = upsertMcpServers(fx.file, SERVERS, { log: () => {} });
  assert.deepStrictEqual(res.skipped, ['atlas']);
  assert.deepStrictEqual(res.written, ['biblos']);
  const root = fixture('config.toml', 'mcp_servers.biblos.url = "x"\n');
  assert.deepStrictEqual(upsertMcpServers(root.file, SERVERS, { log: () => {} }).skipped, ['biblos']);
});

test('the block is the only thing removeMcpServers touches', () => {
  const fx = fixture('config.toml', USER_TOML);
  upsertMcpServers(fx.file, SERVERS);
  assert.strictEqual(removeMcpServers(fx.file).status, 'removed');
  assert.strictEqual(fx.read(), USER_TOML);
});

test('values that TOML cannot carry are refused', () => {
  const fx = fixture('config.toml', '');
  assert.throws(() => upsertMcpServers(fx.file, { atlas: { command: null } }), /TOML/);
  assert.throws(() => upsertMcpServers(fx.file, { 'bad name': { command: 'x' } }), /name/);
});

test('a marker quoted inside prose is not a marker', () => {
  const prose = '# Notes\n\nexonous wraps its block in `<!-- exonous:start v2 -->` and `<!-- exonous:end -->` lines.\n';
  const fx = fixture('AGENTS.md', prose);
  assert.strictEqual(markers.readSection(prose), null);
  assert.strictEqual(markers.upsertFile(fx.file, 'body').status, 'written');
  assert.strictEqual(fx.read(), `${prose}\n<!-- exonous:start v2 -->\nbody\n<!-- exonous:end -->\n`);
  markers.removeFile(fx.file);
  assert.strictEqual(fx.read(), prose);
});

test('marker lines tolerate surrounding whitespace', () => {
  const text = 'a\n  <!-- exonous:start v2 -->  \nbody\n\t<!-- exonous:end -->\nb\n';
  assert.strictEqual(markers.readSection(text), 'body\n');
  assert.strictEqual(markers.remove(text).text, 'a\nb\n');
});

test('a root-level inline mcp_servers table claims every server', () => {
  const user = 'mcp_servers = { atlas = { command = "mine" } }\n';
  const fx = fixture('config.toml', user);
  const logs = [];
  const res = upsertMcpServers(fx.file, SERVERS, { log: (m) => logs.push(m) });
  assert.deepStrictEqual(res.skipped, ['atlas', 'biblos']);
  assert.strictEqual(fx.read(), user);
  assert.strictEqual(logs.filter((m) => m.startsWith('WARN')).length, 2);
});

test('a body carrying a marker line is refused before anything is written', () => {
  const fx = fixture('GEMINI.md', USER_MD);
  assert.throws(() => markers.upsertFile(fx.file, 'x\n<!-- exonous:end -->\ny'), /marker/);
  assert.throws(() => markers.upsertFile(fx.file, '  # exonous:start\n', { style: 'hash' }), /marker/);
  assert.strictEqual(fx.read(), USER_MD);
});

test('CRLF files get a CRLF block and round-trip byte-identical', () => {
  const user = '# mine\r\nline\r\n';
  const fx = fixture('AGENTS.md', user);
  const res = markers.upsertFile(fx.file, 'one\ntwo\n');
  assert.strictEqual(fx.read(), `${user}\r\n<!-- exonous:start v2 -->\r\none\r\ntwo\r\n<!-- exonous:end -->\r\n`);
  assert.strictEqual(res.hash, markers.hashSection('one\ntwo\n'));
  assert.strictEqual(markers.hashSection(markers.readSection(fx.read())), res.hash);
  assert.strictEqual(markers.upsertFile(fx.file, 'one\ntwo\n').status, 'unchanged');
  markers.removeFile(fx.file);
  assert.strictEqual(fx.read(), user);
});
