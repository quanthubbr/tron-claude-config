'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { gateAll } = require('../../assets/machine/hooks/pyle.cjs');
const token = require('../../assets/machine/hooks/lib/token.cjs');

const binary = process.argv[2] || path.resolve('target/debug/exonous');
const driver = process.argv.includes('--driver');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exonous-native-gate-parity-'));
const home = path.join(root, 'home');
const repo = path.join(root, 'repo');
const bin = path.join(root, 'bin');
for (const dir of [home, repo, bin]) fs.mkdirSync(dir);
Object.assign(process.env, {
  EXONOUS_HOME: home, HOME: home, GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'Parity', GIT_COMMITTER_NAME: 'Parity',
  GIT_AUTHOR_EMAIL: 'parity@example.test', GIT_COMMITTER_EMAIL: 'parity@example.test',
});
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
git('init', '-q', '-b', 'feature');
fs.writeFileSync(path.join(repo, 'a'), 'one');
git('add', '.');
git('commit', '-qm', 'init');
fs.writeFileSync(path.join(repo, 'a'), 'two');
git('add', '.');
fs.mkdirSync(path.join(repo, '.github'));
fs.writeFileSync(path.join(repo, '.github/pull_request_template.md'), '## Why\n## Tests\n');
if (process.platform !== 'win32') {
  fs.writeFileSync(path.join(bin, 'gitleaks'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
}

const corpus = [
  ...['-m x', '-am x', '--all -m x', '--al -m x', '--a -m x', '--on -m x',
    '--only -m x', '-p', '--interactive', '-m x -- a', '-m x a', '--pathspec-from-file=paths',
    '--no-all --message=-a', '-m all -S --amend', '--help', '-h', '--dry-run',
    '--unknown', '--message', '-qm x', '--message="a; b"', "-m 'git push'",
    '-m $MESSAGE', '-m "$MESSAGE"', '$FLAGS', '-m x >out', '-F - <<EOF\nx\nEOF',
  ].map(args => `git commit ${args}`),
  ...['origin feature', 'origin HEAD:feature', 'origin HEAD:main', 'origin HEAD:master',
    'origin +HEAD:feature', '--force origin HEAD:feature', '--force-with-lease origin HEAD:feature',
    '-f origin HEAD:main', '--all', '--mirror', '--prune', 'origin :main', '--delete origin main',
    '--delete origin feature', '--repo origin HEAD:main', 'origin HEAD:main HEAD:master',
    '--dry-run --force origin HEAD:main', '-h',
  ].map(args => `git push ${args}`),
  ...['--body x', "--body 'Why Tests'", '--fill', '--help', '--body-file -', '--unknown',
    'unexpected', '--body x --body "Why Tests"', '--body "Why Tests" --body x',
  ].map(args => `gh pr create ${args}`),
  'git log', 'git status && ls', 'gh pr list', "echo 'git commit'",
  'git add . && git commit -m x', 'git commit -m x | cat', 'git commit -m x; git push origin HEAD',
  'git commit -m x &', "bash -lc 'git commit -m x'", 'FOO=1 git commit -m x',
  'env GIT_INDEX_FILE=x git commit -m x', 'command git commit -m x',
  'git --git-dir=.git commit -m x', 'git --work-tree=. commit -m x',
  'git -c alias.ci=commit ci -m x', 'git config alias.ci commit',
  'git -c include.path=x commit -m x', 'git --exec-path=/tmp commit -m x',
  'git -c push.default=matching push', 'git -c remote.origin.mirror=true push',
  'gh pr new --body x', 'gh alias set ship "pr create"', 'gh api repos/o/r/pulls -f title=x',
  'gh api graphql -f query=x', 'echo "$(git commit -m x)"',
  'xargs git commit -m x', 'sudo git commit -m x',
  `cd '${repo}' && git commit -m x`, `git -C '${repo}' commit -m x`,
  'git commit --dry-run --no-dry-run -m x',
  'git push -n --no-dry-run origin HEAD:main',
  'git push --dry-run --no-dry-run --force origin HEAD:feature',
  'gh pr create --help=false --body x',
];

let exact = 0;
const stricter = [];
const native = command => {
  const res = spawnSync(binary, driver ? [home, repo] : ['hook', 'pyle', '--adapter', 'claude'], {
    cwd: repo, input: JSON.stringify({ command, cwd: repo }), encoding: 'utf8', env: process.env,
  });
  assert.equal(res.error, undefined, command);
  return driver ? JSON.parse(res.stdout) : { code: res.status, stdout: res.stdout, stderr: res.stderr };
};
try {
  for (const authorized of [false, true]) {
    for (const command of corpus) {
      const reset = () => {
        fs.rmSync(path.join(home, '.claude/exonous/state'), { recursive: true, force: true });
        if (authorized) for (const kind of ['commit', 'push']) token.mint(kind, repo);
      };
      reset();
      const expected = gateAll(['commit', 'pr', 'push'], { command, cwd: repo }).allow;
      reset();
      const res = native(command);
      const actual = res.code === 0;
      assert.ok(!actual || expected, `unsafe allow (${authorized ? 'token' : 'no token'}): ${command}\n${res.stderr}`);
      if (actual === expected) exact++;
      else stricter.push({ authorized, command });
    }
  }
  const scannerChecks = [];
  if (process.platform !== 'win32') {
    const scanner = path.join(bin, 'gitleaks');
    fs.writeFileSync(scanner, '#!/bin/sh\ncase "$*" in *--help*) exit 0;; esac\necho "Finding: test credential"\nexit 3\n');
    token.mint('commit', repo);
    let out = native('git commit -m x');
    assert.equal(out.code, 2);
    assert.match(out.stderr, /gitleaks/);
    assert.equal(token.verify('commit', repo).ok, true);
    scannerChecks.push('failure denies and preserves token');
    fs.writeFileSync(scanner, '#!/bin/sh\nexec sleep 8\n');
    const start = Date.now();
    out = native('git commit -m x');
    assert.equal(out.code, 2);
    assert.match(out.stderr, /timed out/);
    assert.ok(Date.now() - start < 7500);
    assert.equal(token.verify('commit', repo).ok, true);
    scannerChecks.push('probe timeout denies within deadline and preserves token');
    const priorPath = process.env.PATH;
    process.env.PATH = '/usr/bin:/bin';
    out = native('git commit -m x');
    process.env.PATH = priorPath;
    assert.equal(out.code, 0);
    assert.match(out.stdout + out.stderr, /NOT scanned for secrets/);
    assert.equal(token.verify('commit', repo).ok, false);
    scannerChecks.push('absence warns and consumes authorized token');
  }
  console.log(JSON.stringify({ exact, total: corpus.length * 2, conservativeDenials: stricter, scannerChecks }, null, 2));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
