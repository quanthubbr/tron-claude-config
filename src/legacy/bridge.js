'use strict';

// Bridge from @tron/claude-config to exonous. Delete src/legacy/ (and its two calls in src/setup.js) one release after the bridge.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readLedger } = require('../lib/home');
const { removePlugins, disablePlugin } = require('../lib/techne');
const { removeWorkflowEngine } = require('./workflow-engine');

const HOME = os.homedir();
const LEGACY_PACKAGE = '@tron/claude-config';
const OLD_REPO = 'zaqueu-1/tron-claude-config';
const NEW_REPO = 'zaqueu-1/exonous';
const OLD_LEDGER = path.join(HOME, '.claude', 'tron', 'installed.json');

const REPO_LEFTOVERS = [
  '.claude/hooks/bootstrap-check.sh',
  '.claude/hooks/bypass-check.sh',
  '.claude/hooks/lib/read-budget.cjs',
  '.claude/hooks/lib/harness-sha.cjs',
  '.claude/hooks/lib/pr-template-validate.js',
  '.claude/hooks/lib/validate-pr-body.js',
  '.claude/hooks/lib/pr-create-gate.js',
  '.claude/rules/tron',
  '.claude/rules/ecc',
  '.claude/.tron-scope.json',
  '.claude/.ecc-scope.json',
  '.claude/.harness-last-update',
  '.claude/.harness-session',
  '.github/hooks/tron-design.json',
  '.github/hooks/impeccable.json',
  '.github/hooks/kallos.json',
  'scripts/setup-claude-harness.sh',
];
const OLD_GITIGNORE = ['.claude/.harness-last-update', '.claude/.harness-session'];
const OLD_DESIGN_BIN = /\/skills\/(?:tron-design\/scripts\/tron-design|impeccable\/scripts\/impeccable|kallos\/scripts\/kallos)/;

// Newest first: the first source to reach a target keeps its config. Greek names are unreleased 2.0.0 previews.
const RENAMED_SKILLS = {
  hodos: 'deliver', mneme: 'project-memory', graphe: 'doc', pinax: 'issue-board',
  'tron-flow': 'deliver', 'tron-memory': 'project-memory',
};
const ALIASES = { 'tron-flow': 'deliver' };
const OLD_DESIGN = [
  'tron-design', 'tron-motion', 'tron-native', 'tron-imagery', 'kallos', 'kinesis', 'physis', 'eikon', 'kanon',
];
// Names an older design layer installed; removed only when the copy is ours (link into ~/.agents or matching SKILL.md name).
const RETIRED_DESIGN_SKILLS = [
  'ui-ux-pro-max', 'frontend-design', 'impeccable', 'animate', 'animate-expo', 'animation-vocabulary', 'apple-design',
  'ask-sonner', 'emil-design-eng', 'find-animation-opportunities', 'improve-animations', 'mobile-native', 'pick-ui-library',
  'prototype', 'review-animations', 'write-swift', 'brandkit', 'design-taste-frontend', 'design-taste-frontend-v1',
  'full-output-enforcement', 'gpt-taste', 'high-end-visual-design', 'image-to-code', 'imagegen-frontend-mobile',
  'imagegen-frontend-web', 'industrial-brutalist-ui', 'minimalist-ui', 'redesign-existing-projects', 'stitch-design-taste',
];
const RETIRED_PLUGINS = ['tron-kit@tron', 'ecc@ecc', 'everything-claude-code@everything-claude-code'];
const RETIRED_MARKETPLACES = ['tron', 'ecc', 'everything-claude-code'];
const RETIRED_HOME_PATHS = [
  '.claude/tron-kit', '.claude/rules/tron', '.claude/rules/ecc', '.claude/rules/caveman.md', '.claude/rules/agent-roster.md',
  '.claude/skills/andrej-karpathy-skills', '.cursor/rules/agent-roster.mdc', '.cursor/rules/tron-core.mdc',
];

// ── Repo ─────────────────────────────────────────────────────────────────────

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// Keeps key order and indentation so the diff in the consumer's package.json is one line.
function rewriteDependency({ root, dryRun, log }) {
  const file = path.join(root, 'package.json');
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const pkg = raw && readJsonFile(file);
  if (!pkg) return;
  let changed = false;
  for (const field of ['devDependencies', 'dependencies']) {
    const deps = pkg[field];
    if (!deps || !(LEGACY_PACKAGE in deps)) continue;
    pkg[field] = Object.fromEntries(Object.entries(deps).map(([name, spec]) => (
      name === LEGACY_PACKAGE ? ['exonous', String(spec).replace(OLD_REPO, NEW_REPO)] : [name, spec]
    )));
    changed = true;
  }
  if (!changed) return;
  if (dryRun) {
    log(`DRY: would rename dependency ${LEGACY_PACKAGE} → exonous in package.json`);
    return;
  }
  const indent = /\n(\s+)"/.exec(raw)?.[1] || '  ';
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, indent)}\n`, 'utf8');
  log(`package.json: ${LEGACY_PACKAGE} → exonous (installed on the next session update)`);
}

function dropOldDesignHooks({ root, dryRun, log }) {
  const file = path.join(root, '.cursor', 'hooks.json');
  const config = fs.existsSync(file) && readJsonFile(file);
  if (!config?.hooks) return;
  let removed = 0;
  for (const [event, entries] of Object.entries(config.hooks)) {
    if (!Array.isArray(entries)) continue;
    const kept = entries.filter((entry) => !OLD_DESIGN_BIN.test(JSON.stringify(entry)));
    removed += entries.length - kept.length;
    config.hooks[event] = kept;
  }
  if (!removed) return;
  if (dryRun) log(`DRY: would drop ${removed} old design hook(s) from .cursor/hooks.json`);
  else fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function migrateRepo({ root, dryRun, log }) {
  rewriteDependency({ root, dryRun, log });
  for (const rel of REPO_LEFTOVERS) {
    const target = path.join(root, rel);
    if (!fs.existsSync(target)) continue;
    if (dryRun) {
      log(`DRY: would remove ${rel}`);
      continue;
    }
    fs.rmSync(target, { recursive: true, force: true });
    log(`removed ${rel}`);
  }
  const scriptsDir = path.join(root, 'scripts');
  if (!dryRun && fs.existsSync(scriptsDir) && fs.readdirSync(scriptsDir).length === 0) fs.rmdirSync(scriptsDir);
  dropOldDesignHooks({ root, dryRun, log });
  const gitignore = path.join(root, '.gitignore');
  if (!dryRun && fs.existsSync(gitignore)) {
    const content = fs.readFileSync(gitignore, 'utf8');
    const kept = content.split('\n').filter((line) => !OLD_GITIGNORE.includes(line.trim())).join('\n');
    if (kept !== content) fs.writeFileSync(gitignore, kept, 'utf8');
  }
}

// ── Machine ──────────────────────────────────────────────────────────────────

/** The old ledger lets the first exonous run prune every file the tron release wrote. */
function previousLedger() {
  return readLedger() || readLedger(OLD_LEDGER) || {};
}

function isOurSkill(target, stat, name) {
  if (stat.isSymbolicLink()) {
    const resolved = path.resolve(path.dirname(target), fs.readlinkSync(target));
    return resolved.startsWith(path.join(HOME, '.agents', 'skills') + path.sep);
  }
  if (!stat.isDirectory()) return false;
  try {
    const declared = /^name:\s*['"]?([\w.-]+)['"]?\s*$/m.exec(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'));
    return Boolean(declared) && declared[1] === name;
  } catch {
    return false;
  }
}

function removeOldDesign(home) {
  for (const name of OLD_DESIGN) {
    home.remove(path.join(HOME, '.agents', 'skills', name));
    for (const base of ['.claude', '.cursor', '.github']) home.remove(path.join(HOME, base, 'skills', name));
  }
  for (const base of ['.claude', '.cursor']) home.remove(path.join(HOME, base, 'skills', 'tron-design-fallback'));
  for (const base of ['.claude', '.cursor', '.agents', '.github']) {
    for (const name of RETIRED_DESIGN_SKILLS) {
      const target = path.join(HOME, base, 'skills', name);
      let stat;
      try {
        stat = fs.lstatSync(target);
      } catch {
        continue;
      }
      if (isOurSkill(target, stat, name)) home.remove(target);
    }
  }
}

// Per-person config and caches follow the skill to its new name; the old folder goes once it holds only our files.
function moveRenamedSkills(home, { dryRun, log }) {
  for (const [oldName, newName] of Object.entries(RENAMED_SKILLS)) {
    const oldDir = path.join(HOME, '.claude', 'skills', oldName);
    let stat;
    try {
      stat = fs.lstatSync(oldDir);
    } catch {
      continue;
    }
    if (!isOurSkill(oldDir, stat, oldName)) continue;
    const newDir = path.join(HOME, '.claude', 'skills', newName);
    for (const keep of ['config.json', 'data']) {
      const from = path.join(oldDir, keep);
      const to = path.join(newDir, keep);
      if (!fs.existsSync(from) || fs.existsSync(to)) continue;
      if (dryRun) {
        log(`DRY: would move ~/.claude/skills/${oldName}/${keep} → ${newName}/`);
        continue;
      }
      fs.mkdirSync(newDir, { recursive: true });
      fs.renameSync(from, to);
      log(`moved ~/.claude/skills/${oldName}/${keep} → ${newName}/`);
    }
    home.remove(oldDir);
  }
}

function dropOldGuardHooks({ dryRun, log }) {
  const isOld = (entry) => JSON.stringify(entry).includes('agent-roster-guard.js');
  for (const file of [path.join(HOME, '.claude', 'settings.json'), path.join(HOME, '.cursor', 'hooks.json')]) {
    const config = fs.existsSync(file) && readJsonFile(file);
    if (!config?.hooks) continue;
    let removed = 0;
    for (const [event, entries] of Object.entries(config.hooks)) {
      if (!Array.isArray(entries)) continue;
      const kept = entries.filter((entry) => !isOld(entry));
      removed += entries.length - kept.length;
      if (kept.length) config.hooks[event] = kept;
      else delete config.hooks[event];
    }
    if (!removed) continue;
    if (dryRun) log(`DRY: would drop ${removed} old roster hook(s) from ${file}`);
    else fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  }
}

function writeAliases(home) {
  for (const [oldName, newName] of Object.entries(ALIASES)) {
    home.write(
      path.join(HOME, '.claude', 'commands', `${oldName}.md`),
      `---\ndescription: Renamed to /${newName} — this alias is removed in the next exonous release.\n---\n\n\`/${oldName}\` is now \`/${newName}\`. Run /${newName} with: $ARGUMENTS\n`,
    );
  }
}

function migrateHome({ dryRun, log, home }) {
  const oldState = path.join(HOME, '.claude', 'tron');
  // Plugin CLI calls are slow; they run only while a tron install is still on disk.
  const firstRun = fs.existsSync(oldState) || fs.existsSync(path.join(HOME, '.claude', 'tron-kit'));
  const roles = path.join(oldState, 'agent-roles');
  const newRoles = path.join(HOME, '.claude', 'exonous', 'agent-roles');
  if (fs.existsSync(roles) && !fs.existsSync(newRoles) && !dryRun) {
    fs.mkdirSync(path.dirname(newRoles), { recursive: true });
    fs.renameSync(roles, newRoles);
  }
  home.remove(oldState);
  for (const rel of RETIRED_HOME_PATHS) home.remove(path.join(HOME, rel));
  for (const base of ['.claude', '.cursor']) {
    const dir = path.join(HOME, base, 'agents');
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) if (/^tron-.+\.md$/.test(file)) home.remove(path.join(dir, file));
  }
  removeOldDesign(home);
  moveRenamedSkills(home, { dryRun, log });
  dropOldGuardHooks({ dryRun, log });
  if (firstRun) {
    removePlugins(RETIRED_PLUGINS, RETIRED_MARKETPLACES, { dryRun, log });
    disablePlugin('frontend-design@claude-plugins-official', { dryRun, log });
  }
  removeWorkflowEngine({ dryRun, log });
  writeAliases(home);
}

// Checked by `exonous doctor` while the bridge ships.
const LEFTOVERS = ['.claude/tron', '.claude/tron-kit', '.claude/rules/tron', '.claude/gsd-core'];

module.exports = { migrateRepo, migrateHome, previousLedger, LEGACY_PACKAGE, LEFTOVERS };
