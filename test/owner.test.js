#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { test } = require('node:test');
const fx = require('./helpers/adapter-fixture');

fx.useFixtureHome();
process.env.GIT_CONFIG_GLOBAL = '/dev/null';
process.env.GIT_CONFIG_NOSYSTEM = '1';

const BIN = path.join(__dirname, '..', 'bin', 'exonous.js');
const OTHER = String((process.getuid?.() ?? 0) + 1);
const skip = process.platform === 'win32' ? 'no uids' : false;
const skipAsRoot = skip || (process.getuid() === 0 ? 'runner is root: a root-owned home is its own' : false);

function cli(args, env = {}, cwd = os.tmpdir()) {
  const res = spawnSync(process.execPath, [BIN, ...args], { cwd, env: { ...process.env, ...env }, encoding: 'utf8' });
  return { code: res.status, out: res.stdout + res.stderr };
}

function installed() {
  fs.mkdirSync(fx.home('.claude'));
  assert.strictEqual(cli(['install', '--quiet']).code, 0);
  return fs.readdirSync(fx.home('.claude', 'exonous')).sort();
}

const asOther = { EXONOUS_TEST: '1', EXONOUS_TEST_UID: OTHER };
const asRoot = { EXONOUS_TEST: '1', EXONOUS_TEST_UID: '0' };

test('every writing command refuses when ~/.claude/exonous belongs to another uid', { skip }, () => {
  const before = installed();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-repo-'));
  spawnSync('git', ['init', '-q'], { cwd: repo });
  fs.writeFileSync(path.join(repo, 'package.json'), '{"devDependencies":{"exonous":"github:zaqueu-1/exonous#v2.0.0"}}\n');
  for (const [args, cwd] of [[['install', '--quiet']], [['uninstall', '--yes']], [['migrate', '--repo', repo]], [['draft-path'], repo], [['token', 'commit'], repo], [['update']]]) {
    const res = cli(args, asOther, cwd);
    assert.notStrictEqual(res.code, 0, args.join(' '));
    assert.match(res.out, /owned by uid \d+.*sudo chown -R "\$\(id -un\)" ~\/\.claude\/exonous|belongs to another user/, args.join(' '));
  }
  assert.deepStrictEqual(fs.readdirSync(fx.home('.claude', 'exonous')).sort(), before, 'nothing written or removed');
  assert.ok(fs.existsSync(path.join(repo, 'package.json')));
});

test('root may not write into a home another uid owns, through any writing command', { skip: skipAsRoot }, () => {
  installed();
  for (const args of [['install', '--quiet'], ['uninstall', '--yes'], ['update']]) {
    const res = cli(args, asRoot);
    assert.notStrictEqual(res.code, 0, args.join(' '));
    assert.match(res.out, /refusing to .* as root|owned by uid|belongs to another user/, args.join(' '));
  }
  assert.ok(fs.existsSync(fx.home('.claude', 'exonous', 'install.json')));
});

test('read-only commands still work for another uid', { skip }, () => {
  installed();
  assert.ok([0, 1].includes(cli(['doctor'], asOther).code));
  assert.strictEqual(cli(['update', '--check'], { ...asOther, EXONOUS_RELEASE_SOURCE: 'file:///nonexistent' }).code, 1, 'check runs (and fails on the fake source), it does not refuse');
});

test('writeAtomic refuses to replace a file owned by another uid', { skip }, () => {
  const { writeAtomic } = require('../src/lib/writers/markers');
  const file = fx.home('owned.json');
  fs.writeFileSync(file, '{}\n');
  process.env.EXONOUS_TEST = '1';
  process.env.EXONOUS_TEST_UID = OTHER;
  try {
    assert.throws(() => writeAtomic(file, '{"x":1}\n'), /owned by uid \d+.*sudo chown/);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), '{}\n');
  } finally {
    delete process.env.EXONOUS_TEST;
    delete process.env.EXONOUS_TEST_UID;
  }
  writeAtomic(file, '{"x":1}\n');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), '{"x":1}\n');
});
