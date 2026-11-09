'use strict';
require('./helpers/tmp-cleanup');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync, spawn } = require('node:child_process');
const fx = require('./helpers/adapter-fixture');
fx.useFixtureHome();
function cli(args) { return spawnSync(process.execPath, [path.join(__dirname, '../bin/exonous.js'), 'handoff', ...args], { cwd: fx.home(), env: process.env, encoding: 'utf8' }); }
test('CLI save/latest emit structured results without creating absent vaults', () => {
  fx.write({ v: 1, k: 'pr', g: [['pr', 'url', 'https://github.com/acme/project/pull/1'], ['pr', 'proof', 'checks passed'], ['pr', 'next', 'review']] }, 'body.json');
  const absent = cli(['save', '--body-file', fx.home('body.json')]);
  assert.equal(absent.status, 0, absent.stderr);
  assert.equal(JSON.parse(absent.stdout).reason, 'no-vault');
  fs.mkdirSync(fx.home('exonous-vault'));
  const saved = cli(['save', '--body-file', fx.home('body.json')]);
  assert.equal(saved.status, 0, saved.stderr);
  const latest = cli(['latest', '--json']);
  assert.equal(latest.status, 0, latest.stderr);
  assert.equal(JSON.parse(latest.stdout).path, JSON.parse(saved.stdout).path);
  assert.equal(cli(['save']).status, 2);
});

test('concurrent CLI PR saves publish one complete note without temporary leftovers', async () => {
  fs.mkdirSync(fx.home('exonous-vault'));
  fx.write({ v: 1, k: 'pr', g: [['pr', 'url', 'https://github.com/acme/project/pull/2'], ['pr', 'proof', 'created'], ['pr', 'next', 'review']] }, 'body.json');
  const save = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '../bin/exonous.js'), 'handoff', 'save', '--body-file', fx.home('body.json')], { cwd: fx.home(), env: process.env });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => { try { assert.equal(code, 0, stderr); resolve(JSON.parse(stdout)); } catch (error) { reject(error); } });
  });
  const results = await Promise.all([save(), save(), save(), save()]);
  assert.equal(results.filter((result) => result.status === 'saved').length, 1);
  assert.equal(results.filter((result) => result.status === 'already-saved').length, 3);
  assert.equal(new Set(results.map((result) => result.path)).size, 1);
  const file = results[0].path;
  const note = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(note.g[0][2], 'https://github.com/acme/project/pull/2');
  assert.deepEqual(fs.readdirSync(path.dirname(file)), [path.basename(file)]);
});

function pr(args) { return spawnSync(process.execPath, [path.join(__dirname, '../bin/exonous.js'), 'pr', ...args], { cwd: fx.home(), env: process.env, encoding: 'utf8' }); }
function fakeGh(stdout) {
  const bin = process.env.PATH.split(path.delimiter)[0];
  const log = fx.home('gh-call.json');
  const script = `#!/usr/bin/env node\nconst fs = require('fs'); const a = process.argv.slice(2); const i = a.indexOf('--body-file');\nfs.writeFileSync(${JSON.stringify(log)}, JSON.stringify({ args: a, body: fs.readFileSync(a[i + 1], 'utf8') }));\nprocess.stdout.write(${JSON.stringify(stdout)});\n`;
  fs.writeFileSync(path.join(bin, 'gh'), script, { mode: 0o755 });
  return log;
}
function validBody() {
  const { resolveTemplate } = require('../assets/machine/hooks/lib/template.cjs');
  return resolveTemplate(fx.home()).sections.map((section) => `${section}\n\nN/A\n`).join('\n');
}
const unixOnly = { skip: process.platform === 'win32' && 'fake gh is a shebang script' };

test('pr create rejects malformed arguments without echoing values or creating', () => {
  const result = pr(['create', '--title', 'private title']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage: exonous pr create --body-file/);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.includes('private title'), false);
});

test('pr create refuses a body missing template sections and never runs gh', unixOnly, () => {
  const log = fakeGh('https://github.com/acme/project/pull/3\n');
  fx.write('just a sentence', 'body.md');
  const result = pr(['create', '--title', 'feat: x', '--body-file', 'body.md']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PR body is missing/);
  assert.equal(fs.existsSync(log), false);
});

test('pr create sends the validated body to gh and saves the PR handoff', unixOnly, () => {
  const log = fakeGh('https://github.com/acme/project/pull/4\n');
  fs.mkdirSync(fx.home('exonous-vault'));
  fx.write(validBody(), 'body.md');
  const result = pr(['create', '--base', 'main', '--head', 'feat/x', '--title', 'feat: x', '--body-file', 'body.md', '--draft']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'https://github.com/acme/project/pull/4\n');
  const call = JSON.parse(fs.readFileSync(log, 'utf8'));
  assert.equal(call.body, validBody());
  assert.deepEqual(call.args.filter((a) => !a.endsWith('body.md')), ['pr', 'create', '--base', 'main', '--head', 'feat/x', '--title', 'feat: x', '--body-file', '--draft']);
  const latest = cli(['latest', '--json']);
  assert.equal(JSON.parse(fs.readFileSync(JSON.parse(latest.stdout).path, 'utf8')).g[0][2], 'https://github.com/acme/project/pull/4');
});
