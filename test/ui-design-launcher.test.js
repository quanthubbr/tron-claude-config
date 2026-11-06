#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { spawnSync, spawn } = require('child_process');
const { createHash } = require('crypto');
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
  const fx = integrityFixture();
  fs.unlinkSync(fx.cached);
  const run = engineCommand(fx.scripts, ['detect', '--json', 'src\\a & b\\'], 'win32', fx.env);
  assert.deepStrictEqual(run.options, { shell: true });
  assert.deepStrictEqual(run.args, []);
  assert.strictEqual(run.command, `"${path.join(fx.scripts, 'impeccable.cmd')}" "detect" "--json" "src\\a & b\\\\"`);
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

test('Windows ARM64 uses only authenticated x64 fallback and preserves explicit overrides', async () => {
  const { windowsEngine } = await load();
  const fx = integrityFixture();
  assert.strictEqual(windowsEngine(fx.scripts, { ...fx.env, PROCESSOR_ARCHITECTURE: 'ARM64' }), fx.cached);
  const sibling = path.join(fx.scripts, 'bin', 'windows-x64', 'impeccable.exe');
  fs.mkdirSync(path.dirname(sibling), { recursive: true });
  fs.writeFileSync(sibling, fx.bytes);
  assert.strictEqual(windowsEngine(fx.scripts, { ...fx.env, PROCESSOR_ARCHITECTURE: 'ARM64' }), sibling);
  assert.strictEqual(windowsEngine(fx.scripts, { ...fx.env, IMPECCABLE_BIN: fx.cached }), fx.cached);
});


function integrityFixture() {
  const fx = skill();
  const cache = path.join(fx.dir, 'cache');
  const profile = path.join(fx.dir, 'home');
  fs.writeFileSync(path.join(fx.scripts, 'VERSION'), '0.1.5\n');
  const bytes = 'inert verified engine fixture';
  const hash = createHash('sha256').update(bytes).digest('hex');
  const manifest = `version 0.1.5\n${hash}  impeccable-windows-x64.exe\n`;
  fs.writeFileSync(path.join(fx.scripts, 'ENGINE-CHECKSUMS'), manifest);
  const cached = path.join(cache, 'bin', '0.1.5', 'impeccable.exe');
  fs.mkdirSync(path.dirname(cached), { recursive: true });
  fs.writeFileSync(cached, bytes);
  return { ...fx, cache, profile, bytes, manifest, cached, env: { IMPECCABLE_HOME: cache, USERPROFILE: profile, PATH: '' } };
}

test('Windows direct selection authenticates inert bytes and keeps JSON arguments unchanged', async () => {
  const { windowsEngine, engineCommand } = await load();
  const fx = integrityFixture();
  const args = ['live-poll', '--data', '{"note":"100%"}'];
  assert.strictEqual(windowsEngine(fx.scripts, fx.env), fx.cached);
  assert.deepStrictEqual(engineCommand(fx.scripts, args, 'win32', fx.env), { command: fx.cached, args, options: {} });
  fs.writeFileSync(fx.cached, 'tampered');
  assert.throws(() => windowsEngine(fx.scripts, fx.env), /checksum|integrity/i);
});

test('Windows direct selection rejects absent, malformed, duplicate and mismatched manifests', async () => {
  const { windowsEngine } = await load();
  const fx = integrityFixture();
  const file = path.join(fx.scripts, 'ENGINE-CHECKSUMS');
  for (const manifest of ['', 'version 0.1.6\n', fx.manifest + '\n', fx.manifest + fx.manifest.split('\n')[1] + '\n', fx.manifest.replace(/[a-f0-9]{64}/, 'invalid'), fx.manifest.replace('windows-x64.exe', 'unknown'), fx.manifest.replace('version 0.1.5\n', '')]) {
    fs.writeFileSync(file, manifest);
    assert.throws(() => windowsEngine(fx.scripts, fx.env), /manifest|integrity/i, manifest);
  }
  fs.unlinkSync(file);
  assert.throws(() => windowsEngine(fx.scripts, fx.env), /manifest|integrity/i);
});

test('Windows automatic sibling, home and PATH candidates cannot bypass authentication', async () => {
  const { windowsEngine } = await load();
  for (const location of ['sibling', 'home', 'PATH']) {
    const fx = integrityFixture();
    fs.unlinkSync(fx.cached);
    const file = location === 'sibling' ? path.join(fx.scripts, 'bin', 'windows-x64', 'impeccable.exe') : location === 'home' ? path.join(fx.profile, '.impeccable', 'bin', 'impeccable.exe') : path.join(fx.dir, 'path', 'impeccable.exe');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'unverified candidate');
    if (location === 'PATH') fx.env.PATH = path.dirname(file);
    assert.throws(() => windowsEngine(fx.scripts, fx.env), /checksum|integrity/i, location);
    fs.writeFileSync(file, fx.bytes);
    assert.strictEqual(windowsEngine(fx.scripts, fx.env), file, location);
  }
});

test('Windows explicit override bypasses pins but an invalid defined override never falls back', async () => {
  const { windowsEngine } = await load();
  const fx = integrityFixture();
  fs.unlinkSync(path.join(fx.scripts, 'ENGINE-CHECKSUMS'));
  assert.strictEqual(windowsEngine(fx.scripts, { ...fx.env, IMPECCABLE_BIN: fx.cached }), fx.cached);
  for (const file of ['', path.join(fx.dir, 'missing'), fx.dir]) assert.throws(() => windowsEngine(fx.scripts, { ...fx.env, IMPECCABLE_BIN: file }), /override|IMPECCABLE_BIN/i);
});

function shellFixture() {
  const fx = skill();
  fs.copyFileSync(path.join(SCRIPTS, 'impeccable'), path.join(fx.scripts, 'impeccable'));
  fs.copyFileSync(path.join(SCRIPTS, 'impeccable.cmd'), path.join(fx.scripts, 'impeccable.cmd'));
  const tools = path.join(fx.dir, 'tools');
  fs.mkdirSync(tools);
  fs.writeFileSync(path.join(tools, 'uname'), '#!/bin/sh\ncase "$1" in -s) echo Linux;; *) echo x86_64;; esac\n', { mode: 0o755 });
  fs.writeFileSync(path.join(tools, 'curl'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  fs.writeFileSync(path.join(fx.scripts, 'VERSION'), '0.1.5\n');
  const bytes = '#!/bin/sh\nprintf "executed:%s\\n" "$*"\n[ -z "${ENGINE_MARKER:-}" ] || touch "$ENGINE_MARKER"\n';
  const digest = createHash('sha256').update(bytes).digest('hex');
  const manifest = `version 0.1.5\n${digest}  impeccable-linux-x64\n`;
  fs.writeFileSync(path.join(fx.scripts, 'ENGINE-CHECKSUMS'), manifest);
  const cache = path.join(fx.dir, 'cache');
  const cached = path.join(cache, 'bin', '0.1.5', 'impeccable');
  fs.mkdirSync(path.dirname(cached), { recursive: true });
  const home = path.join(fx.dir, 'home');
  fs.mkdirSync(home);
  const shell = process.platform === 'win32' ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'sh.exe') : 'sh';
  const env = { ...process.env, HOME: home.replace(/\\/g, '/'), IMPECCABLE_HOME: cache.replace(/\\/g, '/'), PATH: `${tools}${path.delimiter}${process.env.PATH}`, FIXTURE_TOOLS: tools.replace(/\\/g, '/'), ENGINE_MARKER: path.join(fx.dir, 'executed').replace(/\\/g, '/') };
  delete env.IMPECCABLE_BIN;
  delete env.IMPECCABLE_LAUNCHER_PROBE;
  const shellArgs = ['-c', process.platform === 'win32' ? 'PATH="$(cygpath -u "$FIXTURE_TOOLS"):$PATH"; export PATH; exec sh "$@"' : 'PATH="$FIXTURE_TOOLS:$PATH"; export PATH; exec sh "$@"', 'fixture'];
  const launch = (extra = {}, args = ['context', 'a b']) => spawnSync(shell, [...shellArgs, path.join(fx.scripts, 'impeccable'), ...args], { env: { ...env, ...extra }, encoding: 'utf8' });
  return { ...fx, bytes, manifest, tools, cache, cached, home, env, shell, shellArgs, launch };
}

test('POSIX launcher never executes automatic candidates before authentication', () => {
  for (const location of ['cache', 'sibling', 'home', 'PATH']) {
    const fx = shellFixture();
    const candidate = location === 'cache' ? fx.cached : location === 'sibling' ? path.join(fx.scripts, 'bin', 'linux-x64', 'impeccable') : location === 'home' ? path.join(fx.home, '.impeccable', 'bin', 'impeccable') : path.join(fx.tools, 'impeccable');
    fs.mkdirSync(path.dirname(candidate), { recursive: true });
    fs.writeFileSync(candidate, fx.bytes + '\n# tampered\n', { mode: 0o755 });
    const r = fx.launch();
    assert.strictEqual(r.status, 127, `${location}: ${r.stderr}`);
    assert.strictEqual(fs.existsSync(fx.env.ENGINE_MARKER), false, `${location} must not even be probed`);
    assert.match(r.stderr, /checksum|integrity/i);
  }
});

test('POSIX launcher rejects missing, duplicate, malformed and wrong-version manifests', () => {
  const fx = shellFixture();
  fs.writeFileSync(fx.cached, fx.bytes, { mode: 0o755 });
  const file = path.join(fx.scripts, 'ENGINE-CHECKSUMS');
  for (const manifest of [null, '', fx.manifest + fx.manifest.split('\n')[1] + '\n', fx.manifest.replace('version 0.1.5', 'version 0.1.6'), fx.manifest.replace(/[a-f0-9]{64}/, 'bad'), fx.manifest.replace('linux-x64', 'unknown')]) {
    if (manifest === null) fs.unlinkSync(file);
    else fs.writeFileSync(file, manifest);
    const r = fx.launch();
    assert.strictEqual(r.status, 127, `${manifest}: ${r.stderr}`);
    assert.strictEqual(fs.existsSync(fx.env.ENGINE_MARKER), false);
  }
});

test('POSIX launcher authenticates valid cache and treats override as explicit', () => {
  const fx = shellFixture();
  fs.writeFileSync(fx.cached, fx.bytes, { mode: 0o755 });
  const r = fx.launch();
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /executed:context a b/);
  fs.unlinkSync(path.join(fx.scripts, 'ENGINE-CHECKSUMS'));
  assert.strictEqual(fx.launch({ IMPECCABLE_BIN: fx.cached }).status, 0);
  for (const override of ['', path.join(fx.dir, 'absent'), fx.dir]) assert.strictEqual(fx.launch({ IMPECCABLE_BIN: override }).status, 127);
});


test('POSIX downloads authenticate local pins and clean private staging on failure and concurrent success', async () => {
  const fx = shellFixture();
  const source = path.join(fx.dir, 'download');
  fs.writeFileSync(source, fx.bytes);
  fs.writeFileSync(path.join(fx.tools, 'curl'), '#!/bin/sh\nwhile [ "$1" != "-o" ]; do shift; done\nshift\ncp "$DOWNLOAD_FIXTURE" "$1"\n', { mode: 0o755 });
  const env = { ...fx.env, DOWNLOAD_FIXTURE: source.replace(/\\/g, '/') };
  const execute = () => new Promise((resolve, reject) => {
    const child = spawn(fx.shell, [...fx.shellArgs, path.join(fx.scripts, 'impeccable'), 'context', 'a b'], { env });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
  const results = await Promise.all([execute(), execute()]);
  for (const r of results) { assert.strictEqual(r.status, 0, r.stderr); assert.match(r.stdout, /executed:context a b/); }
  assert.strictEqual(fs.readFileSync(fx.cached, 'utf8'), fx.bytes);
  assert.deepStrictEqual(fs.readdirSync(path.dirname(fx.cached)), ['impeccable']);
  fs.unlinkSync(fx.cached);
  fs.unlinkSync(fx.env.ENGINE_MARKER);
  fs.writeFileSync(source, fx.bytes + '# tampered');
  const failed = await execute();
  assert.strictEqual(failed.status, 127, failed.stderr);
  assert.match(failed.stderr, /checksum mismatch/);
  assert.strictEqual(fs.existsSync(fx.cached), false);
  assert.strictEqual(fs.existsSync(fx.env.ENGINE_MARKER), false);
  assert.deepStrictEqual(fs.readdirSync(path.dirname(fx.cached)), []);
  fs.writeFileSync(path.join(fx.tools, 'curl'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const unavailable = await execute();
  assert.strictEqual(unavailable.status, 127, unavailable.stderr);
  assert.deepStrictEqual(fs.readdirSync(path.dirname(fx.cached)), []);
});

test('POSIX rejects unsupported platforms, missing platform hashes and unavailable hashing', () => {
  const fx = shellFixture();
  fs.writeFileSync(fx.cached, fx.bytes, { mode: 0o755 });
  fs.writeFileSync(path.join(fx.tools, 'uname'), '#!/bin/sh\necho unsupported\n', { mode: 0o755 });
  assert.strictEqual(fx.launch().status, 127);
  fs.writeFileSync(path.join(fx.tools, 'uname'), '#!/bin/sh\ncase "$1" in -s) echo Linux;; *) echo x86_64;; esac\n', { mode: 0o755 });
  fs.writeFileSync(path.join(fx.scripts, 'ENGINE-CHECKSUMS'), fx.manifest.replace('linux-x64', 'darwin-x64'));
  assert.strictEqual(fx.launch().status, 127);
  fs.writeFileSync(path.join(fx.scripts, 'ENGINE-CHECKSUMS'), fx.manifest);
  for (const tool of ['sha256sum', 'shasum']) fs.writeFileSync(path.join(fx.tools, tool), '#!/bin/sh\nexit 127\n', { mode: 0o755 });
  const failed = fx.launch();
  assert.strictEqual(failed.status, 127, failed.stderr);
  assert.match(failed.stderr, /SHA256 failed/);
  assert.strictEqual(fs.existsSync(fx.env.ENGINE_MARKER), false);
});

test('native launcher rejects untrusted cache and preserves explicit operator override', () => {
  const fx = shellFixture();
  let launch = fx.launch;
  let cached = fx.cached;
  if (process.platform === 'win32') {
    fs.copyFileSync(path.join(SCRIPTS, 'impeccable.ps1'), path.join(fx.scripts, 'impeccable.ps1'));
    cached += '.exe';
    fs.writeFileSync(path.join(fx.scripts, 'ENGINE-CHECKSUMS'), fx.manifest.replace('linux-x64', 'windows-x64.exe'));
    launch = (extra = {}) => spawnSync('cmd.exe', ['/d', '/s', '/c', `""${path.join(fx.scripts, 'impeccable.cmd')}" context "a b""`], { windowsVerbatimArguments: true, env: { ...fx.env, USERPROFILE: fx.home, ...extra }, encoding: 'utf8' });
  }
  fs.writeFileSync(cached, fx.bytes + '# tampered', { mode: 0o755 });
  const refused = launch();
  assert.strictEqual(refused.status, 127, refused.stderr);
  assert.match(refused.stderr, /checksum|integrity/i);
  assert.strictEqual(fs.existsSync(fx.env.ENGINE_MARKER), false);
  fs.unlinkSync(path.join(fx.scripts, 'ENGINE-CHECKSUMS'));
  const override = path.join(fx.dir, process.platform === 'win32' ? 'operator.cmd' : 'operator');
  fs.writeFileSync(override, process.platform === 'win32' ? '@echo off\r\necho executed:%*\r\nexit /b 0\r\n' : fx.bytes, { mode: 0o755 });
  const allowed = launch({ IMPECCABLE_BIN: override });
  assert.strictEqual(allowed.status, 0, allowed.stderr);
  assert.match(allowed.stdout, /executed:context/);
  assert.strictEqual(launch({ IMPECCABLE_BIN: path.join(fx.dir, 'missing') }).status, 127);
});


test('direct selector and POSIX launcher normalize CRLF and reject missing platform hashes', async () => {
  const { windowsEngine } = await load();
  const fx = integrityFixture();
  fs.writeFileSync(path.join(fx.scripts, 'VERSION'), '0.1.5\r\n');
  fs.writeFileSync(path.join(fx.scripts, 'ENGINE-CHECKSUMS'), fx.manifest.replace(/\n/g, '\r\n'));
  assert.strictEqual(windowsEngine(fx.scripts, fx.env), fx.cached);
  fs.writeFileSync(path.join(fx.scripts, 'ENGINE-CHECKSUMS'), fx.manifest.replace('windows-x64.exe', 'linux-x64'));
  assert.throws(() => windowsEngine(fx.scripts, fx.env), /missing.*hash/);
  const shell = shellFixture();
  fs.writeFileSync(shell.cached, shell.bytes, { mode: 0o755 });
  fs.writeFileSync(path.join(shell.scripts, 'VERSION'), '0.1.5\r\n');
  fs.writeFileSync(path.join(shell.scripts, 'ENGINE-CHECKSUMS'), shell.manifest.replace(/\n/g, '\r\n'));
  assert.strictEqual(shell.launch().status, 0);
});

test('POSIX verified executables do not require permission to chmod', () => {
  for (const status of [1, 127]) {
    const fx = shellFixture();
    fs.writeFileSync(fx.cached, fx.bytes, { mode: 0o755 });
    fs.writeFileSync(path.join(fx.tools, 'chmod'), `#!/bin/sh\nexit ${status}\n`, { mode: 0o755 });
    const r = fx.launch();
    assert.strictEqual(r.status, 0, `chmod=${status}: ${r.stderr}`);
    assert.match(r.stdout, /executed:context a b/);
  }
});

test('POSIX missing executable bits require successful chmod after authentication', () => {
  const fx = shellFixture();
  fs.writeFileSync(fx.cached, fx.bytes, { mode: 0o644 });
  const shim = path.join(fx.tools, 'chmod');
  fs.writeFileSync(shim, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const refused = fx.launch();
  if (process.platform === 'win32') assert.strictEqual(refused.status, 0, 'Windows executable eligibility does not depend on POSIX mode bits');
  else {
    assert.strictEqual(refused.status, 127, refused.stderr);
    assert.match(refused.stderr, /cannot make engine executable/);
    assert.strictEqual(fs.existsSync(fx.env.ENGINE_MARKER), false);
  }
  fs.unlinkSync(shim);
  const allowed = fx.launch();
  assert.strictEqual(allowed.status, 0, allowed.stderr);
  assert.match(allowed.stdout, /executed:context a b/);
});

test('manifest parsing agrees on optional final newline and rejects extra records', async () => {
  const { windowsEngine } = await load();
  for (const [label, version, final, valid] of [
    ['optional final newline', '0.1.5\n', '', true],
    ['single final newline', '0.1.5\n', '\n', true],
    ['extra manifest record', '0.1.5\n', '\n\n', false],
    ['extra VERSION record', '0.1.5\n\n', '\n', false],
  ]) {
    const fx = integrityFixture();
    fs.writeFileSync(path.join(fx.scripts, 'VERSION'), version);
    fs.writeFileSync(path.join(fx.scripts, 'ENGINE-CHECKSUMS'), fx.manifest.trimEnd() + final);
    if (valid) assert.strictEqual(windowsEngine(fx.scripts, fx.env), fx.cached, label);
    else assert.throws(() => windowsEngine(fx.scripts, fx.env), /manifest|version/i, label);
    const shell = shellFixture();
    fs.writeFileSync(shell.cached, shell.bytes, { mode: 0o755 });
    fs.writeFileSync(path.join(shell.scripts, 'VERSION'), version);
    fs.writeFileSync(path.join(shell.scripts, 'ENGINE-CHECKSUMS'), shell.manifest.trimEnd() + final);
    const r = shell.launch();
    assert.strictEqual(r.status, valid ? 0 : 127, `${label}: ${r.stderr}`);
    if (process.platform === 'win32') {
      fs.copyFileSync(path.join(SCRIPTS, 'impeccable.ps1'), path.join(shell.scripts, 'impeccable.ps1'));
      fs.writeFileSync(shell.cached + '.exe', 'inert mismatched bytes');
      fs.writeFileSync(path.join(shell.scripts, 'ENGINE-CHECKSUMS'), shell.manifest.trimEnd().replace('linux-x64', 'windows-x64.exe') + final);
      const batch = spawnSync('cmd.exe', ['/d', '/s', '/c', `""${path.join(shell.scripts, 'impeccable.cmd')}" context"`], { windowsVerbatimArguments: true, env: { ...shell.env, USERPROFILE: shell.home }, encoding: 'utf8' });
      assert.strictEqual(batch.status, 127, batch.stderr);
      assert.match(batch.stderr, valid ? /checksum mismatch/ : /manifest|VERSION/, label);
    }
  }
});
