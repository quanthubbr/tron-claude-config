'use strict';

// Every exonous skill and the native form each tool lists it in (its `/` menu, `$` mentions or skill list).
const fs = require('fs');
const path = require('path');
const paths = require('./paths');
const { COMMANDS, HOME_SKILLS, DESIGN_SKILLS, sharedSkillDir } = require('./runtime');

const SKILLS = [...COMMANDS, ...Object.keys(HOME_SKILLS), ...DESIGN_SKILLS];

const shared = (name) => ({ kind: 'skill', file: path.join(sharedSkillDir(name), 'SKILL.md') });
const linked = (dir) => (name) => ({ kind: 'skill', file: path.join(dir(), 'skills', name, 'SKILL.md'), link: true });
const command = (dir, ext) => (name) => ({ kind: 'command', file: path.join(dir(), 'commands', `${name}.${ext}`) });
const gemini = () => path.join(paths.home(), '.gemini');
const opencode = () => path.join(paths.home(), '.config', 'opencode');

// Codex, Copilot and Windsurf read ~/.agents/skills directly (Codex shows skills via `$` and /skills, never in `/`); Gemini and OpenCode only list commands in `/`.
/** @type {Record<string, { label: string, forms: (name: string) => { kind: 'skill'|'command', file: string, link?: boolean }[] }>} */
const TOOLS = {
  claude: { label: 'Claude Code', forms: (name) => [COMMANDS.includes(name) ? command(paths.claudeDir, 'md')(name) : linked(paths.claudeDir)(name)] },
  cursor: { label: 'Cursor', forms: (name) => [linked(paths.cursorDir)(name)] },
  codex: { label: 'Codex CLI', forms: (name) => [shared(name)] },
  gemini: { label: 'Gemini CLI', forms: (name) => [shared(name), command(gemini, 'toml')(name)] },
  opencode: { label: 'OpenCode', forms: (name) => [shared(name), command(opencode, 'md')(name)] },
  copilot: { label: 'Copilot', forms: (name) => [shared(name)] },
  windsurf: { label: 'Windsurf', forms: (name) => [shared(name)] },
};

/** @returns {{ name: string, kind: 'skill'|'command', file: string, link?: boolean }[]} */
function skillForms(tool) {
  const entry = TOOLS[tool];
  if (!entry) throw new Error(`no skill mapping for tool: ${tool}`);
  return SKILLS.flatMap((name) => entry.forms(name).map((form) => ({ name, ...form })));
}

const WHERE = { skill: 'skills', command: '/ commands' };

/** One doctor row per form kind, naming each missing skill. */
function skillRows(tool) {
  const forms = skillForms(tool);
  return Object.keys(WHERE).flatMap((kind) => {
    const mine = forms.filter((f) => f.kind === kind);
    if (!mine.length) return [];
    const missing = mine.filter((f) => !fs.existsSync(f.file)).map((f) => f.name);
    const where = path.dirname(kind === 'skill' ? path.dirname(mine[0].file) : mine[0].file).replace(paths.home(), '~').replace(/\\/g, '/');
    return [{
      name: `${TOOLS[tool].label}: ${WHERE[kind]} (${mine.length - missing.length}/${mine.length} in ${where}/)`,
      ok: !missing.length,
      status: missing.length ? `missing: ${missing.join(', ')}` : '',
      fix: 'exonous install',
    }];
  });
}

module.exports = { SKILLS, TOOLS, skillForms, skillRows };
