#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { test, beforeEach, afterEach } = require('node:test');
const { resolveTemplate, sectionsOf, draftPath } = require('../assets/machine/hooks/lib/template.cjs');
const { validateBodyContent, validateGhPrCreateCommand } = require('../assets/machine/hooks/lib/pr-template-validate.cjs');
const { stateDir, repoKey } = require('../assets/machine/hooks/lib/paths.cjs');

const HOOKS = path.join(__dirname, '..', 'assets', 'machine', 'hooks');
const BUNDLED = path.join(__dirname, '..', 'assets', 'machine', 'PR-TEMPLATE.md');
const EN = '<!-- ## Not a title -->\n## Summary\n\n## Test plan\n### detail\n```\n## not either\n```\n';

let prevHome;
beforeEach(() => {
  prevHome = process.env.EXONOUS_HOME;
  process.env.EXONOUS_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-home-'));
});
afterEach(() => {
  if (prevHome === undefined) delete process.env.EXONOUS_HOME;
  else process.env.EXONOUS_HOME = prevHome;
});

function repo(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-repo-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return fs.realpathSync.native(dir);
}

test('only level-2 titles outside comments and fences are required', () => {
  assert.deepStrictEqual(sectionsOf(EN), ['Summary', 'Test plan']);
});

test('the repo template wins in any case, .github before docs before root', () => {
  const dir = repo({ '.github/PULL_REQUEST_TEMPLATE.md': EN, 'docs/pull_request_template.md': '## Docs\n', 'pull_request_template.md': '## Root\n' });
  assert.deepStrictEqual(resolveTemplate(dir), { path: path.join(dir, '.github', 'PULL_REQUEST_TEMPLATE.md'), sections: ['Summary', 'Test plan'] });
  fs.rmSync(path.join(dir, '.github'), { recursive: true });
  assert.deepStrictEqual(resolveTemplate(path.join(dir, 'docs')).sections, ['Docs']);
  fs.rmSync(path.join(dir, 'docs'), { recursive: true });
  assert.deepStrictEqual(resolveTemplate(dir).sections, ['Root']);
});

test('without a repo template the machine copy applies, then the bundled one', () => {
  const dir = repo();
  assert.strictEqual(resolveTemplate(dir).path, BUNDLED);
  assert.strictEqual(resolveTemplate(dir).sections.length, 5);
  const machine = path.join(process.env.EXONOUS_HOME, '.claude', 'exonous', 'PR-TEMPLATE.md');
  fs.mkdirSync(path.dirname(machine), { recursive: true });
  fs.writeFileSync(machine, '## Why\n## How\n');
  assert.deepStrictEqual(resolveTemplate(dir), { path: machine, sections: ['Why', 'How'] });
  assert.deepStrictEqual(resolveTemplate(os.tmpdir()).sections, ['Why', 'How']);
});

test('the PR draft lives in machine state, keyed by repo', () => {
  const dir = repo();
  assert.strictEqual(draftPath(dir), path.join(stateDir(), 'pr', `${repoKey(dir)}.md`));
});

test('body validation follows the resolved template', () => {
  const template = { path: '/x/t.md', sections: ['Summary', 'Test plan'] };
  assert.deepStrictEqual(validateBodyContent('## Summary\nx\n## Test plan\ny', template), { ok: true });
  const res = validateBodyContent('## Summary\nx', template);
  assert.strictEqual(res.ok, false);
  assert.match(res.reason, /Test plan/);
  assert.match(res.reason, /\/x\/t\.md/);
});

test('gh pr create is checked against the repo template', () => {
  const dir = repo({ '.github/pull_request_template.md': EN, 'body.md': '## Summary\n## Test plan\n' });
  assert.strictEqual(validateGhPrCreateCommand('gh pr create --body-file body.md', dir).ok, true);
  assert.strictEqual(validateGhPrCreateCommand('gh -R o/r pr create --body "## Summary only"', dir).ok, false);
});

test('validate-pr-body CLI exits 0 on a complete body and 1 otherwise', () => {
  const dir = repo({ '.github/pull_request_template.md': EN, 'good.md': '## Summary\n## Test plan\n', 'bad.md': '## Summary\n' });
  const run = (file) => spawnSync(process.execPath, [path.join(HOOKS, 'lib', 'validate-pr-body.cjs'), file], { cwd: dir, encoding: 'utf8', env: process.env });
  const good = run('good.md');
  assert.strictEqual(good.status, 0, good.stderr);
  assert.match(good.stdout, /2 template titles/);
  const bad = run('bad.md');
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stderr, /Test plan/);
});

test('symlinked, dangling and oversized templates are ignored', () => {
  const dir = repo({ 'docs/pull_request_template.md': '## Docs\n', 'outside.md': '## Evil\n' });
  fs.mkdirSync(path.join(dir, '.github'));
  fs.symlinkSync(path.join(dir, 'outside.md'), path.join(dir, '.github', 'pull_request_template.md'));
  assert.deepStrictEqual(resolveTemplate(dir).sections, ['Docs']);
  fs.rmSync(path.join(dir, '.github', 'pull_request_template.md'));
  fs.symlinkSync(path.join(dir, 'missing.md'), path.join(dir, '.github', 'PULL_REQUEST_TEMPLATE.md'));
  assert.deepStrictEqual(resolveTemplate(dir).sections, ['Docs']);
  fs.writeFileSync(path.join(dir, 'docs', 'pull_request_template.md'), `## Big\n${'x'.repeat(64 * 1024)}`);
  assert.strictEqual(resolveTemplate(dir).path, BUNDLED);
});
