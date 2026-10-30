'use strict';

// SKILL.md / agent .md → OpenCode command and agent files.

function unquote(value) {
  if (!value.startsWith('"')) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** Flat `key: value` frontmatter (all exonous assets use only that) + body. */
function splitFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { fields: {}, body: text };
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]] = unquote(kv[2].trim());
  }
  return { fields, body: text.slice(m[0].length).replace(/^\s*\n/, '') };
}

// YAML scalar that stays a plain string whatever it contains.
const yamlString = (value) => JSON.stringify(String(value));

function frontmatter(fields) {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${/^[\w ,.()/-]+$/.test(v) ? v : yamlString(v)}`);
  return `---\n${lines.join('\n')}\n---\n\n`;
}

// OpenCode runs !`cmd` and inlines @path files in a template; shipped text must never execute or read files on load.
const inert = (body) => body.replace(/!`/g, '! `').replace(/(^|[\s(])@(?=[\w./~-])/gm, '$1@ ');

/** OpenCode `commands/<name>.md`; Claude model ids do not exist there, so `model` is dropped. */
function toMdCommand(skill) {
  const { fields, body } = splitFrontmatter(skill);
  return `${frontmatter({ description: fields.description || '' })}${inert(body)}`;
}

/** OpenCode `agents/<name>.md` as a subagent; the model is left to the user's OpenCode config. */
function toOpencodeAgent(agent) {
  const { fields, body } = splitFrontmatter(agent);
  return `${frontmatter({ description: fields.description || '', mode: 'subagent' })}${inert(body)}`;
}

module.exports = { splitFrontmatter, toMdCommand, toOpencodeAgent };
