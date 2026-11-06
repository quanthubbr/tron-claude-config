#!/usr/bin/env node
// ui-design — runs the bundled design engine with exonous defaults: no telemetry, no self-update, rebranded agent-facing output.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BLOCKED = new Set(['update', 'check', 'install', 'link', 'skills']);
const HELP = new Set(['help', '--help', '-h']);
const BUFFERED = new Set(['context', 'doctor', 'hooks', 'hook', 'hook-before-edit', 'detect', 'signals', 'surface-brief', 'pin']);

// Substitutions only: hook verbs print single-line JSON, so nothing here may delete a line or add quotes.
export function rename(text) {
  return text
    .replace(/\[impeccable@[0-9]*\]/g, '[ui-design]')
    .replace(/([ `"(])\/impeccable([ `"):.,])/g, '$1/ui-design$2')
    .replace(/([ `"(])\/impeccable$/gm, '$1/ui-design')
    .replace(/Impeccable's/g, "ui-design's")
    .replace(/Impeccable/g, 'ui-design');
}

export function dropUpstreamPointers(text) {
  return text.split('\n').filter((line) => !line.includes('npx impeccable') && !line.includes('impeccable.style')).join('\n');
}

export function helpText(dir, skillDir) {
  const metadata = JSON.parse(fs.readFileSync(path.join(dir, 'command-metadata.json'), 'utf8'));
  const rows = Object.entries(metadata)
    .filter(([cmd, entry]) => !cmd.startsWith('craft') && typeof entry?.description === 'string')
    .map(([cmd, entry]) => `  /${cmd.padEnd(12)} ${entry.description}`);
  return [
    `ui-design — design commands (/ui-design <command> [target]); full routing in ${skillDir}/SKILL.md`,
    '',
    ...rows,
    '',
    'Engine verbs: context, detect, hooks, doctor, live, ... (see SKILL.md)',
    '',
  ].join('\n');
}

/** One cmd.exe argument; % and " cannot be escaped safely through a batch file's %*, so they are refused. */
export function cmdQuote(value) {
  const text = String(value);
  if (/[%"\r\n]/.test(text)) throw new Error(`cannot pass ${JSON.stringify(text)} to the engine on Windows: it contains %, " or a line break`);
  return `"${text.replace(/(\\+)$/, '$1$1')}"`;
}

function integrityError(message) {
  return Object.assign(new Error(`engine integrity: ${message}; reinstall exonous or set IMPECCABLE_BIN to an explicitly trusted engine`), { code: 127 });
}

export function engineManifest(dir) {
  try {
    const version = fs.readFileSync(path.join(dir, 'VERSION'), 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
    const lines = fs.readFileSync(path.join(dir, 'ENGINE-CHECKSUMS'), 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
    if (version !== '0.1.5' || lines.shift() !== `version ${version}`) throw new Error('version mismatch');
    const hashes = new Map();
    for (const line of lines) {
      const match = line.match(/^([a-f0-9]{64})  (impeccable-(?:darwin|linux)-(?:arm64|x64)|impeccable-windows-x64\.exe)$/);
      if (!match || hashes.has(match[2])) throw new Error('invalid or duplicate asset');
      hashes.set(match[2], match[1]);
    }
    if (!hashes.size) throw new Error('missing assets');
    return hashes;
  } catch (error) {
    throw integrityError(`invalid manifest: ${error.message}`);
  }
}

export function windowsEngine(dir, env = process.env) {
  if (Object.hasOwn(env, 'IMPECCABLE_BIN')) {
    if (env.IMPECCABLE_BIN && fs.statSync(env.IMPECCABLE_BIN, { throwIfNoEntry: false })?.isFile()) return env.IMPECCABLE_BIN;
    throw integrityError('invalid IMPECCABLE_BIN override');
  }
  const expected = engineManifest(dir).get('impeccable-windows-x64.exe');
  if (!expected) throw integrityError('manifest missing Windows x64 hash');
  const cacheRoot = env.IMPECCABLE_HOME || (env.USERPROFILE && path.join(env.USERPROFILE, '.impeccable'));
  const candidates = [
    path.join(dir, 'bin', 'windows-x64', 'impeccable.exe'),
    env.USERPROFILE && path.join(env.USERPROFILE, '.impeccable', 'bin', 'impeccable.exe'),
    cacheRoot && path.join(cacheRoot, 'bin', '0.1.5', 'impeccable.exe'),
    ...(env.PATH || '').split(path.delimiter).filter(Boolean).map((entry) => path.join(entry, 'impeccable.exe')),
  ];
  for (const file of candidates.filter(Boolean)) {
    if (!fs.existsSync(file)) continue;
    if (!fs.statSync(file).isFile() || createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== expected) throw integrityError(`checksum mismatch: ${file}`);
    return file;
  }
  return null;
}

export function engineCommand(dir, args, platform = process.platform, env = process.env) {
  if (platform === 'win32') {
    const exe = windowsEngine(dir, env);
    if (exe) return { command: exe, args, options: {} };
    return { command: [path.join(dir, 'impeccable.cmd'), ...args].map(cmdQuote).join(' '), args: [], options: { shell: true } };
  }
  return { command: 'sh', args: [path.join(dir, 'impeccable'), ...args], options: {} };
}

function exitCode({ status, signal }) {
  return signal ? 128 + (os.constants.signals[signal] ?? 0) : status ?? 1;
}

function fail(message, code) {
  process.stderr.write(`ui-design: ${message}\n`);
  process.exit(code);
}

export function main(args = process.argv.slice(2), platform = process.platform, dir = path.dirname(fileURLToPath(import.meta.url))) {
  const engine = path.join(dir, platform === 'win32' ? 'impeccable.cmd' : 'impeccable');
  const skillDir = process.env.IMPECCABLE_SKILL_DIR || path.dirname(dir);
  Object.assign(process.env, {
    IMPECCABLE_SKILL_DIR: skillDir,
    IMPECCABLE_SELF: path.join(dir, platform === 'win32' ? 'ui-design.mjs' : 'ui-design'),
    IMPECCABLE_NO_UPDATE_CHECK: '1',
    IMPECCABLE_NO_TELEMETRY: '1',
    DO_NOT_TRACK: '1',
  });

  if (!fs.existsSync(engine)) fail(`engine launcher missing at ${engine} (reinstall exonous)`, 127);
  const verb = args[0] ?? '';
  if (BLOCKED.has(verb)) fail('engine updates are managed by exonous (maintainers: npm run pege:watch).', 2);
  if (HELP.has(verb)) {
    process.stdout.write(helpText(dir, skillDir));
    process.exit(0);
  }

  let run;
  try {
    run = engineCommand(dir, args, platform);
  } catch (error) {
    fail(error.message, error.code === 127 ? 127 : 2);
  }

  if (BUFFERED.has(verb)) {
    const result = spawnSync(run.command, run.args, { ...run.options, stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    if (result.error) fail(`cannot run the engine: ${result.error.message}`, 127);
    const out = verb === 'hook' || verb === 'hook-before-edit' ? result.stdout : dropUpstreamPointers(result.stdout);
    process.stdout.write(rename(out));
    process.exitCode = exitCode(result);
    return;
  }

  const child = spawn(run.command, run.args, { ...run.options, stdio: 'inherit' });
  const forward = (signal) => child.kill(signal);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, forward);
  child.on('error', (error) => fail(`cannot run the engine: ${error.message}`, 127));
  child.on('exit', (status, signal) => process.exit(exitCode({ status, signal })));
}

const invoked = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main(process.argv.slice(2), process.platform, path.dirname(path.resolve(process.argv[1])));
