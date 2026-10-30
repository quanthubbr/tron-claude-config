#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const { install } = require('../src/install');
const { uninstall } = require('../src/uninstall');
const { ADAPTERS, select } = require('../src/adapters');
const { renderRules } = require('../src/lib/render-rules');
const fx = require('./helpers/adapter-fixture');

const osHome = fx.useFixtureHome();
const byId = (id) => ADAPTERS.find((a) => a.id === id);
const run = (tools, q = fx.quiet()) => install({ external: false, execPath: process.execPath, tools, ...q });

test('soft tools are gate soft with warn-level "soft: not enforced" rows; aider is unsupported and never selected', () => {
  for (const id of ['cline', 'qwen', 'kiro']) {
    const a = byId(id);
    assert.strictEqual(a.gate, 'soft', id);
    const gate = a.doctor({}).find((r) => /soft: not enforced/.test(r.status));
    assert.ok(gate && gate.level === 'warn' && !gate.ok, id);
  }
  assert.strictEqual(byId('aider').gate, 'none');
  assert.ok(!select({ all: true }).selected.some((a) => a.id === 'aider'));
  assert.ok(!ADAPTERS.some((a) => a.id === 'roo'));
});

test('Cline: own rules file only when ~/Documents/Cline exists; removed on uninstall', async () => {
  run(['cline']);
  assert.ok(!fx.exists('Documents'));
  fx.write('# mine\n', 'Documents', 'Cline', 'Rules', 'mine.md');
  const q = fx.quiet();
  run(['cline'], q);
  assert.strictEqual(fx.read('Documents', 'Cline', 'Rules', 'exonous-nomos.md'), renderRules('no-agents'));
  assert.ok(q.logs.some((m) => /^⚠ cline: rules only — commits are NOT gated/.test(m)));
  await uninstall({ yes: true, log: () => {} });
  assert.ok(!fx.exists('Documents', 'Cline', 'Rules', 'exonous-nomos.md'));
  assert.strictEqual(fx.read('Documents', 'Cline', 'Rules', 'mine.md'), '# mine\n');
});

test('Qwen: marker section in ~/.qwen/QWEN.md only when ~/.qwen exists; uninstall restores the file exactly', async () => {
  run(['qwen']);
  assert.ok(!fx.exists('.qwen'));
  const mine = '# Qwen notes\nno trailing newline';
  fx.write(mine, '.qwen', 'QWEN.md');
  run(['qwen']);
  const text = fx.read('.qwen', 'QWEN.md');
  assert.ok(text.startsWith(mine) && text.includes('exonous:start'));
  run(['qwen']);
  assert.strictEqual(fx.read('.qwen', 'QWEN.md'), text);
  await uninstall({ yes: true, log: () => {} });
  assert.strictEqual(fx.read('.qwen', 'QWEN.md'), mine);
});

test('Kiro: detect only, nothing written', () => {
  fs.mkdirSync(fx.home('.kiro'));
  const before = fs.readdirSync(fx.home('.kiro'));
  const q = fx.quiet();
  run(['kiro'], q);
  assert.deepStrictEqual(fs.readdirSync(fx.home('.kiro')), before);
  assert.ok(byId('kiro').detect());
  assert.ok(q.logs.some((m) => /^⚠ kiro: detected only — commits are NOT gated/.test(m)));
});

test('Aider: detected by ~/.aider.conf.yml or the binary; doctor hint only, install never writes for it', () => {
  const aider = byId('aider');
  assert.strictEqual(aider.detect(), false);
  fx.write('model: x\n', '.aider.conf.yml');
  assert.strictEqual(aider.detect(), true);
  const row = aider.doctor({})[0];
  assert.strictEqual(row.level, 'warn');
  assert.match(row.fix, /read: \[~\/\.claude\/exonous\/rules\/nomos\.md\]/);
  fs.mkdirSync(fx.home('.claude'));
  const q = fx.quiet();
  install({ external: false, execPath: process.execPath, ...q });
  assert.strictEqual(fx.read('.aider.conf.yml'), 'model: x\n');
  assert.ok(q.logs.some((m) => /^⚠ aider: unsupported — /.test(m)));
  assert.deepStrictEqual(fs.readdirSync(osHome.osHome), []);
});

test('the binary on PATH also detects aider', { skip: process.platform === 'win32' ? 'sh shims' : false }, () => {
  const bin = process.env.PATH.split(path.delimiter)[0];
  fs.writeFileSync(path.join(bin, 'aider'), '#!/bin/sh\n', { mode: 0o755 });
  assert.strictEqual(byId('aider').detect(), true);
});
