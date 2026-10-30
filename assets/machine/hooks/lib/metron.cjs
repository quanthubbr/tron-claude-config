#!/usr/bin/env node
'use strict';

// PreToolUse(Read): never blocks; nudges whole-file reads of large files toward locate-first.
const fs = require('fs');

const LINE_LIMIT = 400;

function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let lines = 1;
  for (let i = 0; i < content.length; i += 1) if (content.charCodeAt(i) === 10) lines += 1;
  return lines;
}

function advise(input) {
  const args = (input && input.tool_input) || {};
  if (!args.file_path || args.limit || args.offset || args.pages) return null;
  let stat;
  try {
    stat = fs.statSync(args.file_path);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size > 20 * 1024 * 1024) return null;
  const lines = countLines(args.file_path);
  if (lines <= LINE_LIMIT) return null;
  return `${args.file_path} has ${lines} lines. Unless you are about to edit most of it, locate first (atlas search_graph / get_code_snippet, or grep -n) and Read only the needed range with offset/limit.`;
}

function main() {
  let raw = '';
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    let message = null;
    try {
      message = advise(JSON.parse(raw));
    } catch {
      message = null;
    }
    if (message) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: message },
      }));
    }
    process.exit(0);
  });
}

if (require.main === module) main();

module.exports = { advise, LINE_LIMIT };
