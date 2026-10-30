'use strict';

const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, '..', '..', 'assets', 'rules', 'nomos.md');
const PRAXIS_SOURCE = path.join(__dirname, '..', '..', 'assets', 'rules', 'praxis.md');
const VARIANTS = ['full', 'no-agents', 'min'];
const MIN_SECTIONS = ['Communication', 'Engineering', 'Verify', 'Git'];
const PRAXIS_MIN_SECTIONS = ['Make it work', 'Make it right'];

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

/**
 * Praxis has no roster, so `no-agents` is the whole file; `min` keeps the per-change loop and drops the rest,
 * because the tools that take it have a few kilobytes for every rule they load.
 * @param {'full'|'no-agents'|'min'} variant
 * @param {string} [source] praxis.md content
 */
function renderPraxis(variant, source = fs.readFileSync(PRAXIS_SOURCE, 'utf8')) {
  if (!VARIANTS.includes(variant)) throw new Error(`unknown rules variant: ${variant}`);
  if (variant !== 'min') return source;
  const { head, sections } = split(source);
  const kept = PRAXIS_MIN_SECTIONS.map((name) => {
    const section = sections.find((s) => titled(s, name));
    if (!section) throw new Error(`praxis.md has no "## ${name}" section for the min variant`);
    return section;
  });
  return join(head, kept);
}

/** Both always-on rules as one block, for the adapters that inline rules instead of writing files. */
function renderAlwaysOn(variant) {
  return `${renderRules(variant)}\n${renderPraxis(variant)}`;
}

module.exports = { renderRules, renderPraxis, renderAlwaysOn, VARIANTS };
