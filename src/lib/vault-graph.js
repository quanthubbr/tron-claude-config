'use strict';

const fs = require('fs');
const path = require('path');
const { writeAtomic } = require('./writers/markers');

const SKIP_DIRS = new Set(['node_modules']);
const ATTACHMENT = /\.(png|jpe?g|gif|svg|webp|bmp|avif|pdf|mp[34]|webm|wav|ogg|m4a|mov|canvas|excalidraw)$/i;
const WIKILINK = /\[\[([^\]\n]+?)\]\]/g;
const TAG = /(^|[\s(,])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;

function walk(root, rel = '', out = []) {
  for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(root, child, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      out.push(child);
    }
  }
  return out;
}

function splitFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n(?:---|\.\.\.)(?:\n|$)/.exec(text);
  return m ? { front: m[1], body: text.slice(m[0].length) } : { front: '', body: text };
}

function frontmatterTags(front) {
  const tags = [];
  const lines = front.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^tags?\s*:\s*(.*)$/i.exec(lines[i]);
    if (!m) continue;
    const inline = m[1].trim().replace(/^\[|\]$/g, '');
    if (inline) tags.push(...inline.split(/[,\s]+/));
    for (let j = i + 1; j < lines.length && /^\s+-\s*/.test(lines[j]); j += 1) tags.push(lines[j].replace(/^\s+-\s*/, ''));
  }
  return tags.map((t) => t.trim().replace(/^["']|["']$/g, '').replace(/^#/, '')).filter(Boolean);
}

const stripCode = (text) => text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '').replace(/`[^`\n]*`/g, '');

function parseNote(text) {
  const { front, body } = splitFrontmatter(text.replace(/\r\n?/g, '\n'));
  const clean = stripCode(body);
  const links = [];
  for (const m of clean.matchAll(WIKILINK)) {
    const target = m[1].split('|')[0].split('#')[0].split('^')[0].trim();
    if (target && !ATTACHMENT.test(target)) links.push(target);
  }
  const tags = frontmatterTags(front);
  for (const m of clean.matchAll(TAG)) tags.push(m[2]);
  return { links, tags: tags.map((t) => t.toLowerCase().replace(/\/+$/, '')).filter(Boolean) };
}

const stem = (rel) => path.posix.basename(rel).replace(/\.md$/i, '');

function makeResolver(notes) {
  const byStem = new Map();
  const byPath = new Map();
  for (const rel of notes) {
    const key = stem(rel).toLowerCase();
    if (!byStem.has(key)) byStem.set(key, []);
    byStem.get(key).push(rel);
    byPath.set(rel.toLowerCase().replace(/\.md$/, ''), rel);
  }
  return (target, from) => {
    const bare = target.replace(/\\/g, '/').replace(/\.md$/i, '').toLowerCase();
    if (!bare.includes('/')) {
      const hits = byStem.get(bare);
      if (!hits) return null;
      const dir = path.posix.dirname(from);
      return hits.find((h) => path.posix.dirname(h) === dir) || [...hits].sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
    }
    const relative = path.posix.normalize(path.posix.join(path.posix.dirname(from), bare));
    return byPath.get(bare.replace(/^\/+/, '')) || byPath.get(relative) || null;
  };
}

/** `{ nodes, edges }` for every `*.md` under vaultDir; edges are `link`, `tag` and `file` (folder → child). */
function buildGraph(vaultDir) {
  const notes = walk(vaultDir).sort();
  const resolveLink = makeResolver(notes);
  const nodes = new Map();
  const edges = new Map();
  const addNode = (id, label, type, extra) => {
    if (!nodes.has(id)) nodes.set(id, { id, label, type, ...extra });
  };
  const addEdge = (source, target, type) => {
    if (source !== target) edges.set(`${type}\0${source}\0${target}`, { source, target, type });
  };
  const addFolder = (dir) => {
    if (dir === '.') return null;
    const id = `folder:${dir}`;
    if (!nodes.has(id)) {
      addNode(id, path.posix.basename(dir), 'folder');
      const parent = addFolder(path.posix.dirname(dir));
      if (parent) addEdge(parent, id, 'file');
    }
    return id;
  };

  for (const rel of notes) {
    addNode(rel, stem(rel), 'note');
    const folder = addFolder(path.posix.dirname(rel));
    if (folder) addEdge(folder, rel, 'file');
  }
  for (const rel of notes) {
    const { links, tags } = parseNote(fs.readFileSync(path.join(vaultDir, ...rel.split('/')), 'utf8'));
    for (const target of links) {
      const hit = resolveLink(target, rel);
      if (hit) {
        addEdge(rel, hit, 'link');
        continue;
      }
      const id = `ghost:${target.toLowerCase()}`;
      addNode(id, target, 'ghost', { ghost: true });
      addEdge(rel, id, 'link');
    }
    for (const tag of tags) {
      addNode(`tag:${tag}`, `#${tag}`, 'tag');
      addEdge(rel, `tag:${tag}`, 'tag');
    }
  }
  const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return {
    nodes: [...nodes.values()].sort((a, b) => order(a.id, b.id)),
    edges: [...edges.values()].sort((a, b) => order(a.type, b.type) || order(a.source, b.source) || order(a.target, b.target)),
  };
}

/** Writes `<vault>/.exonous/graph.json` and a self-contained offline `<vault>/.exonous/graph.html`. */
function writeGraph(vaultDir) {
  const graph = buildGraph(vaultDir);
  const outDir = path.join(vaultDir, '.exonous');
  fs.mkdirSync(outDir, { recursive: true });
  const json = path.join(outDir, 'graph.json');
  const html = path.join(outDir, 'graph.html');
  const inline = JSON.stringify(graph).replace(/</g, '\\u003c');
  const template = fs.readFileSync(path.join(__dirname, 'vault-template.html'), 'utf8');
  writeAtomic(json, `${JSON.stringify(graph, null, 2)}\n`);
  writeAtomic(html, template.replace('__GRAPH_DATA__', () => inline));
  return { json, html, nodes: graph.nodes.length, edges: graph.edges.length };
}

module.exports = { buildGraph, writeGraph };
