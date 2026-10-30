#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RUN = path.resolve(__dirname, '..', 'assets', 'techne', 'scripts', 'hooks', 'run.js');
const NV = '--no-' + 'verify';

function hook(id, payload, env = {}) {
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const res = spawnSync(process.execPath, [RUN, id], {
    input,
    encoding: 'utf8',
    env: { ...process.env, EXONOUS_HOOK_PROFILE: '', EXONOUS_DISABLED_HOOKS: '', EXONOUS_ALLOW_CONFIG_EDITS: '', ...env },
  });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

const bash = (command, env) => hook('pre:bash:no-verify', { tool_name: 'Bash', tool_input: { command } }, env);

test('no-verify guard blocks hook-skipping git commands', () => {
  const blocked = [
    `git commit ${NV} -m "x"`,
    `git commit --no-veri -m x`,
    `git push origin main ${NV}`,
    'git commit -anm "msg"',
    'git commit -n -m x',
    'git -c core.hooksPath=/dev/null commit -m x',
    'git -c CORE.HOOKSPATH=/tmp commit -m x',
    'git --config-env=core.hooksPath=HP commit -m x',
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit -m x',
    'export GIT_CONFIG_KEY_0=core.hooksPath; git push',
    `npm test && git commit -m ok ${NV}`,
    `bash -c "git commit ${NV} -m x"`,
    `git rebase -x "git commit --amend ${NV}" main`,
    'git config core.hooksPath /dev/null',
    'git config --global core.hooksPath=/dev/null',
    'git config --global --add core.hooksPath=/tmp',
    `sudo -u me env FOO=1 /usr/bin/git merge ${NV} topic`,
    `echo "$(git commit ${NV} -m x)"`,
  ];
  for (const command of blocked) {
    const res = bash(command);
    assert.strictEqual(res.code, 2, `expected block: ${command}`);
    assert.match(res.stderr, /techne/);
  }
});

test('no-verify guard allows ordinary commands', () => {
  const allowed = [
    'git commit -m "-n"',
    `git commit -m "docs: explain why ${NV} is banned"`,
    "git commit -m 'never use -n here'",
    `git commit -F - <<'EOF'\nfix: guard\n\nmentions ${NV} only as text\nEOF`,
    `git commit -m "$(cat <<'EOF'\nfeat: x (scope)\n\n${NV} in body text\nEOF\n)"`,
    'git push -n origin main',
    'git add -n .',
    'git status && git log --oneline -n 5',
    'git config --unset core.hooksPath',
    'git config --get core.hooksPath',
    `echo ${NV}`,
    `grep -- "${NV}" README.md`,
    'ls -la',
  ];
  for (const command of allowed) {
    const res = bash(command);
    assert.strictEqual(res.code, 0, `expected allow: ${command}\n${res.stderr}`);
  }
});

test('config guard blocks edits to existing lint/format configs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'techne-cfg-'));
  for (const name of ['eslint.config.mjs', '.prettierrc', 'ESLint.Config.TS', 'eslint.config.base.mjs', '.eslintignore', 'biome.json', '.golangci.yml']) {
    fs.writeFileSync(path.join(dir, name), '{}');
    const res = hook('pre:config-guard', { tool_name: 'Edit', tool_input: { file_path: path.join(dir, name) } });
    assert.strictEqual(res.code, 2, `expected block: ${name}`);
  }
  fs.writeFileSync(path.join(dir, 'vite.config.ts'), '');
  assert.strictEqual(hook('pre:config-guard', { tool_input: { file_path: path.join(dir, 'vite.config.ts') } }).code, 0);
  assert.strictEqual(hook('pre:config-guard', { tool_input: { file_path: path.join(dir, 'new', '.prettierrc') } }).code, 0, 'creating a config is allowed');
  const optOut = hook('pre:config-guard', { tool_input: { file_path: path.join(dir, 'biome.json') } }, { EXONOUS_ALLOW_CONFIG_EDITS: '1' });
  assert.strictEqual(optOut.code, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('pre hooks stay neutral under Cursor payloads', () => {
  const res = hook('pre:bash:no-verify', { cursor_version: '1.0', tool_input: { command: `git commit ${NV}` } });
  assert.strictEqual(res.code, 0);
  assert.strictEqual(res.stdout, '{}');
});

test('profiles and EXONOUS_DISABLED_HOOKS gate hooks', () => {
  const command = `git commit ${NV}`;
  assert.strictEqual(bash(command, { EXONOUS_HOOK_PROFILE: 'minimal' }).code, 0);
  assert.strictEqual(bash(command, { EXONOUS_DISABLED_HOOKS: 'pre:config-guard, pre:bash:no-verify' }).code, 0);
  assert.strictEqual(bash(command, { EXONOUS_HOOK_PROFILE: 'strict' }).code, 2);
});

test('oversized payloads fail closed for guards and open for the rest', () => {
  const huge = JSON.stringify({ tool_input: { command: `git status ${'x'.repeat(1024 * 1024 + 10)}` } });
  assert.strictEqual(hook('pre:bash:no-verify', huge).code, 2);
  assert.strictEqual(hook('post:edit-tracker', huge).code, 0);
});

test('edit tracker feeds stop checks, which flag console.log without failing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'techne-stop-'));
  const file = path.join(dir, 'src', 'a.ts');
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, 'export const a = 1;\nconsole.log(a);\n');
  const session = `test-${process.pid}`;
  assert.strictEqual(hook('post:edit-tracker', { session_id: session, cwd: dir, tool_input: { file_path: file } }).code, 0);
  const res = hook('stop:checks', { session_id: session, cwd: dir });
  assert.strictEqual(res.code, 0);
  assert.match(res.stderr, /console\.log left/);
  assert.match(res.stderr, /a\.ts:2/);
  assert.strictEqual(hook('stop:checks', { session_id: session, cwd: dir }).stderr, '', 'list is consumed once');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('removing the techne plugin from settings.json leaves no empty containers it created', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'techne-home-'));
  const prev = { EXONOUS_HOME: process.env.EXONOUS_HOME, PATH: process.env.PATH };
  process.env.EXONOUS_HOME = home;
  process.env.PATH = '/usr/bin:/bin';
  try {
    const file = path.join(home, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const { removePlugins, PLUGIN_ID, MARKETPLACE } = require('../src/lib/techne');
    fs.writeFileSync(file, JSON.stringify({ theme: 'x', enabledPlugins: { [PLUGIN_ID]: true }, extraKnownMarketplaces: { [MARKETPLACE]: { source: {} } } }));
    removePlugins([PLUGIN_ID], [MARKETPLACE], { log: () => {} });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { theme: 'x' });
    fs.writeFileSync(file, JSON.stringify({ enabledPlugins: { [PLUGIN_ID]: true, 'other@m': true }, extraKnownMarketplaces: {} }));
    removePlugins([PLUGIN_ID], [MARKETPLACE], { log: () => {} });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { enabledPlugins: { 'other@m': true }, extraKnownMarketplaces: {} }, 'containers that were not emptied by us stay');
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('on Windows claude.cmd runs through cmd.exe with quoted args; claude.exe runs directly', () => {
  const { claudeInvocation } = require('../src/lib/techne');
  const which = (file) => () => file;
  const args = ['plugin', 'marketplace', 'add', 'C:\\Users\\Jo Doe\\.claude\\techne', '--scope', 'user'];
  assert.deepStrictEqual(claudeInvocation(args, { platform: 'darwin' }), { file: 'claude', args, shell: false });
  assert.deepStrictEqual(claudeInvocation(args, { platform: 'win32', which: which('C:\\npm\\claude.cmd') }), {
    file: 'C:\\npm\\claude.cmd plugin marketplace add "C:\\Users\\Jo Doe\\.claude\\techne" --scope user',
    args: [],
    shell: true,
  });
  assert.deepStrictEqual(claudeInvocation(args, { platform: 'win32', which: which('C:\\bin\\claude.exe') }), { file: 'C:\\bin\\claude.exe', args, shell: false });
  assert.strictEqual(claudeInvocation(args, { platform: 'win32', which: which(null) }), null);
  assert.strictEqual(
    claudeInvocation(['C:\\Jo Doe\\', 'C:\\a b\\\\', 'C:\\plain\\'], { platform: 'win32', which: which('C:\\npm\\claude.cmd') }).file,
    'C:\\npm\\claude.cmd "C:\\Jo Doe\\\\" "C:\\a b\\\\\\\\" C:\\plain\\',
  );
  for (const bad of ['a"b', '%PATH%', 'x!y', 'a\nb']) {
    assert.throws(() => claudeInvocation([bad], { platform: 'win32', which: which('C:\\npm\\claude.CMD') }), /cmd\.exe/);
  }
});

test('gh aliases are read from %APPDATA%\\GitHub CLI on Windows, like gh itself', () => {
  const { ghConfigDir } = require('../assets/machine/hooks/lib/shell.cjs');
  const appdata = 'C:\\Users\\u\\AppData\\Roaming';
  assert.strictEqual(ghConfigDir({ APPDATA: appdata, HOME: '/h' }, 'win32'), 'C:\\Users\\u\\AppData\\Roaming\\GitHub CLI');
  assert.strictEqual(ghConfigDir({ APPDATA: appdata, HOME: '/h' }, 'linux'), path.join('/h', '.config', 'gh'));
  assert.strictEqual(ghConfigDir({ APPDATA: appdata, XDG_CONFIG_HOME: '/x' }, 'win32'), path.join('/x', 'gh'));
  assert.strictEqual(ghConfigDir({ APPDATA: appdata, GH_CONFIG_DIR: '/g' }, 'win32'), '/g');
});
