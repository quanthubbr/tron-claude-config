// Stop: format the JS/TS files this session edited, type-check them, and flag leftover console.log.
// Advisory only — findings go to stderr and the hook always exits 0.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { listFile } = require('./edit-tracker');

const CODE = /\.(c|m)?(j|t)sx?$/;
const TS = /\.(c|m)?tsx?$/;
const CONSOLE_EXEMPT = [/\.(test|spec)\.[cm]?[jt]sx?$/, /\.config\.[cm]?[jt]s$/, /[\\/](scripts|__tests__|__mocks__)[\\/]/];
const BUDGET_MS = 270000;
const PRETTIER_CONFIGS = ['.prettierrc', '.prettierrc.json', '.prettierrc.yml', '.prettierrc.yaml', '.prettierrc.json5', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.mjs', '.prettierrc.toml', 'prettier.config.js', 'prettier.config.cjs', 'prettier.config.mjs', 'prettier.config.ts'];

function takeEditedFiles(sessionId) {
  const file = listFile(sessionId);
  let raw = '';
  try {
    raw = fs.readFileSync(file, 'utf8');
    fs.unlinkSync(file);
  } catch {
    return [];
  }
  return [...new Set(raw.split('\n').map((l) => l.trim()).filter(Boolean))];
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function eligible(file, cwd) {
  if (!CODE.test(file) || !fs.existsSync(file)) return false;
  if (file.split(path.sep).includes('node_modules')) return false;
  // Windows runs .cmd shims through cmd.exe; never hand it a path it would parse as syntax.
  if (process.platform === 'win32' && /[&|<>^%!\s()"]/.test(file)) return false;
  const pluginRoots = [path.join(cwd, '.claude', 'plugins'), path.join(os.homedir(), '.claude', 'plugins')];
  if (pluginRoots.some((root) => isInside(file, root))) return false;
  return isInside(file, cwd);
}

function nearest(start, stop, names) {
  let dir = start;
  for (;;) {
    if (names.some((n) => fs.existsSync(path.join(dir, n)))) return dir;
    if (dir === stop || path.dirname(dir) === dir) return null;
    dir = path.dirname(dir);
  }
}

function localBin(root, name) {
  const bin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
  return fs.existsSync(bin) ? bin : null;
}

function usesPrettier(root) {
  if (PRETTIER_CONFIGS.some((n) => fs.existsSync(path.join(root, n)))) return true;
  try {
    return Boolean(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).prettier);
  } catch {
    return false;
  }
}

function makeRunner(deadline) {
  return (bin, args, cwd) => {
    const timeout = Math.min(120000, deadline - Date.now());
    if (timeout <= 1000) return { skipped: true, output: '' };
    const res = spawnSync(bin, args, { cwd, encoding: 'utf8', timeout, shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    return { status: res.status, output: `${res.stdout || ''}${res.stderr || ''}`, error: res.error };
  };
}

function groupBy(files, keyOf) {
  const groups = new Map();
  for (const file of files) {
    const key = keyOf(file);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(file);
  }
  return groups;
}

function format(files, cwd, run, report) {
  for (const [root, group] of groupBy(files, (f) => nearest(path.dirname(f), cwd, ['package.json']))) {
    const biome = fs.existsSync(path.join(root, 'biome.json')) || fs.existsSync(path.join(root, 'biome.jsonc'));
    const tool = biome ? localBin(root, 'biome') : usesPrettier(root) ? localBin(root, 'prettier') : null;
    if (!tool) continue;
    const args = biome ? ['format', '--write', ...group] : ['--write', '--log-level', 'warn', ...group];
    const res = run(tool, args, root);
    if (res.error || (res.status && res.status !== 0)) report(`format failed in ${root}:\n${res.output.trim()}`);
  }
}

function typecheck(files, cwd, run, report) {
  const tsFiles = files.filter((f) => TS.test(f));
  for (const [project, group] of groupBy(tsFiles, (f) => nearest(path.dirname(f), cwd, ['tsconfig.json']))) {
    const root = nearest(project, cwd, ['node_modules']) || project;
    const tsc = localBin(root, 'tsc');
    if (!tsc) continue;
    const res = run(tsc, ['--noEmit', '--pretty', 'false', '-p', project], project);
    if (res.skipped || res.status === 0) continue;
    const relevant = res.output.split('\n').filter((line) => group.some((f) => line.includes(path.relative(project, f))));
    if (relevant.length) report(`type errors in edited files:\n${relevant.slice(0, 30).join('\n')}`);
  }
}

function consoleLogs(files, report) {
  const hits = [];
  for (const file of files) {
    if (CONSOLE_EXEMPT.some((re) => re.test(file))) continue;
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, idx) => {
      if (/\bconsole\.log\s*\(/.test(line) && !/^\s*(\/\/|\*)/.test(line)) hits.push(`${file}:${idx + 1}`);
    });
  }
  if (hits.length) report(`console.log left in edited files:\n${hits.slice(0, 20).join('\n')}`);
}

module.exports = function stopChecks(payload) {
  const cwd = path.resolve(payload.cwd || process.cwd());
  const files = takeEditedFiles(payload.session_id).filter((f) => eligible(f, cwd));
  if (!files.length) return null;
  const report = (msg) => process.stderr.write(`[techne] ${msg}\n`);
  const run = makeRunner(Date.now() + BUDGET_MS);
  for (const step of [() => format(files, cwd, run, report), () => typecheck(files, cwd, run, report), () => consoleLogs(files, report)]) {
    try {
      step();
    } catch (err) {
      report(`stop check error: ${err.message}`);
    }
  }
  return null;
};
