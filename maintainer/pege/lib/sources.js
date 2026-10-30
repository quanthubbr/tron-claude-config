'use strict';

const fs = require('fs');
const path = require('path');

const UPSTREAM_ROOT = path.resolve(__dirname, '..');
const SOURCES_PATH = path.join(UPSTREAM_ROOT, 'sources.json');

const SAFE = /^[\w][\w./-]*$/;

function assertSafe(source) {
  if (!SAFE.test(source.id) || !SAFE.test(source.ref || '')) {
    throw new Error(`unsafe id/ref in ${SOURCES_PATH}: ${source.id}@${source.ref}`);
  }
  return source;
}

function loadSources() {
  return JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8')).sources.map(assertSafe);
}

function getSource(id) {
  const source = loadSources().find((s) => s.id === id);
  if (!source) throw new Error(`unknown source "${id}" in ${SOURCES_PATH}`);
  return source;
}

function setSourceRef(id, newRef, extra = {}) {
  if (!SAFE.test(newRef)) throw new Error(`unsafe ref: ${newRef}`);
  const doc = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
  const source = doc.sources.find((s) => s.id === id);
  if (!source) throw new Error(`unknown source "${id}" in ${SOURCES_PATH}`);
  Object.assign(source, { ref: newRef }, extra);
  fs.writeFileSync(SOURCES_PATH, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}

module.exports = { UPSTREAM_ROOT, SOURCES_PATH, loadSources, getSource, setSourceRef };
