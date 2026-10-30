#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { test } = require('node:test');
const fx = require('./helpers/adapter-fixture');

fx.useFixtureHome();
process.env.GIT_CONFIG_GLOBAL = os.devNull;
process.env.GIT_CONFIG_NOSYSTEM = '1';

const SRC = path.join(__dirname, '..');

/** A copy of the package at `dir` (assets linked to keep it fast), as a pm would lay it out. */
function packageAt(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const sub of ['bin', 'src', 'scripts']) fs.cpSync(path.join(SRC, sub), path.join(dir, sub), { recursive: true });
  fs.copyFileSync(path.join(SRC, 'package.json'), path.join(dir, 'package.json'));
  fs.symlinkSync(path.join(SRC, 'assets'), path.join(dir, 'assets'));
  return path.join(dir, 'scripts', 'postinstall.js');
}

function postinstall(script, env = {}) {
  return spawnSync(process.execPath, [script], { env: { ...process.env, npm_lifecycle_event: 'postinstall', ...env }, encoding: 'utf8', cwd: path.dirname(path.dirname(script)) });
}

test('package.json runs scripts/postinstall.js', () => {
  assert.strictEqual(require('../package.json').scripts.postinstall, 'node scripts/postinstall.js');
});

test('a dev checkout and CI do nothing', () => {
  fs.mkdirSync(fx.home('.claude'));
  const dev = postinstall(path.join(SRC, 'scripts', 'postinstall.js'));
  assert.strictEqual(dev.status, 0);
  assert.match(dev.stdout, /postinstall skipped: dev checkout/);
  const ci = postinstall(packageAt(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'g-')), 'lib', 'node_modules', 'exonous')), { CI: 'true', npm_config_global: 'true' });
  assert.strictEqual(ci.status, 0);
  assert.match(ci.stdout, /postinstall skipped: CI/);
  assert.ok(!fx.exists('.claude', 'exonous'));
});

test('a global copy installs machine-wide', () => {
  fs.mkdirSync(fx.home('.claude'));
  const script = packageAt(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'g-')), 'lib', 'node_modules', 'exonous'));
  const res = postinstall(script, { npm_config_global: 'true' });
  assert.strictEqual(res.status, 0, res.stdout + res.stderr);
  assert.ok(fx.exists('.claude', 'exonous', 'hooks', 'pyle.cjs'));
});

test('a copy in a repo node_modules migrates the repo and keeps the devDependency during the lifecycle', () => {
  fs.mkdirSync(fx.home('.claude'));
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'repo-')));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  fs.mkdirSync(path.join(repo, '.claude'));
  fs.writeFileSync(path.join(repo, '.claude', '.exonous-scope.json'), '{"updatedAt":"x","folders":["common"],"scoped":[],"signals":{}}\n');
  fs.writeFileSync(path.join(repo, 'package.json'), '{"devDependencies":{"exonous":"github:zaqueu-1/exonous#v2.0.0"}}\n');
  const script = packageAt(path.join(repo, 'node_modules', 'exonous'));
  const res = postinstall(script, { INIT_CWD: repo });
  assert.strictEqual(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /exonous is now installed for this machine/);
  assert.match(res.stdout, /devDependency kept while a package-manager script is running/);
  assert.ok(!fs.existsSync(path.join(repo, '.claude', '.exonous-scope.json')));
  assert.ok(JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).devDependencies.exonous);
});

test('a global install that does not finish exits non-zero, records it for doctor, and a later good install clears it', () => {
  fs.mkdirSync(fx.home('.claude'));
  fs.writeFileSync(fx.home('.claude', 'commands'), 'a file where a dir should be');
  const script = packageAt(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'g-')), 'lib', 'node_modules', 'exonous'));
  const res = postinstall(script, { npm_config_global: 'true' });
  assert.notStrictEqual(res.status, 0);
  assert.match(res.stdout + res.stderr, /exonous install did not finish — run `exonous install`/);
  const record = JSON.parse(fs.readFileSync(fx.home('.claude', 'exonous', 'state', 'last-install-error.json'), 'utf8'));
  assert.strictEqual(record.text, 'exonous install did not finish — run `exonous install`');
  assert.ok(record.at);
  assert.ok(fs.readFileSync(fx.home('.claude', 'exonous', 'state', 'install.log'), 'utf8').length > 0);
  const bin = path.join(path.dirname(path.dirname(script)), 'bin', 'exonous.js');
  const doctor = spawnSync(process.execPath, [bin, 'doctor'], { env: process.env, encoding: 'utf8' }).stdout;
  assert.match(doctor, /✗ last install finished/);
  fs.rmSync(fx.home('.claude', 'commands'));
  assert.strictEqual(postinstall(script, { npm_config_global: 'true' }).status, 0);
  assert.ok(!fx.exists('.claude', 'exonous', 'state', 'last-install-error.json'), 'cleared by a good install');
});

test('a crash before anything can be recorded still prints the fix and exits non-zero', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bad-')), 'not-a-dir');
  fs.writeFileSync(file, 'x');
  const script = packageAt(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'g-')), 'lib', 'node_modules', 'exonous'));
  const res = postinstall(script, { npm_config_global: 'true', EXONOUS_HOME: file });
  assert.notStrictEqual(res.status, 0);
  assert.match(res.stdout + res.stderr, /exonous install did not finish — run `exonous install`/);
});

test('a repo-triggered migration that cannot install records the error but never fails the repo install', () => {
  fs.mkdirSync(fx.home('.claude'));
  fs.writeFileSync(fx.home('.claude', 'commands'), 'a file where a dir should be');
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'repo-')));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  fs.writeFileSync(path.join(repo, 'package.json'), '{"devDependencies":{"exonous":"github:zaqueu-1/exonous#v2.0.0"}}\n');
  const script = packageAt(path.join(repo, 'node_modules', 'exonous'));
  const res = postinstall(script, { INIT_CWD: repo });
  assert.strictEqual(res.status, 0, res.stdout + res.stderr);
  assert.ok(fx.exists('.claude', 'exonous', 'state', 'last-install-error.json'));
});
