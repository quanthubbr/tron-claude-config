'use strict';

// OpenCode: gate plugin, nomos via the `instructions` list in opencode.json, mcp entries, commands and exo-* subagents.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const paths = require('../lib/paths');
const { mergeList } = require('../lib/settings');
const { toMdCommand, toOpencodeAgent } = require('../lib/convert/md-command');
const { ASSETS, COMMANDS } = require('../lib/runtime');
const { onPath, claudeMcp, mergeMcp, removeMcp, selftestRepo, SELFTEST_DENY, mcpRow } = require('./shared');

const TOOL = 'opencode';
const SCRIPT_ONLY = 'script self-test (does not prove the tool loads the hook)';
const RULES_MARKER = '/.claude/exonous/rules/';
const dir = () => path.join(paths.home(), '.config', 'opencode');
// OpenCode reads opencode.json or opencode.jsonc; plain JSON wins when both exist.
function configFile() {
  const json = path.join(dir(), 'opencode.json');
  const jsonc = path.join(dir(), 'opencode.jsonc');
  return !fs.existsSync(json) && fs.existsSync(jsonc) ? jsonc : json;
}
const pluginFile = () => path.join(dir(), 'plugins', 'exonous.js');
const rulesFile = () => path.join(paths.exoDir(), 'rules', 'nomos.md');
const hook = (name) => path.join(paths.exoDir(), 'hooks', name);

function detect() {
  return fs.existsSync(dir()) || onPath('opencode');
}

/** The plugin with absolute paths baked in as JSON string literals. */
function renderPlugin({ node, pyle = hook('pyle.cjs'), kairos = hook('kairos.cjs') }) {
  const values = { __EXONOUS_NODE__: node, __EXONOUS_PYLE__: pyle, __EXONOUS_KAIROS__: kairos };
  return fs.readFileSync(path.join(ASSETS, 'adapters', 'opencode', 'exonous.js'), 'utf8')
    .replace(/"(__EXONOUS_[A-Z]+__)"/g, (_, key) => JSON.stringify(values[key]));
}

const mcpEntries = (log) => Object.fromEntries(Object.entries(claudeMcp({ log })).map(([key, e]) => [key, e.command
  ? { type: 'local', command: [e.command, ...e.args], enabled: true }
  : { type: 'remote', url: e.url, enabled: true }]));

const jsoncOnly = () => configFile().endsWith('.jsonc');

function install({ home, dryRun, log, execPath, rewriteJsonc = false }) {
  const opts = { tool: TOOL };
  const problems = [];
  home.write(pluginFile(), renderPlugin({ node: execPath }), opts);
  const jsonc = { dryRun, log, jsonc: rewriteJsonc };
  if (jsoncOnly() && !rewriteJsonc) {
    log(`WARN: ${configFile()} is JSONC — exonous edits plain JSON only; file left untouched`);
    problems.push({ what: 'rules', reason: `${configFile()} is JSONC`, fix: `add "${rulesFile()}" to its "instructions" by hand, or rerun \`exonous install --rewrite-jsonc\`` });
  } else if (mergeList(configFile(), { key: 'instructions', add: [rulesFile()], ownedMarker: RULES_MARKER, ...jsonc }).status === 'invalid') {
    problems.push({ what: 'rules', reason: `${configFile()} could not be edited (see WARN above)`, fix: 'fix the JSON by hand, or rerun `exonous install --rewrite-jsonc` (drops comments; backup kept)' });
  } else {
    mergeMcp(configFile(), { tool: TOOL, key: 'mcp', entries: mcpEntries(log), ...jsonc });
  }
  for (const name of COMMANDS) {
    const skill = fs.readFileSync(path.join(ASSETS, 'skills', name, 'SKILL.md'), 'utf8');
    home.write(path.join(dir(), 'commands', `${name}.md`), toMdCommand(skill), opts);
  }
  for (const file of fs.readdirSync(path.join(ASSETS, 'agents')).filter((f) => /^exo-.+\.md$/.test(f))) {
    home.write(path.join(dir(), 'agents', file), toOpencodeAgent(fs.readFileSync(path.join(ASSETS, 'agents', file), 'utf8')), opts);
  }
  return { problems };
}

function uninstall({ dryRun, log }) {
  if (!fs.existsSync(configFile())) return;
  mergeList(configFile(), { key: 'instructions', add: [], ownedMarker: RULES_MARKER, dryRun, log });
  removeMcp(configFile(), { tool: TOOL, key: 'mcp', dryRun, log });
}

/** Node binary the plugin was generated with, or null when the plugin is missing or foreign. */
function pluginNode() {
  try {
    const m = /^const NODE = ("(?:[^"\\]|\\.)*");$/m.exec(fs.readFileSync(pluginFile(), 'utf8'));
    return m ? JSON.parse(m[1]) : null;
  } catch {
    return null;
  }
}

/** Imports the installed plugin under node and feeds its gate a synthetic `git commit`. */
function selftest() {
  const node = pluginNode();
  if (!node) return { ok: false, detail: 'gate plugin not installed' };
  if (!fs.existsSync(node)) return { ok: false, detail: `node binary from install is gone (${node}) — rerun exonous install` };
  let repo;
  try {
    repo = selftestRepo();
  } catch (err) {
    return { ok: false, detail: `${SCRIPT_ONLY}: could not create a temp git repo (${err.message})` };
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exonous-selftest-'));
  const copy = path.join(tmp, 'exonous.mjs');
  fs.copyFileSync(pluginFile(), copy);
  const script = `const m = await import(${JSON.stringify(`file://${copy.split(path.sep).join('/')}`)});
const hooks = await m.ExonousGate({ directory: ${JSON.stringify(repo)} });
try { await hooks['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git commit -m exonous-selftest' } }); console.log('allow'); }
catch (e) { console.log('deny: ' + e.message.split('\\n')[0]); }`;
  const res = spawnSync(node, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 30000 });
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(repo, { recursive: true, force: true });
  const out = (res.stdout || '').trim();
  return out.startsWith('deny: ') && SELFTEST_DENY.test(out)
    ? { ok: true, detail: `${SCRIPT_ONLY}: gate plugin denies an unreviewed git commit` }
    : { ok: false, detail: `${SCRIPT_ONLY}: gate plugin did not deny (exit ${res.status}${res.error ? `, ${res.error.message}` : ''})` };
}

function doctor() {
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(configFile(), 'utf8'));
  } catch {
    // reported below
  }
  const agents = fs.existsSync(path.join(dir(), 'agents')) ? fs.readdirSync(path.join(dir(), 'agents')).filter((f) => /^exo-.+\.md$/.test(f)).length : 0;
  const row = (name, ok, status = '') => ({ name: `OpenCode: ${name}`, ok, status, fix: 'exonous install' });
  return [
    row('gate plugin (commit, push, pr)', pluginNode() !== null),
    row('nomos rule (instructions)', Array.isArray(config.instructions) && config.instructions.includes(rulesFile()), jsoncOnly() ? 'opencode.jsonc: add it by hand' : ''),
    row('commands', COMMANDS.every((c) => fs.existsSync(path.join(dir(), 'commands', `${c}.md`)))),
    row('agents exo-*', agents === 12, `${agents}/12 agents`),
    mcpRow('OpenCode', Object.keys(config.mcp || {})),
  ];
}

const registeredCommand = () => (pluginNode() ? pluginFile() : null);

module.exports = { id: TOOL, tier: 1, gate: 'hard', detect, install, uninstall, doctor, selftest, registeredCommand, renderPlugin };
