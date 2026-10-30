'use strict';

// Claude Code: rules, commands, skills, stack rules, agents, techne plugin, and the gate hooks in ~/.claude/settings.json.
const fs = require('fs');
const path = require('path');
const paths = require('../lib/paths');
const { onPath, readJson, mcpRow, installDesignLinks } = require('./shared');
const { mergeOwned, stripOwned, mergeAllow } = require('../lib/settings');
const { sha256 } = require('../lib/home');
const { installTechne, PLUGIN_ID } = require('../lib/techne');
const { installAgents } = require('../lib/agents');
const { ASSETS, OWNED_MARKER, COMMANDS, HOME_SKILLS, DESIGN_SKILLS, hookCommand, listFiles, sharedSkillDir, foreignSkill } = require('../lib/runtime');

const TOOL = 'claude';
const ALLOW_PREFIX = 'Bash(exonous ';
// Token minting stays behind the human prompt; only read-only exonous commands are pre-approved.
const EXONOUS_ALLOW = ['workflow*', 'template*', 'draft-path*', 'validate-pr*'].map((c) => `${ALLOW_PREFIX}${c})`);

const settingsFile = () => path.join(paths.claudeDir(), 'settings.json');

function detect() {
  return fs.existsSync(paths.claudeDir()) || onPath('claude');
}

function hookEntries(execPath) {
  return {
    PreToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: hookCommand(execPath, 'pyle.cjs', 'auto --adapter claude') }] },
      { matcher: 'Read', hooks: [{ type: 'command', command: hookCommand(execPath, 'lib/metron.cjs') }] },
    ],
    SessionStart: [{ hooks: [{ type: 'command', command: hookCommand(execPath, 'kairos.cjs', '--adapter claude') }] }],
  };
}

/** Every file (or symlink) below dir as a relative POSIX path; directories are only containers. */
function treeFiles(dir, rel = '') {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) => {
    const child = rel ? `${rel}/${e.name}` : e.name;
    return e.isDirectory() ? treeFiles(dir, child) : [child];
  });
}

/** Moves one file without ever replacing what is at the target (hard link + unlink; EEXIST means someone got there first). */
function moveNoClobber(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (fs.lstatSync(from).isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(from), to);
  else {
    try {
      fs.linkSync(from, to);
    } catch (err) {
      if (err.code !== 'EXDEV' && err.code !== 'EPERM') throw err;
      fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
    }
  }
  fs.unlinkSync(from);
}

/**
 * An old real ~/.claude/skills/<name> becomes a link only after every file that is not an exact shipped file has moved,
 * structure kept, into the shared dir. Any clash keeps the old dir as it is and skips the link.
 */
function adoptSkillDir(home, name, dir, shared, files, { dryRun, log }) {
  const shipped = new Set(files);
  const previous = home.ledger.previous;
  // A file an older release shipped (ledger-tracked, unedited) is ours too.
  const ours = (rel) => shipped.has(rel) || (() => {
    const entry = previous[`.claude/skills/${name}/${rel}`];
    try {
      return Boolean(entry) && sha256(fs.readFileSync(path.join(dir, rel))) === entry.hash;
    } catch {
      return false;
    }
  })();
  const personal = treeFiles(dir).filter((rel) => path.posix.basename(rel) !== '.DS_Store' && !ours(rel));
  const clash = personal.find((rel) => fs.existsSync(path.join(shared, rel)) || isLink(path.join(shared, rel)));
  if (clash) {
    log(`WARN: ~/.claude/skills/${name}/${clash} also exists in ~/.agents/skills/${name} — kept ~/.claude/skills/${name} as it is (not linked); merge by hand, then rerun`);
    return false;
  }
  if (dryRun) {
    if (personal.length) log(`DRY: would move ${personal.length} personal file(s) from ~/.claude/skills/${name} to ~/.agents/skills/${name}`);
    return false;
  }
  for (const rel of personal) {
    try {
      moveNoClobber(path.join(dir, rel), path.join(shared, rel));
    } catch (err) {
      log(`WARN: could not move ~/.claude/skills/${name}/${rel} (${err.message}) — kept ~/.claude/skills/${name} (not linked)`);
      return false;
    }
  }
  const left = treeFiles(dir).filter((rel) => path.posix.basename(rel) !== '.DS_Store' && !ours(rel));
  if (left.length) {
    log(`WARN: ~/.claude/skills/${name} still holds ${left.join(', ')} — kept (not linked)`);
    return false;
  }
  return true;
}

function isLink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function installSkills(home, { dryRun, log }) {
  for (const [name, files] of Object.entries(HOME_SKILLS)) {
    const dir = path.join(paths.claudeDir(), 'skills', name);
    const shared = sharedSkillDir(name);
    if (foreignSkill(shared, name)) continue;
    let stat = null;
    try {
      stat = fs.lstatSync(dir);
    } catch {
      // nothing there yet
    }
    if (stat && !stat.isSymbolicLink()) {
      if (foreignSkill(dir, name)) {
        log(`WARN: ~/.claude/skills/${name}/ holds a different skill — left untouched`);
        continue;
      }
      if (!stat.isDirectory() || !adoptSkillDir(home, name, dir, shared, files, { dryRun, log })) continue;
    }
    home.link(shared, dir);
  }
}


/** @param {{ home: object, dryRun: boolean, log: (m: string) => void, execPath: string, permissions?: boolean, external: boolean, detected: Record<string, boolean> }} ctx */
function install(ctx) {
  const { home, dryRun, log } = ctx;
  const opts = { tool: TOOL };
  home.sync(path.join(ASSETS, 'rules', 'nomos.md'), path.join(paths.claudeDir(), 'rules', 'nomos.md'), opts);
  for (const name of COMMANDS) home.sync(path.join(ASSETS, 'skills', name, 'SKILL.md'), path.join(paths.claudeDir(), 'commands', `${name}.md`), opts);
  installSkills(home, { dryRun, log });
  const stack = path.join(ASSETS, 'techne', 'rules');
  for (const rel of listFiles(stack)) home.sync(path.join(stack, rel), path.join(paths.claudeDir(), 'rules', 'exonous', rel), opts);
  installDesignLinks(home, paths.claudeDir(), { dryRun });
  if (ctx.external) installTechne({ dryRun, log });
  else log('techne plugin skipped: EXONOUS_HOME is not the real home, so the claude CLI is not called');
  installAgents({ dryRun, log, hasCursor: Boolean(ctx.detected.cursor), execPath: ctx.execPath });
  mergeOwned(settingsFile(), { format: 'claude', entries: hookEntries(ctx.execPath), ownedMarker: OWNED_MARKER, dryRun, log });
  if (ctx.permissions) mergeAllow(settingsFile(), { add: EXONOUS_ALLOW, ownedPrefix: ALLOW_PREFIX, dryRun, log });
}

function uninstall({ dryRun, log }) {
  stripOwned(settingsFile(), { format: 'claude', ownedMarker: OWNED_MARKER, dryRun, log });
  mergeAllow(settingsFile(), { add: [], ownedPrefix: ALLOW_PREFIX, dryRun, log });
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    return {};
  }
}

/** The gate command this tool would run, as registered in its config. */
function registeredCommand() {
  const entry = ((readSettings().hooks || {}).PreToolUse || []).find((e) => e && e.matcher === 'Bash' && JSON.stringify(e).includes('pyle.cjs'));
  return entry && entry.hooks && entry.hooks[0] ? entry.hooks[0].command : null;
}

const selftestPayload = (command, cwd) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd });

const row = (name, ok, fix = 'exonous install', status = '') => ({ name: `Claude Code: ${name}`, ok, status, fix });

function doctor() {
  const settings = readSettings();
  const hooks = JSON.stringify(settings.hooks || {});
  const agents = fs.existsSync(path.join(paths.claudeDir(), 'agents'))
    ? fs.readdirSync(path.join(paths.claudeDir(), 'agents')).filter((f) => /^exo-.+\.md$/.test(f)).length
    : 0;
  return [
    row('gate hook (commit, push, pr)', hooks.includes('pyle.cjs') && hooks.includes('auto --adapter claude') && fs.existsSync(path.join(paths.exoDir(), 'hooks', 'pyle.cjs'))),
    row('self-update hook (kairos)', hooks.includes('kairos.cjs') && hooks.includes('--adapter claude')),
    row('nomos rule', fs.existsSync(path.join(paths.claudeDir(), 'rules', 'nomos.md'))),
    row('commands', COMMANDS.every((c) => fs.existsSync(path.join(paths.claudeDir(), 'commands', `${c}.md`)))),
    row('skills', Object.keys(HOME_SKILLS).every((s) => fs.existsSync(path.join(paths.claudeDir(), 'skills', s, 'SKILL.md')))),
    row('agents exo-* + taxis', agents === 12 && hooks.includes('taxis.js'), 'exonous install', `${agents}/12 agents`),
    mcpRow('Claude Code', [path.join(paths.claudeDir(), '.mcp.json'), path.join(paths.home(), '.claude.json')].flatMap((f) => Object.keys(readJson(f)?.mcpServers || {}))),
    row('techne plugin', fs.existsSync(path.join(paths.claudeDir(), 'techne')) && settings.enabledPlugins?.[PLUGIN_ID] !== false),
  ];
}

module.exports = { id: TOOL, tier: 1, gate: 'hard', detect, install, uninstall, doctor, registeredCommand, selftestPayload };
