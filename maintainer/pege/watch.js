#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { UPSTREAM_ROOT, loadSources, getSource, setSourceRef } = require('./lib/sources');
const { mirror } = require('./lib/git');
const { reviewAndPlan, renderSummary } = require('./source-review');

async function main(argv) {
  if (argv[0] === '--accept') {
    if (!argv[1] || (argv.length !== 2 && (argv.length !== 4 || argv[2] !== '--ref'))) throw new Error('invalid acceptance arguments');
    const source = getSource(argv[1]);
    const ref = argv[3] || mirror(source).latest;
    if (!/^[a-f0-9]{40}$/.test(ref)) throw new Error('invalid candidate ref');
    setSourceRef(source.id, ref, { acceptedAt: new Date().toISOString().slice(0, 10) });
    process.stdout.write(`[pege:watch] ${source.id}: pin accepted\n`);
    return;
  }
  const json = argv.includes('--json');
  const ids = argv.filter((arg) => arg !== '--json');
  const sources = loadSources().filter((source) => !ids.length || ids.includes(source.id));
  if (ids.some((id) => !sources.some((source) => source.id === id))) throw new Error('unknown source id or argument');
  const reports = await reviewAndPlan(sources);
  if (json) process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
  else {
    const directory = path.join(UPSTREAM_ROOT, 'reports');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(directory, `${new Date().toISOString().slice(0, 10)}-summary.md`), renderSummary(reports), { mode: 0o600 });
    process.stdout.write(renderSummary(reports));
  }
}

main(process.argv.slice(2)).catch(() => {
  process.stderr.write('[pege:watch] source operation failed; check symbolic configuration\n');
  process.exitCode = 1;
});
