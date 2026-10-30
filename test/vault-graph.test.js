#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');
const { buildGraph, writeGraph } = require('../src/lib/vault-graph');

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-graph-'));
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return dir;
}

const VAULT = {
  'README.md': '# Home\nSee [[Alpha|the alpha note]] and [[beta#Section]] and [[Missing Note]].\n#root-tag and #123 is no tag\n',
  'proj/Alpha.md': '---\ntags: [design, Arch]\n---\nLinks [[proj/sub/Gamma]] and [[../README]] and ![[diagram.png]].\n',
  'proj/beta.md': '---\ntags:\n  - "design"\n  - ops\n---\r\nBody [[Alpha^block]] ok\r\n```\n[[NotALink]] #notatag\n```\nand `#inline` [[gamma]]\r\n',
  'proj/sub/Gamma.md': 'Leaf with #nested/tag.\n',
  'other/Alpha.md': 'Duplicate stem\n',
  '.obsidian/workspace.md': '[[Alpha]]',
  '.git/x.md': '[[Alpha]]',
  'node_modules/pkg/readme.md': '[[Alpha]]',
  'proj/image.png': 'binary',
};

const has = (graph, source, target, type) => graph.edges.some((e) => e.source === source && e.target === target && e.type === type);

test('nodes are vault-relative notes; dotdirs and node_modules are skipped', () => {
  const graph = buildGraph(fixture(VAULT));
  const notes = graph.nodes.filter((n) => n.type === 'note').map((n) => n.id);
  assert.deepStrictEqual(notes, ['README.md', 'other/Alpha.md', 'proj/Alpha.md', 'proj/beta.md', 'proj/sub/Gamma.md']);
  assert.strictEqual(graph.nodes.find((n) => n.id === 'proj/beta.md').label, 'beta');
});

test('wikilinks resolve through aliases, headings, block refs, basenames and relative paths', () => {
  const graph = buildGraph(fixture(VAULT));
  assert.ok(has(graph, 'README.md', 'other/Alpha.md', 'link') || has(graph, 'README.md', 'proj/Alpha.md', 'link'));
  assert.ok(has(graph, 'README.md', 'proj/beta.md', 'link'));
  assert.ok(has(graph, 'proj/beta.md', 'proj/Alpha.md', 'link'), 'same-folder note wins a basename tie');
  assert.ok(has(graph, 'proj/Alpha.md', 'proj/sub/Gamma.md', 'link'));
  assert.ok(has(graph, 'proj/Alpha.md', 'README.md', 'link'));
  assert.ok(has(graph, 'proj/beta.md', 'proj/sub/Gamma.md', 'link'), 'case-insensitive basename');
  assert.ok(!graph.edges.some((e) => /diagram|notalink/i.test(e.target)), 'attachments and code blocks are ignored');
});

test('unresolved links become flagged ghost nodes', () => {
  const graph = buildGraph(fixture(VAULT));
  const ghost = graph.nodes.find((n) => n.type === 'ghost');
  assert.deepStrictEqual(ghost, { id: 'ghost:missing note', label: 'Missing Note', type: 'ghost', ghost: true });
  assert.ok(has(graph, 'README.md', 'ghost:missing note', 'link'));
});

test('inline and frontmatter tags become tag nodes; code and numeric tags do not', () => {
  const graph = buildGraph(fixture(VAULT));
  const tags = graph.nodes.filter((n) => n.type === 'tag').map((n) => n.id);
  assert.deepStrictEqual(tags, ['tag:arch', 'tag:design', 'tag:nested/tag', 'tag:ops', 'tag:root-tag']);
  assert.ok(has(graph, 'proj/Alpha.md', 'tag:design', 'tag'));
  assert.ok(has(graph, 'proj/beta.md', 'tag:design', 'tag'), 'CRLF frontmatter list is parsed');
  assert.ok(has(graph, 'proj/sub/Gamma.md', 'tag:nested/tag', 'tag'));
});

test('folder edges run parent → child', () => {
  const graph = buildGraph(fixture(VAULT));
  assert.ok(has(graph, 'folder:proj', 'folder:proj/sub', 'file'));
  assert.ok(has(graph, 'folder:proj/sub', 'proj/sub/Gamma.md', 'file'));
  assert.ok(has(graph, 'folder:proj', 'proj/Alpha.md', 'file'));
  assert.ok(!graph.edges.some((e) => e.target === 'README.md' && e.type === 'file'), 'root notes hang off nothing');
});

test('edges are unique and every endpoint is a node', () => {
  const graph = buildGraph(fixture({ ...VAULT, 'twice.md': '[[README]] [[README]] [[twice]]' }));
  const ids = new Set(graph.nodes.map((n) => n.id));
  const keys = graph.edges.map((e) => `${e.type}|${e.source}|${e.target}`);
  assert.strictEqual(new Set(keys).size, keys.length);
  assert.ok(graph.edges.every((e) => ids.has(e.source) && ids.has(e.target)));
  assert.ok(!has(graph, 'twice.md', 'twice.md', 'link'), 'no self links');
});

test('writeGraph writes graph.json and an offline graph.html with escaped inline data', () => {
  const dir = fixture({ ...VAULT, 'evil.md': '[[</script><script>alert(1)</script>]]\n' });
  const out = writeGraph(dir);
  assert.deepStrictEqual([out.json, out.html], [path.join(dir, '.exonous', 'graph.json'), path.join(dir, '.exonous', 'graph.html')]);
  assert.ok(!fs.existsSync(path.join(dir, 'graph.json')) && !fs.existsSync(path.join(dir, 'graph.html')), 'vault root stays clean');
  assert.strictEqual(writeGraph(dir).nodes, out.nodes, 'a rerun does not index its own output');
  const json = JSON.parse(fs.readFileSync(out.json, 'utf8'));
  assert.strictEqual(json.nodes.length, out.nodes);
  assert.strictEqual(json.edges.length, out.edges);
  const html = fs.readFileSync(out.html, 'utf8');
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(html, /__GRAPH_DATA__/);
  assert.strictEqual((html.match(/<\/script>/g) || []).length, 2);
  assert.match(html, /prefers-color-scheme:\s*dark/);
  const inline = /<script type="application\/json" id="graph-data">([\s\S]*?)<\/script>/.exec(html)[1];
  assert.deepStrictEqual(JSON.parse(inline), json);
  writeGraph(dir);
  assert.deepStrictEqual(buildGraph(dir), json, 'generated files are not walked');
});
