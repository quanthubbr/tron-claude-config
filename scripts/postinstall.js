#!/usr/bin/env node
// postinstall.js — installs Claude enforcement harness into consumer repo
// Runs automatically on: npm install @tron/claude-config
// Idempotent: safe to run multiple times

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

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

const GIT_HOOKS = [
  ['managed/git-hooks/pre-commit', '.git/hooks/pre-commit'],
  ['managed/git-hooks/pre-push',   '.git/hooks/pre-push'],
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
  if (destAbs.endsWith('.sh') || destRel.startsWith('.git/hooks/')) {
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

function installECC() {
  const eccTarget = path.join(os.homedir(), '.claude', 'rules', 'ecc');
  if (fs.existsSync(path.join(eccTarget, 'common'))) return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-'));
  try {
    execSync(`git clone --depth=1 https://github.com/affaan-m/ECC.git "${tmpDir}/ECC"`, { stdio: 'ignore', timeout: 30000 });
    fs.mkdirSync(eccTarget, { recursive: true });
    for (const folder of ['common', 'typescript', 'csharp', 'nuxt', 'react', 'react-native', 'vue', 'web']) {
      const src = path.join(tmpDir, 'ECC', 'rules', folder);
      if (fs.existsSync(src)) {
        execSync(`cp -R "${src}" "${eccTarget}/"`, { stdio: 'ignore' });
      }
    }
    log('ECC rules installed → ' + eccTarget);
  } catch {
    log('WARN: ECC install failed (check internet / git)');
  } finally {
    try { execSync(`rm -rf "${tmpDir}"`, { stdio: 'ignore' }); } catch {}
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
  const alreadyInstalled = (() => {
    try {
      const mcpConfigPath = path.join(os.homedir(), '.claude', '.mcp.json');
      if (!fs.existsSync(mcpConfigPath)) return false;
      const config = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
      return Object.keys(config.mcpServers || {}).some(k => k.includes('codebase-memory'));
    } catch { return false; }
  })();

  if (alreadyInstalled) return;

  const isWindows = process.platform === 'win32';
  const cmd = isWindows
    ? 'powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.ps1 -OutFile $env:TEMP\\cmm-install.ps1; & $env:TEMP\\cmm-install.ps1"'
    : 'curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash';

  try {
    execSync(cmd, { stdio: 'ignore', shell: true, timeout: 60000 });
    log('codebase-memory-mcp installed');
  } catch {
    log('WARN: codebase-memory-mcp install failed — see: https://github.com/DeusData/codebase-memory-mcp');
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

// ── Main ─────────────────────────────────────────────────────────────────────

// Machine-level tools: install for developers, skip in CI
if (!IS_CI) {
  installECC();
  installGsd();
  installCodebaseMemoryMcp();
  installCaveman();
  installKarpathySkill();
  installMakePrSkill();
  installEnforcementRule();
  installAgentIsolationRule();
  installHarnessPatterns();
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

// Install git hooks
for (const [src, dest] of GIT_HOOKS) {
  copyFile(src, dest);
}

// Update .gitignore
installGitIgnoreEntries();
