#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const { test } = require('node:test');

const CLI = path.join(__dirname, '../assets/skills/doc/doc.mjs');

// Copies doc.mjs into a temp skills dir so the sibling session-handoff config.json never touches assets/.
function setup({ handoff, unified } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-skill-'));
  const dirs = {
    doc: path.join(base, 'skills', 'doc'),
    handoff: path.join(base, 'skills', 'session-handoff'),
    exonous: path.join(base, 'exo-home', '.claude', 'exonous'),
    repo: path.join(base, 'demo'),
    unifiedVault: path.join(base, 'unified-vault'),
    handoffVault: path.join(base, 'handoff-vault'),
  };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(CLI, path.join(dirs.doc, 'doc.mjs'));
  execFileSync('git', ['init', '-q'], { cwd: dirs.repo });
  for (const vault of [dirs.unifiedVault, dirs.handoffVault]) {
    fs.mkdirSync(path.join(vault, 'demo'), { recursive: true });
    fs.writeFileSync(path.join(vault, 'demo', '2026-10-01 0900 old.md'), '# old\n');
    fs.writeFileSync(path.join(vault, 'demo', '2026-10-22 1800 latest.md'), '# latest\n');
  }
  if (handoff) fs.writeFileSync(path.join(dirs.handoff, 'config.json'), handoff(dirs));
  if (unified) fs.writeFileSync(path.join(dirs.exonous, 'config.json'), unified(dirs));
  const out = spawnSync('node', [path.join(dirs.doc, 'doc.mjs'), 'locate', '--repo', dirs.repo], {
    encoding: 'utf8',
    env: { ...process.env, EXONOUS_HOME: path.join(base, 'exo-home'), HOME: path.join(base, 'home') },
  });
  assert.ok(out.stdout, out.stderr);
  return { dirs, session: JSON.parse(out.stdout).session };
}

const posix = (p) => p.split(path.sep).join('/');
const latest = (vault) => posix(path.join(vault, 'demo', '2026-10-22 1800 latest.md'));

test('unified exonous vault finds the latest session note', () => {
  const { dirs, session } = setup({ unified: (d) => JSON.stringify({ vault: d.unifiedVault }) });
  assert.strictEqual(session.note, latest(dirs.unifiedVault));
  assert.strictEqual(session.reason, null);
});

test('session-handoff sessionsVault overrides the unified vault', () => {
  const { dirs, session } = setup({
    handoff: (d) => JSON.stringify({ sessionsVault: d.handoffVault }),
    unified: (d) => JSON.stringify({ vault: d.unifiedVault }),
  });
  assert.strictEqual(session.note, latest(dirs.handoffVault));
});

test('invalid unified config is reported, not ignored', () => {
  const { session } = setup({ unified: () => '{ not json' });
  assert.strictEqual(session.note, null);
  assert.match(session.reason, /config\.json inválido/);
});

test('no config at all points to exonous vault detect', () => {
  const { session } = setup();
  assert.strictEqual(session.note, null);
  assert.match(session.reason, /exonous vault detect/);
});
