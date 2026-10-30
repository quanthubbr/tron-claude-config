'use strict';

// Qwen Code (soft tier): marker section in ~/.qwen/QWEN.md; its hook schema is unverified, so commits are not gated.
const fs = require('fs');
const path = require('path');
const paths = require('../lib/paths');
const { renderRules } = require('../lib/render-rules');
const { softRow } = require('./shared');

const TOOL = 'qwen';
const dir = () => path.join(paths.home(), '.qwen');
const rulesFile = () => path.join(dir(), 'QWEN.md');

const detect = () => fs.existsSync(dir());

function install({ home }) {
  if (detect()) home.section(rulesFile(), renderRules('no-agents'), { tool: TOOL });
}

// The section is ledger-tracked, so uninstall's ledger pass removes it.
function uninstall() {}

function doctor() {
  let text = '';
  try {
    text = fs.readFileSync(rulesFile(), 'utf8');
  } catch {
    // reported below
  }
  return [
    { name: 'Qwen Code: nomos rules (QWEN.md)', ok: text.includes('exonous:start'), status: '', fix: 'exonous install' },
    softRow('Qwen Code'),
  ];
}

module.exports = { id: TOOL, tier: 3, tierLabel: 'soft', gate: 'soft', detect, install, uninstall, doctor };
