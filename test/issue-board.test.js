'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SOURCE = path.join(__dirname, '..', 'assets', 'skills', 'issue-board', 'board.mjs');

function item(repo, number, assignees = ['me']) {
  return {
    key: `org/${repo}#${number}`, repo, number, title: `${repo} ${number}`, url: `https://github.com/org/${repo}/issues/${number}`, updatedAt: '',
    assignees, labels: [], body: '', status: 'Todo', group: '', boardPriority: 'P1', boardSize: 'S',
  };
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-board-'));
  const skill = path.join(root, 'skill');
  fs.mkdirSync(path.join(skill, 'data', 'org-1'), { recursive: true });
  fs.copyFileSync(SOURCE, path.join(skill, 'board.mjs'));
  fs.writeFileSync(path.join(skill, 'config.json'), JSON.stringify({ owner: 'org', projectNumber: 1 }));
  const items = [item('nuntius', 1), item('nuntius', 2, ['other']), item('tron', 3), item('tron', 4)];
  fs.writeFileSync(path.join(skill, 'data', 'org-1', 'items.json'), JSON.stringify({ me: 'me', items }));
  return { root, skill };
}

function repoDir(root, name, remote) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  spawnSync('git', ['init', '-q'], { cwd: dir });
  if (remote) spawnSync('git', ['remote', 'add', 'origin', remote], { cwd: dir });
  return dir;
}

function run(skill, cwd, args) {
  const result = spawnSync(process.execPath, [path.join(skill, 'board.mjs'), 'render', ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function render(skill, cwd, ...args) {
  const view = JSON.parse(run(skill, cwd, ['--json', ...args]));
  return { view, numbers: view.groups.flatMap((g) => g.rows.map((r) => r.number)).sort() };
}

test('issue-board scopes to the repo of the current directory', () => {
  const { root, skill } = setup();
  const cwd = repoDir(root, 'nuntius', 'https://github.com/fork-user/Nuntius.git');
  const { view, numbers } = render(skill, cwd);
  assert.deepEqual(numbers, [1]);
  assert.deepEqual(view.repos, ['nuntius']);
});

test('issue-board --todos-repos ignores the current repo', () => {
  const { root, skill } = setup();
  const cwd = repoDir(root, 'nuntius', 'git@github.com:org/nuntius.git');
  const { view, numbers } = render(skill, cwd, '--todos-repos');
  assert.deepEqual(numbers, [1, 3, 4]);
  assert.equal(view.repos, null);
});

test('issue-board --repo overrides the current repo', () => {
  const { root, skill } = setup();
  const cwd = repoDir(root, 'nuntius', 'git@github.com:org/nuntius.git');
  assert.deepEqual(render(skill, cwd, '--repo', 'tron').numbers, [3, 4]);
});

test('issue-board shows every repo outside a repo that is on the board', () => {
  const { root, skill } = setup();
  assert.deepEqual(render(skill, repoDir(root, 'plain')).numbers, [1, 3, 4]);
  assert.deepEqual(render(skill, repoDir(root, 'other', 'https://github.com/org/unrelated')).numbers, [1, 3, 4]);
});

test('issue-board table links each issue with a clickable label on a color terminal', () => {
  const { root, skill } = setup();
  const out = run(skill, repoDir(root, 'nuntius', 'git@github.com:org/nuntius.git'), ['--color', '--width', '100']);
  assert.match(out, /\x1b\]8;;https:\/\/github\.com\/org\/nuntius\/issues\/1\x1b\\↗ abrir\x1b\]8;;\x1b\\/);
});

test('issue-board plain table shows the compact url in place of ID and Repo', () => {
  const { root, skill } = setup();
  const out = run(skill, repoDir(root, 'plain'), ['--no-color', '--width', '100']);
  assert.match(out, /github\.com\/org\/tron\/issues\/3/);
  assert.doesNotMatch(out, /https:\/\/|\x1b/);
  assert.doesNotMatch(out, /│ ID /);
  assert.ok(out.split('\n').every((line) => [...line].length <= 100), out);
});
