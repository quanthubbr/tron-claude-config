#!/usr/bin/env node
// maintainer/pege/originality.js — MAINTAINER ONLY: prove rewritten artifacts are exonous's own text
// Usage: npm run pege:originality [-- <id>...] [-- --max <n>] [-- --show <n>]
// For every source with an `originality` block: compares prose (code stripped) of the local paths
// against the upstream files at the pinned ref using 8-word shingles, and scans the local paths
// for upstream brand terms (`brandTerms` in sources.json). With `protocol`, also fails when an engine
// verb or flag the upstream uses is missing from the rewrite. Exit 1 on any violation.

'use strict';

const fs = require('fs');
const path = require('path');
const { UPSTREAM_ROOT, loadSources, SOURCES_PATH } = require('./lib/sources');
const { git, mirror } = require('./lib/git');

const PACKAGE_ROOT = path.resolve(UPSTREAM_ROOT, '..', '..');
const SHINGLE = 8;
const TEXT_EXT = new Set(['.md', '.mdc', '.txt']);

function log(msg) {
  process.stdout.write(`[pege:originality] ${msg}\n`);
}

function parseArgs(argv) {
  const args = { ids: [], max: 2, show: 3 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--max') args.max = Number(argv[++i]);
    else if (arg === '--show') args.show = Number(argv[++i]);
    else if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    else args.ids.push(arg);
  }
  if (!Number.isInteger(args.max) || args.max < 0) throw new Error('--max must be a non-negative integer');
  if (!Number.isInteger(args.show) || args.show < 0) throw new Error('--show must be a non-negative integer');
  return args;
}

function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

function prose(text) {
  return text
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9'\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function shingles(words) {
  const out = new Set();
  for (let i = 0; i + SHINGLE <= words.length; i++) out.add(words.slice(i, i + SHINGLE).join(' '));
  return out;
}

function localFiles(relPaths, exclude) {
  const skip = (rel) => exclude.some((ex) => rel === ex || rel.startsWith(ex.endsWith('/') ? ex : `${ex}/`));
  const walk = (abs) => {
    const rel = path.relative(PACKAGE_ROOT, abs);
    if (skip(rel) || !fs.existsSync(abs)) return [];
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) return fs.readdirSync(abs).flatMap((name) => walk(path.join(abs, name)));
    return TEXT_EXT.has(path.extname(abs)) ? [rel] : [];
  };
  return relPaths.flatMap((rel) => walk(path.join(PACKAGE_ROOT, rel)));
}

function upstreamCorpus(source, globs) {
  const { dir } = mirror(source);
  const patterns = globs.map(globToRegExp);
  const files = git(dir, 'ls-tree', '-r', '--name-only', source.ref)
    .split('\n')
    .filter((f) => patterns.some((re) => re.test(f)));
  if (!files.length) throw new Error(`no upstream files match ${globs.join(', ')} at ${source.ref}`);
  const corpus = new Set();
  const texts = [];
  for (const file of files) {
    const text = git(dir, 'show', `${source.ref}:${file}`);
    texts.push(text);
    for (const s of shingles(prose(text))) corpus.add(s);
  }
  return { files: files.length, corpus, texts };
}

// Protocol the rewrite must keep: every engine verb the upstream invokes, and every CLI flag it passes.
function missingProtocol(protocol, upstreamTexts, localText) {
  const verbAll = new RegExp(protocol.verbs, 'g');
  const verbLine = new RegExp(protocol.verbs);
  const flagRe = /(?<![\w-])--[a-z][a-z0-9-]*[a-z0-9]/g;
  const escape = (token) => token.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const want = new Set();
  for (const text of upstreamTexts) {
    for (const m of text.matchAll(verbAll)) want.add(`verb ${m[1]}`);
    if (protocol.flags) {
      for (const line of text.split('\n').filter((l) => verbLine.test(l))) {
        for (const f of line.match(flagRe) || []) want.add(`flag ${f}`);
      }
    }
  }
  const ignore = new Set(protocol.ignore || []);
  return [...want].filter((item) => {
    const token = item.split(' ')[1];
    if (ignore.has(token)) return false;
    return !new RegExp(`(?<![\\w-])${escape(token)}(?![\\w-])`).test(localText);
  }).sort();
}

function brandMatchers(terms) {
  return terms.map((term) => ({ term, re: new RegExp(term, 'i') }));
}

// Engine-owned literals the binary reads or writes stay verbatim; they are not mentions.
function stripEngineLiterals(text) {
  return text
    .replace(/\.impeccable\b[\w./-]*/g, ' ')
    .replace(/\bIMPECCABLE_[A-Z_]+\b/g, ' ')
    .replace(/\bimpeccable:product-schema\b/g, ' ')
    .replace(/\bimpeccable-(?:disable-next-line|disable-line|disable|allow-kickers|ignore)\b/g, ' ')
    .replace(/\bdata-impeccable-[\w*-]*/g, ' ')
    .replace(/\bimpeccable-(?:variants-start|variants-end|carbonize-start|carbonize-end|carbonize-start\/end|param-values)\b/g, ' ')
    .replace(/\b__impeccable\w*/g, ' ');
}

function checkSource(source, matchers, args) {
  const spec = source.originality;
  const files = localFiles(spec.local, spec.exclude || []);
  if (!files.length) throw new Error(`no local files under ${spec.local.join(', ')}`);
  const { files: upstreamCount, corpus, texts } = upstreamCorpus(source, spec.upstream);
  const violations = [];
  if (spec.protocol) {
    const localText = files.map((rel) => fs.readFileSync(path.join(PACKAGE_ROOT, rel), 'utf8')).join('\n');
    const missing = missingProtocol(spec.protocol, texts, localText);
    if (missing.length) violations.push(`protocol dropped by the rewrite: ${missing.join(', ')}`);
  }
  for (const rel of files) {
    const text = fs.readFileSync(path.join(PACKAGE_ROOT, rel), 'utf8');
    const shared = [...shingles(prose(text))].filter((s) => corpus.has(s));
    if (shared.length > args.max) violations.push(`${rel}: ${shared.length} shared ${SHINGLE}-word runs, e.g. "${shared.slice(0, args.show).join('" | "')}"`);
    const scrubbed = stripEngineLiterals(text);
    for (const { term, re } of matchers) {
      const line = scrubbed.split('\n').findIndex((l) => re.test(l));
      if (line !== -1) violations.push(`${rel}:${line + 1}: upstream term /${term}/`);
    }
  }
  return { files: files.length, upstreamCount, violations };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const registry = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
  const matchers = brandMatchers(registry.brandTerms || []);
  const sources = loadSources().filter((s) => s.originality && (!args.ids.length || args.ids.includes(s.id)));
  if (!sources.length) throw new Error('no sources with an `originality` block matched');

  let failed = 0;
  for (const source of sources) {
    try {
      const result = checkSource(source, matchers, args);
      if (result.violations.length) {
        failed++;
        log(`${source.id}: FAIL — ${result.violations.length} violation(s) across ${result.files} file(s) vs ${result.upstreamCount} upstream file(s)`);
        for (const v of result.violations) log(`  ${v}`);
      } else {
        log(`${source.id}: ok — ${result.files} file(s) vs ${result.upstreamCount} upstream file(s)`);
      }
    } catch (err) {
      failed++;
      log(`${source.id}: ERROR ${err.message.split('\n')[0]}`);
    }
  }
  if (failed) process.exitCode = 1;
}

try {
  main();
} catch (err) {
  process.stderr.write(`[pege:originality] ERROR: ${err.message}\n`);
  process.exit(1);
}
