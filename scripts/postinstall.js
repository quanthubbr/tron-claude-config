#!/usr/bin/env node
'use strict';

// Plain file, never a package.json lifecycle script (adr-0005): older repo hooks run it after updating the dependency.
try {
  require('../src/repo-mode').bootstrap({ quiet: true });
} catch (err) {
  process.stdout.write(`[exonous] WARN: repo-mode install failed: ${String(err.message).split('\n')[0]} — run \`npx exonous setup\`\n`);
}
process.exit(0);
