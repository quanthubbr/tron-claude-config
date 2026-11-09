'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const paths = require('./lib/paths');

// Skill engines ship as Node scripts inside each skill; the CLI runs the installed copy so per-person config and caches stay there.
const ENGINES = {
  'project-memory': { skill: 'project-memory', script: 'project-memory.mjs' },
  doc: { skill: 'doc', script: 'doc.mjs' },
  'issue-board': { skill: 'issue-board', script: 'board.mjs' },
  'ui-design': { skill: 'ui-design', script: path.join('scripts', 'ui-design.mjs') },
};

function skillDirs(skill) {
  return [
    path.join(paths.home(), '.agents', 'skills', skill),
    path.join(paths.home(), '.claude', 'skills', skill),
    path.join(__dirname, '..', 'assets', 'skills', skill),
  ];
}

function resolveScript(engine, explicitDir) {
  const dirs = explicitDir ? [path.resolve(explicitDir)] : skillDirs(engine.skill);
  return dirs.map((dir) => path.join(dir, engine.script)).find((file) => fs.existsSync(file)) || null;
}

function skillCommand(name, args) {
  const engine = ENGINES[name];
  let rest = args;
  let explicitDir = null;
  if (rest[0] === '--skill-dir') {
    if (!rest[1]) {
      console.error(`usage: exonous ${name} [--skill-dir <dir>] <args>`);
      return 2;
    }
    explicitDir = rest[1];
    rest = rest.slice(2);
  }
  const script = resolveScript(engine, explicitDir);
  if (!script) {
    console.error(`exonous ${name}: ${engine.script} not found${explicitDir ? ` in ${explicitDir}` : ' — run `exonous install`'}`);
    return 1;
  }
  const result = spawnSync(process.execPath, [script, ...rest], { stdio: 'inherit' });
  if (result.error) {
    console.error(`exonous ${name}: ${result.error.message}`);
    return 1;
  }
  if (result.signal) return 128 + (require('os').constants.signals[result.signal] || 1);
  return result.status === null ? 1 : result.status;
}

module.exports = { ENGINES, skillCommand };
