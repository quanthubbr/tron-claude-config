'use strict';

// exonous doctor: one screen, every piece, and the fix for whatever is missing.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { update } = require('./update');
const { packageVersion, gitHooksDir, REPO_FILES, GIT_HOOKS, DESIGN_SKILLS, HOME_SKILLS, PACKAGE_ROOT } = require('./setup');
const { PLUGIN_ID } = require('./lib/techne');
const { LEFTOVERS } = require('./legacy/bridge');

const HOME = os.homedir();
const FIX_SETUP = 'npx exonous setup';

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function hasMcp(key) {
  return [path.join(HOME, '.claude', '.mcp.json'), path.join(HOME, '.claude.json')]
    .some((file) => Boolean(readJson(file)?.mcpServers?.[key]));
}

function repoChecks(root) {
  if (!fs.existsSync(path.join(root, '.git')) || path.resolve(root) === PACKAGE_ROOT) return [];
  const missing = REPO_FILES.filter(([, dest]) => !fs.existsSync(path.join(root, dest))).map(([, dest]) => dest);
  const hooksDir = gitHooksDir(root);
  if (!hooksDir) {
    return [
      { name: 'repo gates (.claude/, AGENTS.md)', ok: !missing.length, detail: missing.join(', '), fix: FIX_SETUP },
      { name: 'git hooks (pre-commit, pre-push)', ok: true, detail: 'core.hooksPath set: hooks owned by another tool' },
    ];
  }
  const gitHooks = GIT_HOOKS.filter((name) => {
    try {
      return /exonous|commit-changes/.test(fs.readFileSync(path.join(hooksDir, name), 'utf8'));
    } catch {
      return false;
    }
  });
  return [
    { name: 'repo gates (.claude/, AGENTS.md)', ok: !missing.length, detail: missing.join(', '), fix: FIX_SETUP },
    { name: 'git hooks (pre-commit, pre-push)', ok: gitHooks.length === GIT_HOOKS.length, fix: FIX_SETUP },
  ];
}

function releaseCheck(root) {
  try {
    const result = update({ root, check: true });
    const ok = ['current', 'pinned', 'absent'].includes(result.status);
    const detail = { current: `v${result.to}`, pinned: `pinned to ${result.from}`, absent: 'not a dependency here', available: `v${result.from} → v${result.to}` }[result.status] || result.status;
    return { name: 'release', ok, detail, fix: 'npx exonous update' };
  } catch (err) {
    return { name: 'release', ok: false, detail: `cannot reach remote (${err.message.split('\n')[0]})`, fix: 'check network/credentials, then npx exonous update' };
  }
}

function machineChecks() {
  const settings = readJson(path.join(HOME, '.claude', 'settings.json')) || {};
  const agents = fs.existsSync(path.join(HOME, '.claude', 'agents'))
    ? fs.readdirSync(path.join(HOME, '.claude', 'agents')).filter((f) => /^exo-.+\.md$/.test(f)).length
    : 0;
  const memoryConfig = readJson(path.join(HOME, '.claude', 'skills', 'project-memory', 'config.json'));
  const leftovers = LEFTOVERS.filter((rel) => fs.existsSync(path.join(HOME, rel)));
  return [
    { name: 'nomos (core rule)', ok: fs.existsSync(path.join(HOME, '.claude', 'rules', 'nomos.md')), fix: FIX_SETUP },
    { name: 'agents exo-* + taxis', ok: agents === 12 && JSON.stringify(settings.hooks || {}).includes('taxis.js'), detail: `${agents}/12 agents`, fix: FIX_SETUP },
    { name: 'skills', ok: Object.keys(HOME_SKILLS).every((s) => fs.existsSync(path.join(HOME, '.claude', 'skills', s, 'SKILL.md'))), fix: FIX_SETUP },
    { name: 'design stack', ok: DESIGN_SKILLS.every((s) => fs.existsSync(path.join(HOME, '.agents', 'skills', s, 'SKILL.md'))), fix: FIX_SETUP },
    { name: 'techne plugin', ok: fs.existsSync(path.join(HOME, '.claude', 'techne')) && settings.enabledPlugins?.[PLUGIN_ID] !== false, fix: FIX_SETUP },
    { name: 'atlas MCP (code graph)', ok: hasMcp('atlas'), fix: 'node node_modules/exonous/src/lib/atlas.js --force' },
    { name: 'biblos MCP (library docs)', ok: hasMcp('biblos'), fix: 'node node_modules/exonous/src/lib/biblos.js' },
    {
      name: 'project-memory vault',
      ok: Boolean(process.env.PROJECT_MEMORY_VAULT || (memoryConfig?.vault && fs.existsSync(memoryConfig.vault))),
      fix: 'create ~/.claude/skills/project-memory/config.json with { "vault": "<abs path>" }',
    },
    { name: 'no leftovers from older installs', ok: !leftovers.length, detail: leftovers.map((r) => `~/${r}`).join(', '), fix: FIX_SETUP },
  ];
}

function doctor({ root = process.cwd() } = {}) {
  const checks = [...repoChecks(root), releaseCheck(root), ...machineChecks()];
  console.log(`exonous v${packageVersion()} — ${root.replace(HOME, '~')}\n`);
  for (const check of checks) {
    const detail = check.detail ? ` (${check.detail})` : '';
    console.log(`  ${check.ok ? '✓' : '✗'} ${check.name}${detail}${check.ok ? '' : `\n      fix: ${check.fix}`}`);
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log(failed ? `\n${failed} problem(s).` : '\nAll good.');
  return failed ? 1 : 0;
}

module.exports = { doctor };
