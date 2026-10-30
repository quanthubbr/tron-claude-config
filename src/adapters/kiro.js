'use strict';

// Kiro (soft tier): detected only; no verified rules or blocking-hook surface yet.
const fs = require('fs');
const path = require('path');
const paths = require('../lib/paths');
const { softRow } = require('./shared');

const TOOL = 'kiro';
const detect = () => fs.existsSync(path.join(paths.home(), '.kiro'));

function install() {}
function uninstall() {}

const doctor = () => [softRow('Kiro', 'detected only, no verified rules channel')];

module.exports = { id: TOOL, tier: 3, tierLabel: 'soft', gate: 'soft', softNote: 'detected only', detect, install, uninstall, doctor };
