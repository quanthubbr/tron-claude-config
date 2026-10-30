#!/usr/bin/env node
'use strict';

require('./helpers/tmp-cleanup');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { test } = require('node:test');
const { analyze } = require('../assets/machine/hooks/lib/shell.cjs');
const token = require('../assets/machine/hooks/lib/token.cjs');
const { repoKey } = require('../assets/machine/hooks/lib/paths.cjs');

const PYLE = path.join(__dirname, '..', 'assets', 'machine', 'hooks', 'pyle.cjs');
const GIT_DIR = path.dirname(execFileSync('which', ['git'], { encoding: 'utf8' }).trim());
const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1' };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: { ...process.env, ...GIT_ENV }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function shim(gitleaks) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pyle-bin-'));
  if (gitleaks) {
    fs.writeFileSync(path.join(dir, 'gitleaks'), `#!/bin/sh\n${gitleaks}\n`);
    fs.chmodSync(path.join(dir, 'gitleaks'), 0o755);
  }
  return dir;
}
const CLEAN = 'exit 0';

function setup({ branch = 'feat/x' } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pyle-home-'));
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pyle-repo-')));
  git(dir, 'init', '-q', '-b', branch);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '--no-gpg-sign', '-m', 'init');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b');
  git(dir, 'add', 'b.txt');
  const env = { ...GIT_ENV, EXONOUS_HOME: home, HOME: home, PATH: `${shim(CLEAN)}:${GIT_DIR}:/usr/bin:/bin` };
  const withHome = (fn) => {
    const prev = process.env.EXONOUS_HOME;
    process.env.EXONOUS_HOME = home;
    try {
      return fn();
    } finally {
      if (prev === undefined) delete process.env.EXONOUS_HOME;
      else process.env.EXONOUS_HOME = prev;
    }
  };
  return { home, dir, env, mint: (kind, cwd = dir, opts) => withHome(() => token.mint(kind, cwd, opts)), tokenFile: (kind) => path.join(home, '.claude', 'exonous', 'state', kind, `${repoKey(dir)}.json`) };
}

function withRemote(fx) {
  const remote = path.join(fx.home, 'remote.git');
  git(fx.home, 'init', '-q', '--bare', remote);
  git(fx.dir, 'remote', 'add', 'origin', remote);
  git(fx.dir, 'push', '-q', '-u', 'origin', 'HEAD');
  return remote;
}

function run(mode, input, env, { adapter = 'claude', extra = [] } = {}) {
  const res = spawnSync(process.execPath, [PYLE, mode, '--adapter', adapter, ...extra], {
    input: typeof input === 'string' ? input : JSON.stringify(input), env, encoding: 'utf8',
  });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}
const claude = (command, cwd) => ({ tool_name: 'Bash', tool_input: { command }, cwd });

test('the analyzer finds gated git and gh calls anywhere on the line', () => {
  const kinds = (cmd, cwd = '/r') => analyze(cmd, cwd).calls.map((c) => `${c.kind}@${c.cwd}`);
  assert.deepStrictEqual(kinds('git commit -m x'), ['commit@/r']);
  assert.deepStrictEqual(kinds('git -C sub -c user.name=x commit -m y'), ['commit@/r/sub']);
  assert.deepStrictEqual(kinds('cd /w && git add . && git commit -m "a; b" | cat'), ['commit@/w']);
  assert.deepStrictEqual(kinds('cd "/w x" && git push origin HEAD'), ['push@/w x']);
  assert.deepStrictEqual(kinds('gh -R o/r pr create --fill && gh pr new'), ['pr@/r', 'pr@/r']);
  assert.deepStrictEqual(kinds('echo "$(git commit -m x)"'), ['commit@/r']);
  assert.deepStrictEqual(kinds("bash -lc 'git push -f'"), ['push@/r']);
  assert.deepStrictEqual(kinds('FOO=1 env -i command /usr/bin/git commit'), ['commit@/r']);
  assert.deepStrictEqual(kinds('git commit -F - <<EOF\ngit push --force\nEOF\n'), ['commit@/r']);
  assert.deepStrictEqual(kinds('>"$(git commit -m x)"'), ['commit@/r']);
  assert.deepStrictEqual(kinds('cat <(git push -f) >(git commit)'), ['push@/r', 'commit@/r']);
  assert.deepStrictEqual(kinds('git log --grep commit; echo git commit; git status 2>&1 | grep commit'), []);
  assert.deepStrictEqual(kinds('gh pr list; git commit-tree x; # git commit'), []);
});

test('no token → commit denied with the workflow hint', () => {
  const { dir, env } = setup();
  const res = run('commit', claude('git commit -m x', dir), env);
  assert.strictEqual(res.code, 2);
  assert.match(res.stderr, /exonous workflow commit/);
  assert.match(res.stderr, /exonous token commit/);
});

test('a valid token allows exactly one commit', () => {
  const fx = setup();
  fx.mint('commit');
  assert.strictEqual(run('commit', claude('git commit -m x', fx.dir), fx.env).code, 0);
  assert.ok(!fs.existsSync(fx.tokenFile('commit')));
  assert.strictEqual(run('commit', claude('git commit -m x', fx.dir), fx.env).code, 2);
});

test('expired and mismatched tokens are refused', () => {
  const fx = setup();
  fx.mint('commit', fx.dir, { now: Date.now() - token.TTL_MS - 1 });
  assert.match(run('commit', claude('git commit -m x', fx.dir), fx.env).stderr, /expired/);
  fx.mint('commit');
  fs.writeFileSync(path.join(fx.dir, 'c.txt'), 'c');
  git(fx.dir, 'add', 'c.txt');
  assert.match(run('commit', claude('git commit -m x', fx.dir), fx.env).stderr, /staged changes differ/);
});

test('commits that stage at commit time are refused even with a token', () => {
  const fx = setup();
  for (const cmd of ['git commit -am x', 'git commit --all -m x', 'git commit -m x -- a.txt', 'git commit -p', 'git commit -m x b.txt']) {
    fx.mint('commit');
    const res = run('commit', claude(cmd, fx.dir), fx.env);
    assert.strictEqual(res.code, 2, cmd);
    assert.match(res.stderr, /git add/, cmd);
  }
  fx.mint('commit');
  assert.strictEqual(run('commit', claude('git commit -m all -S --amend', fx.dir), fx.env).code, 0);
});

test('help, logs and non-commit commands are never gated', () => {
  const { dir, env } = setup();
  for (const cmd of ['git commit --help', 'git commit -h', 'git log', 'git status && ls', 'gh pr list']) {
    assert.strictEqual(run('commit', claude(cmd, dir), env).code, 0, cmd);
  }
});

test('a leading cd decides which repo the token belongs to', () => {
  const fx = setup();
  fx.mint('commit');
  assert.strictEqual(run('commit', claude(`cd ${fx.dir} && git commit -m x`, os.tmpdir()), fx.env).code, 0);
});

test('every adapter fixture is gated with its own deny format', () => {
  const { dir, env } = setup();
  const cmd = 'git commit -m x';
  const fixtures = {
    claude: claude(cmd, dir),
    cursor: { command: cmd, cwd: dir },
    gemini: { tool_name: 'run_shell_command', tool_input: { command: cmd }, cwd: dir },
    codex: { tool_name: 'Bash', tool_input: { command: cmd }, cwd: dir },
    windsurf: { tool_info: { command_line: cmd, cwd: dir } },
    copilot: { tool_name: 'run_in_terminal', tool_input: { command: cmd }, cwd: dir },
    opencode: { tool: 'bash', args: { command: cmd }, cwd: dir },
  };
  for (const [adapter, input] of Object.entries(fixtures)) {
    const res = run('commit', input, env, { adapter });
    if (adapter === 'copilot') {
      assert.strictEqual(res.code, 0);
      assert.strictEqual(JSON.parse(res.stdout).permissionDecision, 'deny');
    } else {
      assert.strictEqual(res.code, 2, adapter);
      assert.match(res.stderr, /exonous token commit/, adapter);
    }
    if (adapter === 'cursor') assert.strictEqual(JSON.parse(res.stdout).permission, 'deny');
  }
  assert.strictEqual(run('commit', { command: 'ls', cwd: dir }, env, { adapter: 'cursor' }).stdout, '{"permission":"allow"}');
});

test('gitleaks findings deny, absence warns and allows', () => {
  const fx = setup();
  fx.mint('commit');
  const leaky = { ...fx.env, PATH: `${shim('echo "Finding: aws key"; exit 3')}:${GIT_DIR}:/usr/bin:/bin` };
  const res = run('commit', claude('git commit -m x', fx.dir), leaky);
  assert.strictEqual(res.code, 2);
  assert.match(res.stderr, /gitleaks/);
  assert.ok(fs.existsSync(fx.tokenFile('commit')), 'a denied commit keeps its token');
  const absent = { ...fx.env, PATH: `${shim(null)}:${GIT_DIR}` };
  const ok = run('commit', claude('git commit -m x', fx.dir), absent);
  assert.strictEqual(ok.code, 0);
  assert.match(JSON.parse(ok.stdout).hookSpecificOutput.additionalContext, /gitleaks not installed/);
  assert.strictEqual(JSON.parse(ok.stdout).hookSpecificOutput.hookEventName, 'PreToolUse');
  fx.mint('commit');
  const cur = run('commit', { command: 'git commit -m x', cwd: fx.dir }, absent, { adapter: 'cursor' });
  assert.strictEqual(cur.code, 0);
  assert.match(cur.stderr, /gitleaks not installed/);
});

test('force-push and pushes to main or master need a push token', () => {
  const fx = setup();
  withRemote(fx);
  const push = (cmd) => run('push', claude(cmd, fx.dir), fx.env);
  assert.strictEqual(push('git push -u origin feat/x').code, 0);
  assert.strictEqual(push('git push').code, 0);
  for (const cmd of ['git push -f', 'git push --force origin feat/x', 'git push --force-with-lease', 'git push origin +feat/x', 'git push -uf origin x', 'git push origin feat/x:main', 'git push origin master', 'git push origin HEAD:refs/heads/main', 'git push --mirror']) {
    const res = push(cmd);
    assert.strictEqual(res.code, 2, cmd);
    assert.match(res.stderr, /exonous token push/, cmd);
  }
  fx.mint('push');
  assert.strictEqual(push('git push --force-with-lease origin feat/x').code, 0);
  assert.strictEqual(push('git push -f').code, 2, 'push token is one-shot');
});

test('a plain push from main is a push to main', () => {
  const fx = setup({ branch: 'main' });
  assert.strictEqual(run('push', claude('git push', fx.dir), fx.env).code, 2);
  assert.strictEqual(run('push', claude('git push origin feat/y', fx.dir), fx.env).code, 0);
});

test('pushing a branch that does not exist locally says so', () => {
  const fx = setup();
  withRemote(fx);
  const res = run('push', claude('git push origin main', fx.dir), fx.env);
  assert.strictEqual(res.code, 2);
  assert.match(res.stderr, /there is no local branch "main" to push/);
  assert.ok(!/cannot resolve what/.test(res.stderr));
});

test('gh pr create is checked against the template', () => {
  const { dir, env } = setup();
  fs.mkdirSync(path.join(dir, '.github'));
  fs.writeFileSync(path.join(dir, '.github', 'pull_request_template.md'), '## Summary\n## Test plan\n');
  fs.writeFileSync(path.join(dir, 'body.md'), '## Summary\nx\n## Test plan\ny\n');
  assert.strictEqual(run('pr', claude('gh pr create --body-file body.md', dir), env).code, 0);
  const res = run('pr', claude('gh -R o/r pr create --body "## Summary"', dir), env);
  assert.strictEqual(res.code, 2);
  assert.match(res.stderr, /Test plan/);
  assert.match(res.stderr, /exonous workflow pr/);
});

test('auto mode gates commit, push and pr from one hook entry', () => {
  const fx = setup();
  assert.match(run('auto', claude('git commit -m x', fx.dir), fx.env).stderr, /exonous token commit/);
  assert.match(run('auto', claude('git push -f', fx.dir), fx.env).stderr, /exonous token push/);
  assert.match(run('auto', claude('gh pr create --fill', fx.dir), fx.env).stderr, /exonous workflow pr/);
  assert.strictEqual(run('auto', claude('git status', fx.dir), fx.env).code, 0);
  fx.mint('commit');
  assert.strictEqual(run('auto', claude('git commit -m x', fx.dir), fx.env).code, 0);
});

test('unreadable input and unknown modes pass only when the text mentions neither git nor gh', () => {
  const { env } = setup();
  for (const [mode, input, code] of [
    ['commit', 'not json', 0], ['commit', '', 0], ['commit', '{"tool_input":{"file_path":"/x"}}', 0],
    ['commit', 'not json git commit', 2], ['commit', '{"weird":"gh pr create"}', 2], ['merge', claude('git commit', '/'), 2], ['merge', claude('ls', '/'), 0],
  ]) {
    const res = run(mode, input, env);
    assert.strictEqual(res.code, code, `${mode} ${input}`);
    assert.doesNotMatch(res.stderr, /\n\s+at /);
  }
});

// ── Revision 1: bypass matrix (QA + security) ───────────────────────────────

function deepShell(cmd, levels) {
  let out = cmd;
  for (let i = 0; i < levels; i += 1) out = `sh -c '${out.replace(/'/g, `'"'"'`)}'`;
  return out;
}

const COMMIT_DENY = [
  // A: isolation
  'git add . && git commit -m x', 'git commit -m x; echo done', 'git commit -m x | tee log', 'git commit -m x || true',
  'git commit -m x &', '(git commit -m x)', '{ git commit -m x; }', 'if true; then git commit -m x; fi',
  'for i in 1; do git commit -m x; done', 'true; git commit -m x', '! git commit -m x', 'f() { git commit -m x; }; f',
  'timeout 5 git commit -m x', 'env git commit -m x', 'sudo git commit -m x', 'nohup git commit -m x', 'command git commit -m x',
  "bash -c 'git add -A; git commit -m x'", "bash -c 'git commit -m x' && true", "eval 'git add . && git commit -m x'",
  'git commit -m "$(git add -A; echo x)"', 'git commit -m `git add -A`', 'git commit -m "$(touch c.txt && echo x)"',
  'cd sub && cd .. && git commit -m x', 'cd - && git commit -m x', '(cd sub) && git commit -m x', 'true || cd sub && git commit -m x',
  'cd sub || git commit -m x', 'cd "$D" && git commit -m x', 'git commit -m x\ngit push', 'git commit -m x && git commit -m y',
  // B: unresolvable with a gated keyword
  'echo x | xargs git commit -m', 'find . -maxdepth 0 -exec git commit -m x \;', 'watch -n1 git commit -m x',
  "script -q -c 'git commit -m x' /dev/null", 'ssh host git commit -m x', '$GIT commit -m x', 'g=git; $g commit -m x',
  '`echo git` commit -m x', "$'git' commit -m x", '{git,true} commit -m x', 'gi? commit -m x', "env -S 'git commit -m x'",
  "bash <<'EOF'\ngit commit -m x\nEOF", 'bash ./do-commit.sh', 'git -c alias.ci=commit ci -m x',
  'git commit -F - <<EOF\n$(git add -A)\nEOF', deepShell('git commit -m x', 6),
  'python3 -c "import os; os.system(\'git commit -m x\')"', "node -e \"require('child_process').execSync('git commit -m x')\"",
  "perl -e 'system(q(git commit -m x))'",
  // C: options
  'git commit --al -m x', 'git commit --incl -m x', 'git commit --onl -m x', 'git commit --patc', 'git commit --interac',
  'git commit --a -m x', 'git commit --frobnicate -m x', 'git commit $FLAGS -m x', 'git commit -m x $P', 'git commit --pathspec-from=f -m x',
  // D: repo redirection
  'GIT_DIR=.git git commit -m x', 'GIT_WORK_TREE=. git commit -m x', 'GIT_INDEX_FILE=/tmp/i git commit -m x',
  'git --git-dir=.git commit -m x', 'git --work-tree . commit -m x',
];

const COMMIT_ALLOW = [
  'git commit -m x', 'cd sub && git commit -m x', "git commit -m \"$(cat <<'EOF'\nmsg\nEOF\n)\"", "bash -lc 'git commit -m x'",
  'git commit -m x 2>&1', 'git -C sub commit -m x', 'git commit -m "$MSG"', 'git commit --amend --no-edit', 'git commit -n -m x',
  'git commit --no-verif -m x',
];

test('bypass matrix: every unsafe commit shape is denied even with a valid token', () => {
  const fx = setup();
  fs.mkdirSync(path.join(fx.dir, 'sub'));
  const failures = [];
  for (const cmd of COMMIT_DENY) {
    fx.mint('commit');
    const res = run('commit', claude(cmd, fx.dir), fx.env);
    if (res.code !== 2) failures.push(`ALLOWED: ${JSON.stringify(cmd)}`);
  }
  for (const cmd of COMMIT_ALLOW) {
    fx.mint('commit');
    const res = run('commit', claude(cmd, fx.dir), fx.env);
    if (res.code !== 0) failures.push(`DENIED: ${JSON.stringify(cmd)} → ${res.stderr.trim()}`);
  }
  assert.deepStrictEqual(failures, []);
});

test('help and dry-run count only as real options, never as option values', () => {
  const fx = setup();
  const failures = [];
  for (const [mode, cmd, code] of [
    ['commit', 'git commit -m -h', 2], ['commit', 'git commit -m --dry-run', 2], ['commit', 'git commit -F --help', 2],
    ['commit', 'git commit --help', 0], ['commit', 'git commit -h', 0], ['commit', 'git commit --dry-run', 0], ['commit', 'git commit --dry', 0],
    ['push', 'git push -o -n origin main', 2], ['push', 'git push --dry-run origin main', 0], ['push', 'git push -n origin main', 0],
    ['pr', 'gh pr create -t -h', 2], ['pr', 'gh pr create --help', 0],
  ]) {
    const res = run(mode, claude(cmd, fx.dir), fx.env);
    if (res.code !== code) failures.push(`${cmd} → ${res.code}`);
  }
  assert.deepStrictEqual(failures, []);
});

test('bypass matrix: push shapes that need a push token', () => {
  const fx = setup();
  withRemote(fx);
  const failures = [];
  for (const cmd of [
    'git push --forc', 'git push --force-with origin feat/x', 'git push --mirr', "git push origin 'refs/heads/*:refs/heads/*'",
    'git push origin $B', 'git push --frob origin feat/x', 'git push origin :main', 'git push --delete origin main',
    'git push --prune origin feat/x', 'git push origin feat/x && git push origin main', 'git push origin main 2>&1 | tail',
    'git push origin feat/x; git push -f',
  ]) {
    if (run('push', claude(cmd, fx.dir), fx.env).code !== 2) failures.push(cmd);
  }
  for (const cmd of ['git push origin feat/x', 'git push -u origin HEAD', 'git push']) {
    if (run('push', claude(cmd, fx.dir), fx.env).code !== 0) failures.push(`DENIED ${cmd}`);
  }
  assert.deepStrictEqual(failures, []);
});

test('a push token covers only the commit it was minted for', () => {
  const fx = setup();
  git(fx.dir, 'commit', '-q', '--no-gpg-sign', '-m', 'b');
  git(fx.dir, 'branch', 'other', 'HEAD~1');
  fx.mint('push');
  assert.strictEqual(run('push', claude('git push origin other:main', fx.dir), fx.env).code, 2);
  assert.strictEqual(run('push', claude('git push origin HEAD:main', fx.dir), fx.env).code, 0);
});

test('a configured git alias for commit or push is denied without any keyword on the line', () => {
  const fx = setup();
  git(fx.dir, 'config', 'alias.ci', 'commit');
  git(fx.dir, 'config', 'alias.c2', 'ci');
  git(fx.dir, 'config', 'alias.sh1', '!git push --force');
  git(fx.dir, 'config', 'alias.st2', 'status');
  for (const cmd of ['git ci -m x', 'git c2 -m x', 'git sh1', 'HOME=/tmp git st2', 'export HOME=/tmp; git st2']) {
    fx.mint('commit');
    assert.strictEqual(run('commit', claude(cmd, fx.dir), fx.env).code, 2, cmd);
  }
  assert.strictEqual(run('commit', claude('git st2', fx.dir), fx.env).code, 0);
});

test('gh pr create must run alone and with known options', () => {
  const { dir, env } = setup();
  fs.mkdirSync(path.join(dir, '.github'));
  fs.writeFileSync(path.join(dir, '.github', 'pull_request_template.md'), '## Summary\n## Test plan\n');
  fs.writeFileSync(path.join(dir, 'body.md'), '## Summary\nx\n## Test plan\ny\n');
  assert.strictEqual(run('pr', claude('gh pr create --body-file body.md && echo ok', dir), env).code, 2);
  assert.strictEqual(run('pr', claude('gh pr create --body-file body.md --frob', dir), env).code, 2);
  assert.strictEqual(run('pr', claude('gh pr create --body-file body.md extra', dir), env).code, 2);
  assert.strictEqual(run('pr', claude('cd . && gh pr create -F body.md', dir), env).code, 0);
});

test('a changed gitleaks config or a failing gitleaks blocks the commit', () => {
  const fx = setup();
  fs.writeFileSync(path.join(fx.dir, '.gitleaks.toml'), '[extend]\nuseDefault = true\n');
  git(fx.dir, 'add', '.gitleaks.toml');
  git(fx.dir, 'commit', '-q', '--no-gpg-sign', '-m', 'cfg');
  git(fx.dir, 'add', 'b.txt');
  const attempt = (env = fx.env) => {
    fx.mint('commit');
    return run('commit', claude('git commit -m x', fx.dir), env);
  };
  assert.strictEqual(attempt().code, 0);
  fs.writeFileSync(path.join(fx.dir, 'd.txt'), 'd');
  git(fx.dir, 'add', 'd.txt');
  fs.appendFileSync(path.join(fx.dir, '.gitleaks.toml'), '[allowlist]\npaths = [".*"]\n');
  assert.match(attempt().stderr, /\.gitleaks/);
  git(fx.dir, 'add', '.gitleaks.toml');
  assert.strictEqual(attempt().code, 2);
  git(fx.dir, 'reset', '-q', '--', '.gitleaks.toml');
  git(fx.dir, 'checkout', '--', '.gitleaks.toml');
  fs.writeFileSync(path.join(fx.dir, '.gitleaksignore'), 'abc:1\n');
  assert.strictEqual(attempt().code, 2);
  fs.rmSync(path.join(fx.dir, '.gitleaksignore'));
  assert.strictEqual(attempt().code, 0, 'clean again');
  fs.writeFileSync(path.join(fx.dir, 'e.txt'), 'e');
  git(fx.dir, 'add', 'e.txt');
  for (const script of ['echo boom >&2; exit 1', 'kill -9 $$']) {
    const env = { ...fx.env, PATH: `${shim(script)}:${GIT_DIR}:/usr/bin:/bin` };
    const res = attempt(env);
    assert.strictEqual(res.code, 2, script);
    assert.match(res.stderr, /gitleaks/, script);
  }
});

test('git calls made by the gate never run a repo fsmonitor command', () => {
  const fx = setup();
  const marker = path.join(fx.home, 'fsmonitor-ran');
  git(fx.dir, 'config', 'core.fsmonitor', `touch ${marker}`);
  const env = { ...fx.env, PATH: `${shim('git status >/dev/null 2>&1; exit 0')}:${GIT_DIR}:/usr/bin:/bin` };
  fx.mint('commit');
  run('commit', claude('git commit -m x', fx.dir), env);
  run('push', claude('git push origin main', fx.dir), env);
  assert.ok(!fs.existsSync(marker), 'fsmonitor command executed');
});

// ── Revision 2 ───────────────────────────────────────────────────────────────

test('a computed command name or git/gh subcommand is denied even without a gated keyword', () => {
  const fx = setup();
  const failures = [];
  for (const cmd of ['g=git; s=comm; $g ${s}it -m x', '$G ${S}it', '$G commit -m x', 'git ${s:-co}mmit -m x', 'git pu${x}sh origin main',
    'gh pr cre${x}ate --fill', 'gh ${p}r create', '$CMD push origin main', 'eval "$X" && git status', '$(echo git) status', 'git $SUB',
    '"$BIN" run "$ARG"', '$HOME/bin/gi${t} commit -m x', 'bash -c "$SCRIPT"; gh pr list']) {
    for (const mode of ['commit', 'push', 'pr']) {
      if (run(mode, claude(cmd, fx.dir), fx.env).code !== 2) failures.push(`${mode}: ${cmd}`);
    }
  }
  for (const cmd of ['$HOME/bin/tool --x', 'ls $DIR', 'echo "$(date)"', 'cat "${FILE}"', '"$PYTHON" script.py', '$(which node) x',
    '"$VENV/bin/python" -m pytest', 'bash -c "$SCRIPT"', 'eval "$X"', '"$BIN" run']) {
    if (run('commit', claude(cmd, fx.dir), fx.env).code !== 0) failures.push(`DENIED ${cmd}`);
  }
  const viaHome = run('commit', claude('$HOME/bin/git commit -m x', fx.dir), fx.env);
  if (viaHome.code !== 2 || !/no commit token/.test(viaHome.stderr)) failures.push('$HOME/bin/git not gated as git');
  fx.mint('commit');
  if (run('commit', claude('$HOME/bin/git commit -m x', fx.dir), fx.env).code !== 0) failures.push('$HOME/bin/git with a token');
  assert.deepStrictEqual(failures, []);
});

test('a computed command name cannot reach a git alias for commit or push', () => {
  const fx = setup();
  git(fx.dir, 'config', 'alias.ci', 'commit');
  fx.mint('commit');
  assert.strictEqual(run('commit', claude('gi${t} ci -m x', fx.dir), fx.env).code, 2);
  assert.strictEqual(run('commit', claude('gi${t} status', fx.dir), fx.env).code, 0);
});

test('a staged gitleaks:allow comment blocks the commit', () => {
  const fx = setup();
  fs.writeFileSync(path.join(fx.dir, 'k.txt'), 'key = "AKIA0000000000000000" // gitleaks:allow\n');
  git(fx.dir, 'add', 'k.txt');
  fx.mint('commit');
  const res = run('commit', claude('git commit -m x', fx.dir), fx.env);
  assert.strictEqual(res.code, 2);
  assert.match(res.stderr, /gitleaks:allow/);
});

test('gitleaks gets --ignore-gitleaks-allow only when it supports the flag', () => {
  const fx = setup();
  const log = path.join(fx.home, 'args.log');
  const script = (help) => `if [ "$2" = "--help" ]; then echo "${help}"; exit 0; fi; echo "$@" >> ${log}; exit 0`;
  for (const [help, expected] of [['      --ignore-gitleaks-allow   ignore gitleaks:allow comments', true], ['      --redact', false]]) {
    fs.rmSync(log, { force: true });
    fx.mint('commit');
    const env = { ...fx.env, PATH: `${shim(script(help))}:${GIT_DIR}:/usr/bin:/bin` };
    assert.strictEqual(run('commit', claude('git commit -m x', fx.dir), env).code, 0);
    assert.strictEqual(fs.readFileSync(log, 'utf8').includes('--ignore-gitleaks-allow'), expected, help);
  }
});

test('push config overrides are denied and a refspec-less push resolves its real destination', () => {
  const fx = setup();
  const failures = [];
  for (const cmd of ['git -c push.default=matching push', 'git -c remote.origin.push=refs/heads/*:refs/heads/main push', 'git -c branch.feat/x.merge=refs/heads/main push', 'git --config-env=push.default=X push']) {
    if (run('push', claude(cmd, fx.dir), fx.env).code !== 2) failures.push(cmd);
  }
  if (run('push', claude('git push', fx.dir), fx.env).code !== 2) failures.push('git push without an upstream must need a token');
  withRemote(fx);
  if (run('push', claude('git push', fx.dir), fx.env).code !== 0) failures.push('git push to its own upstream');
  git(fx.dir, 'config', 'remote.origin.push', 'refs/heads/feat/x:refs/heads/main');
  if (run('push', claude('git push', fx.dir), fx.env).code !== 2) failures.push('configured push to main');
  if (run('push', claude('git push origin', fx.dir), fx.env).code !== 2) failures.push('configured push to main via remote only');
  assert.deepStrictEqual(failures, []);
});

test('PR titles are checked in the body only, and --base comes from the parsed options', () => {
  const { dir, env } = setup();
  fs.mkdirSync(path.join(dir, '.github'));
  fs.writeFileSync(path.join(dir, '.github', 'pull_request_template.md'), '## Summary\n## Test plan\n');
  assert.strictEqual(run('pr', claude('gh pr create --title "## Summary ## Test plan" --body "x"', dir), env).code, 2);
  assert.strictEqual(run('pr', claude('gh pr create --label "## Summary" --label "## Test plan" --fill', dir), env).code, 2);
  assert.strictEqual(run('pr', claude('gh pr create --title t --body "## Summary\n## Test plan"', dir), env).code, 0);
});

test('a hook runtime that cannot load fails closed for git/gh (exit 2) and open for anything else', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pyle-broken-'));
  fs.mkdirSync(path.join(dir, 'lib'));
  fs.copyFileSync(PYLE, path.join(dir, 'pyle.cjs'));
  fs.writeFileSync(path.join(dir, 'lib', 'payload.cjs'), 'throw new Error("half-updated runtime");');
  const gate = (command) => spawnSync(process.execPath, [path.join(dir, 'pyle.cjs'), 'auto', '--adapter', 'windsurf'], {
    input: JSON.stringify({ agent_action_name: 'pre_run_command', tool_info: { command_line: command, cwd: dir } }), encoding: 'utf8',
  });
  const git = gate('git commit -m x');
  assert.strictEqual(git.status, 2);
  assert.match(git.stderr, /exonous: blocked — the gate could not load/);
  assert.strictEqual(gate('gh pr create').status, 2);
  const ls = gate('ls -la');
  assert.strictEqual(ls.status, 0);
});

test('gitleaks is capped well under tool hook timeouts', () => {
  const src = fs.readFileSync(PYLE, 'utf8');
  assert.match(src, /const GITLEAKS_TIMEOUT_MS = 20000;/);
  assert.match(src, /const GITLEAKS_PROBE_MS = 5000;/);
});

