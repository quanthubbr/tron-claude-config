#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { test } = require('node:test');

const HELPER = path.join(__dirname, 'helpers', 'tmp-cleanup.js');

function runChild(ending) {
  const script = `require(${JSON.stringify(HELPER)});
const fs = require('fs'), os = require('os'), path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-probe-'));
fs.writeFileSync(path.join(dir, 'f'), 'x');
process.stdout.write(dir);
${ending}`;
  const res = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  return { dir: res.stdout, signal: res.signal, status: res.status };
}

test('temp dirs are removed when the test process ends normally', () => {
  const { dir, status } = runChild('');
  assert.strictEqual(status, 0);
  assert.ok(dir && !fs.existsSync(dir));
});

for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  test(`temp dirs are removed when the test process is killed with ${signal}`, { skip: process.platform === 'win32' ? 'no POSIX signals' : false }, () => {
    const { dir, signal: got } = runChild(`process.kill(process.pid, '${signal}'); setTimeout(() => {}, 5000);`);
    assert.strictEqual(got, signal, 'the process still dies from the signal');
    assert.ok(dir && !fs.existsSync(dir), `${dir} left behind`);
  });
}
