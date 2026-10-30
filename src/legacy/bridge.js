'use strict';

// Bridge from @tron/claude-config to exonous (machine side). Delete src/legacy/ and its call in src/install.js one release after the bridge.
const fs = require('fs');
const path = require('path');
const paths = require('../lib/paths');
const { readLedger } = require('../lib/home');
const { removePlugins, disablePlugin } = require('../lib/techne');
const { removeWorkflowEngine } = require('./workflow-engine');

const oldLedger = () => path.join(paths.home(), '.claude', 'tron', 'installed.json');

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

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// ── Machine ──────────────────────────────────────────────────────────────────

/** The old ledger lets the first exonous run prune every file the tron release wrote. */
function previousLedger() {
  return readLedger() || readLedger(oldLedger()) || {};
}

function isOurSkill(target, stat, name) {
  if (stat.isSymbolicLink()) {
    const resolved = path.resolve(path.dirname(target), fs.readlinkSync(target));
    return resolved.startsWith(path.join(paths.home(), '.agents', 'skills') + path.sep);
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
    home.remove(path.join(paths.home(), '.agents', 'skills', name));
    for (const base of ['.claude', '.cursor', '.github']) home.remove(path.join(paths.home(), base, 'skills', name));
  }
  for (const base of ['.claude', '.cursor']) home.remove(path.join(paths.home(), base, 'skills', 'tron-design-fallback'));
  for (const base of ['.claude', '.cursor', '.agents', '.github']) {
    for (const name of RETIRED_DESIGN_SKILLS) {
      const target = path.join(paths.home(), base, 'skills', name);
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
    const oldDir = path.join(paths.home(), '.claude', 'skills', oldName);
    let stat;
    try {
      stat = fs.lstatSync(oldDir);
    } catch {
      continue;
    }
    if (!isOurSkill(oldDir, stat, oldName)) continue;
    const newDir = path.join(paths.home(), '.claude', 'skills', newName);
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
  for (const file of [path.join(paths.home(), '.claude', 'settings.json'), path.join(paths.home(), '.cursor', 'hooks.json')]) {
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
      path.join(paths.home(), '.claude', 'commands', `${oldName}.md`),
      `---\ndescription: Renamed to /${newName} — this alias is removed in the next exonous release.\n---\n\n\`/${oldName}\` is now \`/${newName}\`. Run /${newName} with: $ARGUMENTS\n`,
    );
  }
}

function migrateHome({ dryRun, log, home }) {
  const oldState = path.join(paths.home(), '.claude', 'tron');
  // Plugin CLI calls are slow; they run only while a tron install is still on disk.
  const firstRun = fs.existsSync(oldState) || fs.existsSync(path.join(paths.home(), '.claude', 'tron-kit'));
  const roles = path.join(oldState, 'agent-roles');
  const newRoles = path.join(paths.home(), '.claude', 'exonous', 'agent-roles');
  if (fs.existsSync(roles) && !fs.existsSync(newRoles) && !dryRun) {
    fs.mkdirSync(path.dirname(newRoles), { recursive: true });
    fs.renameSync(roles, newRoles);
  }
  home.remove(oldState);
  for (const rel of RETIRED_HOME_PATHS) home.remove(path.join(paths.home(), rel));
  for (const base of ['.claude', '.cursor']) {
    const dir = path.join(paths.home(), base, 'agents');
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

module.exports = { migrateHome, previousLedger, LEFTOVERS };
