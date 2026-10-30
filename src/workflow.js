'use strict';

// exonous workflow commit|pr: the skill procedure as plain text, so any gated tool can follow it.
const fs = require('fs');
const path = require('path');

const SKILLS = path.join(__dirname, '..', 'assets', 'skills');
const WORKFLOWS = { commit: 'commit-changes', pr: 'make-pr' };

function workflowText(kind) {
  const skill = WORKFLOWS[kind];
  if (!skill) throw new Error(`unknown workflow "${kind}" — use one of: ${Object.keys(WORKFLOWS).join(', ')}`);
  const source = fs.readFileSync(path.join(SKILLS, skill, 'SKILL.md'), 'utf8');
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---\r?\n+/.exec(source);
  return frontmatter ? source.slice(frontmatter[0].length) : source;
}

function workflow(kind, out = process.stdout) {
  out.write(workflowText(kind));
}

module.exports = { workflow, workflowText, WORKFLOWS };
