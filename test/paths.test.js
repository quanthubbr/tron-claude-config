#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');
const paths = require('../src/lib/paths');

function withHome(value, fn) {
  const prev = process.env.EXONOUS_HOME;
  if (value === undefined) delete process.env.EXONOUS_HOME;
  else process.env.EXONOUS_HOME = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.EXONOUS_HOME;
    else process.env.EXONOUS_HOME = prev;
  }
}

test('without EXONOUS_HOME every dir hangs off the OS home', () => {
  withHome(undefined, () => {
    assert.strictEqual(paths.home(), os.homedir());
    assert.strictEqual(paths.claudeDir(), path.join(os.homedir(), '.claude'));
    assert.strictEqual(paths.cursorDir(), path.join(os.homedir(), '.cursor'));
  });
});

test('EXONOUS_HOME is read at call time, not at load time', () => {
  const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'paths-'));
  withHome(fake, () => {
    assert.strictEqual(paths.home(), fake);
    assert.strictEqual(paths.claudeDir(), path.join(fake, '.claude'));
    assert.strictEqual(paths.cursorDir(), path.join(fake, '.cursor'));
    assert.strictEqual(paths.exoDir(), path.join(fake, '.claude', 'exonous'));
    assert.strictEqual(paths.stateDir(), path.join(fake, '.claude', 'exonous', 'state'));
  });
});

test('the package manager user agent wins over the install path', () => {
  assert.strictEqual(paths.detectPm({ npm_config_user_agent: 'pnpm/9.1.0 npm/? node/v20.11.0 darwin arm64' }, '/x/.bun/install/global'), 'pnpm');
  assert.strictEqual(paths.detectPm({ npm_config_user_agent: 'bun/1.1.0 npm/? node/v22.0.0 linux x64' }, '/usr/lib/node_modules/exonous'), 'bun');
  assert.strictEqual(paths.detectPm({ npm_config_user_agent: 'npm/10.5.0 node/v20.11.0 darwin arm64' }, '/x/pnpm/global'), 'npm');
});

test('without a user agent the real package root decides', () => {
  assert.strictEqual(paths.detectPm({}, '/home/u/.bun/install/global/node_modules/exonous'), 'bun');
  assert.strictEqual(paths.detectPm({}, '/home/u/.local/share/pnpm/global/5/node_modules/exonous'), 'pnpm');
  assert.strictEqual(paths.detectPm({}, '/usr/local/lib/node_modules/exonous'), 'npm');
  assert.strictEqual(paths.detectPm({ npm_config_user_agent: 'yarn/1.22.0 npm/? node/v20' }, '/usr/local/lib/node_modules/exonous'), 'npm');
});

test('a symlinked package root is resolved before matching', () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paths-pm-')));
  const real = path.join(base, '.bun', 'install', 'global', 'node_modules', 'exonous');
  fs.mkdirSync(real, { recursive: true });
  const link = path.join(base, 'exonous-link');
  fs.symlinkSync(real, link, 'dir');
  assert.strictEqual(paths.detectPm({}, link), 'bun');
});
