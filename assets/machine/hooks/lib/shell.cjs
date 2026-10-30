'use strict';

// Static shell-line analysis for the gates: finds git commit/push and gh pr create, and flags what it cannot resolve.
const fs = require('fs');
const path = require('path');
const { home, gitOut } = require('./paths.cjs');

const MAX_DEPTH = 4;
const RESERVED = new Set(['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'do', 'done', 'case', 'esac', 'select', 'function', '{', '}', '!', '[[', ']]', 'coproc']);
const WRAPPERS = {
  time: [], nohup: [], command: [], builtin: [], exec: ['-a'], nice: ['-n'], ionice: ['-c', '-n', '-t'], stdbuf: ['-i', '-o', '-e'],
  caffeinate: ['-t', '-w'], timeout: ['-s', '-k', '--signal', '--kill-after'], chrt: [], taskset: [], unbuffer: [],
  sudo: ['-u', '-g', '-C', '-D', '-h', '-p', '-r', '-t', '-U'], doas: ['-u', '-C'],
};
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'mksh', 'ash', 'fish']);
const ENV_MUTATORS = new Set(['export', 'declare', 'typeset', 'readonly', 'local', 'set', 'unset', 'alias', 'unalias', 'source', '.', 'shopt', 'enable', 'hash']);
const INDIRECT = new Set(['xargs', 'parallel', 'watch', 'ssh', 'su', 'runuser', 'flock', 'sg', 'chroot', 'nsenter', 'unshare', 'setsid', 'strace', 'ltrace', 'gdb', 'dbus-run-session', 'busybox', 'sem']);
const PRINTERS = new Set(['cat', 'printf', 'echo']);
const INTERPRETERS = /^(python[\d.]*|node|nodejs|deno|bun|perl|ruby|php|lua|osascript|pwsh|powershell|tclsh|awk|gawk|jq)$/;
const GIT_BUILTINS = new Set(`add am annotate apply archive bisect blame branch bugreport bundle cat-file check-attr check-ignore check-mailmap
check-ref-format checkout checkout-index cherry cherry-pick citool clean clone column commit commit-graph commit-tree config count-objects
credential describe diagnose diff diff-files diff-index diff-tree difftool fast-export fast-import fetch fetch-pack filter-branch fmt-merge-msg
for-each-ref for-each-repo format-patch fsck gc get-tar-commit-id grep gui hash-object help hook index-pack init instaweb interpret-trailers
log ls-files ls-remote ls-tree mailinfo mailsplit maintenance merge merge-base merge-file merge-index merge-tree mergetool mktag mktree
multi-pack-index mv name-rev notes pack-objects pack-redundant pack-refs patch-id prune prune-packed pull push range-diff read-tree rebase
reflog remote repack replace replay request-pull rerere reset restore rev-list rev-parse revert rm send-email send-pack shortlog show
show-branch show-index show-ref sparse-checkout stash status stripspace submodule switch symbolic-ref tag unpack-file unpack-objects
update-index update-ref update-server-info var verify-commit verify-pack verify-tag version whatchanged worktree write-tree lfs`.split(/\s+/));
const GH_COMMANDS = new Set(`agent-task alias api attestation auth browse cache codespace completion config copilot extension gist gpg-key help
issue label org pr preview project release repo ruleset run search secret ssh-key status variable version workflow`.split(/\s+/));

// ── Lexer ────────────────────────────────────────────────────────────────────

function newWord() {
  return { t: 'w', v: '', unq: '', dyn: false, dynUnq: false, dynAt: -1, dynEnd: -1, glob: false, quoted: false, subs: [] };
}

function markDyn(w, quoted) {
  if (!w.dyn) w.dynAt = w.v.length;
  w.dyn = true;
  if (!quoted) w.dynUnq = true;
}

function heredocDelim(text, i) {
  let j = i;
  if (text[j] === '-') j += 1;
  while (text[j] === ' ' || text[j] === '\t') j += 1;
  const m = /^(?:'([^']*)'|"([^"]*)"|\\?([^\s;&|<>()'"]+))/.exec(text.slice(j));
  if (!m) return null;
  return { delim: m[1] ?? m[2] ?? m[3], quoted: m[1] !== undefined || m[2] !== undefined || m[0].startsWith('\\'), end: j + m[0].length };
}

function skipHeredocBody(text, i, delim) {
  let j = i;
  const lines = [];
  while (j < text.length) {
    const eol = text.indexOf('\n', j);
    const line = text.slice(j, eol === -1 ? text.length : eol);
    j = eol === -1 ? text.length : eol + 1;
    if (line.replace(/^\t+/, '') === delim) return { body: lines.join('\n'), end: j, closed: true };
    lines.push(line);
  }
  return { body: lines.join('\n'), end: j, closed: false };
}

/** Index just past the matching close; heredoc bodies and quotes do not count. */
function readNested(text, start, open, close) {
  let depth = 1;
  let j = start;
  let quote = null;
  const pending = [];
  while (j < text.length) {
    const ch = text[j];
    if (quote) {
      if (ch === '\\' && quote === '"') j += 1;
      else if (ch === quote) quote = null;
      j += 1;
      continue;
    }
    if (ch === '\\') {
      j += 2;
      continue;
    }
    if (ch === '\n' && pending.length) {
      j += 1;
      for (const delim of pending.splice(0)) j = skipHeredocBody(text, j, delim).end;
      continue;
    }
    if (open !== close && ch === '<' && text[j + 1] === '<' && text[j + 2] !== '<') {
      const h = heredocDelim(text, j + 2);
      if (h) {
        pending.push(h.delim);
        j = h.end;
        continue;
      }
    }
    if (open !== close && (ch === '"' || ch === "'")) quote = ch;
    else if (ch === open && open !== close) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (!depth) return { inner: text.slice(start, j), end: j + 1, closed: true };
    }
    j += 1;
  }
  return { inner: text.slice(start), end: text.length, closed: false };
}

/** @returns {{ tokens: object[], notes: string[] }} */
function lex(text) {
  const tokens = [];
  const notes = [];
  const pending = [];
  let w = null;
  const word = () => {
    if (!w) w = newWord();
    return w;
  };
  const end = () => {
    if (!w) return;
    if (/\{[^{}]*(,|\.\.)[^{}]*\}/.test(w.unq)) w.glob = true;
    tokens.push(w);
    w = null;
  };
  const op = (v) => {
    end();
    tokens.push({ t: 'op', v });
  };
  const nested = (start, open, close, quoted) => {
    const r = readNested(text, start, open, close);
    if (!r.closed) notes.push('an unterminated command substitution');
    const wd = word();
    markDyn(wd, quoted);
    wd.subs.push(r.inner);
    return r.end;
  };

  function readDollar(i, quoted) {
    const nx = text[i + 1];
    const wd = word();
    if (nx === '(') {
      const end2 = nested(i + 2, '(', ')', quoted);
      wd.v += text.slice(i, end2);
      wd.dynEnd = wd.v.length;
      return end2;
    }
    if (nx === '{') {
      const r = readNested(text, i + 2, '{', '}');
      markDyn(wd, quoted);
      if (/\$\(|`|<\(/.test(r.inner)) wd.subs.push(r.inner.replace(/^[^$`<]*/, ''));
      wd.v += text.slice(i, r.end);
      wd.dynEnd = wd.v.length;
      return r.end;
    }
    if (nx === "'" && !quoted) {
      let j = i + 2;
      while (j < text.length && text[j] !== "'") j += text[j] === '\\' ? 2 : 1;
      markDyn(wd, false);
      wd.v += text.slice(i, j + 1);
      wd.dynEnd = wd.v.length;
      return j + 1;
    }
    if (nx === '"' && !quoted) {
      markDyn(wd, true);
      const after = readDouble(i + 2);
      wd.dynEnd = wd.v.length;
      return after;
    }
    const m = /^(?:[A-Za-z_][A-Za-z0-9_]*|[0-9?#@*!$-])/.exec(text.slice(i + 1));
    if (m) {
      markDyn(wd, quoted);
      wd.v += `$${m[0]}`;
      wd.dynEnd = wd.v.length;
      return i + 1 + m[0].length;
    }
    wd.v += '$';
    if (!quoted) wd.unq += '$';
    return i + 1;
  }

  function readDouble(start) {
    const wd = word();
    wd.quoted = true;
    let i = start;
    while (i < text.length && text[i] !== '"') {
      const ch = text[i];
      if (ch === '\\' && i + 1 < text.length) {
        const nx = text[i + 1];
        if (nx === '\n') {
          i += 2;
        } else {
          wd.v += '$`"\\'.includes(nx) ? nx : `\\${nx}`;
          i += 2;
        }
      } else if (ch === '$') {
        i = readDollar(i, true);
      } else if (ch === '`') {
        const end2 = nested(i + 1, '`', '`', true);
        wd.v += text.slice(i, end2);
        wd.dynEnd = wd.v.length;
        i = end2;
      } else {
        wd.v += ch;
        i += 1;
      }
    }
    if (i >= text.length) notes.push('an unterminated quote');
    return i + 1;
  }

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const nx = text[i + 1];
    if (ch === '\n') {
      op('\n');
      i += 1;
      for (const tok of pending.splice(0)) {
        const body = skipHeredocBody(text, i, tok.heredoc.delim);
        if (!body.closed) notes.push('an unterminated heredoc');
        tok.heredoc.body = body.body;
        if (!tok.heredoc.quoted && /\$\(|`/.test(body.body)) tok.heredoc.expands = true;
        i = body.end;
      }
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      end();
      i += 1;
    } else if (ch === '#' && !w) {
      while (i < text.length && text[i] !== '\n') i += 1;
    } else if (ch === '&' && nx === '&') {
      op('&&');
      i += 2;
    } else if (ch === '|' && nx === '|') {
      op('||');
      i += 2;
    } else if (ch === ';' && (nx === ';' || nx === '&')) {
      op(`;${nx}`);
      i += 2;
    } else if (ch === '|' && nx === '&') {
      op('|&');
      i += 2;
    } else if ((ch === '<' || ch === '>') && nx === '(') {
      const end2 = nested(i + 2, '(', ')', false);
      word().v += text.slice(i, end2);
      w.dynEnd = w.v.length;
      i = end2;
    } else if (ch === '&' && nx === '>') {
      end();
      i += text[i + 2] === '>' ? 3 : 2;
      tokens.push({ t: 'r', v: '&>' });
    } else if (ch === '<' || ch === '>') {
      if (w && /^\d+$/.test(w.v) && !w.quoted && !w.dyn) w = null;
      else end();
      if (ch === '<' && nx === '<' && text[i + 2] === '<') {
        tokens.push({ t: 'r', v: '<<<' });
        i += 3;
        continue;
      }
      if (ch === '<' && nx === '<') {
        const h = heredocDelim(text, i + 2);
        const tok = { t: 'r', v: '<<', heredoc: { delim: h ? h.delim : '', quoted: h ? h.quoted : false, body: '', expands: false } };
        if (!h) notes.push('an unreadable heredoc');
        tokens.push(tok);
        pending.push(tok);
        i = h ? h.end : i + 2;
        continue;
      }
      let v = ch;
      i += 1;
      if (text[i] === '>' || text[i] === '&' || text[i] === '|' || (ch === '<' && text[i] === '>')) {
        v += text[i];
        i += 1;
      }
      const dup = v.endsWith('&') ? /^(\d+|-)/.exec(text.slice(i)) : null;
      if (dup) i += dup[0].length;
      tokens.push({ t: 'r', v, dup: Boolean(dup) });
    } else if (';&|()'.includes(ch)) {
      op(ch);
      i += 1;
    } else if (ch === "'") {
      const wd = word();
      wd.quoted = true;
      const e = text.indexOf("'", i + 1);
      if (e === -1) notes.push('an unterminated quote');
      wd.v += text.slice(i + 1, e === -1 ? text.length : e);
      i = e === -1 ? text.length : e + 1;
    } else if (ch === '"') {
      i = readDouble(i + 1);
    } else if (ch === '\\') {
      if (nx !== '\n') {
        const wd = word();
        wd.quoted = true;
        wd.v += nx ?? '';
      }
      i += 2;
    } else if (ch === '`') {
      const end2 = nested(i + 1, '`', '`', false);
      word().v += text.slice(i, end2);
      w.dynEnd = w.v.length;
      i = end2;
    } else if (ch === '$') {
      i = readDollar(i, false);
    } else {
      const wd = word();
      if ('*?['.includes(ch)) wd.glob = true;
      wd.v += ch;
      wd.unq += ch;
      i += 1;
    }
  }
  end();
  if (pending.length) notes.push('an unterminated heredoc');
  return { tokens, notes };
}

// ── Simple commands ──────────────────────────────────────────────────────────

const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)(\[[^\]]*\])?\+?=/;

function commands(tokens) {
  const cmds = [];
  const ops = [];
  let cur = null;
  const blank = () => ({ words: [], assigns: [], redirs: [] });
  cur = blank();
  const flush = () => {
    if (cur.words.length || cur.assigns.length || cur.redirs.length) cmds.push(cur);
    cur = blank();
  };
  for (let k = 0; k < tokens.length; k += 1) {
    const tk = tokens[k];
    if (tk.t === 'op') {
      flush();
      ops.push({ v: tk.v, after: cmds.length - 1 });
    } else if (tk.t === 'r') {
      const r = { op: tk.v, heredoc: tk.heredoc || null, target: null };
      if (!tk.dup && !tk.heredoc && tokens[k + 1] && tokens[k + 1].t === 'w') {
        k += 1;
        r.target = tokens[k];
      }
      cur.redirs.push(r);
    } else if (!cur.words.length && ASSIGNMENT.test(tk.unq) && tk.v.startsWith(ASSIGNMENT.exec(tk.unq)[1])) {
      cur.assigns.push(tk);
    } else {
      cur.words.push(tk);
    }
  }
  flush();
  return { cmds, ops };
}

const subsOf = (cmd) => [...cmd.words, ...cmd.assigns, ...cmd.redirs.map((r) => r.target).filter(Boolean)].flatMap((w) => w.subs);
const commandName = (word) => path.basename(word).replace(/\.exe$/i, '');

// `$HOME/bin/tool` keeps a static basename; anything computed after the last slash is unknowable.
function staticName(word) {
  if (word.glob) return null;
  if (!word.dyn) return commandName(word.v);
  const slash = word.v.lastIndexOf('/');
  return slash !== -1 && word.dynEnd <= slash ? commandName(word.v.slice(slash + 1)) : null;
}
const assignName = (w) => ASSIGNMENT.exec(w.unq)[1];

function expandHome(dir) {
  const base = process.env.HOME || home();
  if (dir === '~') return base;
  return dir.startsWith('~/') ? path.join(base, dir.slice(2)) : dir;
}

function resolveCommand(cmd, scan) {
  let words = cmd.words;
  let wrapped = false;
  let compound = false;
  const assigns = [...cmd.assigns];
  for (let guard = 0; guard < 16 && words.length; guard += 1) {
    const w0 = words[0];
    if (w0.dyn || w0.glob) break;
    if (!w0.quoted && RESERVED.has(w0.v)) {
      words = words.slice(1);
      compound = true;
      continue;
    }
    const name = commandName(w0.v);
    if (name === 'env') {
      wrapped = true;
      let k = 1;
      while (k < words.length) {
        const a = words[k];
        if (ASSIGNMENT.test(a.unq)) {
          assigns.push(a);
          k += 1;
        } else if (/^(-[a-zA-Z]*S|--split-string)/.test(a.v)) {
          scan.notes.push('`env -S` builds a command from a string');
          return { words: [], wrapped, compound, assigns };
        } else if (['-u', '--unset', '-C', '--chdir'].includes(a.v)) {
          if (a.v === '-C' || a.v === '--chdir') scan.notes.push('`env -C` changes directory');
          k += 2;
        } else if (a.v.startsWith('-')) {
          k += 1;
        } else {
          break;
        }
      }
      words = words.slice(k);
      continue;
    }
    if (WRAPPERS[name]) {
      wrapped = true;
      let k = 1;
      while (k < words.length && words[k].v.startsWith('-') && words[k].v !== '-') k += WRAPPERS[name].includes(words[k].v) ? 2 : 1;
      if (name === 'timeout' && words[k] && /^\d/.test(words[k].v)) k += 1;
      words = words.slice(k);
      continue;
    }
    break;
  }
  return { words, wrapped, compound, assigns };
}

// ── Walk ─────────────────────────────────────────────────────────────────────

function gitCall(cmd, res, args, dir, dirKnown, depth, scan) {
  let i = 0;
  let cwd = dir;
  let known = dirKnown;
  const redirect = [];
  const configs = [];
  while (i < args.length) {
    const a = args[i];
    if (a.dyn || a.glob) {
      scan.forced.push('a git subcommand or option is computed at run time');
      return;
    }
    if (!a.v.startsWith('-')) break;
    const eq = a.v.indexOf('=');
    const flag = eq === -1 ? a.v : a.v.slice(0, eq);
    const value = eq === -1 ? args[i + 1] && args[i + 1].v : a.v.slice(eq + 1);
    const step = eq === -1 ? 2 : 1;
    if (a.v === '-C') {
      const t = args[i + 1];
      if (!t || t.dyn || t.glob) known = false;
      else cwd = path.resolve(cwd, expandHome(t.v));
      i += 2;
    } else if (a.v === '-c' || flag === '--config-env') {
      const t = args[i + (eq === -1 ? 1 : 0)];
      if (!t || t.dyn || /^\s*(alias\.|include)/i.test(value || '')) scan.forced.push('inline git config that defines an alias or include');
      configs.push(String(value || '').split('=')[0].trim());
      i += step;
    } else if (flag === '--git-dir' || flag === '--work-tree') {
      redirect.push(flag);
      i += step;
    } else if (['--namespace', '--super-prefix', '--attr-source'].includes(flag)) {
      i += step;
    } else if (flag === '--exec-path' && eq !== -1) {
      scan.forced.push('a custom git exec path');
      i += 1;
    } else {
      i += 1;
    }
  }
  const sub = args[i];
  if (!sub) return;
  const rest = args.slice(i + 1);
  const call = { args: rest, cwd, dirKnown: known, cmd, depth, wrapped: res.wrapped, assigns: res.assigns, redirect, configs };
  if (sub.v === 'commit' || sub.v === 'push') scan.calls.push({ kind: sub.v, ...call });
  else if (sub.v === 'config' && rest.some((a) => a.dyn || /^(alias\.|include)/i.test(a.v))) scan.forced.push('a git alias or include change');
  else if (!GIT_BUILTINS.has(sub.v)) scan.nonBuiltin.push({ tool: 'git', sub: sub.v, dir: cwd, known, changesEnv: res.assigns.length > 0 || res.wrapped });
}

function ghCall(cmd, res, args, dir, dirKnown, depth, scan) {
  let i = 0;
  while (i < args.length && args[i].v.startsWith('-') && !args[i].dyn) i += ['-R', '--repo', '--hostname'].includes(args[i].v) ? 2 : 1;
  const a = args[i];
  const b = args[i + 1];
  if (!a) return;
  if (a.dyn || a.glob || (a.v === 'pr' && b && (b.dyn || b.glob))) {
    scan.forced.push('a gh subcommand is computed at run time');
    return;
  }
  if (a.v === 'pr' && b && ['create', 'new'].includes(b.v)) {
    scan.calls.push({ kind: 'pr', args: args.slice(i + 2), cwd: dir, dirKnown, cmd, depth, wrapped: res.wrapped, assigns: res.assigns, redirect: [], configs: [] });
  } else if (a.v === 'alias' && b && ['set', 'import'].includes(b.v)) {
    scan.forced.push('a gh alias change');
  } else if (a.v === 'api' && args.some((x) => /pulls|graphql/.test(x.v))) {
    scan.forced.push('`gh api` can open pull requests without the gate');
  } else if (!GH_COMMANDS.has(a.v)) {
    scan.nonBuiltin.push({ tool: 'gh', sub: a.v, dir, known: dirKnown, changesEnv: res.assigns.length > 0 || res.wrapped });
  }
}

function shellCall(cmd, args, dir, depth, scan) {
  let i = 0;
  let hasC = false;
  while (i < args.length) {
    const a = args[i];
    if (a.v === '--') {
      i += 1;
      break;
    }
    if (!/^[-+]/.test(a.v) || a.dyn) break;
    if (/^-[a-zA-Z]*c[a-zA-Z]*$/.test(a.v) || a.v === '--command') hasC = true;
    i += ['-o', '+o', '-O', '+O', '--rcfile', '--init-file'].includes(a.v) ? 2 : 1;
  }
  if (!hasC) {
    scan.notes.push('a shell runs commands the gate cannot read');
    return;
  }
  const script = args[i];
  if (!script) return;
  if (script.dyn || script.glob) {
    scan.dynamicScripts.push('a shell script is computed at run time');
    return;
  }
  cmd.shellScript = walk(script.v, dir, depth + 1, scan);
  cmd.shellPlain = i === args.length - 1;
}

function walk(text, cwd, depth, scan) {
  if (depth > MAX_DEPTH) {
    scan.notes.push('commands are nested too deeply to check');
    return null;
  }
  const { tokens, notes } = lex(text);
  scan.notes.push(...notes);
  for (const tk of tokens) {
    if (tk.t === 'w') scan.words.push(tk.v);
    if (tk.heredoc) scan.words.push(tk.heredoc.body);
  }
  const { cmds, ops } = commands(tokens);
  const structure = { cmds, ops, compound: false, depth };
  let dir = cwd;
  let dirKnown = true;
  for (const cmd of cmds) {
    for (const sub of subsOf(cmd)) walk(sub, dir, depth + 1, scan);
    if (cmd.redirs.some((r) => r.heredoc && r.heredoc.expands)) scan.notes.push('a heredoc runs a command substitution');
    const res = resolveCommand(cmd, scan);
    if (res.compound) structure.compound = true;
    cmd.wrapped = res.wrapped;
    if (!res.words.length) {
      if (cmd.assigns.length) scan.mutatesEnv = true;
      continue;
    }
    const head = res.words[0];
    const name = staticName(head);
    const args = res.words.slice(1);
    if (name === null) {
      scan.dynamicHeads.push({ argsStatic: args.every((a) => !a.dyn && !a.glob), first: args[0] ? args[0].v : null, dir, known: dirKnown });
      continue;
    }
    if (name === 'cd' || name === 'pushd' || name === 'popd') {
      const target = args.find((a) => !a.v.startsWith('-') || a.v === '-');
      const opts = args.some((a) => a.v.startsWith('-') && a.v !== '-');
      if (name === 'popd' || opts || args.length > 1 || (target && (target.dyn || target.glob || target.v === '-'))) {
        dirKnown = false;
      } else {
        dir = path.resolve(dir, expandHome(target ? target.v : '~'));
        cmd.cdTarget = dir;
      }
    } else if (ENV_MUTATORS.has(name)) {
      scan.mutatesEnv = true;
      if (name === 'source' || name === '.') scan.notes.push('a sourced script cannot be read');
    } else if (SHELLS.has(name)) {
      shellCall(cmd, args, dir, depth, scan);
    } else if (name === 'eval') {
      if (args.some((a) => a.dyn || a.glob)) scan.dynamicScripts.push('eval of a string computed at run time');
      else walk(args.map((a) => a.v).join(' '), dir, depth + 1, scan);
    } else if (INDIRECT.has(name)
      || (['find', 'fd', 'fdfind'].includes(name) && args.some((a) => /^-(exec|execdir|ok|okdir|x|X|-exec|-exec-batch)$/.test(a.v)))
      || (name === 'script' && args.some((a) => /^(-[a-zA-Z]*c|--command)/.test(a.v)))) {
      scan.notes.push(`\`${name}\` runs a command the gate cannot see`);
    } else if (INTERPRETERS.test(name)) {
      scan.notes.push(`\`${name}\` runs code the gate cannot read`);
    } else if (name === 'git') {
      gitCall(cmd, res, args, dir, dirKnown, depth, scan);
    } else if (name === 'gh') {
      ghCall(cmd, res, args, dir, dirKnown, depth, scan);
    }
  }
  return structure;
}

// ── Aliases ──────────────────────────────────────────────────────────────────

function gitAliases(dir) {
  const out = gitOut(dir, ['config', '--get-regexp', '^alias\\.']) || '';
  const map = new Map();
  for (const line of out.split('\n')) {
    const m = /^alias\.(\S+)\s+([\s\S]*)$/.exec(line);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

function ghAliases() {
  const dir = process.env.GH_CONFIG_DIR || path.join(process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || home(), '.config'), 'gh');
  const map = new Map();
  let text = '';
  try {
    text = fs.readFileSync(path.join(dir, 'config.yml'), 'utf8');
  } catch {
    return map;
  }
  const block = /^aliases:\s*\n((?:[ \t]+.*\n?)*)/m.exec(text);
  for (const line of (block ? block[1] : '').split('\n')) {
    const m = /^\s+([^:\s]+):\s*(.*)$/.exec(line);
    if (m) map.set(m[1], m[2].replace(/^(['"])(.*)\1$/, '$2'));
  }
  return map;
}

function resolveAliases(scan) {
  const cache = new Map();
  // A computed command name could be git or gh: its first argument must not be a gated alias either.
  for (const head of scan.dynamicHeads) {
    if (head.argsStatic && head.first && head.known) {
      for (const tool of ['git', 'gh']) scan.nonBuiltin.push({ tool, sub: head.first, dir: head.dir, known: true, changesEnv: false, viaDynamic: true });
    }
  }
  for (const nb of scan.nonBuiltin) {
    if (!nb.viaDynamic && (nb.changesEnv || scan.mutatesEnv || !nb.known)) {
      scan.forced.push(`\`${nb.tool} ${nb.sub}\` may be an alias and the line changes its environment`);
      continue;
    }
    const key = `${nb.tool}:${nb.dir}`;
    if (!cache.has(key)) cache.set(key, nb.tool === 'git' ? gitAliases(nb.dir) : ghAliases());
    const map = cache.get(key);
    const gated = nb.tool === 'git' ? /\b(commit|push|send-pack|commit-tree)\b/ : /\b(pr\s+(create|new)|api)\b/;
    let name = nb.sub;
    for (let hop = 0; hop < 10 && map.has(name); hop += 1) {
      const value = map.get(name);
      if (value.trim().startsWith('!')) {
        scan.forced.push(`\`${nb.tool} ${nb.sub}\` is a shell alias`);
        break;
      }
      if (gated.test(value)) {
        scan.forced.push(`\`${nb.tool} ${nb.sub}\` is an alias for \`${nb.tool} ${value.trim()}\``);
        break;
      }
      name = value.trim().split(/\s+/)[0];
    }
  }
}

// ── Public ───────────────────────────────────────────────────────────────────

const trailingOnly = (structure) => structure.ops.every((o) => (o.v === ';' || o.v === '\n') && o.after === structure.cmds.length - 1);

/** Text of a command substitution that only prints (cat/printf/echo, maybe a heredoc). */
function isPrinter(text) {
  const { tokens, notes } = lex(text);
  if (notes.length) return false;
  const structure = commands(tokens);
  if (structure.cmds.length !== 1 || !trailingOnly(structure)) return false;
  const [cmd] = structure.cmds;
  const [head] = cmd.words;
  return Boolean(head) && !head.dyn && !head.glob && PRINTERS.has(head.v) && !cmd.assigns.length
    && cmd.words.every((w) => !w.subs.length) && cmd.redirs.every((r) => (r.heredoc ? !r.heredoc.expands : !r.target || !r.target.subs.length));
}

/**
 * @returns {{ calls: object[], notes: string[], forced: string[], words: string[], top: object | null }}
 */
function analyze(command, cwd) {
  const scan = { calls: [], notes: [], forced: [], words: [], nonBuiltin: [], dynamicHeads: [], dynamicScripts: [], mutatesEnv: false };
  let top = walk(command, cwd, 0, scan);
  // `sh -c '<script>'` alone on the line is judged as the script itself.
  while (top && top.cmds.length === 1 && trailingOnly(top) && !top.compound) {
    const [cmd] = top.cmds;
    if (!cmd.shellScript || !cmd.shellPlain || cmd.assigns.length || cmd.redirs.length || cmd.wrapped) break;
    top = cmd.shellScript;
  }
  resolveAliases(scan);
  return { ...scan, top };
}

/** Why `call` is not alone on the line, or null when it is (optionally after one `cd <dir> &&`). */
function isolationProblem(result, call) {
  const { top } = result;
  if (result.calls.length !== 1) return 'it shares the line with another gated command';
  if (!top || top.compound) return 'it is inside a compound command';
  if (call.wrapped) return 'it is wrapped in another command';
  if (call.depth !== top.depth) return 'it runs inside another command';
  const last = top.cmds[top.cmds.length - 1];
  if (last !== call.cmd) return 'other commands run with it';
  if (top.cmds.length === 1) {
    if (!trailingOnly(top)) return 'other commands run with it';
  } else if (top.cmds.length === 2) {
    const [cd] = top.cmds;
    const plainCd = cd.cdTarget && cd.words.length === 2 && !cd.assigns.length && !cd.redirs.length && !cd.wrapped && !subsOf(cd).length;
    const ops = top.ops.filter((o) => !(o.after === 1 && (o.v === ';' || o.v === '\n')));
    if (!plainCd || ops.length !== 1 || ops[0].v !== '&&' || ops[0].after !== 0) return 'only one `cd <dir> &&` may come before it';
  } else {
    return 'other commands run with it';
  }
  if (!call.dirKnown) return 'its working directory cannot be determined';
  if (!subsOf(call.cmd).every(isPrinter)) return 'a command substitution in it runs another command';
  return null;
}

/** GIT_DIR-style redirection on a gated call. */
function redirectionProblem(call) {
  const env = call.assigns.map(assignName).filter((n) => /^GIT_/.test(n));
  if (env.length) return `${env.join(', ')} points git somewhere the token never saw`;
  if (call.redirect.length) return `${call.redirect.join(', ')} points git somewhere the token never saw`;
  return null;
}

module.exports = { lex, analyze, isolationProblem, redirectionProblem, isPrinter };
