#!/usr/bin/env node
// postinstall.js — installs Claude enforcement harness into consumer repo
// Runs automatically on: npm install @tron/claude-config
// Idempotent: safe to run multiple times

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFileSync } = require('child_process');
const { installTronRules } = require('./lib/install-tron-rules');
const { installTronKitPlugin, removeLegacyEcc, disablePlugin } = require('./lib/install-tron-kit');
const { ensureCodebaseMemoryMcp } = require('./lib/ensure-codebase-memory');

const DRY = process.env.DRY === '1';
const IS_CI = !!(process.env.CI || process.env.CONTINUOUS_INTEGRATION || process.env.GITHUB_ACTIONS);
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const CONSUMER_ROOT = process.env.INIT_CWD || process.cwd();

// Files that lived under node_modules/.../managed/ → consumer dest
// Each entry: [src relative to PACKAGE_ROOT, dest relative to CONSUMER_ROOT]
const MANAGED_FILES = [
  ['managed/claude/settings.json',                    '.claude/settings.json'],
  ['managed/claude/PR-TEMPLATE.md',                   '.claude/PR-TEMPLATE.md'],
  ['managed/claude/hooks/bypass-check.sh',            '.claude/hooks/bypass-check.sh'],
  ['managed/claude/hooks/bootstrap-check.sh',         '.claude/hooks/bootstrap-check.sh'],
  ['managed/claude/hooks/lib/pr-template-validate.cjs','.claude/hooks/lib/pr-template-validate.cjs'],
  ['managed/claude/hooks/lib/validate-pr-body.cjs',    '.claude/hooks/lib/validate-pr-body.cjs'],
  ['managed/claude/hooks/lib/pr-create-gate.cjs',      '.claude/hooks/lib/pr-create-gate.cjs'],
  ['managed/setup-claude-harness.sh',                 'scripts/setup-claude-harness.sh'],
  ['managed/AGENTS.md',                               'AGENTS.md'],
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
  '.cursor/',
  '.omc/',
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

function copyTree(srcAbs, destAbs, { exclude = ['__pycache__', '.DS_Store'] } = {}) {
  if (!fs.existsSync(srcAbs)) {
    log(`WARN: copyTree source not found: ${srcAbs}`);
    return;
  }
  if (DRY) {
    log(`DRY: would copyTree ${srcAbs} → ${destAbs}`);
    return;
  }
  fs.mkdirSync(destAbs, { recursive: true });
  for (const entry of fs.readdirSync(srcAbs, { withFileTypes: true })) {
    if (exclude.includes(entry.name)) continue;
    const srcPath = path.join(srcAbs, entry.name);
    const destPath = path.join(destAbs, entry.name);
    if (entry.isDirectory()) {
      copyTree(srcPath, destPath, { exclude });
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      const ext = path.extname(entry.name);
      if (!ext || ext === '.sh' || ext === '.cmd') {
        try {
          fs.chmodSync(destPath, 0o755);
        } catch {
          // chmod may fail on some platforms/files — non-fatal
        }
      }
    }
  }
}

const EMIL_SKILL_NAMES = [
  'animate',
  'animate-expo',
  'animation-vocabulary',
  'apple-design',
  'ask-sonner',
  'emil-design-eng',
  'find-animation-opportunities',
  'improve-animations',
  'mobile-native',
  'pick-ui-library',
  'prototype',
  'review-animations',
  'write-swift',
];

const TASTE_SKILL_NAMES = [
  'brandkit',
  'design-taste-frontend',
  'design-taste-frontend-v1',
  'full-output-enforcement',
  'gpt-taste',
  'high-end-visual-design',
  'image-to-code',
  'imagegen-frontend-mobile',
  'imagegen-frontend-web',
  'industrial-brutalist-ui',
  'minimalist-ui',
  'redesign-existing-projects',
  'stitch-design-taste',
];

function ensureSymlinkOrCopy(targetAbs, linkAbs) {
  if (fs.existsSync(linkAbs)) {
    try {
      const stat = fs.lstatSync(linkAbs);
      if (stat.isSymbolicLink()) {
        const resolved = fs.realpathSync(linkAbs);
        if (resolved === fs.realpathSync(targetAbs)) return;
      } else if (stat.isDirectory()) {
        return;
      }
    } catch {
      // fall through to recreate
    }
  }
  if (DRY) {
    log(`DRY: would symlink ${linkAbs} → ${targetAbs}`);
    return;
  }
  fs.mkdirSync(path.dirname(linkAbs), { recursive: true });
  try {
    if (fs.existsSync(linkAbs)) fs.rmSync(linkAbs, { recursive: true, force: true });
    fs.symlinkSync(targetAbs, linkAbs, 'dir');
  } catch {
    copyTree(targetAbs, linkAbs);
  }
}

function installEmilSkills() {
  const home = os.homedir();
  const srcBase = path.join(PACKAGE_ROOT, 'managed', 'skills', 'emilkowalski');
  for (const name of EMIL_SKILL_NAMES) {
    const src = path.join(srcBase, name);
    const agentsDest = path.join(home, '.agents', 'skills', name);
    copyTree(src, agentsDest);
    ensureSymlinkOrCopy(agentsDest, path.join(home, '.claude', 'skills', name));
    ensureSymlinkOrCopy(agentsDest, path.join(home, '.cursor', 'skills', name));
  }
  log('Emil skills installed → ~/.agents/skills/ (+ symlinks to ~/.claude/skills/ and ~/.cursor/skills/)');
}

function installTasteSkills() {
  const home = os.homedir();
  const srcBase = path.join(PACKAGE_ROOT, 'managed', 'skills', 'leonxlnx');
  for (const name of TASTE_SKILL_NAMES) {
    const src = path.join(srcBase, name);
    const agentsDest = path.join(home, '.agents', 'skills', name);
    copyTree(src, agentsDest);
    ensureSymlinkOrCopy(agentsDest, path.join(home, '.claude', 'skills', name));
    ensureSymlinkOrCopy(agentsDest, path.join(home, '.cursor', 'skills', name));
  }
  log('Taste skills installed → ~/.agents/skills/ (+ symlinks to ~/.claude/skills/ and ~/.cursor/skills/)');
}

function installImpeccable() {
  const home = os.homedir();
  const src = path.join(PACKAGE_ROOT, 'managed', 'skills', 'impeccable');
  const skillTargets = [
    path.join(home, '.claude', 'skills', 'impeccable'),
    path.join(home, '.cursor', 'skills', 'impeccable'),
    path.join(home, '.github', 'skills', 'impeccable'),
  ];
  for (const dest of skillTargets) {
    copyTree(src, dest);
  }

  const agentsSrc = path.join(PACKAGE_ROOT, 'managed', 'agents');
  if (fs.existsSync(agentsSrc)) {
    for (const agentFile of fs.readdirSync(agentsSrc).filter((f) => f.startsWith('impeccable-') && f.endsWith('.md'))) {
      for (const agentsDir of [path.join(home, '.claude', 'agents'), path.join(home, '.cursor', 'agents')]) {
        if (DRY) {
          log(`DRY: would copy ${agentFile} → ${agentsDir}/`);
          continue;
        }
        fs.mkdirSync(agentsDir, { recursive: true });
        fs.copyFileSync(path.join(agentsSrc, agentFile), path.join(agentsDir, agentFile));
      }
    }
  }

  if (!DRY) {
    for (const base of skillTargets) {
      const launcher = path.join(base, 'scripts', 'impeccable');
      const bin = path.join(base, 'scripts', 'bin', 'darwin-arm64', 'impeccable');
      for (const p of [launcher, bin]) {
        if (fs.existsSync(p)) fs.chmodSync(p, 0o755);
      }
    }
  }
  log('impeccable installed → ~/.claude/skills/, ~/.cursor/skills/, ~/.github/skills/ (+ agents)');
}

function installImpeccableHooks(consumerRoot) {
  const home = os.homedir();
  const hookSpecs = [
    {
      template: 'managed/hooks/cursor/hooks.json',
      dest: path.join(consumerRoot, '.cursor', 'hooks.json'),
      bin: path.join(home, '.cursor', 'skills', 'impeccable', 'scripts', 'impeccable'),
    },
    {
      template: 'managed/hooks/github/impeccable.json',
      dest: path.join(consumerRoot, '.github', 'hooks', 'impeccable.json'),
      bin: path.join(home, '.github', 'skills', 'impeccable', 'scripts', 'impeccable'),
    },
  ];

  for (const { template, dest, bin } of hookSpecs) {
    if (fs.existsSync(dest)) {
      const existing = fs.readFileSync(dest, 'utf8');
      if (existing.includes('impeccable')) {
        log(`impeccable hooks skipped (already present): ${path.relative(consumerRoot, dest)}`);
        continue;
      }
    }
    const templateAbs = path.join(PACKAGE_ROOT, template);
    if (!fs.existsSync(templateAbs)) {
      log(`WARN: hook template not found: ${template}`);
      continue;
    }
    const content = fs.readFileSync(templateAbs, 'utf8').replaceAll('__IMPECCABLE_BIN__', bin);
    if (DRY) {
      log(`DRY: would write impeccable hooks → ${path.relative(consumerRoot, dest)}`);
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, 'utf8');
    log(`impeccable hooks installed → ${path.relative(consumerRoot, dest)}`);
  }
}

function installTronDesignFallback() {
  // Always sync — subordinate to the Emil + Impeccable + Taste combo; stale copies must not linger.
  const home = os.homedir();
  const src = path.join(PACKAGE_ROOT, 'managed', 'skills', 'tron-design-fallback');
  for (const dest of [
    path.join(home, '.claude', 'skills', 'tron-design-fallback'),
    path.join(home, '.cursor', 'skills', 'tron-design-fallback'),
  ]) {
    if (!DRY) fs.rmSync(dest, { recursive: true, force: true });
    copyTree(src, dest);
  }
  log(`tron-design-fallback ${DRY ? 'would be ' : ''}synced → ~/.claude/skills/, ~/.cursor/skills/`);
}

const LEGACY_DESIGN_SKILLS = ['ui-ux-pro-max', 'frontend-design'];
const LEGACY_DESIGN_PLUGIN = 'frontend-design@claude-plugins-official';

function removeLegacyDesignSkills() {
  const home = os.homedir();
  for (const base of ['.claude', '.cursor', '.agents', '.github']) {
    for (const name of LEGACY_DESIGN_SKILLS) {
      const target = path.join(home, base, 'skills', name);
      let stat;
      try {
        stat = fs.lstatSync(target);
      } catch {
        continue;
      }
      const rel = `~/${base}/skills/${name}`;
      if (DRY) {
        log(`DRY: would remove legacy skill ${rel}`);
        continue;
      }
      try {
        if (stat.isSymbolicLink()) fs.unlinkSync(target);
        else fs.rmSync(target, { recursive: true, force: true });
        log(`removed legacy skill ${rel}`);
      } catch (err) {
        log(`WARN: could not remove legacy skill ${rel}: ${err.message}`);
      }
    }
  }
  try {
    disablePlugin(LEGACY_DESIGN_PLUGIN, { dryRun: DRY, log });
  } catch (err) {
    log(`WARN: ${LEGACY_DESIGN_PLUGIN} not disabled: ${err.message}`);
  }
}

function installFrontendSkillsRule() {
  const dest = path.join(os.homedir(), '.cursor', 'rules', 'frontend-skills.mdc');
  const src = path.join(PACKAGE_ROOT, 'managed', 'cursor', 'rules', 'frontend-skills.mdc');
  if (!fs.existsSync(src)) {
    log('WARN: frontend-skills.mdc not found in managed/');
    return;
  }
  if (DRY) {
    log('DRY: would sync frontend-skills.mdc → ~/.cursor/rules/');
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  log('frontend-skills rule synced → ~/.cursor/rules/frontend-skills.mdc');
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
    (() => { try { execSync('npx --yes @opengsd/gsd-pi --version', { stdio: 'ignore', timeout: 8000 }); return true; } catch { return false; } })();

  if (alreadyInstalled) return;

  const pm = detectPackageManager();
  const cmd = globalInstallCmd(pm, '@opengsd/gsd-pi');
  try {
    execSync(cmd, { stdio: 'ignore', timeout: 60000 });
    log(`gsd installed globally (${cmd})`);
  } catch {
    log(`WARN: gsd install failed — run manually: ${cmd}`);
  }
}

function installCodebaseMemoryMcp() {
  // Required by agent-isolation / AGENTS.md — should be registered in ~/.claude/.mcp.json
  // Official installers: https://github.com/DeusData/codebase-memory-mcp (macOS/Linux + Windows)
  // Non-fatal here: a failed MCP install must not block copying hooks into consumer repos
  // (especially on Windows/WSL where PowerShell/curl installers often fail on first run).
  const result = ensureCodebaseMemoryMcp();
  if (result.alreadyReady) {
    log('codebase-memory-mcp already registered');
    return result;
  }
  if (result.ok) {
    return result;
  }
  log('WARN: codebase-memory-mcp could not be installed automatically');
  log('WARN: run manually: node node_modules/@tron/claude-config/scripts/lib/ensure-codebase-memory.js');
  return result;
}

function installCaveman() {
  if (process.platform === 'win32') {
    log('WARN: caveman auto-install skipped on native Windows — use WSL/Git Bash or install from https://github.com/JuliusBrussee/caveman');
    return;
  }
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
  // Always sync — enforcement contract; stale English "Summary" skills were bypassing the PT-BR template.
  const dest = path.join(os.homedir(), '.claude', 'commands', 'make-pr.md');
  const src = path.join(PACKAGE_ROOT, 'managed', 'skills', 'make-pr', 'SKILL.md');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  log('make-pr skill synced → ~/.claude/commands/make-pr.md');
}

function installSessionHandoffSkill() {
  // Always sync the code files so fixes reach everyone; never touch config.json,
  // which holds each person's sessions vault path.
  const destDir = path.join(os.homedir(), '.claude', 'skills', 'session-handoff');
  const srcDir = path.join(PACKAGE_ROOT, 'managed', 'skills', 'session-handoff');
  const existing = path.join(destDir, 'SKILL.md');
  if (fs.existsSync(existing) && !/^name: session-handoff\r?$/m.test(fs.readFileSync(existing, 'utf8'))) {
    log('WARN: ~/.claude/skills/session-handoff/ holds a different skill — left untouched');
    return;
  }
  if (DRY) {
    log('DRY: would sync session-handoff skill → ~/.claude/skills/session-handoff/');
    return;
  }
  try {
    fs.mkdirSync(destDir, { recursive: true });
    for (const file of ['SKILL.md', 'config.example.json']) {
      const src = path.join(srcDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(destDir, file));
      }
    }
    log('session-handoff skill synced → ~/.claude/skills/session-handoff/ (vault set in config.json on first use)');
  } catch (err) {
    log(`WARN: session-handoff skill not synced: ${err.message}`);
  }
}

function installSessionHandoffCommand() {
  // Always sync — `/session-handoff` replaces legacy `/save-session` and `/retomar`.
  const dest = path.join(os.homedir(), '.claude', 'commands', 'session-handoff.md');
  const src = path.join(PACKAGE_ROOT, 'managed', 'skills', 'session-handoff', 'SKILL.md');
  if (DRY) {
    log('DRY: would sync session-handoff command → ~/.claude/commands/session-handoff.md');
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  log('session-handoff command synced → ~/.claude/commands/session-handoff.md');
}

function installIssueBoardSkill() {
  // Always sync the code files so fixes reach everyone; never touch config.json or data/,
  // which hold each person's board and cached classification.
  const destDir = path.join(os.homedir(), '.claude', 'skills', 'issue-board');
  const srcDir = path.join(PACKAGE_ROOT, 'managed', 'skills', 'issue-board');
  const existing = path.join(destDir, 'SKILL.md');
  if (fs.existsSync(existing) && !/^name: issue-board\r?$/m.test(fs.readFileSync(existing, 'utf8'))) {
    log('WARN: ~/.claude/skills/issue-board/ holds a different skill — left untouched');
    return;
  }
  if (DRY) {
    log('DRY: would sync issue-board skill → ~/.claude/skills/issue-board/');
    return;
  }
  try {
    fs.mkdirSync(destDir, { recursive: true });
    for (const file of ['SKILL.md', 'board.mjs', 'render.py', 'config.example.json']) {
      fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
    }
    log('issue-board skill synced → ~/.claude/skills/issue-board/ (board is set in config.json on first use)');
  } catch (err) {
    // Optional tool: a copy failure (locked file on Windows) must not break npm install.
    log(`WARN: issue-board skill not synced: ${err.message}`);
  }
}

function installDocSkill() {
  // Always sync the code files so fixes reach everyone. The skill keeps no per-person state.
  const destDir = path.join(os.homedir(), '.claude', 'skills', 'doc');
  const srcDir = path.join(PACKAGE_ROOT, 'managed', 'skills', 'doc');
  const existing = path.join(destDir, 'SKILL.md');
  if (fs.existsSync(existing) && !/^name: doc\r?$/m.test(fs.readFileSync(existing, 'utf8'))) {
    log('WARN: ~/.claude/skills/doc/ holds a different skill — left untouched');
    return;
  }
  if (DRY) {
    log('DRY: would sync doc skill → ~/.claude/skills/doc/');
    return;
  }
  try {
    fs.mkdirSync(destDir, { recursive: true });
    for (const file of ['SKILL.md', 'doc.mjs']) {
      fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
    }
    log('doc skill synced → ~/.claude/skills/doc/');
  } catch (err) {
    // Optional tool: a copy failure (locked file on Windows) must not break npm install.
    log(`WARN: doc skill not synced: ${err.message}`);
  }
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

function installTronKit() {
  // Legacy removal runs only after tron-kit is in place, so the user never ends up with neither.
  try {
    installTronKitPlugin({ dryRun: DRY, log });
  } catch (err) {
    log(`WARN: tron-kit plugin not installed: ${err.message}`);
    return;
  }
  try {
    removeLegacyEcc({ dryRun: DRY, log });
  } catch (err) {
    log(`WARN: legacy plugin cleanup incomplete: ${err.message}`);
  }
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

const isConsumerRepo = fs.existsSync(path.join(CONSUMER_ROOT, '.git'));
const isSelfInstall = path.resolve(CONSUMER_ROOT) === path.resolve(PACKAGE_ROOT);

// Consumer-repo hooks/settings first — must succeed even when global tool installs fail (Windows/WSL).
if (isConsumerRepo && !isSelfInstall) {
  for (const [src, dest] of MANAGED_FILES) {
    copyFile(src, dest);
  }

  if (!IS_CI) {
    installTronRules(CONSUMER_ROOT, { dryRun: DRY, silent: DRY });
  }

  installGitHooks();
  installGitIgnoreEntries();
  installImpeccableHooks(CONSUMER_ROOT);
}

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
  installSessionHandoffSkill();
  installEmilSkills();
  installImpeccable();
  installTronKit();
  installTasteSkills();
  installTronDesignFallback();
  removeLegacyDesignSkills();
  installIssueBoardSkill();
  installFrontendSkillsRule();
  installEnforcementRule();
  installAgentIsolationRule();
  installHarnessPatterns();
  installCavemanRule();
  installDocSkill();
}
