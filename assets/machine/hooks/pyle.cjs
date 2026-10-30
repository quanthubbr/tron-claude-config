#!/usr/bin/env node
'use strict';

// Pre-exec shell gate: pyle.cjs <auto|commit|pr|push> [--adapter <id>]. Node builtins + ./lib only.
const { spawnSync } = require('child_process');

// A half-updated or broken runtime must still block git/gh: Windsurf, for one, only blocks on exit 2.
let payload, token, repoRoot, gitEnv, gitOut, analyze, isolationProblem, redirectionProblem;
let parseOptions, has, COMMIT, PUSH, GH_PR_CREATE, validatePrCreate, prFields;
let loadError = null;
try {
  payload = require('./lib/payload.cjs');
  token = require('./lib/token.cjs');
  ({ repoRoot, gitEnv, gitOut } = require('./lib/paths.cjs'));
  ({ analyze, isolationProblem, redirectionProblem } = require('./lib/shell.cjs'));
  ({ parseOptions, has, COMMIT, PUSH, GH_PR_CREATE } = require('./lib/cli-options.cjs'));
  ({ validatePrCreate, prFields } = require('./lib/pr-template-validate.cjs'));
} catch (err) {
  loadError = err;
}

const MODES = ['commit', 'pr', 'push'];
const PROTECTED = /^(main|master)$/;
const GATED_WORD = /commit|push|\bpr\b[\s\S]*\b(create|new)\b/i;
const GIT_WORD = /\bgit\b|\bgh\b/;
const DISPLAY = { commit: 'git commit', push: 'git push', pr: 'gh pr create' };
const STAGING = ['all', 'patch', 'interactive', 'include', 'only', 'pathspec-from-file'];
// Tool hooks time out (Copilot defaults to 30 s): probe + scan stay well under that, and a timeout denies.
const GITLEAKS_TIMEOUT_MS = 20000;
const GITLEAKS_PROBE_MS = 5000;

const TOKEN_REASONS = {
  commit: {
    none: 'no commit token for this repo',
    expired: 'the commit token expired (15 min)',
    mismatch: 'the staged changes differ from what was reviewed',
    invalid: 'the commit token is unreadable',
  },
  push: {
    none: 'no push token for this repo',
    expired: 'the push token expired (15 min)',
    mismatch: 'the commit being pushed is not the one the push token was minted for',
    invalid: 'the push token is unreadable',
  },
};

function denyText(mode, why) {
  if (mode === 'commit') return `exonous: git commit blocked — ${why}. Run \`exonous workflow commit\`, follow it (review), then \`exonous token commit\` and retry.`;
  if (mode === 'push') return `exonous: git push blocked — ${why}. Run \`exonous workflow commit\`, review, then \`exonous token push\` and retry.`;
  return `exonous: gh pr create blocked — ${why}. Run \`exonous workflow pr\`, review, then retry.`;
}

// ── Commit ───────────────────────────────────────────────────────────────────

// Case-insensitive: macOS and Windows resolve .GITLEAKS.toml as the config gitleaks reads.
const GITLEAKS_SPEC = ':(glob,icase)**/.gitleaks*';
const isGitleaksFile = (rel) => !rel.endsWith('/') && /^\.gitleaks/i.test(rel.split('/').pop());

// Tracked changes from status; untracked and ignored files one by one from ls-files, which (unlike status --ignored)
// never collapses an ignored directory into a single entry.
function gitleaksConfigChanged(root) {
  const tracked = gitOut(root, ['status', '--porcelain=v1', '-z', '--untracked-files=no', '--', GITLEAKS_SPEC]);
  const others = gitOut(root, ['ls-files', '-z', '--others', '--', GITLEAKS_SPEC]);
  if (tracked === null || others === null) return 'git could not report the gitleaks config state';
  // -z entries are "XY path"; a rename or copy is followed by its original path as a bare entry.
  const changed = [];
  const tokens = tracked.split('\0');
  for (let i = 0; i < tokens.length; i++) {
    if (!tokens[i]) continue;
    changed.push(tokens[i].slice(3));
    if (/^[RC]/.test(tokens[i])) changed.push(tokens[++i] || '');
  }
  const files = [...new Set([...changed, ...others.split('\0')])].filter((rel) => rel && isGitleaksFile(rel));
  return files.length ? `the gitleaks config differs from HEAD (${files.join(', ')}); a human must commit it` : null;
}

function allowCommentStaged(root) {
  const diff = gitOut(root, ['diff', '--cached', '-U0', '--no-color', '--no-ext-diff', '--no-textconv']);
  if (diff === null) return 'git could not read the staged diff';
  const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++ '));
  return added.some((l) => l.includes('gitleaks:allow')) ? 'a staged line adds a `gitleaks:allow` comment; a human must commit it' : null;
}

function scanStaged(cwd, warnings) {
  const root = repoRoot(cwd);
  const tampered = gitleaksConfigChanged(root) || allowCommentStaged(root);
  if (tampered) return tampered;
  const run = (args, timeout = GITLEAKS_TIMEOUT_MS) => spawnSync('gitleaks', args, { cwd: root, env: gitEnv(), encoding: 'utf8', timeout });
  // Older gitleaks lacks the flag; the staged-diff check above covers it then.
  const help = run(['git', '--help'], GITLEAKS_PROBE_MS);
  const args = ['git', '--staged', '--redact', '--no-banner'];
  if (!help.error && `${help.stdout}${help.stderr}`.includes('--ignore-gitleaks-allow')) args.push('--ignore-gitleaks-allow');
  const res = help.error && help.error.code === 'ENOENT' ? help : run(args);
  if (res.error && res.error.code === 'ENOENT') {
    warnings.push('exonous: gitleaks not installed — staged content was NOT scanned for secrets (https://github.com/gitleaks/gitleaks#installing).');
    return null;
  }
  if (res.status === 0 && !res.error && !res.signal) return null;
  const detail = `${res.stdout || ''}${res.stderr || ''}`.split('\n').filter((l) => l.trim()).slice(0, 15).join('\n');
  const how = res.error ? res.error.message : res.signal ? `killed by ${res.signal}` : `exit ${res.status}`;
  return `gitleaks did not pass the staged changes (${how}); remove any secret and re-stage, or allowlist a false positive in a separately reviewed commit${detail ? `:\n${detail}\n` : ''}`;
}

function checkCommit(call, { warnings }) {
  const parsed = parseOptions(call.args, COMMIT);
  if (parsed.error) return `cannot verify its options: ${parsed.error}`;
  if (has(parsed, 'help', 'dry-run')) return null;
  if (has(parsed, ...STAGING) || parsed.positional.length) {
    return 'commits that stage at commit time (-a, -i, -o, -p, pathspecs) are not covered by the token; stage with `git add`, mint the token, then run a plain `git commit`';
  }
  const state = token.verify('commit', call.cwd);
  if (!state.ok) return TOKEN_REASONS.commit[state.reason];
  const leak = scanStaged(call.cwd, warnings);
  if (leak) return leak;
  const claimed = token.consume('commit', call.cwd);
  return claimed.ok ? null : TOKEN_REASONS.commit[claimed.reason];
}

// ── Push ─────────────────────────────────────────────────────────────────────

function currentBranch(cwd) {
  return (gitOut(cwd, ['branch', '--show-current']) || '').trim();
}

/** dst null = destination unresolved, treated as protected. @returns {{ force: boolean, all: boolean, pushes: { src: string | null, dst: string | null }[] }} */
function pushPlan(parsed, cwd) {
  const force = has(parsed, 'force', 'force-with-lease', 'force-if-includes', 'mirror');
  let all = has(parsed, 'all', 'branches', 'mirror', 'prune');
  const deleting = has(parsed, 'delete');
  const refspecs = parsed.opts.some((o) => o.name === 'repo') ? parsed.positional : parsed.positional.slice(1);
  const branch = currentBranch(cwd);
  const upstream = () => {
    const out = gitOut(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{push}']);
    return out && out.trim() ? out.trim().replace(/^[^/]+\//, '') : null;
  };
  const short = (ref) => {
    const name = ref.replace(/^refs\/heads\//, '');
    return name === 'HEAD' ? branch : name;
  };
  if (!refspecs.length) return { force, all, pushes: all ? [] : [{ src: 'HEAD', dst: upstream() }] };
  const pushes = refspecs.map((raw) => {
    const spec = raw.replace(/^\+/, '');
    if (spec.includes('*') || spec === ':') all = true;
    if (deleting) return { src: null, dst: short(spec) };
    const colon = spec.indexOf(':');
    if (colon === -1) return { src: spec, dst: short(spec) };
    const src = spec.slice(0, colon);
    return { src: src || null, dst: short(spec.slice(colon + 1) || src) };
  });
  return { force: force || refspecs.some((r) => r.startsWith('+')), all, pushes };
}

function checkPush(call) {
  const override = call.configs.find((k) => /^(push|remote|branch)\./i.test(k));
  if (override) return `inline \`-c ${override}\` changes where the push goes`;
  const parsed = parseOptions(call.args, PUSH);
  if (parsed.error) return `cannot verify its options: ${parsed.error}`;
  if (has(parsed, 'help', 'dry-run')) return null;
  const plan = pushPlan(parsed, call.cwd);
  const guarded = plan.pushes.find((p) => p.dst === null || PROTECTED.test(p.dst));
  const target = plan.all ? 'every branch' : guarded && (guarded.dst || 'an upstream that cannot be resolved');
  if (!plan.force && !target) return null;
  const what = plan.force ? 'force-push' : `push to ${target}`;
  if (plan.all) return `${plan.force ? 'force-push' : 'push'} touches every branch; push one branch at a time`;
  const deleted = plan.pushes.find((p) => p.src === null);
  if (deleted) return `deleting ${deleted.dst} needs a human`;
  const shas = plan.pushes.map((p) => (gitOut(call.cwd, ['rev-parse', '--verify', '--end-of-options', `${p.src}^{commit}`]) || '').trim());
  const missing = plan.pushes.find((p, i) => !shas[i]);
  if (missing) {
    const branch = missing.src && !/[~^:@]|^HEAD$/.test(missing.src) ? missing.src.replace(/^refs\/heads\//, '') : null;
    return branch
      ? `there is no local branch "${branch}" to push (${what}); push the branch you mean, e.g. \`git push origin HEAD:${missing.dst}\`, after review`
      : `cannot resolve what ${what} would send`;
  }
  const state = token.verify('push', call.cwd, shas);
  if (!state.ok) return `${what} needs review; ${TOKEN_REASONS.push[state.reason]}`;
  const claimed = token.consume('push', call.cwd, shas);
  return claimed.ok ? null : `${what} needs review; ${TOKEN_REASONS.push[claimed.reason]}`;
}

// ── PR ───────────────────────────────────────────────────────────────────────

function checkPr(call) {
  const parsed = parseOptions(call.args, GH_PR_CREATE);
  if (parsed.error) return `cannot verify its options: ${parsed.error}`;
  if (has(parsed, 'help')) return null;
  if (parsed.positional.length) return `unexpected argument "${parsed.positional[0]}"`;
  const result = validatePrCreate(prFields(parsed), call.cwd);
  return result.ok ? null : result.reason.replace(/\.$/, '');
}

// ── Gate ─────────────────────────────────────────────────────────────────────

/** @returns {{ allow: boolean, reason?: string, warnings: string[] }} */
function gate(mode, { command, cwd }) {
  const warnings = [];
  const result = analyze(command, cwd);
  const deny = (why) => ({ allow: false, reason: denyText(mode, why), warnings });
  if (result.forced.length) return deny(result.forced[0]);
  const gatedWord = GATED_WORD.test(command) || result.words.some((w) => GATED_WORD.test(w));
  const gitWord = GIT_WORD.test(command);
  // Computed names are fine for ordinary tools; near git/gh or with computed arguments they could be anything.
  if (result.dynamicHeads.some((h) => !h.argsStatic) || (result.dynamicHeads.length && (gitWord || gatedWord))) return deny('a command name is computed at run time');
  if (result.dynamicScripts.length && (gitWord || gatedWord)) return deny(result.dynamicScripts[0]);
  const call = result.calls.find((c) => c.kind === mode);
  if (!call) return gatedWord && result.notes.length ? deny(`${result.notes[0]} on a line that mentions a gated command`) : { allow: true, warnings };
  const alone = isolationProblem(result, call);
  if (alone) return deny(`run \`${DISPLAY[mode]}\` alone (optionally after one \`cd <dir> &&\`): ${alone}`);
  if (result.notes.length) return deny(result.notes[0]);
  const redirected = redirectionProblem(call);
  if (redirected) return deny(redirected);
  let reason;
  try {
    if (mode === 'commit') reason = checkCommit(call, { warnings });
    else if (mode === 'push') reason = checkPush(call);
    else reason = checkPr(call);
  } catch (err) {
    reason = `the gate could not verify this command (${err.message})`;
  }
  return reason ? deny(reason) : { allow: true, warnings };
}

/** First deny across modes wins; one hook entry can gate commit, push and pr. */
function gateAll(modes, input) {
  const warnings = [];
  for (const mode of modes) {
    const result = gate(mode, input);
    warnings.push(...result.warnings);
    if (!result.allow) return { ...result, warnings };
  }
  return { allow: true, warnings };
}

// ── Entry ────────────────────────────────────────────────────────────────────

const mentionsGit = (raw) => raw.includes('git') || raw.includes('gh');

function option(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1] || null;
}

function finish({ code, stdout, stderr }) {
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  process.exitCode = code;
}

function failClosed(adapter, raw, why) {
  if (!mentionsGit(raw)) return finish(payload.allow(adapter, [`exonous: ${why} — command not checked.`]));
  return finish(payload.deny(adapter, `exonous: blocked — ${why}, and the input mentions git or gh. Run the command again on its own line.`));
}

function main(argv) {
  const mode = argv[0];
  const adapter = option(argv, '--adapter') || 'claude';
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('error', () => failClosed(adapter, raw, 'hook input was unreadable'));
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    try {
      if (mode !== 'auto' && !MODES.includes(mode)) return failClosed(adapter, raw, `unknown gate mode "${mode}"`);
      const input = payload.parse(adapter, raw);
      if (!input) return failClosed(adapter, raw, 'hook input had no shell command');
      const result = gateAll(mode === 'auto' ? MODES : [mode], input);
      const warn = result.warnings.map((w) => `${w}\n`).join('');
      if (result.allow) return finish(payload.allow(adapter, result.warnings));
      const out = payload.deny(adapter, result.reason);
      return finish({ ...out, stderr: `${warn}${out.stderr}` });
    } catch (err) {
      return failClosed(adapter, raw, `gate error (${err.message})`);
    }
  });
}

/** No libs available: deny anything that mentions git or gh with exit 2 (the one block signal every tool honors). */
function loadFailure(err) {
  let raw = '';
  const done = () => {
    if (!GIT_WORD.test(raw)) return;
    process.stderr.write(`exonous: blocked — the gate could not load (${err.message}); run \`exonous install\` or \`exonous doctor\`.\n`);
    process.exitCode = 2;
  };
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', done);
  process.stdin.on('error', done);
}

if (require.main === module) {
  if (loadError) loadFailure(loadError);
  else {
    try {
      main(process.argv.slice(2));
    } catch (err) {
      loadFailure(err);
    }
  }
}

module.exports = { gate, gateAll, pushPlan };
