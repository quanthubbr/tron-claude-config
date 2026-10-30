'use strict';

// Temp home + local bare release repo + PATH shims for npm/pnpm/bun: no network, no real global installs.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const HOOKS = path.join(ROOT, 'assets', 'machine', 'hooks');
const DAY_MS = 24 * 60 * 60 * 1000;

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
};

const git = (cwd, args) => execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// Installs a fake package for `github:…#<sha>` (version from the tag map) and a pm lockfile naming the commit.
const shim = (name) => `#!/bin/sh
printf '%s\\n' "${name} $*" >> "$SHIM_LOG"
if [ "$1" = root ]; then echo "$SHIM_ROOT"; exit 0; fi
if [ -n "$SHIM_SLEEP" ]; then sleep "$SHIM_SLEEP"; fi
if [ -n "$SHIM_FAIL" ]; then echo "registry unreachable \\033[31m$SHIM_FAIL" >&2; exit 1; fi
for a; do last=$a; done
sha=\${last##*#}
ver=$(grep "^$sha " "$SHIM_TAGS" | cut -d' ' -f2)
lsha=\${SHIM_LOCK_SHA:-$sha}
case "$(basename "$0")" in
  bun) nm="$BUN_INSTALL/install/global/node_modules"; lock="$BUN_INSTALL/install/global/bun.lock"
       body="{ \\"packages\\": { \\"exonous\\": [\\"exonous@github:zaqueu-1/exonous#$lsha\\"] } }";;
  pnpm) nm="$SHIM_ROOT"; lock="$(dirname "$SHIM_ROOT")/pnpm-lock.yaml"
       body="  exonous: https://codeload.github.com/zaqueu-1/exonous/tar.gz/$lsha";;
  *) nm="$SHIM_ROOT"; lock="$SHIM_ROOT/.package-lock.json"
       body="{ \\"packages\\": { \\"node_modules/exonous\\": { \\"resolved\\": \\"git+ssh://git@github.com/zaqueu-1/exonous.git#$lsha\\" } } }";;
esac
mkdir -p "$nm/exonous/bin"
[ -z "$SHIM_NO_LOCK" ] && printf '%s\\n' "$body" > "$lock"
printf '{"name":"%s","version":"%s"}\\n' "\${SHIM_NAME:-exonous}" "\${SHIM_VERSION:-$ver}" > "$nm/exonous/package.json"
cp "$SHIM_FAKE_BIN" "$nm/exonous/bin/exonous.js"
`;

// Stands in for the new release's CLI: records argv and, like a real install, rewrites install.json.
const FAKE_BIN = `'use strict';
const fs = require('fs');
const path = require('path');
fs.appendFileSync(process.env.INSTALL_LOG, process.argv.slice(2).join(' ') + '\\n');
if (process.env.FAKE_INSTALL_FAIL) process.exit(1);
if (process.env.FAKE_INSTALL_WARN) console.log('[exonous] WARN: cursor incomplete: disk full');
const version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version;
const file = path.join(process.env.EXONOUS_HOME, '.claude', 'exonous', 'install.json');
const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
fs.writeFileSync(file, JSON.stringify({ ...prev, version, packageRoot: path.join(__dirname, '..'), tagSha: null }));
`;

function bareRepo(dir, tags) {
  const work = path.join(dir, 'work');
  fs.mkdirSync(work);
  git(work, ['init', '-q']);
  const shas = {};
  for (const tag of tags) {
    fs.writeFileSync(path.join(work, 'f.txt'), tag);
    git(work, ['add', 'f.txt']);
    git(work, ['commit', '-q', '-m', tag]);
    git(work, tag.startsWith('a:') ? ['tag', '-a', tag.slice(2), '-m', tag.slice(2)] : ['tag', tag]);
    shas[tag.replace(/^a:/, '')] = git(work, ['rev-parse', 'HEAD']);
  }
  const bare = path.join(dir, 'repo.git');
  git(dir, ['clone', '-q', '--bare', work, bare]);
  return { url: `file://${bare}`, shas };
}

/**
 * @param {{ installed?: string, tags?: string[], pm?: string, info?: object, config?: object, env?: Record<string, string> }} [options]
 */
function fixture({ installed = '2.1.0', tags = ['a:v2.1.0', 'a:v2.2.0'], pm = 'npm', info = {}, config, env = {} } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'selfupdate-')));
  const home = path.join(dir, 'home');
  const exo = path.join(home, '.claude', 'exonous');
  const state = path.join(exo, 'state');
  fs.mkdirSync(exo, { recursive: true });
  const repo = bareRepo(dir, tags);
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  for (const name of ['npm', 'pnpm', 'bun']) fs.writeFileSync(path.join(bin, name), shim(name), { mode: 0o755 });
  const tagsFile = path.join(dir, 'tags.txt');
  fs.writeFileSync(tagsFile, Object.entries(repo.shas).map(([tag, sha]) => `${sha} ${tag.slice(1)}\n`).join(''));
  const fakeBin = path.join(dir, 'fake-exonous.js');
  fs.writeFileSync(fakeBin, FAKE_BIN);
  fs.writeFileSync(path.join(exo, 'install.json'), JSON.stringify({
    version: installed, pm, pmPath: path.join(bin, pm), packageRoot: path.join(dir, 'old'), source: 'https://github.com/zaqueu-1/exonous.git',
    tagSha: null, installedAt: new Date(0).toISOString(), tools: { claude: { tier: 1, version: installed } }, ...info,
  }));
  if (config) fs.writeFileSync(path.join(exo, 'config.json'), JSON.stringify(config));
  const baseEnv = { ...process.env };
  for (const key of ['CI', 'CONTINUOUS_INTEGRATION', 'EXONOUS_NO_UPDATE', 'npm_config_user_agent', 'SHIM_FAIL', 'SHIM_SLEEP', 'SHIM_VERSION', 'SHIM_NAME', 'SHIM_LOCK_SHA', 'SHIM_NO_LOCK', 'FAKE_INSTALL_FAIL', 'FAKE_INSTALL_WARN', 'EXONOUS_UPDATE_TEST_PM', 'EXONOUS_TEST', 'EXONOUS_RELEASE_SOURCE']) delete baseEnv[key];
  const fx = {
    dir, home, exo, state, repo, bin, shim,
    shimLog: path.join(dir, 'pm.log'),
    installLog: path.join(dir, 'install.log'),
    globalRoot: path.join(dir, 'global'),
    env: {
      ...baseEnv,
      EXONOUS_HOME: home,
      EXONOUS_UPDATE_TEST_PM: '1',
      EXONOUS_TEST: '1',
      SHIM_TAGS: tagsFile,
      EXONOUS_RELEASE_SOURCE: repo.url,
      PATH: `${bin}${path.delimiter}${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`,
      SHIM_LOG: path.join(dir, 'pm.log'),
      SHIM_ROOT: path.join(dir, 'global'),
      SHIM_FAKE_BIN: fakeBin,
      INSTALL_LOG: path.join(dir, 'install.log'),
      BUN_INSTALL: path.join(dir, 'bun'),
      ...env,
    },
    read: (file) => {
      try {
        return fs.readFileSync(file, 'utf8');
      } catch {
        return '';
      }
    },
    pmCalls: () => fx.read(fx.shimLog).split('\n').filter(Boolean),
    installs: () => fx.pmCalls().filter((l) => !/^\w+ root /.test(l)),
    installCalls: () => fx.read(fx.installLog).split('\n').filter(Boolean),
    info: () => JSON.parse(fs.readFileSync(path.join(exo, 'install.json'), 'utf8')),
    note: () => fx.read(path.join(state, 'note')).trim(),
    log: () => fx.read(path.join(state, 'update.log')),
    age: (name, ms) => {
      const t = (Date.now() - ms) / 1000;
      fs.utimesSync(path.join(state, name), t, t);
    },
    put: (name, content) => {
      fs.mkdirSync(state, { recursive: true });
      fs.writeFileSync(path.join(state, name), content);
    },
  };
  return fx;
}

/** Runs selfupdate.cjs in a child so env, PATH and EXONOUS_HOME stay isolated per test. */
function runLib(fx, fn, options = {}, env = {}) {
  const code = `const s = require(${JSON.stringify(path.join(HOOKS, 'lib', 'selfupdate.cjs'))});
process.stdout.write(JSON.stringify(s.${fn}(${JSON.stringify(options)})));`;
  const res = spawnSync(process.execPath, ['-e', code], { env: { ...fx.env, ...env }, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`selfupdate.${fn} crashed: ${res.stderr}`);
  return JSON.parse(res.stdout);
}

module.exports = { fixture, runLib, HOOKS, ROOT, DAY_MS };
