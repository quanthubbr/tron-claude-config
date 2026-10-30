'use strict';

// exonous install: machine-wide, idempotent. Shared pieces first, then every selected tool adapter, then prune.
const fs = require('fs');
const path = require('path');
const paths = require('./lib/paths');
const { createHome } = require('./lib/home');
const { ensureAtlas } = require('./lib/atlas');
const { ensureBiblos } = require('./lib/biblos');
const { select, ADAPTERS } = require('./adapters');
const { ASSETS, DESIGN_SKILLS, HOME_SKILLS, sharedSkillDir, foreignSkill, packageVersion, installRuntime, writeInstallInfo, isolatedHome, guardTarget, assertOwner, recordInstallError, clearInstallError } = require('./lib/runtime');
const legacy = require('./legacy/bridge');

function defaultLog(msg) {
  process.stdout.write(`[exonous] ${msg}\n`);
}

function step(log, name, run) {
  try {
    run();
    return true;
  } catch (err) {
    log(`WARN: ${name} incomplete: ${err.message}`);
    return false;
  }
}

// Design skills ship an engine tree, so they are replaced whole instead of tracked file by file.
function installDesignStack(home, { dryRun, log }) {
  for (const name of DESIGN_SKILLS) {
    const dest = path.join(paths.home(), '.agents', 'skills', name);
    if (!dryRun) fs.rmSync(dest, { recursive: true, force: true });
    home.copyTree(path.join(ASSETS, 'skills', name), dest);
  }
  log(`design stack ${dryRun ? 'would be ' : ''}synced → ~/.agents/skills (${DESIGN_SKILLS.join(', ')})`);
}

/** A hard-gate tool whose gate could not be registered is named at the end of the run, never just buried in a WARN. */
function gateProblems(adapter, { dryRun, warnings, problems }) {
  const out = problems.map((p) => ({ tool: adapter.id, ...p }));
  if (dryRun || adapter.gate !== 'hard' || out.some((p) => p.what === 'gate') || adapter.registeredCommand()) return out;
  const reason = (warnings[0] || 'the hook could not be registered').replace(/ — [^—]*not written; file left untouched$/, '');
  const fix = /not valid JSON/.test(reason) && ['gemini', 'opencode'].includes(adapter.id)
    ? 'fix the JSON by hand, or rerun `exonous install --rewrite-jsonc` (drops comments; backup kept)'
    : 'fix the file named above, then rerun `exonous install`';
  return [{ tool: adapter.id, what: 'gate', reason, fix }, ...out];
}

function installSharedSkills(home, log) {
  for (const [name, files] of Object.entries(HOME_SKILLS)) {
    const dir = sharedSkillDir(name);
    if (foreignSkill(dir, name)) {
      log(`WARN: ~/.agents/skills/${name}/ holds a different skill — left untouched`);
      continue;
    }
    for (const file of files) home.sync(path.join(ASSETS, 'skills', name, file), path.join(dir, file));
  }
}

/**
 * @param {{ dryRun?: boolean, quiet?: boolean, permissions?: boolean, tools?: string[] | null, all?: boolean, skip?: string[],
 *   external?: boolean, execPath?: string, log?: (msg: string) => void }} [options]
 * @returns {{ tools: string[] }}
 */
function install({
  dryRun = false, quiet = false, permissions = false, tools = null, all = false, skip = [], rewriteJsonc = false,
  external = !isolatedHome(), execPath = process.execPath, realHome = false, log,
} = {}) {
  const emit = log || (quiet ? (msg) => { if (/^(WARN|⚠|target home)/.test(msg)) defaultLog(msg); } : defaultLog);
  guardTarget({ action: 'install', dryRun, realHome, log: emit });
  assertOwner('install');
  const { selected, detected } = select({ tools, all, skip });
  if (!selected.length) emit('WARN: no supported tool found (Claude Code, Cursor, Gemini CLI, Codex CLI, OpenCode) — only shared pieces installed; rerun after installing one');
  const home = createHome({ dryRun, log: emit, previous: legacy.previousLedger() });
  step(emit, 'legacy cleanup', () => legacy.migrateHome({ dryRun, log: emit, home }));
  step(emit, 'atlas', () => {
    if (!external) emit('atlas skipped: EXONOUS_HOME is not the real home');
    else if (!ensureAtlas({ dryRun }).ok) emit('WARN: atlas not installed — run `exonous doctor` for the manual command');
  });
  step(emit, 'biblos', () => ensureBiblos({ dryRun }));
  step(emit, 'design stack', () => installDesignStack(home, { dryRun, log: emit }));
  step(emit, 'shared skills', () => installSharedSkills(home, emit));
  if (!step(emit, 'runtime', () => installRuntime(home, { dryRun }))) home.ledger.complete = false;
  const inactive = [];
  for (const adapter of selected) {
    const warnings = [];
    const log = (msg) => {
      if (/^WARN: /.test(msg)) warnings.push(msg.slice(6));
      emit(msg);
    };
    const ctx = { home, dryRun, log, execPath, permissions, external, detected, rewriteJsonc };
    let result = null;
    if (!step(log, adapter.id, () => { result = adapter.install(ctx); })) home.ledger.complete = false;
    inactive.push(...gateProblems(adapter, { dryRun, warnings, problems: (result && result.problems) || [] }));
  }
  writeInstallInfo({ tools: Object.fromEntries(selected.map((a) => [a.id, a])), dryRun });
  const complete = home.ledger.complete;
  home.prune(packageVersion(), { tools: selected.map((a) => a.id) });
  if (!dryRun) {
    if (complete) clearInstallError();
    else recordInstallError(`install v${packageVersion()} incomplete: some files failed to sync (see the WARN lines of that run)`);
  }
  for (const p of inactive) emit(`⚠ ${p.tool}: ${p.what} NOT active — ${p.reason}; fix: ${p.fix}`);
  for (const adapter of selected.filter((a) => a.gate === 'soft')) emit(`⚠ ${adapter.id}: ${adapter.softNote || 'rules only'} — commits are NOT gated`);
  for (const adapter of ADAPTERS.filter((a) => a.gate === 'none' && detected[a.id])) emit(`⚠ ${adapter.id}: unsupported — ${adapter.HINT}`);
  emit(`install ${dryRun ? 'dry run ' : ''}done (v${packageVersion()}) — ${selected.map((a) => a.id).join(', ') || 'no tools'}`);
  return { tools: selected.map((a) => a.id), inactive, complete };
}

module.exports = { install, isolatedHome };
