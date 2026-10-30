// PostToolUse(Edit|Write|MultiEdit): remember which files this session touched, for stop:checks.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function listFile(sessionId) {
  const id = String(sessionId || 'default').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128) || 'default';
  return path.join(os.tmpdir(), `techne-edits-${id}.txt`);
}

module.exports = function editTracker(payload) {
  const input = payload?.tool_input || {};
  const file = input.file_path || input.path;
  if (typeof file !== 'string' || !file) return null;
  const absolute = path.resolve(payload.cwd || process.cwd(), file);
  try {
    fs.appendFileSync(listFile(payload.session_id), `${absolute}\n`, 'utf8');
  } catch (err) {
    process.stderr.write(`[techne] edit list not updated: ${err.message}\n`);
  }
  return null;
};

module.exports.listFile = listFile;
