'use strict';

// Cline (soft tier): nomos and praxis as their own files in the global Rules dir; nothing gates commits.
const fs = require('fs');
const path = require('path');
const paths = require('../lib/paths');
const { renderRules, renderPraxis } = require('../lib/render-rules');
const { softRow } = require('./shared');

const TOOL = 'cline';
const dir = () => path.join(paths.home(), 'Documents', 'Cline');
const RULES = { 'exonous-nomos.md': renderRules, 'exonous-praxis.md': renderPraxis };
const rulesFile = (name = 'exonous-nomos.md') => path.join(dir(), 'Rules', name);

const detect = () => fs.existsSync(dir());

function install({ home }) {
  if (!detect()) return;
  for (const [name, render] of Object.entries(RULES)) home.write(rulesFile(name), render('no-agents'), { tool: TOOL });
}

// The rules files are ledger-tracked, so uninstall's ledger pass removes them.
function uninstall() {}

function doctor() {
  return [
    { name: 'Cline: nomos + praxis rules', ok: Object.keys(RULES).every((name) => fs.existsSync(rulesFile(name))), status: '', fix: 'exonous install' },
    softRow('Cline'),
  ];
}

module.exports = { id: TOOL, tier: 3, tierLabel: 'soft', gate: 'soft', detect, install, uninstall, doctor };
