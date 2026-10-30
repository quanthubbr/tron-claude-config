'use strict';

// Aider (unsupported): no hooks and no MCP, so exonous only prints how to load the rules. Never writes.
const fs = require('fs');
const path = require('path');
const paths = require('../lib/paths');
const { onPath } = require('./shared');

const TOOL = 'aider';
const HINT = 'add `read: [~/.claude/exonous/rules/nomos.md, ~/.claude/exonous/rules/praxis.md]` to ~/.aider.conf.yml';

const detect = () => onPath('aider') || fs.existsSync(path.join(paths.home(), '.aider.conf.yml'));

function install() {}
function uninstall() {}

const doctor = () => [{ name: 'Aider: unsupported (no hooks)', ok: false, level: 'warn', status: 'rules are not loaded and commits are NOT gated', fix: HINT }];

module.exports = { id: TOOL, tier: 0, tierLabel: 'unsupported', gate: 'none', detect, install, uninstall, doctor, HINT };
