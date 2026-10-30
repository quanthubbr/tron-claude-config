#!/usr/bin/env node
'use strict';

const { track } = require('./helpers/tmp-cleanup');

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { test } = require('node:test');
const fx = require('./helpers/adapter-fixture');
const { migrateRepo } = require('../src/legacy/repo-migrate');

fx.useFixtureHome();
// The real global git config may set core.hooksPath; fixture repos must never see it.
process.env.GIT_CONFIG_GLOBAL = '/dev/null';
process.env.GIT_CONFIG_NOSYSTEM = '1';

const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

const SHIPPED = {
  'AGENTS.md': '# AGENTS (shipped)\n',
  '.claude/PR-TEMPLATE.md': '## Summary\n',
  '.claude/hooks/pyle.sh': '#!/bin/sh\nexit 0\n',
  '.claude/hooks/lib/metron.cjs': 'module.exports = 1;\n',
  '.claude/rules/exonous/common/core.md': '# core\n',
  '.claude/hooks/bypass-check.sh': '#!/bin/sh\n# tron\n',
  '.claude/rules/tron/common/old.md': '# tron rule\n',
  'scripts/setup-claude-harness.sh': '#!/bin/sh\n',
};
const HOOKS = { 'pre-commit': '#!/bin/sh\n# exonous pre-commit\n', 'pre-push': '#!/bin/sh\n# exonous pre-push\n' };
const MANIFEST = {
  files: {
    ...Object.fromEntries(Object.entries(SHIPPED).map(([k, v]) => [k, [sha(v)]])),
    '.claude/settings.json': [sha('{"shipped":true}\n')],
    'git-hooks:pre-commit': [sha(HOOKS['pre-commit'])],
    'git-hooks:pre-push': [sha(HOOKS['pre-push'])],
  },
  settingsCommands: ['bash .claude/hooks/pyle.sh commit', 'node .claude/hooks/kairos.cjs'],
};
const USER_SETTINGS = {
  permissions: { allow: ['Bash(make*)'] },
  hooks: {
    PreToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'bash .claude/hooks/pyle.sh commit' }] },
      { matcher: 'Edit', hooks: [{ type: 'command', command: 'my-lint' }] },
    ],
    SessionStart: [{ hooks: [{ type: 'command', command: 'node .claude/hooks/kairos.cjs' }] }],
  },
};

function shims() {
  const bin = process.env.PATH.split(path.delimiter)[0];
  const log = path.join(bin, 'pm.log');
  const groot = path.join(bin, 'groot');
  // Records argv; like the real pm it drops removed packages, answers `root -g` and `--help`, and lays out a global install.
  const script = (pm) => `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(process.env.SHIM_NO_IGNORE ? 'usage: ${pm} remove <pkg>' : 'usage: ${pm} remove <pkg>\\n  --ignore-scripts  skip scripts');
  process.exit(0);
}
fs.appendFileSync(${JSON.stringify(log)}, '${pm} ' + args.join(' ') + ' @' + process.cwd() + '\\n');
if (args[0] === 'root') { console.log(${JSON.stringify(groot)}); process.exit(0); }
if (process.env.SHIM_FAIL) process.exit(1);
if (args.includes('-g')) {
  const sha = args[args.length - 1].split('#')[1];
  fs.mkdirSync(path.join(${JSON.stringify(groot)}, 'exonous'), { recursive: true });
  fs.writeFileSync(path.join(${JSON.stringify(groot)}, 'exonous', 'package.json'), JSON.stringify({ name: 'exonous', version: process.env.SHIM_GVERSION || require(${JSON.stringify(path.join(__dirname, '..', 'package.json'))}).version }));
  fs.writeFileSync(path.join(${JSON.stringify(groot)}, '.package-lock.json'), JSON.stringify({ packages: { 'node_modules/exonous': { resolved: 'git+ssh://git@github.com/zaqueu-1/exonous.git#' + sha } } }));
  process.exit(0);
}
if (['uninstall', 'remove'].includes(args[0])) {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  for (const name of args.slice(1).filter((a) => !a.startsWith('-'))) delete (pkg.devDependencies || {})[name];
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\\n');
}
`;
  for (const pm of ['npm', 'pnpm', 'bun']) fs.writeFileSync(path.join(bin, pm), script(pm), { mode: 0o755 });
  return () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
}

/** A consumer repo as a repo-mode install left it, committed so package.json and the lockfile are clean. */
function repo({ dep = 'exonous', lockfile = 'package-lock.json', worktree = false } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'consumer-')));
  const git = (...args) => execFileSync('git', args, { cwd: dir, env: { ...process.env, ...GIT_ENV }, encoding: 'utf8' }).trim();
  git('init', '-q');
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  for (const [rel, text] of Object.entries(SHIPPED)) write(rel, text);
  write('.claude/settings.json', `${JSON.stringify(USER_SETTINGS, null, 2)}\n`);
  write('.cursor/hooks.json', `${JSON.stringify({ version: 1, hooks: { preToolUse: [{ command: "[ ! -f '/h/.agents/skills/ui-design/scripts/ui-design' ] || x", timeout: 5 }, { command: 'mine' }] } }, null, 2)}\n`);
  write('.github/hooks/ui-design.json', `${JSON.stringify({ version: 1, hooks: { postToolUse: [{ type: 'command', bash: '"/h/.agents/skills/ui-design/scripts/ui-design" hook' }] } }, null, 2)}\n`);
  write('.claude/.exonous-scope.json', `${JSON.stringify({ updatedAt: 'x', folders: ['common'], scoped: [], signals: {} }, null, 2)}\n`);
  write('package.json', `${JSON.stringify({ name: 'app', devDependencies: { [dep]: 'github:zaqueu-1/exonous#v2.0.0' } }, null, 2)}\n`);
  if (lockfile) write(lockfile, '{}\n');
  write('src/app.js', 'console.log(1);\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  let root = dir;
  if (worktree) {
    root = track(`${dir}-wt`);
    git('worktree', 'add', '-q', root);
  }
  const hooksDir = path.resolve(root, execFileSync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: root, env: { ...process.env, ...GIT_ENV }, encoding: 'utf8' }).trim());
  fs.mkdirSync(hooksDir, { recursive: true });
  for (const [name, text] of Object.entries(HOOKS)) fs.writeFileSync(path.join(hooksDir, name), text, { mode: 0o755 });
  return { root, hooksDir, read: (rel) => fs.readFileSync(path.join(root, rel), 'utf8'), exists: (rel) => fs.existsSync(path.join(root, rel)), git };
}

function machine() {
  fs.mkdirSync(fx.home('.claude'), { recursive: true });
}

const quietLogs = () => {
  const logs = [];
  return { logs, log: (m) => logs.push(m) };
};
const migrate = (r, opts = {}) => migrateRepo({ root: r.root, manifest: MANIFEST, env: { ...process.env, npm_lifecycle_event: '' }, ...quietLogs(), ...opts });
const pmShims = process.platform === 'win32' ? 'extensionless pm shims' : false;

test('v2.0.0-style repo: unmodified files removed, modified kept and listed, settings stripped, design entries stripped, git hooks removed', () => {
  machine();
  const calls = shims();
  const r = repo();
  fs.writeFileSync(path.join(r.root, 'AGENTS.md'), '# AGENTS (edited by the team)\n');
  const q = quietLogs();
  const res = migrate(r, q);
  assert.strictEqual(res.status, 'migrated', q.logs.join('\n'));
  for (const rel of Object.keys(SHIPPED).filter((k) => k !== 'AGENTS.md')) assert.ok(!r.exists(rel), rel);
  assert.ok(r.exists('AGENTS.md'));
  assert.deepStrictEqual(res.keptModified, ['AGENTS.md']);
  assert.ok(q.logs.some((m) => /kept .*AGENTS\.md/.test(m)));
  assert.ok(!r.exists('.claude/hooks') && !r.exists('.claude/rules') && !r.exists('scripts'), 'emptied dirs pruned');
  assert.ok(!r.exists('.claude/.exonous-scope.json'));
  const settings = JSON.parse(r.read('.claude/settings.json'));
  assert.deepStrictEqual(settings, { permissions: { allow: ['Bash(make*)'] }, hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'my-lint' }] }] } });
  assert.deepStrictEqual(JSON.parse(r.read('.cursor/hooks.json')).hooks.preToolUse, [{ command: 'mine' }]);
  assert.ok(!r.exists('.github/hooks/ui-design.json'), 'a file left with no hooks is deleted');
  for (const name of Object.keys(HOOKS)) assert.ok(!fs.existsSync(path.join(r.hooksDir, name)), name);
  assert.ok(r.exists('src/app.js') && r.exists('package.json'));
  assert.ok(fx.exists('.claude', 'exonous', 'hooks', 'pyle.cjs'), 'machine install ran first');
  if (!pmShims) {
    assert.ok(calls().some((c) => /^npm uninstall --ignore-scripts --no-audit --no-fund exonous @/.test(c)), calls().join('\n'));
    assert.strictEqual(res.devDependency, 'removed');
  }
  assert.ok(q.logs.some((m) => /^\d+ tracked file\(s\) deleted — commit the cleanup$/.test(m)), q.logs.join('\n'));
  assert.ok(res.trackedRemoved >= 7);
});

test('a shipped, unedited settings.json is deleted outright', () => {
  machine();
  shims();
  const r = repo();
  fs.writeFileSync(path.join(r.root, '.claude/settings.json'), '{"shipped":true}\n');
  migrate(r);
  assert.ok(!r.exists('.claude/settings.json'));
});

test('tron-style repo with @tron/claude-config: tron files removed, the legacy devDependency dropped via pnpm', { skip: pmShims }, () => {
  machine();
  const calls = shims();
  const r = repo({ dep: '@tron/claude-config', lockfile: 'pnpm-lock.yaml' });
  const res = migrate(r);
  assert.ok(!r.exists('.claude/hooks/bypass-check.sh') && !r.exists('.claude/rules/tron'));
  assert.ok(calls().some((c) => /^pnpm remove --ignore-scripts @tron\/claude-config @/.test(c)), calls().join('\n'));
  assert.strictEqual(res.devDependency, 'removed');
});

test('bun lockfile → bun remove', { skip: pmShims }, () => {
  machine();
  const calls = shims();
  const r = repo({ lockfile: 'bun.lock' });
  migrate(r);
  assert.ok(calls().some((c) => /^bun remove --ignore-scripts exonous @/.test(c)), calls().join('\n'));
});

test('a pm whose remove cannot skip scripts is not run; the migrate hint is printed instead', () => {
  machine();
  const calls = shims();
  const r = repo({ lockfile: 'pnpm-lock.yaml' });
  const q = quietLogs();
  const res = migrate(r, { ...q, env: { ...process.env, npm_lifecycle_event: '', SHIM_NO_IGNORE: '1' } });
  assert.strictEqual(res.devDependency, 'note');
  assert.ok(!calls().some((c) => /^pnpm remove/.test(c)));
  assert.ok(q.logs.some((m) => /cannot skip lifecycle scripts/.test(m)));
});

test('pm choice: packageManager field, then the lockfile, then the running pm, then npm', () => {
  const { repoPm } = require('../src/legacy/repo-migrate');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{}');
  assert.strictEqual(repoPm(dir, {}).pm, 'npm');
  assert.strictEqual(repoPm(dir, { npm_config_user_agent: 'bun/1.1.0 npm/? node/v20' }).pm, 'bun', 'no lockfile: the running pm');
  fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  assert.strictEqual(repoPm(dir, { npm_config_user_agent: 'npm/10.8.0 node/v20' }).pm, 'pnpm', 'npx in a pnpm repo never picks npm');
  fs.writeFileSync(path.join(dir, 'package.json'), '{"packageManager":"bun@1.1.0"}');
  assert.strictEqual(repoPm(dir, { npm_config_user_agent: 'npm/10.8.0' }).pm, 'bun');
});

test('a modified git hook is kept and listed', () => {
  machine();
  shims();
  const r = repo();
  fs.writeFileSync(path.join(r.hooksDir, 'pre-push'), '#!/bin/sh\n# exonous pre-push, edited by the team\n');
  const res = migrate(r);
  assert.ok(!fs.existsSync(path.join(r.hooksDir, 'pre-commit')));
  assert.ok(fs.existsSync(path.join(r.hooksDir, 'pre-push')));
  assert.ok(res.keptModified.some((k) => /pre-push/.test(k)));
});

test('a linked worktree leaves the shared git hooks to the main checkout', () => {
  machine();
  shims();
  const r = repo({ worktree: true });
  const q = quietLogs();
  const res = migrate(r, q);
  assert.strictEqual(res.status, 'migrated');
  for (const name of Object.keys(HOOKS)) assert.ok(fs.existsSync(path.join(r.hooksDir, name)), name);
  assert.ok(q.logs.some((m) => /git hooks are shared with .* — run `exonous migrate` there/.test(m)));
});

test('symlinked .claude and .cursor never redirect a delete or a rewrite outside the repo', () => {
  machine();
  shims();
  const victim = fs.mkdtempSync(path.join(os.tmpdir(), 'victim-'));
  const victim2 = fs.mkdtempSync(path.join(os.tmpdir(), 'victim2-'));
  fs.mkdirSync(path.join(victim, 'hooks'));
  fs.writeFileSync(path.join(victim, 'hooks', 'pyle.sh'), SHIPPED['.claude/hooks/pyle.sh']);
  fs.writeFileSync(path.join(victim, 'settings.json'), `${JSON.stringify(USER_SETTINGS, null, 2)}\n`);
  fs.mkdirSync(path.join(victim, '.exonous'));
  fs.writeFileSync(path.join(victim, '.exonous', 'keep.txt'), 'x');
  const cursorHooks = `${JSON.stringify({ version: 1, hooks: { preToolUse: [{ command: '/h/.agents/skills/ui-design/scripts/ui-design x' }] } })}\n`;
  fs.writeFileSync(path.join(victim2, 'hooks.json'), cursorHooks);
  const r = repo();
  for (const [link, target] of [['.claude', victim], ['.cursor', victim2]]) {
    fs.rmSync(path.join(r.root, link), { recursive: true });
    fs.symlinkSync(target, path.join(r.root, link));
  }
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'symlinks');
  const q = quietLogs();
  const res = migrate(r, q);
  assert.strictEqual(fs.readFileSync(path.join(victim, 'hooks', 'pyle.sh'), 'utf8'), SHIPPED['.claude/hooks/pyle.sh']);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(victim, 'settings.json'), 'utf8')), USER_SETTINGS);
  assert.ok(fs.existsSync(path.join(victim, '.exonous', 'keep.txt')));
  assert.strictEqual(fs.readFileSync(path.join(victim2, 'hooks.json'), 'utf8'), cursorHooks);
  assert.ok(res.skipped.some((s) => s.startsWith('.claude')) && res.skipped.some((s) => s.startsWith('.cursor')), JSON.stringify(res.skipped));
  assert.ok(q.logs.some((m) => /^WARN: .* skipped — it is a symlink or resolves outside/.test(m)));
  assert.ok(!r.exists('AGENTS.md'), 'files outside the symlinks are still cleaned');
});

test('nothing in the repo is touched when the machine gate cannot be verified', () => {
  machine();
  const calls = shims();
  fx.write('{ not json', '.claude', 'settings.json');
  const r = repo();
  const before = r.git('status', '--porcelain');
  const q = quietLogs();
  const res = migrate(r, q);
  assert.strictEqual(res.status, 'blocked');
  assert.match(res.reason, /claude/);
  assert.strictEqual(r.git('status', '--porcelain'), before);
  for (const rel of Object.keys(SHIPPED)) assert.ok(r.exists(rel), rel);
  assert.ok(fs.existsSync(path.join(r.hooksDir, 'pre-commit')));
  assert.ok(!calls().some((c) => /uninstall|remove/.test(c)));
  assert.ok(q.logs.some((m) => /repo left unchanged/.test(m)));
});

test('a dirty package.json or lockfile keeps the devDependency and prints the migrate hint', () => {
  machine();
  const calls = shims();
  const r = repo();
  fs.writeFileSync(path.join(r.root, 'package-lock.json'), '{"packages":{"node_modules/left-pad":{}}}\n');
  const q = quietLogs();
  const res = migrate(r, q);
  assert.strictEqual(res.devDependency, 'note');
  assert.ok(!calls().some((c) => /uninstall/.test(c)));
  assert.ok(q.logs.some((m) => m.includes(`run \`exonous migrate\` in ${r.root} to drop the devDependency`)));
});

test('inside a pm lifecycle (postinstall) the devDependency is never removed', () => {
  machine();
  const calls = shims();
  const r = repo();
  const res = migrate(r, { env: { ...process.env, npm_lifecycle_event: 'postinstall' } });
  assert.strictEqual(res.status, 'migrated');
  assert.strictEqual(res.devDependency, 'note');
  assert.ok(!calls().some((c) => /uninstall/.test(c)));
});

test('the v2.0.0 updater\'s own spec bump does not count as a dirty package.json or package-lock.json', { skip: pmShims }, () => {
  machine();
  const calls = shims();
  const r = repo();
  const lock = (spec) => `${JSON.stringify({ lockfileVersion: 3, packages: { '': { devDependencies: { exonous: spec } }, 'node_modules/exonous': { resolved: spec } } }, null, 2)}\n`;
  fs.writeFileSync(path.join(r.root, 'package-lock.json'), lock('github:zaqueu-1/exonous#v2.0.0'));
  r.git('commit', '-qam', 'lock');
  fs.writeFileSync(path.join(r.root, 'package.json'), `${JSON.stringify({ name: 'app', devDependencies: { exonous: 'github:zaqueu-1/exonous#v2.1.0' } }, null, 2)}\n`);
  fs.writeFileSync(path.join(r.root, 'package-lock.json'), lock('github:zaqueu-1/exonous#v2.1.0'));
  assert.strictEqual(migrate(r).devDependency, 'removed');
  assert.ok(calls().some((c) => /^npm uninstall/.test(c)));
});

test('any other change to package.json, or any change to a pnpm lockfile, keeps the devDependency', () => {
  machine();
  const calls = shims();
  const r = repo();
  fs.writeFileSync(path.join(r.root, 'package.json'), `${JSON.stringify({ name: 'app', version: '9.9.9', devDependencies: { exonous: 'github:zaqueu-1/exonous#v2.1.0' } }, null, 2)}\n`);
  assert.strictEqual(migrate(r).devDependency, 'note');
  const p = repo({ lockfile: 'pnpm-lock.yaml' });
  fs.writeFileSync(path.join(p.root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n# exonous spec bump only\n');
  assert.strictEqual(migrate(p).devDependency, 'note');
  assert.ok(!calls().some((c) => /uninstall|remove/.test(c)));
});

test('repo-triggered runs honor EXONOUS_NO_INSTALL and autoInstall:false and announce what they did; an explicit migrate ignores the opt-out', () => {
  machine();
  shims();
  const r = repo();
  const q = quietLogs();
  const off = migrate(r, { ...q, trigger: 'repo', env: { ...process.env, npm_lifecycle_event: '', EXONOUS_NO_INSTALL: '1' } });
  assert.strictEqual(off.status, 'opted-out');
  assert.ok(!fx.exists('.claude', 'exonous', 'hooks'), 'nothing installed');
  assert.ok(r.exists('.claude/hooks/pyle.sh'));
  assert.ok(q.logs.some((m) => /machine install skipped \(EXONOUS_NO_INSTALL=1\); to migrate by hand run `exonous install`, then `exonous migrate` in /.test(m)));
  fx.write({ autoInstall: false }, '.claude', 'exonous', 'config.json');
  assert.strictEqual(migrate(r, { trigger: 'repo' }).status, 'opted-out');
  const q2 = quietLogs();
  assert.strictEqual(migrate(r, q2).status, 'migrated', 'cli trigger');
  fs.rmSync(fx.home('.claude', 'exonous', 'config.json'));
  const r2 = repo();
  const q3 = quietLogs();
  migrate(r2, { ...q3, trigger: 'repo' });
  const text = q3.logs.join('\n');
  assert.match(text, /exonous is now installed for this machine/);
  assert.match(text, /tools configured: claude/);
  assert.match(text, /gate active for: claude/);
  assert.match(text, /undo: exonous uninstall/);
});

test('a repo reached through a symlinked path is migrated normally', () => {
  machine();
  shims();
  const r = repo();
  const alias = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'alias-')), 'repo');
  fs.symlinkSync(r.root, alias);
  const res = migrateRepo({ root: alias, manifest: MANIFEST, env: { ...process.env, npm_lifecycle_event: '' }, log: () => {} });
  assert.deepStrictEqual(res.skipped, []);
  assert.ok(!r.exists('.claude/hooks/pyle.sh'));
});

test('a rerun is a no-op', () => {
  machine();
  const calls = shims();
  const r = repo();
  migrate(r);
  const snapshot = r.git('status', '--porcelain');
  const n = calls().length;
  const res = migrate(r);
  assert.strictEqual(r.git('status', '--porcelain'), snapshot);
  assert.deepStrictEqual(res.removed, []);
  assert.strictEqual(calls().length, n, 'no second pm call once the dependency is gone');
});

test('a repo with no repo-mode install is left alone and nothing is installed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plain-'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x"}\n');
  const res = migrateRepo({ root: dir, manifest: MANIFEST, env: process.env, log: () => {} });
  assert.strictEqual(res.status, 'nothing');
  assert.ok(!fx.exists('.claude', 'exonous'));
});

/** Local bare repo with this package's version tagged (annotated), as the release source. */
function releaseSource() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rel-'));
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: { ...process.env, ...GIT_ENV }, encoding: 'utf8' }).trim();
  fs.mkdirSync(path.join(dir, 'w'));
  git(path.join(dir, 'w'), 'init', '-q');
  git(path.join(dir, 'w'), 'commit', '-q', '--allow-empty', '-m', 'r');
  const version = require('../package.json').version;
  git(path.join(dir, 'w'), 'tag', '-a', `v${version}`, '-m', 'r');
  const sha = git(path.join(dir, 'w'), 'rev-parse', 'HEAD');
  git(dir, 'clone', '-q', '--bare', path.join(dir, 'w'), path.join(dir, 'r.git'));
  return { url: `file://${path.join(dir, 'r.git')}`, sha };
}

test('the global add pins the tag commit and verifies the package; it is skipped in a redirected home without the test opt-in, and failures only warn', { skip: pmShims }, () => {
  machine();
  const calls = shims();
  const r = repo();
  migrate(r);
  assert.ok(!calls().some((c) => / -g /.test(c)), 'redirected home: no global install');
  const rel = releaseSource();
  const testEnv = { ...process.env, npm_lifecycle_event: '', EXONOUS_TEST: '1', EXONOUS_UPDATE_TEST_PM: '1', EXONOUS_RELEASE_SOURCE: rel.url };
  const ok = migrate(repo(), { env: testEnv });
  assert.strictEqual(ok.global, 'ok');
  assert.ok(calls().some((c) => c.startsWith(`npm i -g --no-audit --no-fund github:zaqueu-1/exonous#${rel.sha} @`)), calls().join('\n'));
  const q = quietLogs();
  const bad = migrate(repo(), { ...q, env: { ...testEnv, SHIM_GVERSION: '0.0.1' } });
  assert.strictEqual(bad.global, 'failed');
  assert.ok(q.logs.some((m) => /WARN: global install .* failed \(.*expected v/.test(m)), q.logs.join('\n'));
  assert.strictEqual(bad.status, 'migrated');
});

test('the shipped manifest regenerates without a diff', () => {
  const { build } = require('../maintainer/gen-v2-manifest');
  const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy', 'v2-manifest.json'), 'utf8'));
  assert.deepStrictEqual(build(), shipped);
});

test('setup from inside a repo node_modules routes to the migration', () => {
  const r = repo();
  const pkg = path.join(r.root, 'node_modules', 'exonous');
  fs.mkdirSync(pkg, { recursive: true });
  const src = path.join(__dirname, '..');
  for (const dir of ['bin', 'src', 'assets']) fs.cpSync(path.join(src, dir), path.join(pkg, dir), { recursive: true });
  fs.copyFileSync(path.join(src, 'package.json'), path.join(pkg, 'package.json'));
  machine();
  shims();
  const env = { ...process.env, INIT_CWD: r.root, npm_lifecycle_event: '' };
  const res = spawnSync(process.execPath, [path.join(pkg, 'bin', 'exonous.js'), 'setup'], { cwd: r.root, env, encoding: 'utf8' });
  assert.strictEqual(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /repo-mode install migrated/);
  assert.ok(!r.exists('.claude/.exonous-scope.json'), 'generated scope file removed');
  assert.ok(r.exists('.claude/hooks/pyle.sh'), 'content unknown to the real manifest is kept');
  assert.deepStrictEqual(JSON.parse(r.read('.claude/settings.json')).hooks, { PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'my-lint' }] }] });
});
