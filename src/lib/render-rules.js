'use strict';

const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, '..', '..', 'assets', 'rules', 'nomos.md');
const VARIANTS = ['full', 'no-agents', 'min'];
const MIN_SECTIONS = ['Communication', 'Engineering', 'Verify', 'Git'];

function split(source) {
  const parts = source.split(/^(?=## )/m);
  return { head: parts[0], sections: parts.slice(1) };
}

const titled = (section, name) => section.startsWith(`## ${name}`);

function join(head, sections) {
  return `${[head, ...sections].join('').replace(/\n+$/, '')}\n`;
}

/**
 * @param {'full'|'no-agents'|'min'} variant
 * @param {string} [source] nomos.md content
 */
function renderRules(variant, source = fs.readFileSync(SOURCE, 'utf8')) {
  if (!VARIANTS.includes(variant)) throw new Error(`unknown rules variant: ${variant}`);
  if (variant === 'full') return source;
  const { head, sections } = split(source);
  if (variant === 'no-agents') return join(head, sections.filter((s) => !titled(s, 'Agents')));
  const kept = MIN_SECTIONS.map((name) => {
    const section = sections.find((s) => titled(s, name));
    if (!section) throw new Error(`nomos.md has no "## ${name}" section for the min variant`);
    return section;
  });
  return join(head, kept);
}

module.exports = { renderRules, VARIANTS };
