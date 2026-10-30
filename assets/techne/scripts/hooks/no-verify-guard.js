// PreToolUse(Bash): refuse git invocations that would skip the repository's git hooks.
'use strict';

const path = require('path');
const { lex } = require('./lib/shell');

const HOOK_RUNNING = new Set(['commit', 'push', 'merge', 'cherry-pick', 'rebase', 'am']);
const SHELLS = new Set(['sh', 'bash', 'dash', 'zsh', 'ksh']);
const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{', '}', 'time']);
const GIT_GLOBALS_WITH_VALUE = new Set(['-C', '--work-tree', '--git-dir', '--namespace', '--super-prefix', '--exec-path']);
const SUDO_WITH_VALUE = new Set(['-u', '-g', '-h', '-p', '-C', '-D', '-r', '-t', '-U']);
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s;
const NO_VERIFY = '--no-verify';

// Long options that consume the next word, per subcommand (values are data, not flags).
const LONG_WITH_VALUE = {
  commit: ['--message', '--file', '--reuse-message', '--reedit-message', '--template', '--author', '--date', '--cleanup', '--fixup', '--squash', '--trailer', '--pathspec-from-file'],
  merge: ['--message', '--file', '--strategy', '--strategy-option', '--into-name'],
  push: ['--push-option', '--repo', '--receive-pack', '--exec'],
  rebase: ['--exec', '--strategy', '--strategy-option', '--onto'],
  'cherry-pick': ['--mainline', '--strategy', '--strategy-option'],
  am: ['--patch-format', '--directory', '--exclude', '--include', '--resolvemsg'],
};
// Short options whose value is the rest of the cluster or the next word.
const SHORT_WITH_VALUE = {
  commit: 'mFCct',
  merge: 'mFsX',
  push: 'o',
  rebase: 'xsX',
  'cherry-pick': 'msX',
  am: 'pC',
};
const SHORT_OPTIONAL_VALUE = { commit: 'uS', merge: 'S', rebase: 'S', 'cherry-pick': 'S', am: 'S' };

const isNoVerify = (word) => word.length >= 9 && NO_VERIFY.startsWith(word);
const isHooksPathKey = (key) => key.trim().toLowerCase() === 'core.hookspath';

function overridesHooksPath(env) {
  for (const [name, value] of env) {
    if (/^GIT_CONFIG_KEY_\d+$/.test(name) && isHooksPathKey(value)) return true;
    if (name === 'GIT_CONFIG_PARAMETERS' && value.toLowerCase().includes('core.hookspath')) return true;
  }
  return false;
}

// Strips wrappers (env, sudo, command, …) and prefix assignments; returns the real command words.
function unwrap(words, env) {
  let i = 0;
  const take = () => {
    while (i < words.length) {
      const m = words[i].match(ASSIGNMENT);
      if (m) env.set(m[1], m[2]);
      else if (!KEYWORDS.has(words[i])) break;
      i++;
    }
  };
  take();
  for (;;) {
    const cmd = path.basename(words[i] || '');
    if (cmd === 'env') {
      i++;
      while (i < words.length && (words[i].startsWith('-') || ASSIGNMENT.test(words[i]))) {
        if (words[i] === '-u' || words[i] === '-S') i++;
        else if (!words[i].startsWith('-')) {
          const m = words[i].match(ASSIGNMENT);
          env.set(m[1], m[2]);
        }
        i++;
      }
    } else if (cmd === 'sudo' || cmd === 'doas' || cmd === 'nice' || cmd === 'nohup' || cmd === 'command' || cmd === 'exec' || cmd === 'builtin') {
      i++;
      while (i < words.length && words[i].startsWith('-')) {
        if (SUDO_WITH_VALUE.has(words[i]) || (cmd === 'nice' && words[i] === '-n')) i++;
        i++;
      }
    } else break;
    take();
  }
  return words.slice(i);
}

function checkGit(args, env, scanNested) {
  let i = 1;
  let hooksOverride = overridesHooksPath(env);
  while (i < args.length && args[i].startsWith('-')) {
    const arg = args[i];
    if (arg === '-c') {
      if (isHooksPathKey((args[i + 1] || '').split('=')[0])) hooksOverride = true;
      i += 2;
    } else if (arg.startsWith('-c')) {
      if (isHooksPathKey(arg.slice(2).split('=')[0])) hooksOverride = true;
      i++;
    } else if (arg === '--config-env') {
      if (isHooksPathKey((args[i + 1] || '').split('=')[0])) hooksOverride = true;
      i += 2;
    } else if (arg.startsWith('--config-env=')) {
      if (isHooksPathKey(arg.slice('--config-env='.length).split('=')[0])) hooksOverride = true;
      i++;
    } else if (GIT_GLOBALS_WITH_VALUE.has(arg)) {
      i += 2;
    } else {
      i++;
    }
  }
  const sub = args[i];
  const rest = args.slice(i + 1);

  if (sub === 'config' && setsHooksPath(rest)) {
    return 'Setting core.hooksPath is not allowed: it disables the repository git hooks.';
  }
  if (!HOOK_RUNNING.has(sub)) return null;
  if (hooksOverride) return `Overriding core.hooksPath on git ${sub} is not allowed: git hooks must run.`;

  const longValue = new Set(LONG_WITH_VALUE[sub]);
  const shortValue = SHORT_WITH_VALUE[sub] || '';
  const shortOptional = SHORT_OPTIONAL_VALUE[sub] || '';
  for (let j = 0; j < rest.length; j++) {
    const word = rest[j];
    if (word === '--') break;
    if (word.startsWith('--')) {
      const [name, inline] = word.split(/=(.*)/s);
      if (isNoVerify(name)) return `git ${sub} ${NO_VERIFY} is not allowed: fix what the hook reports instead of skipping it.`;
      if (longValue.has(name) && inline === undefined) {
        if (sub === 'rebase' && name === '--exec' && rest[j + 1]) scanNested(rest[j + 1]);
        j++;
      } else if (sub === 'rebase' && name === '--exec' && inline) {
        scanNested(inline);
      }
      continue;
    }
    if (!/^-[A-Za-z]/.test(word)) continue;
    for (let k = 1; k < word.length; k++) {
      const flag = word[k];
      if (flag === 'n' && sub === 'commit') return 'git commit -n skips the commit hooks and is not allowed.';
      if (shortOptional.includes(flag)) break;
      if (shortValue.includes(flag)) {
        const value = k + 1 < word.length ? word.slice(k + 1) : rest[++j];
        if (sub === 'rebase' && flag === 'x' && value) scanNested(value);
        break;
      }
    }
  }
  return null;
}

function setsHooksPath(rest) {
  const positional = [];
  for (const word of rest) {
    if (word === '--unset' || word === '--unset-all' || word === '--get' || word === '--get-all' || word === 'unset' || word === 'get') return false;
    if (!word.startsWith('-')) positional.push(word);
  }
  if (positional[0] === 'set') positional.shift();
  if (!positional.length) return false;
  const [key, inline] = positional[0].split(/=(.*)/s);
  return isHooksPathKey(key) && (inline !== undefined || positional.length >= 2);
}

function inspect(command, depth = 0) {
  if (depth > 4) return null;
  const env = new Map();
  const nestedReasons = [];
  const scanNested = (script) => {
    const reason = inspect(script, depth + 1);
    if (reason) nestedReasons.push(reason);
  };

  for (const segment of lex(command)) {
    const local = new Map(env);
    const words = unwrap(segment.words, local);
    if (!words.length) {
      for (const [k, v] of local) env.set(k, v);
      continue;
    }
    const cmd = path.basename(words[0]);
    if (cmd === 'export') {
      for (const word of words.slice(1)) {
        const m = word.match(ASSIGNMENT);
        if (m) env.set(m[1], m[2]);
      }
      continue;
    }
    if (cmd === 'git') {
      const reason = checkGit(words, local, scanNested);
      if (reason) return reason;
    } else if (SHELLS.has(cmd)) {
      const flagIndex = words.findIndex((w, idx) => idx > 0 && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(w));
      if (flagIndex !== -1 && words[flagIndex + 1]) scanNested(words[flagIndex + 1]);
      else segment.heredocs.forEach(scanNested);
    } else if (cmd === 'eval') {
      scanNested(words.slice(1).join(' '));
    }
    if (nestedReasons.length) return nestedReasons[0];
  }
  return nestedReasons[0] || null;
}

module.exports = function noVerifyGuard(payload, { truncated }) {
  if (truncated) return { block: 'Hook payload too large to inspect; refusing the command. Split it into smaller commands.' };
  const command = payload?.tool_input?.command;
  if (typeof command !== 'string' || !/git|GIT_CONFIG/.test(command)) return null;
  const reason = inspect(command);
  return reason ? { block: reason } : null;
};

module.exports.inspect = inspect;
