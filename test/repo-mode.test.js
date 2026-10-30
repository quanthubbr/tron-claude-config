#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { test } = require('node:test');
const { fixture, runLib } = require('./helpers/selfupdate-fixture');

const ROOT = path.join(__dirname, '..');
const skip = process.platform === 'win32' ? 'sh shims' : false;
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
};
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A committed consumer repo declaring exonous, with a copy of `version` under node_modules/<name>. */
function consumer(dir, { name = 'exonous', spec = 'github:zaqueu-1/exonous#v2.1.0', version = '2.1.0', copy = false } = {}) {
  const root = path.join(dir, 'app');
  const pkg = path.join(root, 'node_modules', ...name.split('/'));
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), `{\n    "name": "app",\n    "devDependencies": {\n        ${JSON.stringify(name)}: ${JSON.stringify(spec)}\n    }\n}\n`);
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{}\n');
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n');
  if (copy) {
    for (const sub of ['bin', 'src', 'assets', 'scripts']) fs.cpSync(path.join(ROOT, sub), path.join(pkg, sub), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(pkg, 'package.json'));
  } else {
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'exonous', version }));
  }
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  return { root, pkg };
}

// Like `npm install` in the repo: lays out node_modules/<dep> at the version the spec's tag names.
const REPO_SHIM = (name) => `#!/bin/sh
printf '%s\\n' "${name} $* @$PWD" >> "$SHIM_LOG"
if [ -n "$SHIM_FAIL" ]; then echo "registry unreachable" >&2; exit 1; fi
node -e '
const fs = require("fs"); const path = require("path");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const [dep, spec] = Object.entries(pkg.devDependencies).find(([k]) => k === "exonous" || k === "@tron/claude-config");
const dir = path.join("node_modules", ...dep.split("/"));
fs.mkdirSync(path.join(dir, "bin"), { recursive: true });
fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "exonous", version: spec.split("#v")[1] }));
fs.copyFileSync(process.env.SHIM_FAKE_BIN, path.join(dir, "bin", "exonous.js"));
'
`;

function repoFixture(options = {}) {
  const fx = fixture({ tags: ['a:v2.1.0', 'a:v2.2.0', 'a:v3.0.0'] });
  const app = consumer(fx.dir, options);
  for (const pm of ['npm', 'pnpm', 'bun']) fs.writeFileSync(path.join(fx.bin, pm), REPO_SHIM(pm), { mode: 0o755 });
  fs.writeFileSync(path.join(fx.exo, 'install.json'), JSON.stringify({ ...fx.info(), packageRoot: app.pkg }));
  return { fx, app };
}

test('repo mode follows the repo spec: same-major tag written into package.json, repo pm install, then setup from the new copy', { skip }, () => {
  const { fx, app } = repoFixture();
  const res = runLib(fx, 'run', { background: true });
  assert.strictEqual(res.status, 'updated', JSON.stringify(res));
  assert.strictEqual(fs.readFileSync(path.join(app.root, 'package.json'), 'utf8'), `{\n    "name": "app",\n    "devDependencies": {\n        "exonous": "github:zaqueu-1/exonous#v2.2.0"\n    }\n}\n`);
  assert.deepStrictEqual(fx.pmCalls(), [`npm install --ignore-scripts --no-audit --no-fund @${app.root}`]);
  assert.deepStrictEqual(fx.installCalls(), ['setup --quiet']);
  assert.strictEqual(fx.info().version, '2.2.0');
  assert.strictEqual(fx.note(), 'exonous updated v2.1.0 → v2.2.0 (restart to load new hooks)');
});

test('repo mode keeps the @tron/claude-config key and its mirror source', { skip }, () => {
  const { fx, app } = repoFixture({ name: '@tron/claude-config', spec: 'github:quanthubbr/tron-claude-config#v2.1.0' });
  assert.strictEqual(runLib(fx, 'check').status, 'available');
  assert.strictEqual(runLib(fx, 'run', {}).status, 'updated');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(app.root, 'package.json'), 'utf8')).devDependencies, { '@tron/claude-config': 'github:quanthubbr/tron-claude-config#v2.2.0' });
});

test('repo mode never bumps a package.json with uncommitted changes, and restores it when the pm fails', { skip }, () => {
  const { fx, app } = repoFixture();
  const file = path.join(app.root, 'package.json');
  fs.appendFileSync(file, '\n');
  const dirty = fs.readFileSync(file, 'utf8');
  const res = runLib(fx, 'run', { background: true });
  assert.strictEqual(res.status, 'failed');
  assert.match(res.error, /uncommitted changes/);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), dirty);
  assert.deepStrictEqual(fx.pmCalls(), []);
  assert.strictEqual(fx.note(), 'exonous update to v2.2.0 failed — run `exonous update` to see why');
  git(app.root, 'checkout', '--', 'package.json');
  const before = fs.readFileSync(file, 'utf8');
  assert.strictEqual(runLib(fx, 'run', {}, { SHIM_FAIL: '1' }).status, 'failed');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), before, 'spec restored');
  assert.strictEqual(fx.info().version, '2.1.0');
});

test('a repo spec pinned to a commit or a branch, or from an unknown source, is never updated', { skip }, () => {
  for (const spec of [`github:zaqueu-1/exonous#${'a'.repeat(40)}`, 'github:zaqueu-1/exonous#main', 'file:../exonous', 'github:evil/exonous#v2.1.0']) {
    const { fx } = repoFixture({ spec });
    const res = runLib(fx, 'run', {});
    assert.strictEqual(res.status, 'pinned', spec);
    assert.match(res.ref, /in .*app$/);
    assert.deepStrictEqual(fx.pmCalls(), []);
  }
});

function setup(fx, app, env = {}) {
  return spawnSync(process.execPath, [path.join(app.pkg, 'bin', 'exonous.js'), 'setup'], {
    cwd: app.root, encoding: 'utf8', env: { ...fx.env, EXONOUS_TEST: '', EXONOUS_NO_UPDATE: '1', HOME: fx.home, INIT_CWD: app.root, ...env },
  });
}

test('setup from a repo copy installs the machine in repo mode and keeps the dependency', () => {
  const fx = fixture();
  fs.rmSync(path.join(fx.exo, 'install.json'));
  fs.mkdirSync(path.join(fx.home, '.claude'), { recursive: true });
  const app = consumer(fx.dir, { copy: true });
  const res = setup(fx, app);
  assert.strictEqual(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /repo mode: machine installed from .*app .*updates follow exonous@github:zaqueu-1\/exonous#v2\.1\.0/);
  assert.strictEqual(fx.info().packageRoot, app.pkg);
  assert.ok(fs.existsSync(path.join(fx.exo, 'hooks', 'pyle.cjs')));
  assert.strictEqual(git(app.root, 'status', '--porcelain'), '', 'nothing written into the repo');
  const doctor = spawnSync(process.execPath, [path.join(app.pkg, 'bin', 'exonous.js'), 'doctor'], { cwd: app.root, encoding: 'utf8', env: { ...fx.env, EXONOUS_TEST: '', HOME: fx.home } });
  assert.match(doctor.stdout, /✓ install mode \(repo — .*app, updates follow exonous@github:zaqueu-1\/exonous#v2\.1\.0\)/);
});

test('a global install prevails: setup and postinstall from a repo copy stay inert', () => {
  const fx = fixture();
  const globalRoot = path.join(fx.dir, 'global', 'exonous');
  fs.mkdirSync(globalRoot, { recursive: true });
  fs.writeFileSync(path.join(globalRoot, 'package.json'), '{"name":"exonous","version":"2.1.0"}');
  fs.writeFileSync(path.join(fx.exo, 'install.json'), JSON.stringify({ ...fx.info(), packageRoot: globalRoot }));
  const before = fs.readFileSync(path.join(fx.exo, 'install.json'), 'utf8');
  const app = consumer(fx.dir, { copy: true });
  const res = setup(fx, app);
  assert.strictEqual(res.status, 0, res.stderr);
  assert.match(res.stdout, /global install \(.*global.*exonous\) takes precedence — the dependency in .*app stays inert/);
  const post = spawnSync(process.execPath, [path.join(app.pkg, 'scripts', 'postinstall.js')], { cwd: app.root, encoding: 'utf8', env: { ...fx.env, EXONOUS_TEST: '', HOME: fx.home } });
  assert.strictEqual(post.status, 0);
  assert.strictEqual(post.stdout, '', 'quiet when inert');
  assert.strictEqual(fs.readFileSync(path.join(fx.exo, 'install.json'), 'utf8'), before);
  assert.ok(!fs.existsSync(path.join(fx.exo, 'hooks')));
});

test('an older repo copy never downgrades the machine; opt-outs skip repo mode', () => {
  const fx = fixture();
  const newer = consumer(fs.mkdtempSync(path.join(os.tmpdir(), 'newer-')), { version: '99.0.0' });
  fs.writeFileSync(path.join(fx.exo, 'install.json'), JSON.stringify({ ...fx.info(), version: '99.0.0', packageRoot: newer.pkg }));
  const app = consumer(fx.dir, { copy: true });
  const res = setup(fx, app);
  assert.match(res.stdout, /already runs v99\.0\.0 from .*newer.*app — not downgrading/);
  assert.ok(!fs.existsSync(path.join(fx.exo, 'hooks')));
  fs.rmSync(path.join(fx.exo, 'install.json'));
  assert.match(setup(fx, app, { EXONOUS_NO_INSTALL: '1' }).stdout, /repo mode skipped \(EXONOUS_NO_INSTALL=1\)/);
  fs.writeFileSync(path.join(fx.exo, 'config.json'), '{"autoInstall": false}');
  assert.match(setup(fx, app).stdout, /repo mode skipped \(\{"autoInstall": false\}/);
  assert.ok(!fs.existsSync(path.join(fx.exo, 'hooks')));
});

test('postinstall outside a repo node_modules does nothing and always exits 0', () => {
  const fx = fixture();
  const res = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'postinstall.js')], { encoding: 'utf8', env: { ...fx.env, HOME: fx.home } });
  assert.strictEqual(res.status, 0);
  assert.strictEqual(res.stdout, '');
});
