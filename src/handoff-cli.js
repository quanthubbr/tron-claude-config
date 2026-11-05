'use strict';

const handoff = require('./lib/handoff');

function handoffCommand(args) {
  const command = args[0];
  const options = {};
  let bodyFile;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--json' && command === 'latest') continue;
    if (args[i] === '--body-file' && args[i + 1] && !args[i + 1].startsWith('--')) {
      bodyFile = args[++i];
    } else return usage();
  }
  if (!['save', 'latest'].includes(command) || (command === 'save' && !bodyFile) || (command === 'latest' && bodyFile)) return usage();
  try {
    let result;
    if (command === 'save') {
      let body;
      try { body = JSON.parse(handoff.readText(bodyFile)); } catch (err) { throw new Error(err.message.includes('too large') ? err.message : 'cannot read handoff body as JSON'); }
      result = handoff.save(body, options);
    } else result = handoff.latest(options);
    console.log(JSON.stringify(result));
    return 0;
  } catch (err) {
    console.log(JSON.stringify({ status: 'error', reason: err.message }));
    return 1;
  }
}

function usage() {
  console.error('usage: exonous handoff save --body-file <json-file> | latest --json');
  return 2;
}

module.exports = { handoffCommand };
