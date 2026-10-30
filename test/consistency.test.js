#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

// Guards what every session pays for: shipped names resolve, the old brand stays inside src/legacy/,
// and the always-loaded context stays inside its byte budget.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const { HOME_SKILLS, COMMANDS, DESIGN_SKILLS } = require('../src/lib/runtime');
const { renderRules, VARIANTS } = require('../src/lib/render-rules');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const NOMOS_BUDGET = 4500;
const COMMON_RULES_BUDGET = 4000;
const MIN_RULES_BUDGET = 3072;
const LEGACY_ZONES = ['src/legacy/', 'maintainer/'];
const LEGACY_PACKAGE = '@tron/claude-config';
// The tron brand and the Greek skill names that English names replaced.
const OLD_BRAND = /(?<![a-z])(?:tron|hodos|mneme|graphe|pinax|elenchos|phylax|kallos|kinesis|physis|eikon|kanon)(?![a-z])/i;
// Vendored design engine: license-bound third-party files, not ours to rename.
const VENDORED = /^assets\/skills\/ui-design\/scripts\/(?!ui-design$|ui-design\.mjs$|command-metadata\.json$)/;

const read = (f) => fs.readFileSync(f, 'utf8');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const subdirs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.cache', '.git'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const isText = (f) => !read(f).includes('\0');
const shipped = ['bin', 'src', 'assets'].flatMap((d) => walk(path.join(ROOT, d)))
  .filter((f) => !VENDORED.test(rel(f)) && isText(f));
const docs = shipped.filter((f) => /\.(md|mdc)$/.test(f));
const roster = JSON.parse(read(path.join(ASSETS, 'agents', 'roster.json')));
const techneSkills = new Set(subdirs(path.join(ASSETS, 'techne', 'skills')));

test('roster.json matches the agent files and their tiers', () => {
  const files = fs.readdirSync(path.join(ASSETS, 'agents')).filter((f) => /^exo-.+\.md$/.test(f)).map((f) => f.slice(0, -3)).sort();
  assert.deepStrictEqual([...roster.agents].sort(), files);
  for (const agent of roster.agents) {
    const body = read(path.join(ASSETS, 'agents', `${agent}.md`));
    assert.strictEqual(/^model:\s*(\S+)/m.exec(body)?.[1], roster.tiers[agent], `${agent} model differs from its tier`);
    assert.match(body, /\{"status":"done\|partial\|blocked"/, `${agent} lacks the report line`);
  }
});

test('every exo-* and techne:* name in shipped docs exists', () => {
  const unknown = docs.flatMap((f) => [
    ...(read(f).match(/\bexo-[a-z][a-z-]*/g) || []).filter((n) => !roster.agents.includes(n)),
    ...(read(f).match(/\btechne:[a-z][a-z-]*/g) || []).filter((n) => !techneSkills.has(n.slice(7))),
  ].map((n) => `${rel(f)}: ${n}`));
  assert.deepStrictEqual(unknown, []);
});

test('every file install writes is shipped', () => {
  const missing = [
    path.join(ASSETS, 'machine', 'PR-TEMPLATE.md'),
    path.join(ASSETS, 'machine', 'hooks', 'pyle.cjs'),
    path.join(ASSETS, 'editors', 'hooks', 'cursor', 'hooks.json'),
    path.join(ASSETS, 'editors', 'cursor', 'frontend-skills.mdc'),
    ...Object.entries(HOME_SKILLS).flatMap(([name, files]) => files.map((f) => path.join(ASSETS, 'skills', name, f))),
    ...COMMANDS.map((name) => path.join(ASSETS, 'skills', name, 'SKILL.md')),
    ...DESIGN_SKILLS.map((name) => path.join(ASSETS, 'skills', name, 'SKILL.md')),
    path.join(ASSETS, 'skills', 'ui-patterns', 'SKILL.md'),
  ].filter((f) => !fs.existsSync(f)).map(rel);
  assert.deepStrictEqual(missing, []);
});

test('skill frontmatter names match their folders', () => {
  for (const base of [path.join(ASSETS, 'skills'), path.join(ASSETS, 'techne', 'skills')]) {
    for (const dir of subdirs(base)) {
      const name = /^name:\s*(\S+)/m.exec(read(path.join(base, dir, 'SKILL.md')));
      if (name) assert.strictEqual(name[1], dir, `${rel(base)}/${dir}`);
    }
  }
});

test('old names appear only inside the legacy bridge', () => {
  const hits = shipped
    .filter((f) => !LEGACY_ZONES.some((zone) => rel(f).startsWith(zone)))
    .flatMap((f) => read(f).split('\n').map((line, i) => [line.replaceAll(LEGACY_PACKAGE, ''), i + 1, f]))
    .filter(([line]) => OLD_BRAND.test(line))
    .map(([line, n, f]) => `${rel(f)}:${n}: ${line.trim().slice(0, 100)}`);
  assert.deepStrictEqual(hits, []);
});

test('always-loaded context stays inside its byte budget', () => {
  const nomos = fs.statSync(path.join(ASSETS, 'rules', 'nomos.md')).size;
  assert.ok(nomos <= NOMOS_BUDGET, `nomos.md is ${nomos} B (budget ${NOMOS_BUDGET})`);
  const commonDir = path.join(ASSETS, 'techne', 'rules', 'common');
  const common = fs.readdirSync(commonDir).reduce((sum, f) => sum + fs.statSync(path.join(commonDir, f)).size, 0);
  assert.ok(common <= COMMON_RULES_BUDGET, `techne rules/common is ${common} B (budget ${COMMON_RULES_BUDGET})`);
});

test('every rules variant fits inside the source and min fits the Windsurf budget', () => {
  const source = fs.statSync(path.join(ASSETS, 'rules', 'nomos.md')).size;
  for (const variant of VARIANTS) {
    const size = Buffer.byteLength(renderRules(variant));
    assert.ok(size <= source, `${variant} is ${size} B, larger than nomos.md (${source} B)`);
  }
  const min = Buffer.byteLength(renderRules('min'));
  assert.ok(min <= MIN_RULES_BUDGET, `min rules are ${min} B (budget ${MIN_RULES_BUDGET})`);
});

test('package.json has no install lifecycle scripts, so a git install never runs our code in a temp clone', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  for (const name of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack', 'build']) {
    assert.ok(!(pkg.scripts && name in pkg.scripts), `scripts.${name} must not exist`);
  }
  assert.ok(!pkg.files.some((f) => /postinstall/.test(f)));
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'scripts', 'postinstall.js')));
});

