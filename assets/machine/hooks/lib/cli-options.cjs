'use strict';

// Option parsing for the gated commands, close enough to git parse-options and gh pflag to tell values from flags.
const COMMIT = {
  prefix: true,
  long: {
    all: 'none', patch: 'none', interactive: 'none', include: 'none', only: 'none', 'pathspec-from-file': 'req', 'pathspec-file-nul': 'none',
    quiet: 'none', verbose: 'none', 'untracked-files': 'opt', 'dry-run': 'none', short: 'none', branch: 'none', porcelain: 'none',
    long: 'none', null: 'none', 'reuse-message': 'req', 'reedit-message': 'req', fixup: 'req', squash: 'req', 'reset-author': 'none',
    file: 'req', author: 'req', date: 'req', message: 'req', template: 'req', trailer: 'req', signoff: 'none', verify: 'none',
    'allow-empty': 'none', 'allow-empty-message': 'none', cleanup: 'req', edit: 'none', amend: 'none', 'post-rewrite': 'none',
    status: 'none', 'gpg-sign': 'opt', 'ahead-behind': 'none', help: 'none',
  },
  short: {
    a: ['all', 'none'], p: ['patch', 'none'], i: ['include', 'none'], o: ['only', 'none'], h: ['help', 'none'], n: ['no-verify', 'none'],
    m: ['message', 'req'], F: ['file', 'req'], C: ['reuse-message', 'req'], c: ['reedit-message', 'req'], t: ['template', 'req'],
    u: ['untracked-files', 'opt'], S: ['gpg-sign', 'opt'], s: ['signoff', 'none'], e: ['edit', 'none'], q: ['quiet', 'none'],
    v: ['verbose', 'none'], z: ['null', 'none'],
  },
};

const PUSH = {
  prefix: true,
  long: {
    all: 'none', branches: 'none', mirror: 'none', tags: 'none', 'follow-tags': 'none', atomic: 'none', 'dry-run': 'none',
    porcelain: 'none', delete: 'none', prune: 'none', force: 'none', 'force-with-lease': 'opt', 'force-if-includes': 'none',
    repo: 'req', 'set-upstream': 'none', thin: 'none', quiet: 'none', verbose: 'none', progress: 'none', 'recurse-submodules': 'req',
    verify: 'none', ipv4: 'none', ipv6: 'none', 'receive-pack': 'req', exec: 'req', 'push-option': 'req', signed: 'opt', help: 'none',
  },
  short: {
    v: ['verbose', 'none'], q: ['quiet', 'none'], f: ['force', 'none'], n: ['dry-run', 'none'], d: ['delete', 'none'],
    u: ['set-upstream', 'none'], 4: ['ipv4', 'none'], 6: ['ipv6', 'none'], o: ['push-option', 'req'], h: ['help', 'none'],
  },
};

const GH_PR_CREATE = {
  prefix: false,
  boolValues: true,
  long: {
    title: 'req', body: 'req', 'body-file': 'req', base: 'req', head: 'req', draft: 'none', fill: 'none', 'fill-first': 'none',
    'fill-verbose': 'none', web: 'none', editor: 'none', assignee: 'req', label: 'req', milestone: 'req', project: 'req',
    reviewer: 'req', recover: 'req', template: 'req', 'no-maintainer-edit': 'none', 'dry-run': 'none', repo: 'req', help: 'none',
  },
  short: {
    t: ['title', 'req'], b: ['body', 'req'], F: ['body-file', 'req'], B: ['base', 'req'], H: ['head', 'req'], d: ['draft', 'none'],
    f: ['fill', 'none'], w: ['web', 'none'], e: ['editor', 'none'], a: ['assignee', 'req'], l: ['label', 'req'], m: ['milestone', 'req'],
    p: ['project', 'req'], r: ['reviewer', 'req'], T: ['template', 'req'], R: ['repo', 'req'], h: ['help', 'none'],
  },
};

function resolveLong(name, spec) {
  if (spec.long[name] !== undefined) return { key: name, negated: false };
  const negated = name.startsWith('no-') ? name.slice(3) : null;
  if (negated !== null && spec.prefix && spec.long[negated] !== undefined) return { key: negated, negated: true };
  if (!spec.prefix) return { error: `unknown option --${name}` };
  const keys = Object.keys(spec.long);
  const found = keys.filter((k) => k.startsWith(name)).map((key) => ({ key, negated: false }));
  if (negated) found.push(...keys.filter((k) => k.startsWith(negated)).map((key) => ({ key, negated: true })));
  if (found.length === 1) return found[0];
  return { error: `${found.length ? 'ambiguous' : 'unknown'} option --${name}` };
}

// A value is safe only when the shell cannot split or glob it into more words.
const splits = (w) => w.glob || w.dynUnq;

/**
 * @param {{ v: string, dyn: boolean, dynUnq: boolean, dynAt: number, glob: boolean }[]} args lexed words
 * @returns {{ opts: { name: string, negated: boolean, value: string | null }[], positional: string[], error: string | null }}
 */
function parseOptions(args, spec) {
  const out = { opts: [], positional: [], error: null };
  const fail = (error) => ({ ...out, error });
  let rest = false;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const v = a.v;
    const staticPrefix = a.dyn ? a.dynAt : v.length;
    if (!rest && v === '--' && !a.dyn && !a.quoted) {
      rest = true;
      continue;
    }
    if (rest || !v.startsWith('-') || v === '-' || staticPrefix < 2) {
      if (a.dyn || a.glob) return fail(`argument "${v}" is computed at run time`);
      out.positional.push(v);
      continue;
    }
    if (v.startsWith('--')) {
      const eq = v.indexOf('=');
      if (a.dyn && (eq === -1 || staticPrefix <= eq)) return fail(`option "${v}" is computed at run time`);
      const r = resolveLong(eq === -1 ? v.slice(2) : v.slice(2, eq), spec);
      if (r.error) return fail(r.error);
      const type = r.negated ? 'none' : spec.long[r.key];
      let value = null;
      if (eq !== -1) {
        if (type === 'none' && !spec.boolValues) return fail(`--${r.key} takes no value`);
        if (a.dynUnq || a.glob) return fail(`the value of --${r.key} can split into more words`);
        value = v.slice(eq + 1);
      } else if (type === 'req') {
        i += 1;
        if (!args[i]) return fail(`--${r.key} needs a value`);
        if (splits(args[i])) return fail(`the value of --${r.key} can split into more words`);
        value = args[i].v;
      }
      out.opts.push({ name: r.key, negated: r.negated, value });
      continue;
    }
    for (let k = 1; k < v.length; k += 1) {
      if (a.dyn && staticPrefix <= k) return fail(`option "${v}" is computed at run time`);
      const def = spec.short[v[k]];
      if (!def) return fail(`unknown option -${v[k]}`);
      const [name, type] = def;
      if (type === 'none') {
        out.opts.push({ name, negated: false, value: null });
        continue;
      }
      let value = v.slice(k + 1);
      if (value && (a.dynUnq || a.glob)) return fail(`the value of -${v[k]} can split into more words`);
      if (!value && type === 'req') {
        i += 1;
        if (!args[i]) return fail(`-${v[k]} needs a value`);
        if (splits(args[i])) return fail(`the value of -${v[k]} can split into more words`);
        value = args[i].v;
      }
      out.opts.push({ name, negated: false, value: value || null });
      break;
    }
  }
  return out;
}

const has = (parsed, ...names) => parsed.opts.some((o) => names.includes(o.name) && !o.negated);

module.exports = { parseOptions, has, COMMIT, PUSH, GH_PR_CREATE };
