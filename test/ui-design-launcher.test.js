#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { spawnSync } = require('child_process');
const { test } = require('node:test');

const SCRIPTS = path.join(__dirname, '..', 'assets', 'skills', 'ui-design', 'scripts');
const LAUNCHER = path.join(SCRIPTS, 'ui-design.mjs');
const skip = process.platform === 'win32' ? 'sh fake engine' : false;
const load = () => import(pathToFileURL(LAUNCHER).href);

const FAKE_ENGINE = `#!/bin/sh
echo "args:$*"
echo "self:$IMPECCABLE_SELF skill:$IMPECCABLE_SKILL_DIR"
echo "flags:$IMPECCABLE_NO_UPDATE_CHECK$IMPECCABLE_NO_TELEMETRY$DO_NOT_TRACK"
echo "run npx impeccable update"
echo "see https://impeccable.style"
echo "[impeccable@3] Impeccable's hint: try /impeccable live"
exit "\${FAKE_RC:-0}"
`;

function skill({ engine = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-design-'));
  const scripts = path.join(dir, 'scripts');
  fs.mkdirSync(scripts);
  fs.copyFileSync(LAUNCHER, path.join(scripts, 'ui-design.mjs'));
  fs.writeFileSync(path.join(scripts, 'command-metadata.json'), JSON.stringify({
    craft: { description: 'Legacy alias.' },
    init: { description: 'Capture "product" truth.' },
    polish: { description: 'Final pass.' },
  }));
  if (engine) fs.writeFileSync(path.join(scripts, 'impeccable'), FAKE_ENGINE);
  return { dir: fs.realpathSync(dir), scripts: fs.realpathSync(scripts) };
}

function run(fx, args, env = {}) {
  const clean = { ...process.env, IMPECCABLE_SKILL_DIR: '', ...env };
  if (!env.IMPECCABLE_SKILL_DIR) delete clean.IMPECCABLE_SKILL_DIR;
  return spawnSync(process.execPath, [path.join(fx.scripts, 'ui-design.mjs'), ...args], { env: clean, encoding: 'utf8' });
}

test('rename rebrands engine output without touching anything else', async () => {
  const { rename } = await load();
  assert.strictEqual(rename('[impeccable@12] Impeccable\'s run `/impeccable live` and (/impeccable)'), '[ui-design] ui-design\'s run `/ui-design live` and (/ui-design)');
  assert.strictEqual(rename('a /impeccable\nb /impeccable\n'), 'a /ui-design\nb /ui-design\n');
  assert.strictEqual(rename('{"path":"x/impeccable/y"}'), '{"path":"x/impeccable/y"}');
});

test('upstream install and site pointers are dropped line by line', async () => {
  const { dropUpstreamPointers } = await load();
  assert.strictEqual(dropUpstreamPointers('keep\nnpx impeccable x\nimpeccable.style\nlast\n'), 'keep\nlast\n');
});

test('on Windows without a known engine binary, impeccable.cmd runs with every argument quoted for cmd.exe', async () => {
  const { engineCommand, cmdQuote } = await load();
  const run = engineCommand('C:\\s k\\scripts', ['detect', '--json', 'src\\a & b\\'], 'win32', {});
  assert.deepStrictEqual(run.options, { shell: true });
  assert.deepStrictEqual(run.args, []);
  assert.strictEqual(run.command, `"${path.join('C:\\s k\\scripts', 'impeccable.cmd')}" "detect" "--json" "src\\a & b\\\\"`);
  assert.throws(() => cmdQuote('100%'), /%/);
  assert.throws(() => cmdQuote('{"a":1}'), /contains/);
  assert.throws(() => cmdQuote('a\nb'), /line break/);
});

test('elsewhere the engine runs through sh with arguments passed as-is', async () => {
  const { engineCommand } = await load();
  assert.deepStrictEqual(engineCommand('/s', ['live', '$HOME "x"'], 'linux'), { command: 'sh', args: [path.join('/s', 'impeccable'), 'live', '$HOME "x"'], options: {} });
});

test('a missing engine launcher exits 127', { skip }, () => {
  const r = run(skill({ engine: false }), ['context']);
  assert.strictEqual(r.status, 127);
  assert.match(r.stderr, /engine launcher missing/);
});

test('self-update verbs are blocked with exit 2', { skip }, () => {
  const fx = skill();
  for (const verb of ['update', 'check', 'install', 'link', 'skills']) {
    const r = run(fx, [verb]);
    assert.strictEqual(r.status, 2, verb);
    assert.match(r.stderr, /managed by exonous/);
    assert.strictEqual(r.stdout, '');
  }
});

test('help lists commands from command-metadata.json, minus the craft alias', { skip }, () => {
  const fx = skill();
  const r = run(fx, ['--help']);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, [
    `ui-design — design commands (/ui-design <command> [target]); full routing in ${fx.dir}/SKILL.md`,
    '',
    '  /init         Capture "product" truth.',
    '  /polish       Final pass.',
    '',
    'Engine verbs: context, detect, hooks, doctor, live, ... (see SKILL.md)',
    '',
  ].join('\n'));
});

test('buffered verbs set the exonous env, filter and rebrand output, and pass the exit code through', { skip }, () => {
  const fx = skill();
  const r = run(fx, ['context', '--target', 'a b'], { FAKE_RC: '3' });
  assert.strictEqual(r.status, 3);
  assert.strictEqual(r.stdout, [
    'args:context --target a b',
    `self:${path.join(fx.scripts, 'ui-design')} skill:${fx.dir}`,
    'flags:111',
    "[ui-design] ui-design's hint: try /ui-design live",
    '',
  ].join('\n'));
});

test('hook verbs only rebrand, keeping every line', { skip }, () => {
  const r = run(skill(), ['hook-before-edit'], { IMPECCABLE_SKILL_DIR: '/custom' });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /skill:\/custom/);
  assert.match(r.stdout, /npx impeccable update/);
  assert.match(r.stdout, /\[ui-design\] ui-design's hint/);
});

test('other verbs stream engine output untouched', { skip }, () => {
  const r = run(skill(), ['live', '--x'], { FAKE_RC: '4' });
  assert.strictEqual(r.status, 4);
  assert.match(r.stdout, /^args:live --x$/m);
  assert.match(r.stdout, /\[impeccable@3\] Impeccable's hint: try \/impeccable live/);
});

test('the POSIX shim forwards to the node launcher', { skip }, () => {
  const fx = skill();
  fs.copyFileSync(path.join(SCRIPTS, 'ui-design'), path.join(fx.scripts, 'ui-design'));
  const r = spawnSync('sh', [path.join(fx.scripts, 'ui-design'), 'update'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /managed by exonous/);
});

test('on Windows a trusted engine binary runs directly, so arguments never pass through cmd.exe', async () => {
  const { engineCommand, windowsEngine } = await load();
  const fx = skill();
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-design-cache-'));
  fs.writeFileSync(path.join(fx.scripts, 'VERSION'), '3.1.0\r\n');
  const cached = path.join(cache, 'bin', '3.1.0', 'impeccable.exe');
  fs.mkdirSync(path.dirname(cached), { recursive: true });
  fs.writeFileSync(cached, '');
  assert.strictEqual(windowsEngine(fx.scripts, { IMPECCABLE_HOME: cache }), cached);
  assert.strictEqual(windowsEngine(fx.scripts, { USERPROFILE: path.join(cache, 'nobody') }), null);
  const sibling = path.join(fx.scripts, 'bin', 'windows-arm64', 'impeccable.exe');
  fs.mkdirSync(path.dirname(sibling), { recursive: true });
  fs.writeFileSync(sibling, '');
  assert.strictEqual(windowsEngine(fx.scripts, { IMPECCABLE_HOME: cache, PROCESSOR_ARCHITECTURE: 'ARM64' }), sibling);
  assert.strictEqual(windowsEngine(fx.scripts, { IMPECCABLE_HOME: cache, PROCESSOR_ARCHITECTURE: 'AMD64' }), cached);
  assert.strictEqual(windowsEngine(fx.scripts, { IMPECCABLE_BIN: cached, PROCESSOR_ARCHITECTURE: 'ARM64' }), cached);
  const data = '{"status":"done","note":"100%"}';
  assert.deepStrictEqual(engineCommand(fx.scripts, ['live-poll', '--data', data], 'win32', { IMPECCABLE_HOME: cache }), { command: cached, args: ['live-poll', '--data', data], options: {} });
});
