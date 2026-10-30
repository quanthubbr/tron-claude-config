#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { test } = require('node:test');

const BIN = path.join(__dirname, '..', 'bin', 'exonous.js');
const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-home-'));
  fs.mkdirSync(path.join(home, '.claude'));
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cli-repo-')));
  const env = { ...process.env, ...GIT_ENV, EXONOUS_HOME: home };
  const git = (...args) => execFileSync('git', args, { cwd: repo, env, stdio: 'ignore' });
  git('init', '-q', '-b', 'feat/x');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a');
  git('add', '.');
  git('commit', '-q', '--no-gpg-sign', '-m', 'init');
  fs.writeFileSync(path.join(repo, 'b.txt'), 'b');
  git('add', 'b.txt');
  const cli = (args, opts = {}) => spawnSync(process.execPath, [BIN, ...args], { cwd: repo, env, encoding: 'utf8', ...opts });
  return { home, repo, env, cli };
}

test('token mints commit and push tokens for the current repo', () => {
  const { home, cli } = fixture();
  const res = cli(['token', 'commit']);
  assert.strictEqual(res.status, 0, res.stderr);
  assert.match(res.stdout, /commit token/);
  assert.strictEqual(fs.readdirSync(path.join(home, '.claude', 'exonous', 'state', 'commit')).length, 1);
  assert.strictEqual(cli(['token', 'push']).status, 0);
  const bad = cli(['token', 'merge']);
  assert.notStrictEqual(bad.status, 0);
  assert.match(bad.stderr, /commit|push/);
  assert.notStrictEqual(cli(['token', 'commit'], { cwd: os.tmpdir() }).status, 0);
});

test('workflow, template, draft-path and validate-pr', () => {
  const { home, repo, cli } = fixture();
  assert.match(cli(['workflow', 'commit']).stdout, /exonous token commit/);
  assert.match(cli(['workflow', 'pr']).stdout, /exonous draft-path/);
  assert.notStrictEqual(cli(['workflow', 'deploy']).status, 0);
  const tpl = cli(['template']);
  assert.strictEqual(tpl.status, 0);
  assert.match(tpl.stdout, /PR-TEMPLATE\.md/);
  assert.match(tpl.stdout, /## Resumo/);
  const draft = cli(['draft-path']).stdout.trim();
  assert.ok(draft.startsWith(path.join(home, '.claude', 'exonous', 'state', 'pr')));
  assert.ok(fs.existsSync(path.dirname(draft)));
  fs.writeFileSync(draft, '## Resumo\n## Principais mudanças\n## Arquitetura & implementação\n## Antes → Agora\n## Roteiro de teste\n');
  assert.strictEqual(cli(['validate-pr', draft]).status, 0);
  fs.writeFileSync(path.join(repo, 'bad.md'), '## Resumo\n');
  const bad = cli(['validate-pr', 'bad.md']);
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stderr, /Roteiro de teste/);
});

test('installed Claude hook denies git commit until `exonous token commit`', () => {
  const { home, repo, env, cli } = fixture();
  const install = cli(['install']);
  assert.strictEqual(install.status, 0, install.stderr);
  const settings = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'));
  const command = settings.hooks.PreToolUse.find((e) => e.matcher === 'Bash').hooks[0].command;
  const payload = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, cwd: repo });
  const hook = () => spawnSync('sh', ['-c', command], { input: payload, env, encoding: 'utf8' });
  const denied = hook();
  assert.strictEqual(denied.status, 2, denied.stderr);
  assert.match(denied.stderr, /exonous token commit/);
  assert.strictEqual(cli(['token', 'commit']).status, 0);
  const allowed = hook();
  assert.strictEqual(allowed.status, 0, allowed.stderr);
});

test('setup is an alias of install and --dry-run writes nothing', () => {
  const { home, cli } = fixture();
  const res = cli(['setup', '--dry-run']);
  assert.strictEqual(res.status, 0, res.stderr);
  assert.match(res.stdout, /install dry run done/);
  assert.deepStrictEqual(fs.readdirSync(path.join(home, '.claude')), []);
});

test('dev-checkout guard: without EXONOUS_HOME, install and uninstall refuse and name the target', () => {
  const fakeReal = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-real-'));
  const marker = path.join(fakeReal, '.claude', 'exonous', 'config.json');
  fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(marker, '{}');
  const env = { ...process.env, HOME: fakeReal, USERPROFILE: fakeReal };
  delete env.EXONOUS_HOME;
  for (const args of [['uninstall', '--yes'], ['install']]) {
    const res = spawnSync(process.execPath, [BIN, ...args], { env, encoding: 'utf8' });
    assert.notStrictEqual(res.status, 0, args.join(' '));
    assert.match(`${res.stdout}${res.stderr}`, /target home: .*cli-real-/, args.join(' '));
    assert.match(`${res.stdout}${res.stderr}`, /refusing .*--real-home/s, args.join(' '));
  }
  assert.deepStrictEqual(fs.readdirSync(path.join(fakeReal, '.claude')), ['exonous']);
  assert.ok(fs.existsSync(marker));
  const dry = spawnSync(process.execPath, [BIN, 'uninstall', '--dry-run'], { env, encoding: 'utf8' });
  assert.strictEqual(dry.status, 0, dry.stderr);
  assert.ok(fs.existsSync(marker));
});

test('gate --selftest runs the registered hook and expects a deny', () => {
  const { home, cli } = fixture();
  assert.strictEqual(cli(['install']).status, 0);
  const ok = cli(['gate', '--selftest', 'claude']);
  assert.strictEqual(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /claude: script self-test \(does not prove the tool loads the hook\): gate denies/);
  fs.mkdirSync(path.join(home, '.cursor'), { recursive: true });
  assert.strictEqual(cli(['install']).status, 0);
  assert.strictEqual(cli(['gate', '--selftest', 'cursor']).status, 0);
  const file = path.join(home, '.claude', 'settings.json');
  const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
  settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter((e) => !JSON.stringify(e).includes('pyle.cjs'));
  fs.writeFileSync(file, JSON.stringify(settings));
  const broken = cli(['gate', '--selftest', 'claude']);
  assert.strictEqual(broken.status, 1);
  assert.match(broken.stdout, /not registered/);
});

test('setup outside a repo node_modules is an alias of install', () => {
  const { home, cli } = fixture();
  const res = cli(['setup', '--quiet'], { env: { ...process.env, EXONOUS_HOME: home, EXONOUS_NO_UPDATE: '1' } });
  assert.strictEqual(res.status, 0, res.stderr);
  assert.ok(fs.existsSync(path.join(home, '.claude', 'exonous', 'hooks', 'pyle.cjs')));
});
