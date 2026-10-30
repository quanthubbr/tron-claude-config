'use strict';

// Cline (soft tier): nomos as its own file in the global Rules dir; nothing gates commits.
const fs = require('fs');
const path = require('path');
const paths = require('../lib/paths');
const { renderRules } = require('../lib/render-rules');
const { softRow } = require('./shared');

const TOOL = 'cline';
const dir = () => path.join(paths.home(), 'Documents', 'Cline');
const rulesFile = () => path.join(dir(), 'Rules', 'exonous-nomos.md');

const detect = () => fs.existsSync(dir());

function install({ home }) {
  if (detect()) home.write(rulesFile(), renderRules('no-agents'), { tool: TOOL });
}

// The rules file is ledger-tracked, so uninstall's ledger pass removes it.
function uninstall() {}

function doctor() {
  return [
    { name: 'Cline: nomos rules', ok: fs.existsSync(rulesFile()), status: '', fix: 'exonous install' },
    softRow('Cline'),
  ];
}

module.exports = { id: TOOL, tier: 3, tierLabel: 'soft', gate: 'soft', detect, install, uninstall, doctor };
