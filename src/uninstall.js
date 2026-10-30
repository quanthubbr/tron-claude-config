'use strict';

// exonous uninstall: removes only what install wrote; MCP registrations, config.json and agent-roles stay (they are the user's).
const fs = require('fs');
const path = require('path');
const paths = require('./lib/paths');
const readline = require('readline');
const { createHome, readLedgerFile, ledgerPath, contained } = require('./lib/home');
const { stripOwned } = require('./lib/settings');
const { removePlugins, PLUGIN_ID, MARKETPLACE } = require('./lib/techne');
const { DESIGN_SKILLS, HOME_SKILLS, PACKAGE_ROOT, sharedSkillDir, isolatedHome, guardTarget, readInstallInfo, assertOwner } = require('./lib/runtime');
const { ADAPTERS } = require('./adapters');

// Runtime pieces exonous ships into ~/.claude/exonous; everything else there belongs to the user.
const RUNTIME = ['hooks', 'rules', 'state', 'PR-TEMPLATE.md', 'taxis.js', 'roster.json', 'install.json'];
const KEPT = ['config.json', 'agent-roles'];

function defaultLog(msg) {
  process.stdout.write(`[exonous] ${msg}\n`);
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(/^y(es)?$/i.test(answer.trim()));
  }));
}

function removeMachine(home, { dryRun, log }) {
  const ledger = readLedgerFile(ledgerPath()) || {};
  for (const adapter of ADAPTERS) adapter.uninstall({ dryRun, log });
  const taxis = '/.claude/exonous/taxis.js';
  stripOwned(path.join(paths.claudeDir(), 'settings.json'), { format: 'claude', ownedMarker: taxis, dryRun, log });
  stripOwned(path.join(paths.cursorDir(), 'hooks.json'), { format: 'cursor', ownedMarker: taxis, dryRun, log });
  for (const entry of ledger.sections || []) home.removeSection(entry);
  for (const rel of Object.keys(ledger.files || {})) {
    const abs = contained(rel);
    if (!abs) {
      log(`WARN: ledger entry ${rel} points outside the home — left alone`);
      continue;
    }
    home.remove(abs);
    if (fs.existsSync(`${abs}.bak`)) log(`kept your backup ~/${rel}.bak`);
  }
  for (const base of ['.claude', '.cursor']) {
    const dir = path.join(paths.home(), base, 'agents');
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (/^exo-.+\.md$/.test(f)) home.remove(path.join(dir, f));
    home.remove(path.join(paths.home(), base, 'skills', 'ui-patterns'));
  }
  for (const name of Object.keys(HOME_SKILLS)) {
    const link = path.join(paths.claudeDir(), 'skills', name);
    try {
      if (fs.lstatSync(link).isSymbolicLink() && fs.realpathSync(link) === fs.realpathSync(sharedSkillDir(name))) home.remove(link);
    } catch {
      // gone or dangling: nothing of ours to remove
    }
  }
  for (const name of DESIGN_SKILLS) {
    home.remove(path.join(paths.home(), '.agents', 'skills', name));
    for (const base of ['.claude', '.cursor', '.github']) home.remove(path.join(paths.home(), base, 'skills', name));
  }
  if (!isolatedHome() && !dryRun) removePlugins([PLUGIN_ID], [MARKETPLACE], { log });
  home.remove(path.join(paths.claudeDir(), 'techne'));
  for (const rel of RUNTIME) home.remove(path.join(paths.exoDir(), rel));
  home.remove(ledgerPath());
  const left = fs.existsSync(paths.exoDir()) ? fs.readdirSync(paths.exoDir()) : [];
  if (!left.length && !dryRun) fs.rmSync(paths.exoDir(), { recursive: true, force: true });
  else if (left.length) log(`kept ${KEPT.map((k) => `~/.claude/exonous/${k}`).join(' and ')} (yours; delete by hand if unwanted)`);
}

// Tool roots (~/.claude, ~/.gemini, ~/.config, ~/Documents, …) are never pruned, even when empty.
function pruneEmpty(removed) {
  const home = paths.home();
  const dirs = [...new Set(removed.map((abs) => path.dirname(abs)))].sort((a, b) => b.length - a.length);
  for (const start of dirs) {
    let dir = start;
    while (dir.startsWith(`${home}${path.sep}`) && path.relative(home, dir).split(path.sep).length > 1) {
      try {
        if (fs.lstatSync(dir).isSymbolicLink() || fs.readdirSync(dir).length) break;
        fs.rmdirSync(dir);
      } catch {
        break;
      }
      dir = path.dirname(dir);
    }
  }
}

// One line per area (first three levels below the home), e.g. ~/.claude/rules/exonous rather than each stack folder.
function summarize(removed, log) {
  const byDir = new Map();
  for (const abs of removed) {
    const dir = `~/${path.relative(paths.home(), path.dirname(abs)).split(path.sep).slice(0, 3).join('/')}`;
    byDir.set(dir, (byDir.get(dir) || 0) + 1);
  }
  for (const [dir, n] of [...byDir].sort()) log(`removed ${n} ${n === 1 ? 'item' : 'items'} from ${dir}`);
}

function removePackage(info, { log }) {
  const selfupdate = require('../assets/machine/hooks/lib/selfupdate.cjs');
  if (!selfupdate.globalAllowed()) {
    log('package removal skipped: EXONOUS_HOME points away from the real home');
    return;
  }
  const cmd = selfupdate.pmCommand(info || {});
  try {
    selfupdate.pmRun(cmd, [cmd.pm === 'npm' ? 'uninstall' : 'remove', '-g', 'exonous']);
    log(`removed the global exonous package with ${cmd.pm}`);
  } catch (err) {
    log(`WARN: ${cmd.pm} could not remove the global package (${String(err.message).split('\n')[0]})`);
  }
}

/** @param {{ yes?: boolean, dryRun?: boolean, realHome?: boolean, verbose?: boolean, removePackage?: boolean, log?: (msg: string) => void }} [options] */
async function uninstall({ yes = false, dryRun = false, realHome = false, verbose = false, removePackage: dropPackage = false, log = defaultLog } = {}) {
  guardTarget({ action: 'uninstall', dryRun, realHome, log });
  if (!dryRun) assertOwner('uninstall');
  if (!yes && !dryRun && !(await confirm(`Remove exonous from ${paths.home()}? [y/N] `))) {
    log('nothing removed');
    return 1;
  }
  const info = readInstallInfo();
  const removed = [];
  const homeLog = (msg) => {
    const m = /^removed ~\/(.+)$/.exec(msg);
    if (m) removed.push(path.join(paths.home(), ...m[1].split('/')));
    if (!m || verbose) log(msg);
  };
  removeMachine(createHome({ dryRun, log: homeLog }), { dryRun, log: homeLog });
  if (!dryRun) pruneEmpty(removed);
  if (!verbose) summarize(removed, log);
  const pm = (info && info.pm) || paths.detectPm(process.env, PACKAGE_ROOT);
  const repoRoot = require('../assets/machine/hooks/lib/repo.cjs').repoOf(info && info.packageRoot);
  if (repoRoot) log(`repo mode: drop the exonous dependency from ${repoRoot}/package.json, or its next \`exonous setup\` installs again`);
  else if (dropPackage && !dryRun) removePackage(info, { log });
  else log(`${dryRun ? 'dry run done. ' : ''}last step: ${pm} ${pm === 'npm' ? 'uninstall' : 'remove'} -g exonous (or rerun with --remove-package)`);
  log('kept: atlas/biblos MCP registrations and your skill config files');
  return 0;
}

module.exports = { uninstall };
