#!/usr/bin/env node
'use strict';

// npm/pnpm/bun postinstall: global copy → machine install (a failure fails the pm run); a repo's node_modules copy → repo migration (never fails it).
const path = require('path');

let repoMode = false;

function main() {
  const { postinstallDecision } = require('../src/lib/runtime');
  const decision = postinstallDecision(process.env);
  if (decision.action === 'skip') {
    console.log(`[exonous] postinstall skipped: ${decision.reason}`);
    return;
  }
  if (decision.action === 'migrate') {
    repoMode = true;
    const { migrateRepo, migrationRoot } = require('../src/legacy/repo-migrate');
    migrateRepo({ root: migrationRoot(path.join(__dirname, '..')), trigger: 'repo' });
    return;
  }
  if (!require('../src/install').install({ quiet: true }).complete) fail('install incomplete');
}

function fail(detail) {
  let text = 'exonous install did not finish — run `exonous install`';
  try {
    const runtime = require('../src/lib/runtime');
    runtime.recordInstallError(detail);
    text = runtime.INSTALL_ERROR;
  } catch {
    // runtime unloadable: the fixed text still reaches the user
  }
  console.error(`[exonous] ${text}`);
  if (!repoMode) process.exitCode = 1;
}

try {
  main();
} catch (err) {
  fail(err && err.stack ? err.stack : String(err));
}
