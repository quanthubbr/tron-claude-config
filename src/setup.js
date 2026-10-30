'use strict';

// exonous setup: installs the repo gates and the machine-level toolkit. Idempotent — safe to re-run at any time.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createHome } = require('./lib/home');
const { installRules } = require('./lib/rules');
const { installTechne } = require('./lib/techne');
const { ensureAtlas } = require('./lib/atlas');
const { ensureBiblos } = require('./lib/biblos');
const { installAgents } = require('./lib/agents');
const { ensureEslintIgnore } = require('./lib/eslint-ignore');
const legacy = require('./legacy/bridge');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(PACKAGE_ROOT, 'assets');
const HOME = os.homedir();

const REPO_FILES = [
  ['repo/AGENTS.md', 'AGENTS.md'],
  ['repo/claude/settings.json', '.claude/settings.json'],
  ['repo/claude/PR-TEMPLATE.md', '.claude/PR-TEMPLATE.md'],
  ['repo/claude/hooks/pyle.sh', '.claude/hooks/pyle.sh'],
  ['repo/claude/hooks/kairos.cjs', '.claude/hooks/kairos.cjs'],
  ['repo/claude/hooks/lib/pr-template-validate.cjs', '.claude/hooks/lib/pr-template-validate.cjs'],
  ['repo/claude/hooks/lib/validate-pr-body.cjs', '.claude/hooks/lib/validate-pr-body.cjs'],
  ['repo/claude/hooks/lib/pr-create-gate.cjs', '.claude/hooks/lib/pr-create-gate.cjs'],
  ['repo/claude/hooks/lib/metron.cjs', '.claude/hooks/lib/metron.cjs'],
];
const GIT_HOOKS = ['pre-commit', 'pre-push'];
const GITIGNORE_ENTRIES = ['.claude/.commit-authorized', '.claude/.pr-body-draft.md', '.claude/.exonous/', '.cursor/', '.omc/'];

const COMMANDS = ['commit-changes', 'make-pr', 'code-review', 'security-review'];
// Code files only — config.json and data/ hold each person's settings and are never touched.
const HOME_SKILLS = {
  deliver: ['SKILL.md', 'references/parallel.md'],
  'project-memory': ['SKILL.md', 'project-memory.mjs', 'config.example.json'],
  'session-handoff': ['SKILL.md', 'config.example.json'],
  doc: ['SKILL.md', 'doc.mjs'],
  'issue-board': ['SKILL.md', 'board.mjs', 'render.py', 'config.example.json'],
};
const DESIGN_SKILLS = ['ui-design', 'ui-motion', 'native-ui', 'ui-mockup'];
// POSIX separators: the path is spliced into JSON hook templates and sh commands.
const UI_DESIGN_BIN = path.join(HOME, '.agents', 'skills', 'ui-design', 'scripts', 'ui-design').replaceAll('\\', '/');

function defaultLog(msg) {
  process.stdout.write(`[exonous] ${msg}\n`);
}

function isCi() {
  return Boolean(process.env.CI || process.env.CONTINUOUS_INTEGRATION || process.env.GITHUB_ACTIONS);
}

function packageVersion() {
  return JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;
}

function step(log, name, run) {
  try {
    run();
  } catch (err) {
    log(`WARN: ${name} incomplete: ${err.message}`);
  }
}

// ── Repo ─────────────────────────────────────────────────────────────────────

function copyRepoFiles({ root, dryRun, log }) {
  for (const [src, dest] of REPO_FILES) {
    const destAbs = path.join(root, dest);
    if (dryRun) {
      log(`DRY: would write ${dest}`);
      continue;
    }
    fs.mkdirSync(path.dirname(destAbs), { recursive: true });
    fs.copyFileSync(path.join(ASSETS, src), destAbs);
    if (dest.endsWith('.sh')) fs.chmodSync(destAbs, 0o755);
  }
}

// --git-path works in worktrees; core.hooksPath set means another tool owns the hooks.
function gitHooksDir(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    if (git('config', '--get', 'core.hooksPath')) return null;
  } catch {
    // exit 1 = key unset, the common case
  }
  return path.resolve(root, git('rev-parse', '--git-path', 'hooks'));
}

function installGitHooks({ root, dryRun, log }) {
  const dir = gitHooksDir(root);
  if (!dir) {
    log('git hooks skipped: core.hooksPath is managed by another tool');
    return;
  }
  for (const name of GIT_HOOKS) {
    if (dryRun) {
      log(`DRY: would install git hook ${name}`);
      continue;
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(ASSETS, 'repo', 'git-hooks', name), path.join(dir, name));
    fs.chmodSync(path.join(dir, name), 0o755);
  }
}

function ensureGitignore({ root, dryRun, log }) {
  const file = path.join(root, '.gitignore');
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  const lines = new Set(content.split(/\r?\n/).map((l) => l.trim()));
  const missing = GITIGNORE_ENTRIES.filter((entry) => !lines.has(entry));
  if (!missing.length) return;
  if (dryRun) {
    log(`DRY: would add ${missing.join(', ')} to .gitignore`);
    return;
  }
  fs.writeFileSync(file, `${content.replace(/\n*$/, '\n')}${missing.join('\n')}\n`, 'utf8');
}

function mergeDesignHook({ root, dryRun, log }, template, dest) {
  const fresh = JSON.parse(fs.readFileSync(path.join(ASSETS, 'editors', 'hooks', template), 'utf8').replaceAll('__UI_DESIGN_BIN__', UI_DESIGN_BIN));
  const before = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : '';
  let config;
  try {
    config = before ? JSON.parse(before) : { version: 1, hooks: {} };
  } catch (err) {
    log(`WARN: ui-design hook not merged, invalid JSON in ${path.relative(root, dest)}: ${err.message}`);
    return;
  }
  config.hooks = config.hooks || {};
  for (const [event, entries] of Object.entries(fresh.hooks)) {
    const list = Array.isArray(config.hooks[event]) ? config.hooks[event] : [];
    config.hooks[event] = list.some((entry) => JSON.stringify(entry).includes(UI_DESIGN_BIN)) ? list : [...list, ...entries];
  }
  const after = `${JSON.stringify(config, null, 2)}\n`;
  if (after === before) return;
  if (dryRun) {
    log(`DRY: would write ui-design hooks → ${path.relative(root, dest)}`);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, after, 'utf8');
}

function setupRepo(ctx, ci) {
  copyRepoFiles(ctx);
  if (!ci) installRules(ctx.root, { dryRun: ctx.dryRun, silent: ctx.dryRun });
  installGitHooks(ctx);
  ensureGitignore(ctx);
  ensureEslintIgnore(ctx.root, { dryRun: ctx.dryRun, log: ctx.log });
  mergeDesignHook(ctx, 'cursor/hooks.json', path.join(ctx.root, '.cursor', 'hooks.json'));
  mergeDesignHook(ctx, 'github/ui-design.json', path.join(ctx.root, '.github', 'hooks', 'ui-design.json'));
}

// ── Machine ──────────────────────────────────────────────────────────────────

function installHomeFiles(home, { log, hasCursor }) {
  home.sync(path.join(ASSETS, 'rules', 'nomos.md'), path.join(HOME, '.claude', 'rules', 'nomos.md'));
  for (const name of COMMANDS) {
    home.sync(path.join(ASSETS, 'skills', name, 'SKILL.md'), path.join(HOME, '.claude', 'commands', `${name}.md`));
  }
  for (const [name, files] of Object.entries(HOME_SKILLS)) {
    const dir = path.join(HOME, '.claude', 'skills', name);
    const existing = path.join(dir, 'SKILL.md');
    if (fs.existsSync(existing) && !new RegExp(`^name: ${name}\\r?$`, 'm').test(fs.readFileSync(existing, 'utf8'))) {
      log(`WARN: ~/.claude/skills/${name}/ holds a different skill — left untouched`);
      continue;
    }
    for (const file of files) home.sync(path.join(ASSETS, 'skills', name, file), path.join(dir, file));
  }
  if (hasCursor) {
    home.sync(path.join(ASSETS, 'editors', 'cursor', 'frontend-skills.mdc'), path.join(HOME, '.cursor', 'rules', 'frontend-skills.mdc'));
  }
}

// Design skills ship an engine tree, so they are replaced whole instead of tracked file by file.
function installDesignStack(home, { dryRun, log, hasCursor }) {
  const editors = hasCursor ? ['.claude', '.cursor'] : ['.claude'];
  for (const name of DESIGN_SKILLS) {
    const dest = path.join(HOME, '.agents', 'skills', name);
    if (!dryRun) fs.rmSync(dest, { recursive: true, force: true });
    home.copyTree(path.join(ASSETS, 'skills', name), dest);
    for (const base of [...editors, '.github']) home.link(dest, path.join(HOME, base, 'skills', name));
  }
  for (const base of editors) {
    const dest = path.join(HOME, base, 'skills', 'ui-patterns');
    if (!dryRun) fs.rmSync(dest, { recursive: true, force: true });
    home.copyTree(path.join(ASSETS, 'skills', 'ui-patterns'), dest);
  }
  log(`design stack ${dryRun ? 'would be ' : ''}synced → ${DESIGN_SKILLS.join(', ')} + ui-patterns`);
}

function setupMachine({ dryRun, log }) {
  // Read before any write: later steps create ~/.cursor paths and would fake a Cursor install.
  const hasCursor = fs.existsSync(path.join(HOME, '.cursor'));
  const home = createHome({ dryRun, log, previous: legacy.previousLedger() });
  step(log, 'legacy cleanup', () => legacy.migrateHome({ dryRun, log, home }));
  step(log, 'atlas', () => {
    if (!ensureAtlas({ dryRun }).ok) log('WARN: atlas not installed — run `exonous doctor` for the manual command');
  });
  step(log, 'biblos', () => ensureBiblos({ dryRun }));
  step(log, 'home files', () => {
    try {
      installHomeFiles(home, { log, hasCursor });
    } catch (err) {
      home.ledger.complete = false;
      throw err;
    }
  });
  step(log, 'design stack', () => installDesignStack(home, { dryRun, log, hasCursor }));
  step(log, 'techne', () => installTechne({ dryRun, log }));
  step(log, 'agents', () => installAgents({ dryRun, log, hasCursor }));
  home.prune(packageVersion());
}

/**
 * @param {{ dryRun?: boolean, root?: string, ci?: boolean, log?: (msg: string) => void }} [options]
 */
function setup({ dryRun = false, root = process.env.INIT_CWD || process.cwd(), ci = isCi(), log = defaultLog } = {}) {
  const ctx = { root: path.resolve(root), dryRun, log };
  const isConsumer = fs.existsSync(path.join(ctx.root, '.git')) && ctx.root !== PACKAGE_ROOT;
  // Repo gates first: they must land even when a machine-level install fails (offline, Windows/WSL).
  if (isConsumer) {
    step(log, 'legacy repo cleanup', () => legacy.migrateRepo(ctx));
    setupRepo(ctx, ci);
  }
  if (!ci) setupMachine(ctx);
  log(`setup ${dryRun ? 'dry run ' : ''}done (v${packageVersion()})`);
}

module.exports = { setup, gitHooksDir, packageVersion, UI_DESIGN_BIN, REPO_FILES, GIT_HOOKS, COMMANDS, HOME_SKILLS, DESIGN_SKILLS, PACKAGE_ROOT };
