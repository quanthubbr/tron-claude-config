#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Per-machine opt-out for the caveman communication style.
 *
 * Caveman stays the default for everyone. A developer who does not want it creates the
 * marker file below; from then on postinstall neither installs caveman nor writes rules
 * that tell the model to use it. The marker lives in ~/.claude so it survives every
 * `bun install` in every consumer repo, whatever shell or IDE runs the install.
 */
function cavemanOptOutMarker(home = os.homedir()) {
  return path.join(home, '.claude', '.sem-caveman');
}

function isCavemanOptedOut(home = os.homedir()) {
  return fs.existsSync(cavemanOptOutMarker(home));
}

/**
 * Removes every caveman reference from a managed rule file.
 *
 * Works line by line on purpose: caveman appears inside markdown tables, and a comment
 * marker around a table row would end the table. Removing a whole section can leave two
 * `---` separators in a row, so those collapse into one.
 */
function stripCaveman(text) {
  return text
    .split('\n')
    .filter((line) => !/caveman/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n---\n\n---\n/g, '\n---\n');
}

module.exports = { cavemanOptOutMarker, isCavemanOptedOut, stripCaveman };
