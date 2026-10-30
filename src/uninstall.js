'use strict';

// exonous uninstall: removes what setup wrote. Keeps MCP registrations (atlas, biblos) and per-person
// config (project-memory vault, session-handoff, issue-board) — those are the user's, not ours.
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { createHome, readLedger, STATE_DIR } = require('./lib/home');
const { removePlugins, PLUGIN_ID, MARKETPLACE } = require('./lib/techne');
const { REPO_FILES, GIT_HOOKS, DESIGN_SKILLS } = require('./setup');
const { detectPm, findDependency } = require('./update');

const HOME = os.homedir();

function log(msg) {
  process.stdout.write(`[exonous] ${msg}\n`);
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(/^y(es)?$/i.test(answer.trim()));
  }));
}

function removeRepo(root, home) {
  for (const [, dest] of REPO_FILES) home.remove(path.join(root, dest), dest);
  for (const name of GIT_HOOKS) {
    const hook = path.join(root, '.git', 'hooks', name);
    if (fs.existsSync(hook) && /exonous|commit-changes/.test(fs.readFileSync(hook, 'utf8'))) home.remove(hook, `.git/hooks/${name}`);
  }
  for (const rel of ['.claude/rules/exonous', '.claude/.exonous', '.claude/.exonous-scope.json', '.github/hooks/ui-design.json']) {
    home.remove(path.join(root, rel), rel);
  }
}

function dropTaxisHooks() {
  for (const file of [path.join(HOME, '.claude', 'settings.json'), path.join(HOME, '.cursor', 'hooks.json')]) {
    let config;
    try {
      config = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    for (const [event, entries] of Object.entries(config.hooks || {})) {
      if (!Array.isArray(entries)) continue;
      const kept = entries.filter((entry) => !JSON.stringify(entry).includes('taxis.js'));
      if (kept.length) config.hooks[event] = kept;
      else delete config.hooks[event];
    }
    fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  }
}

function removeMachine(home) {
  for (const rel of Object.keys(readLedger() || {})) {
    home.remove(path.join(HOME, rel));
    if (fs.existsSync(path.join(HOME, `${rel}.bak`))) log(`kept your backup ~/${rel}.bak`);
  }
  for (const base of ['.claude', '.cursor']) {
    const dir = path.join(HOME, base, 'agents');
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (/^exo-.+\.md$/.test(f)) home.remove(path.join(dir, f));
    home.remove(path.join(HOME, base, 'skills', 'ui-patterns'));
  }
  for (const name of DESIGN_SKILLS) {
    home.remove(path.join(HOME, '.agents', 'skills', name));
    for (const base of ['.claude', '.cursor', '.github']) home.remove(path.join(HOME, base, 'skills', name));
  }
  home.remove(path.join(HOME, '.cursor', 'rules', 'nomos.mdc'));
  dropTaxisHooks();
  removePlugins([PLUGIN_ID], [MARKETPLACE], { log });
  home.remove(path.join(HOME, '.claude', 'techne'));
  home.remove(STATE_DIR);
}

async function uninstall({ root = process.cwd(), yes = false } = {}) {
  if (!yes && !(await confirm('Remove exonous from this repo and this machine? [y/N] '))) {
    log('nothing removed');
    return 1;
  }
  const home = createHome({ log });
  if (fs.existsSync(path.join(root, '.git'))) removeRepo(root, home);
  removeMachine(home);
  const dep = findDependency(root);
  if (dep) log(`last step: ${detectPm(root)} remove ${dep.name}`);
  log('kept: atlas/biblos MCP registrations and your skill config files');
  return 0;
}

module.exports = { uninstall };
