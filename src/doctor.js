'use strict';

// exonous doctor: one screen, every piece, and the fix for whatever is missing.
const fs = require('fs');
const path = require('path');
const paths = require('./lib/paths');
const { select, selftest, readConfig, ADAPTERS } = require('./adapters');
const { onPath } = require('./adapters/shared');
const { readLedger, sha256 } = require('./lib/home');
const { DESIGN_SKILLS, packageVersion, readInstallInfo, readInstallError } = require('./lib/runtime');
const { LEFTOVERS } = require('./legacy/bridge');
const { current } = require('./vault-cli');
const selfupdate = require('../assets/machine/hooks/lib/selfupdate.cjs');

const FIX = 'exonous install';

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function hasMcp(key) {
  return [path.join(paths.claudeDir(), '.mcp.json'), path.join(paths.home(), '.claude.json')]
    .some((file) => Boolean(readJson(file)?.mcpServers?.[key]));
}

function updateChecks() {
  const moved = selfupdate.tagWarning();
  const last = selfupdate.lastCheck();
  const off = selfupdate.optedOut();
  const age = last === null ? 'never checked' : `last check ${Math.round((Date.now() - last) / 3600000)} h ago`;
  return [
    { name: 'self-update', ok: true, status: off ? `off (${off})` : age, fix: 'exonous update' },
    {
      name: 'release tag unchanged since install',
      ok: !moved,
      status: moved ? `v${moved.version} now points to ${moved.actual.slice(0, 12)}, installed from ${moved.expected.slice(0, 12)}` : '',
      fix: 'check the tag on github.com/zaqueu-1/exonous before trusting it, then exonous update',
    },
  ];
}

function vaultCheck() {
  const row = { name: 'vault (project memory, handoffs, docs)', fix: 'exonous vault detect, then exonous vault set <path>' };
  let found;
  try {
    found = current();
  } catch (err) {
    return { ...row, ok: false, status: err.message };
  }
  if (!found.path) return { ...row, ok: false, status: 'not configured' };
  const exists = fs.existsSync(found.path) && fs.statSync(found.path).isDirectory();
  return { ...row, ok: exists, status: `${found.path} via ${found.source}${exists ? '' : ' — missing'}` };
}

function sharedChecks() {
  const info = readInstallInfo();
  const leftovers = LEFTOVERS.filter((rel) => fs.existsSync(path.join(paths.home(), rel)));
  return [
    { name: 'machine install (install.json)', ok: Boolean(info), status: info ? `v${info.version} via ${info.pm}` : '', fix: FIX },
    { name: 'gate runtime (~/.claude/exonous/hooks)', ok: fs.existsSync(path.join(paths.exoDir(), 'hooks', 'pyle.cjs')), fix: FIX },
    { name: 'design stack', ok: DESIGN_SKILLS.every((s) => fs.existsSync(path.join(paths.home(), '.agents', 'skills', s, 'SKILL.md'))), fix: FIX },
    { name: 'atlas MCP (code graph)', ok: hasMcp('atlas'), fix: 'exonous install (or node <exonous>/src/lib/atlas.js --force)' },
    { name: 'biblos MCP (library docs)', ok: hasMcp('biblos'), fix: 'exonous install' },
    vaultCheck(),
    { name: 'no leftovers from older installs', ok: !leftovers.length, status: leftovers.map((r) => `~/${r}`).join(', '), fix: FIX },
  ];
}

// Cells for the coverage matrix, read from each adapter's doctor rows by what they are about.
const COLUMNS = { Rules: /rule|nomos/i, Commands: /command|skills/i, MCP: /\bMCP\b/, Update: /kairos|self-update|pre_user_prompt/i };
const TIER = { 1: 'full', 2: 'hard-reduced', 3: 'soft', 0: 'unsupported' };

function cell(rows) {
  if (!rows.length) return '—';
  if (rows.some((r) => !r.ok && r.level !== 'warn')) return '✗';
  return rows.some((r) => !r.ok) ? '⚠' : '✓';
}

function gateCell(adapter, result) {
  if (adapter.gate === 'soft') return 'soft: not enforced';
  if (adapter.gate === 'none') return 'unsupported';
  if (!adapter.registeredCommand()) return 'hard (not registered)';
  return `hard (registered, selftest ${result && result.ok ? 'ok' : 'FAILED'})`;
}

function matrix({ selected, detected, disabled, rowsById, selftests }) {
  const header = ['Tool', 'Tier', 'Rules', 'Gate', 'Commands', 'MCP', 'Update'];
  const lines = ADAPTERS.map((a) => {
    const tier = a.tierLabel || TIER[a.tier] || String(a.tier);
    if (!detected[a.id]) return [a.id, tier, '', 'not installed', '', '', ''];
    if (a.gate !== 'none' && !selected.includes(a)) return [a.id, tier, '', disabled.includes(a.id) ? 'skipped' : 'not selected', '', '', ''];
    const rows = rowsById[a.id] || [];
    const pick = (re) => cell(rows.filter((r) => re.test(r.name)));
    return [a.id, tier, pick(COLUMNS.Rules), gateCell(a, selftests[a.id]), pick(COLUMNS.Commands), pick(COLUMNS.MCP), pick(COLUMNS.Update)];
  });
  const widths = header.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
  const fmt = (cols) => `  ${cols.map((c, i) => c.padEnd(widths[i])).join(' | ').trimEnd()}`;
  return [fmt(header), `  ${widths.map((w) => '-'.repeat(w)).join('-|-')}`, ...lines.map(fmt)].join('\n');
}

/** Hook files under ~/.claude/exonous/hooks whose bytes no longer match what install recorded; null when none are tracked. */
function changedHooks() {
  const tracked = Object.entries(readLedger() || {}).filter(([rel]) => rel.startsWith('.claude/exonous/hooks/'));
  if (!tracked.length) return null;
  return tracked
    .filter(([rel, entry]) => {
      try {
        return sha256(fs.readFileSync(path.join(paths.home(), rel))) !== (entry.hash || entry);
      } catch {
        return true;
      }
    })
    .map(([rel]) => rel.replace('.claude/exonous/', ''));
}

/** Files under ~/.claude/exonous another uid owns (a root session wrote them); the current user cannot update them. */
function foreignFiles() {
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries.flatMap((e) => {
      const full = path.join(dir, e.name);
      const mine = paths.foreignOwner(full) === null;
      const below = e.isDirectory() && !e.isSymbolicLink() ? walk(full) : [];
      return mine ? below : [path.relative(paths.exoDir(), full), ...below];
    });
  };
  const top = paths.foreignOwner(paths.exoDir()) === null ? [] : ['.'];
  return [...top, ...walk(paths.exoDir())];
}

function machineChecks(cwd) {
  const info = readInstallInfo();
  const rows = [];
  const foreign = foreignFiles();
  rows.push({
    name: 'files in ~/.claude/exonous owned by you',
    ok: !foreign.length,
    status: foreign.length ? `${foreign.length} not: ${foreign.slice(0, 5).join(', ')}${foreign.length > 5 ? ', …' : ''}` : '',
    fix: 'sudo chown -R "$(id -un)" ~/.claude/exonous',
  });
  const failed = readInstallError();
  if (failed) rows.push({ name: 'last install finished', ok: false, status: `${failed.text} (${failed.at}); details in ~/.claude/exonous/state/install.log`, fix: FIX });
  if (info) {
    const source = require('../assets/machine/hooks/lib/repo.cjs').repoSource(info);
    rows.push({ name: 'install mode', ok: true, status: source ? `repo — ${source.root}, updates follow ${source.dep.name}@${source.dep.spec}` : 'global' });
    const pmOk = (info.pmPath && fs.existsSync(info.pmPath)) || onPath(info.pm || 'npm');
    rows.push({ name: `package manager (${info.pm}) on PATH`, ok: Boolean(pmOk), status: '', fix: `install ${info.pm} or reinstall exonous with the pm you use` });
    if (info.packageRoot && !fs.existsSync(info.packageRoot)) {
      rows.push({
        name: `exonous package location ${info.packageRoot} is gone`, ok: false, level: 'warn',
        status: 'the hooks still work; the exonous CLI and updates need a global copy',
        fix: 'npm i -g github:zaqueu-1/exonous (or pnpm add -g github:zaqueu-1/exonous / bun add -g github:zaqueu-1/exonous), then exonous install',
      });
    }
  }
  const changed = changedHooks();
  if (changed === null) rows.push({ name: 'hook scripts match the install', ok: false, level: 'warn', status: 'no hook entries tracked — reinstall', fix: FIX });
  else rows.push({ name: 'hook scripts match the install', ok: !changed.length, status: changed.length ? `${changed.length} changed: ${changed.join(', ')}` : '', fix: FIX });
  const { hasRepoFiles } = require('./legacy/repo-migrate');
  const inRepo = (paths.gitOut(cwd, ['rev-parse', '--is-inside-work-tree']) || '').trim() === 'true';
  if (inRepo && hasRepoFiles(cwd)) {
    rows.push({ name: `old repo-install files in ${cwd}`, ok: false, status: 'files from the v2.0.0-era repo install are still here', fix: 'run `npx exonous setup` here (keeps the dependency) or `exonous migrate` (drops it)' });
  }
  return rows;
}

function doctor({ cwd = process.cwd() } = {}) {
  const { selected: tools, detected } = select({});
  const disabled = readConfig().disabledTools || [];
  const hints = ADAPTERS.filter((a) => a.gate === 'none' && detected[a.id]);
  const selftests = {};
  const gates = tools.filter((a) => a.gate === 'hard').map((a) => {
    const result = selftest(a);
    selftests[a.id] = result;
    return { name: `${a.id}: gate self-test`, ok: result.ok, status: result.detail, fix: 'exonous install' };
  });
  const rowsById = Object.fromEntries([...tools, ...hints].map((a) => [a.id, a.doctor({})]));
  const checks = [...sharedChecks(), ...machineChecks(cwd), ...updateChecks(), ...Object.values(rowsById).flat(), ...gates];
  const groups = toolGroups(tools, hints);
  console.log(`exonous v${packageVersion()} — ${groups.header || 'no supported tool detected'}\n`);
  console.log(`${matrix({ selected: tools, detected, disabled, rowsById, selftests })}\n`);
  const { text, failed } = report(checks);
  console.log(text);
  if (groups.header) console.log(groups.summary);
  return failed ? 1 : 0;
}

/** Hard-gated tools apart from the ones exonous only feeds rules to, detects, or cannot support. */
function toolGroups(tools, hints) {
  const ids = (list) => list.map((a) => a.id);
  const gated = ids(tools.filter((a) => a.gate === 'hard'));
  const soft = tools.filter((a) => a.gate === 'soft');
  const parts = [
    ['gated', gated],
    ['rules only', ids(soft.filter((a) => !a.softNote))],
    ['detected', ids(soft.filter((a) => a.softNote))],
    ['unsupported', ids(hints)],
  ].filter(([, list]) => list.length);
  const ungated = [...ids(soft), ...ids(hints)];
  return {
    header: parts.map(([label, list]) => `${label}: ${list.join(', ')}`).join('; '),
    summary: `Commits gated in ${gated.length} tool${gated.length === 1 ? '' : 's'}${ungated.length ? `; NOT gated in ${ungated.length}: ${ungated.join(', ')}` : ''}.`,
  };
}

/** Rows exonous cannot verify carry level 'warn': shown with ⚠ and their fix, never counted as failures. */
function report(checks) {
  const lines = checks.map((check) => {
    const warn = !check.ok && check.level === 'warn';
    const mark = check.ok ? '✓' : warn ? '⚠' : '✗';
    const detail = check.status ? ` (${check.status})` : '';
    return `  ${mark} ${check.name}${detail}${check.ok ? '' : `\n      fix: ${check.fix}`}`;
  });
  const failed = checks.filter((c) => !c.ok && c.level !== 'warn').length;
  const warned = checks.filter((c) => !c.ok && c.level === 'warn').length;
  const tail = warned ? ` (${warned} warning${warned === 1 ? '' : 's'})` : '';
  lines.push(failed ? `\n${failed} problem(s)${tail}.` : `\nAll good${tail}.`);
  return { text: lines.join('\n'), failed, warned };
}

module.exports = { doctor, report };
