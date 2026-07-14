#!/usr/bin/env node
// postinstall.js — installs Claude enforcement harness into consumer repo
// Runs automatically on: npm install @tron/claude-config
// Idempotent: safe to run multiple times

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFileSync } = require('child_process');
const { installEccRules } = require('./lib/install-ecc-rules');
const { ensureCodebaseMemoryMcp } = require('./lib/ensure-codebase-memory');

const DRY = process.env.DRY === '1';
const IS_CI = !!(process.env.CI || process.env.CONTINUOUS_INTEGRATION || process.env.GITHUB_ACTIONS);
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const CONSUMER_ROOT = process.env.INIT_CWD || process.cwd();

// Files that lived under node_modules/.../managed/ → consumer dest
// Each entry: [src relative to PACKAGE_ROOT, dest relative to CONSUMER_ROOT]
const MANAGED_FILES = [
  ['managed/claude/settings.json',           '.claude/settings.json'],
  ['managed/claude/hooks/bypass-check.sh',   '.claude/hooks/bypass-check.sh'],
  ['managed/claude/hooks/bootstrap-check.sh','.claude/hooks/bootstrap-check.sh'],
  ['managed/setup-claude-harness.sh',        'scripts/setup-claude-harness.sh'],
  ['managed/AGENTS.md',                      'AGENTS.md'],
];

// Each entry: [src relative to PACKAGE_ROOT, hook name]. The destination
// directory is resolved at runtime — see installGitHooks().
const GIT_HOOKS = [
  ['managed/git-hooks/pre-commit', 'pre-commit'],
  ['managed/git-hooks/pre-push',   'pre-push'],
];

// Entries to add to .gitignore if not already present
const GITIGNORE_ENTRIES = [
  '.claude/.commit-authorized',
  '.claude/.pr-authorized',
  '.claude/.pr-body-draft.md',
  '.claude/.harness-last-update',
];

function log(msg) {
  process.stdout.write(`[claude-config] ${msg}\n`);
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!DRY) fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, destRel) {
  const srcAbs = path.join(PACKAGE_ROOT, src);
  const destAbs = path.join(CONSUMER_ROOT, destRel);
  if (!fs.existsSync(srcAbs)) {
    log(`WARN: source not found: ${src}`);
    return;
  }
  ensureDir(destAbs);
  if (DRY) {
    log(`DRY: would copy ${src} → ${destRel}`);
    return;
  }
  fs.copyFileSync(srcAbs, destAbs);
  // Make shell scripts executable
  if (destAbs.endsWith('.sh')) {
    fs.chmodSync(destAbs, 0o755);
  }
}

function git(...args) {
  return execFileSync('git', args, {
    cwd: CONSUMER_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

// Resolve the directory git actually reads hooks from.
//
// `<root>/.git/hooks` is only valid in a primary checkout. In a linked worktree
// `.git` is a file pointing at the real gitdir, so hardcoding that path makes
// mkdir fail with ENOTDIR. `git rev-parse --git-path` returns the correct
// location in both layouts.
//
// Returns null when core.hooksPath is set: hooks are owned by another tool
// (husky, lefthook, ...) and git ignores .git/hooks entirely. Writing there
// would be dead code, and writing into the managed directory would clobber
// that tool's hooks.
function resolveGitHooksDir() {
  try {
    if (git('config', '--get', 'core.hooksPath')) return null;
  } catch {
    // Exit code 1 simply means the key is unset — that is the common case.
  }

  try {
    return path.resolve(CONSUMER_ROOT, git('rev-parse', '--git-path', 'hooks'));
  } catch (err) {
    log(`WARN: could not resolve git hooks directory: ${err.message}`);
    return null;
  }
}

function installGitHooks() {
  const hooksDir = resolveGitHooksDir();
  if (!hooksDir) {
    log('git hooks skipped: core.hooksPath is managed by another tool');
    return;
  }

  for (const [src, name] of GIT_HOOKS) {
    const srcAbs = path.join(PACKAGE_ROOT, src);
    const destAbs = path.join(hooksDir, name);
    if (!fs.existsSync(srcAbs)) {
      log(`WARN: source not found: ${src}`);
      continue;
    }
    if (DRY) {
      log(`DRY: would copy ${src} → ${destAbs}`);
      continue;
    }
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.copyFileSync(srcAbs, destAbs);
    fs.chmodSync(destAbs, 0o755);
  }
}

function installGitIgnoreEntries() {
  const gitignorePath = path.join(CONSUMER_ROOT, '.gitignore');
  if (!fs.existsSync(gitignorePath)) return;
  let content = fs.readFileSync(gitignorePath, 'utf8');
  let changed = false;
  for (const entry of GITIGNORE_ENTRIES) {
    if (!content.includes(entry)) {
      content += `\n${entry}`;
      changed = true;
    }
  }
  if (changed) {
    if (!DRY) fs.writeFileSync(gitignorePath, content, 'utf8');
    else log(`DRY: would add entries to .gitignore`);
  }
}

// ── Machine-level tools (skip in CI — developers-only) ───────────────────────

function detectPackageManager() {
  if (fs.existsSync(path.join(CONSUMER_ROOT, 'bun.lockb')) || fs.existsSync(path.join(CONSUMER_ROOT, 'bun.lock'))) return 'bun';
  if (fs.existsSync(path.join(CONSUMER_ROOT, 'pnpm-lock.yaml'))) return 'pnpm';
  return 'npm';
}

function globalInstallCmd(pm, pkg) {
  switch (pm) {
    case 'bun':  return `bun add -g ${pkg}`;
    case 'pnpm': return `pnpm add -g ${pkg}`;
    default:     return `npm install -g ${pkg}`;
  }
}

function installGsd() {
  // Already available?
  const alreadyInstalled =
    (() => { try { execSync('gsd --version', { stdio: 'ignore' }); return true; } catch { return false; } })() ||
    (() => { try { execSync('npx --yes gsd-core --version', { stdio: 'ignore', timeout: 8000 }); return true; } catch { return false; } })();

  if (alreadyInstalled) return;

  const pm = detectPackageManager();
  const cmd = globalInstallCmd(pm, 'gsd-core');
  try {
    execSync(cmd, { stdio: 'ignore', timeout: 60000 });
    log(`gsd installed globally (${cmd})`);
  } catch {
    log(`WARN: gsd install failed — run manually: ${cmd}`);
  }
}

function installCodebaseMemoryMcp() {
  // Required by agent-isolation / AGENTS.md — must be registered in ~/.claude/.mcp.json
  // Official installers: https://github.com/DeusData/codebase-memory-mcp (macOS/Linux + Windows)
  const result = ensureCodebaseMemoryMcp();
  if (!result.ok) {
    log('FATAL: codebase-memory-mcp is required and could not be installed');
    process.exit(1);
  }
  if (result.alreadyReady) {
    log('codebase-memory-mcp already registered');
  }
}

function installCaveman() {
  // Check if caveman skill already present in any known location
  const home = os.homedir();
  const knownPaths = [
    path.join(home, '.claude', 'skills', 'caveman'),
    path.join(home, '.claude', 'commands', 'caveman.md'),
  ];
  if (knownPaths.some(p => fs.existsSync(p))) return;

  try {
    execSync(
      'curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.sh | bash',
      { stdio: 'ignore', shell: true, timeout: 30000 }
    );
    log('caveman installed');
  } catch {
    log('WARN: caveman install failed — see: https://github.com/JuliusBrussee/caveman');
  }
}

function installKarpathySkill() {
  const dest = path.join(os.homedir(), '.claude', 'skills', 'andrej-karpathy-skills', 'karpathy-guidelines', 'SKILL.md');
  if (fs.existsSync(dest)) return;
  const src = path.join(PACKAGE_ROOT, 'managed', 'skills', 'andrej-karpathy-skills', 'karpathy-guidelines', 'SKILL.md');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  log('andrej-karpathy-skills installed → ~/.claude/skills/');
}

function installCommitChangesSkill() {
  const dest = path.join(os.homedir(), '.claude', 'commands', 'commit-changes.md');
  if (fs.existsSync(dest)) return;
  const src = path.join(PACKAGE_ROOT, 'managed', 'skills', 'commit-changes', 'SKILL.md');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  log('commit-changes skill installed → ~/.claude/commands/commit-changes.md');
}

function installCodeReviewSkill() {
  const dest = path.join(os.homedir(), '.claude', 'commands', 'code-review.md');
  if (fs.existsSync(dest)) return;
  const src = path.join(PACKAGE_ROOT, 'managed', 'skills', 'code-review', 'SKILL.md');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  log('code-review skill installed → ~/.claude/commands/code-review.md');
}

function installSecurityReviewSkill() {
  const dest = path.join(os.homedir(), '.claude', 'commands', 'security-review.md');
  if (fs.existsSync(dest)) return;
  const src = path.join(PACKAGE_ROOT, 'managed', 'skills', 'security-review', 'SKILL.md');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  log('security-review skill installed → ~/.claude/commands/security-review.md');
}

function installMakePrSkill() {
  const dest = path.join(os.homedir(), '.claude', 'commands', 'make-pr.md');
  if (fs.existsSync(dest)) return;
  const src = path.join(PACKAGE_ROOT, 'managed', 'skills', 'make-pr', 'SKILL.md');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  log('make-pr skill installed → ~/.claude/commands/make-pr.md');
}

function installEnforcementRule() {
  const dest = path.join(os.homedir(), '.claude', 'rules', 'harness-enforcement.md');
  const src = path.join(PACKAGE_ROOT, 'managed', 'claude', 'rules', 'harness-enforcement.md');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function installAgentIsolationRule() {
  const dest = path.join(os.homedir(), '.claude', 'rules', 'agent-isolation.md');
  const src = path.join(PACKAGE_ROOT, 'managed', 'claude', 'rules', 'agent-isolation.md');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function installHarnessPatterns() {
  const dest = path.join(os.homedir(), '.claude', 'rules', 'harness-patterns.md');
  const src = path.join(PACKAGE_ROOT, 'managed', 'claude', 'rules', 'harness-patterns.md');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function installCavemanRule() {
  // Always overwrite — caveman communication is harness-enforced, not optional
  const dest = path.join(os.homedir(), '.claude', 'rules', 'caveman.md');
  const src = path.join(PACKAGE_ROOT, 'managed', 'claude', 'rules', 'caveman.md');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  log('caveman rule enforced → ~/.claude/rules/caveman.md');
}

// ── Main ─────────────────────────────────────────────────────────────────────

// Machine-level tools: install for developers, skip in CI
if (!IS_CI) {
  installGsd();
  installCodebaseMemoryMcp();
  installCaveman();
  installKarpathySkill();
  installCommitChangesSkill();
  installCodeReviewSkill();
  installSecurityReviewSkill();
  installMakePrSkill();
  installEnforcementRule();
  installAgentIsolationRule();
  installHarnessPatterns();
  installCavemanRule();
}

// Consumer-repo-specific setup
const isConsumerRepo = fs.existsSync(path.join(CONSUMER_ROOT, '.git'));
if (!isConsumerRepo) process.exit(0);

// Also skip if CONSUMER_ROOT === PACKAGE_ROOT (self-install)
if (path.resolve(CONSUMER_ROOT) === path.resolve(PACKAGE_ROOT)) process.exit(0);

// Copy managed files
for (const [src, dest] of MANAGED_FILES) {
  copyFile(src, dest);
}

// ECC rules: project-scoped sync (add/remove folders based on consumer package.json)
if (!IS_CI) {
  installEccRules(CONSUMER_ROOT, { dryRun: DRY, silent: DRY });
}

// Install git hooks
installGitHooks();

// Update .gitignore
installGitIgnoreEntries();
