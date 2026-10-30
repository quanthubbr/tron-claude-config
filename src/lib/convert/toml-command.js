'use strict';

// SKILL.md → Gemini CLI `commands/<name>.toml` ({ description, prompt }).
const { splitFrontmatter } = require('./md-command');

// JSON escapes are valid TOML basic-string escapes; DEL is the one control char JSON leaves raw.
const basic = (text) => JSON.stringify(String(text)).replace(/\u007f/g, '\\u007f');

function multiline(text) {
  const body = text.endsWith('\n') ? text : `${text}\n`;
  // A literal block cannot hold ''' or control chars other than tab and newline.
  if (body.includes("'''") || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(body)) return basic(body);
  return `'''\n${body}'''`;
}

// Gemini expands !{…} (shell) and @{…} (file) in prompts; shipped text must never execute.
const inert = (body) => body.replace(/([!@])\{/g, '$1 {');

function toTomlCommand(skill) {
  const { fields, body } = splitFrontmatter(skill);
  const prompt = inert(body).replace(/\$ARGUMENTS/g, '{{args}}');
  return `description = ${basic(fields.description || '')}\nprompt = ${multiline(prompt)}\n`;
}

module.exports = { toTomlCommand };
