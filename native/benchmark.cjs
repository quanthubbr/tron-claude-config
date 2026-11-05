'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const binary = path.resolve(process.argv[2] || `target/release/exonous${process.platform === 'win32' ? '.exe' : ''}`);
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'exonous-benchmark-'));
const env = { ...process.env, EXONOUS_HOME: home, EXONOUS_NO_UPDATE: '1', EXONOUS_RULES_REMINDER: '1' };
const commands = {
  node: [process.execPath, [path.resolve(__dirname, '../assets/machine/hooks/ethos.cjs'), '--adapter', 'claude']],
  rust: [binary, ['hook', 'ethos', '--adapter', 'claude']],
};

function sample(name) {
  const [program, args] = commands[name];
  const start = process.hrtime.bigint();
  const result = spawnSync(program, args, { env, encoding: 'utf8' });
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  assert.equal(result.status, 0, result.stderr);
  assert.ok(JSON.parse(result.stdout).hookSpecificOutput.additionalContext.includes('nomos + praxis'));
  return { ms, output: result.stdout };
}

try {
  assert.equal(sample('node').output, sample('rust').output, 'benchmark outputs must match');
  for (let i = 0; i < 5; i++) for (const name of Object.keys(commands)) sample(name);
  const timings = { node: [], rust: [] };
  for (let i = 0; i < 30; i++) {
    for (const name of i % 2 ? ['node', 'rust'] : ['rust', 'node']) timings[name].push(sample(name).ms);
  }
  const summary = Object.fromEntries(Object.entries(timings).map(([name, values]) => {
    values.sort((a, b) => a - b);
    return [name, { medianMs: values[15], p95Ms: values[28] }];
  }));
  console.log(JSON.stringify({ scope: 'ethos process startup and identical output; no model inference', platform: process.platform, arch: process.arch, nodeVersion: process.version, samples: 30, ...summary }, null, 2));
} finally {
  fs.rmSync(home, { recursive: true, force: true });
}
