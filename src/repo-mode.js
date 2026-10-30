'use strict';

// Repo mode: exonous declared in a repo's package.json and no global install. The repo copy installs and updates the machine.
const fs = require('fs');
const repo = require('../assets/machine/hooks/lib/repo.cjs');
const { compareVersions } = require('../assets/machine/hooks/lib/release.cjs');
const runtime = require('./lib/runtime');

const parts = (version) => String(version).split('.').map(Number);

function defaultLog(msg) {
  process.stdout.write(`[exonous] ${msg}\n`);
}

/**
 * Machine install from a repo copy, unless a global install or a newer repo copy already runs the machine.
 * @param {{ packageRoot?: string, env?: NodeJS.ProcessEnv, quiet?: boolean, log?: (msg: string) => void }} [options]
 * @returns {{ status: 'not-repo'|'opted-out'|'inert'|'refused'|'installed', reason?: string, root?: string }}
 */
function bootstrap({ packageRoot = runtime.PACKAGE_ROOT, env = process.env, quiet = false, log = defaultLog } = {}) {
  const root = repo.repoOf(packageRoot);
  if (!root) return { status: 'not-repo' };
  const legacy = require('./legacy/repo-migrate');
  const off = legacy.optedOut(env);
  if (off) {
    log(`repo mode skipped (${off})`);
    return { status: 'opted-out', reason: off, root };
  }
  const info = runtime.readInstallInfo();
  if (repo.globalPrevails(info)) {
    if (!quiet) log(`the global install (${info.packageRoot}) takes precedence — the dependency in ${root} stays inert`);
    return { status: 'inert', reason: 'global', root };
  }
  const version = runtime.packageVersion();
  if (info?.version && fs.existsSync(String(info.packageRoot)) && compareVersions(parts(info.version), parts(version)) > 0) {
    log(`this machine already runs v${info.version} from ${repo.repoOf(info.packageRoot) || info.packageRoot} — not downgrading to v${version}`);
    return { status: 'inert', reason: 'newer', root };
  }
  try {
    runtime.assertOwner('install');
  } catch (err) {
    log(err.message);
    return { status: 'refused', reason: err.message, root };
  }
  require('./install').install(quiet ? { quiet } : { log });
  legacy.cleanRepoFiles({ root: legacy.migrationRoot(packageRoot, env), log });
  const dep = repo.readDep(root);
  if (!quiet) log(`repo mode: machine installed from ${root} (v${version}); updates follow ${dep.name}@${dep.spec}`);
  return { status: 'installed', root };
}

module.exports = { bootstrap };
