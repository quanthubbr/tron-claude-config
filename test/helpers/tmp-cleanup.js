'use strict';

// Every temp dir a test file creates under os.tmpdir() is removed when that test process exits.
const fs = require('fs');
const os = require('os');
const path = require('path');

const created = new Set();
const base = fs.realpathSync(os.tmpdir());
const original = fs.mkdtempSync;

if (!fs.mkdtempSync.exonousTracked) {
  fs.mkdtempSync = function mkdtempSync(prefix, options) {
    const dir = original.call(fs, prefix, options);
    const real = fs.realpathSync(dir);
    if (real.startsWith(`${base}${path.sep}`)) created.add(real);
    return dir;
  };
  fs.mkdtempSync.exonousTracked = true;
  process.on('exit', () => {
    for (const dir of created) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // already gone or busy: nothing to keep
      }
    }
  });
}

/** Also clean a temp path a test creates without mkdtemp (a file or a sibling like `<dir>-wt`). */
function track(p) {
  if (path.resolve(p).startsWith(`${base}${path.sep}`) || path.resolve(p).startsWith(`${os.tmpdir()}${path.sep}`)) created.add(p);
  return p;
}

module.exports = { track };
