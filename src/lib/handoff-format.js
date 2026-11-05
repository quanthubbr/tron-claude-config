'use strict';

const datedName = (name) => /^\d{4}-\d{2}-\d{2}[ T]\d{2}[:\-]?\d{2}.*\.md$/.test(name);
const graphEnvelope = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, 'v') && typeof value.ts === 'string';

function legacyHandoff(content) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1] || '';
  return /^tipo:\s*["']?sessao["']?\s*$/m.test(frontmatter) || /^tags:\s*\[[^\]\r\n]*\bhandoff\b[^\]\r\n]*\]/m.test(frontmatter);
}

module.exports = { datedName, graphEnvelope, legacyHandoff };
