use crate::runtime::{self, Result};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

#[derive(Clone, Debug)]
pub struct Word {
    pub value: String,
    pub dynamic: bool,
    safe_value: bool,
}

impl Word {
    fn new(value: String, dynamic: bool, unquoted: bool) -> Self {
        static VARIABLE: OnceLock<regex::Regex> = OnceLock::new();
        let variable = VARIABLE.get_or_init(|| {
            regex::Regex::new(r"\$[A-Za-z_][A-Za-z0-9_]*|\$\{[A-Za-z_][A-Za-z0-9_]*\}")
                .expect("static regex")
        });
        let rest = variable.replace_all(&value, "");
        let safe_value =
            dynamic && !unquoted && (!rest.contains(['$', '`']) || literal_printer(&value));
        Self {
            value,
            dynamic,
            safe_value,
        }
    }
}

fn literal_printer(value: &str) -> bool {
    let Some(script) = value.strip_prefix("$(").and_then(|s| s.strip_suffix(')')) else {
        return false;
    };
    let Some((header, body)) = script.trim_end_matches('\n').split_once('\n') else {
        return false;
    };
    let Some(delimiter) = header
        .strip_prefix("cat <<'")
        .and_then(|s| s.strip_suffix('\''))
    else {
        return false;
    };
    if delimiter.is_empty()
        || !delimiter
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return false;
    }
    let Some((content, end)) = body.rsplit_once('\n') else {
        return false;
    };
    end == delimiter && !content.lines().any(|line| line == delimiter)
}

#[derive(Debug)]
pub struct Call {
    pub kind: &'static str,
    pub cwd: PathBuf,
    pub args: Vec<Word>,
    pub configs: Vec<String>,
}

#[derive(Clone, Debug)]
enum Token {
    Word(Word),
    Op(String),
}

fn lex(text: &str) -> Result<Vec<Token>> {
    let mut out = Vec::new();
    let mut value = String::new();
    let mut active = false;
    let mut dynamic = false;
    let mut unquoted = false;
    let mut quote = None;
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if let Some(q) = quote {
            if c == q {
                quote = None;
            } else if c == '\\' && q == '"' {
                let next = chars.next().ok_or("unterminated escape")?;
                if !['$', '`', '"', '\\', '\n'].contains(&next) {
                    value.push('\\');
                }
                if next != '\n' {
                    value.push(next);
                }
            } else {
                if q == '"' && matches!(c, '$' | '`') {
                    dynamic = true;
                }
                value.push(c);
            }
            continue;
        }
        if c == '#' && !active {
            while chars.peek().is_some_and(|c| *c != '\n') {
                chars.next();
            }
            continue;
        }
        if matches!(c, '\'' | '"') {
            quote = Some(c);
            active = true;
            continue;
        }
        if c == '\\' {
            let next = chars.next().ok_or("unterminated escape")?;
            if next != '\n' {
                value.push(next);
                active = true;
            }
            continue;
        }
        if c.is_whitespace() || ";&|<>()".contains(c) {
            if active {
                out.push(Token::Word(Word::new(
                    std::mem::take(&mut value),
                    dynamic,
                    unquoted,
                )));
                active = false;
                dynamic = false;
                unquoted = false;
            }
            if c == '\n' || ";&|<>()".contains(c) {
                let mut op = c.to_string();
                if matches!(c, '&' | '|') && chars.peek() == Some(&c) {
                    op.push(chars.next().unwrap());
                }
                out.push(Token::Op(op));
            }
            continue;
        }
        if "$`*?[{~".contains(c) {
            dynamic = true;
            unquoted = true;
        }
        value.push(c);
        active = true;
    }
    if quote.is_some() {
        return Err("unterminated shell quote".into());
    }
    if active {
        out.push(Token::Word(Word::new(value, dynamic, unquoted)));
    }
    Ok(out)
}

fn name(word: &str) -> &str {
    word.rsplit(['/', '\\'])
        .next()
        .unwrap_or(word)
        .strip_suffix(".exe")
        .unwrap_or_else(|| word.rsplit(['/', '\\']).next().unwrap_or(word))
}

fn gated(text: &str) -> bool {
    static GATED: OnceLock<regex::Regex> = OnceLock::new();
    GATED
        .get_or_init(|| {
            regex::Regex::new(r"(?i)commit|push|\bpr\b[\s\S]*\b(create|new)\b")
                .expect("static regex")
        })
        .is_match(text)
}

fn known_git(sub: &str) -> bool {
    "add am annotate apply archive bisect blame branch bugreport bundle cat-file check-attr check-ignore check-mailmap check-ref-format checkout checkout-index cherry cherry-pick citool clean clone column commit commit-graph commit-tree config count-objects credential describe diagnose diff diff-files diff-index diff-tree difftool fast-export fast-import fetch fetch-pack filter-branch fmt-merge-msg for-each-ref for-each-repo format-patch fsck gc get-tar-commit-id grep gui hash-object help hook index-pack init instaweb interpret-trailers log ls-files ls-remote ls-tree mailinfo mailsplit maintenance merge merge-base merge-file merge-index merge-tree mergetool mktag mktree multi-pack-index mv name-rev notes pack-objects pack-redundant pack-refs patch-id prune prune-packed pull push range-diff read-tree rebase reflog remote repack replace replay request-pull rerere reset restore rev-list rev-parse revert rm send-email send-pack shortlog show show-branch show-index show-ref sparse-checkout stash status stripspace submodule switch symbolic-ref tag unpack-file unpack-objects update-index update-ref update-server-info var verify-commit verify-pack verify-tag version whatchanged worktree write-tree lfs".split_whitespace().any(|x| x == sub)
}

fn safe_git_alias(cwd: &Path, sub: &str) -> Result<bool> {
    let aliases = runtime::git(cwd, &["config", "--get-regexp", "^alias\\."]).unwrap_or_default();
    let mut current = sub;
    let mut seen = false;
    for _ in 0..10 {
        let prefix = format!("alias.{current} ");
        let Some(value) = aliases.lines().find_map(|line| line.strip_prefix(&prefix)) else {
            return Ok(seen && known_git(current));
        };
        seen = true;
        if value.trim().starts_with('!') || gated(value) || value.contains("send-pack") {
            return Err("a git alias bypasses a gated command".into());
        }
        current = value.split_whitespace().next().unwrap_or("");
    }
    Err("a git alias cannot be resolved safely".into())
}

fn inspect(words: &[Word], cwd: &Path, git_context: bool, mutates: bool) -> Result<Option<Call>> {
    static ASSIGNMENT: OnceLock<regex::Regex> = OnceLock::new();
    let assignment = ASSIGNMENT
        .get_or_init(|| regex::Regex::new(r"^([A-Za-z_][A-Za-z0-9_]*)=").expect("static regex"));
    let mut words = words;
    while let Some((head, rest)) = words.split_first() {
        if let Some(caps) = assignment.captures(&head.value) {
            let key = &caps[1];
            if matches!(
                key,
                "HOME" | "GH_CONFIG_DIR" | "XDG_CONFIG_HOME" | "APPDATA" | "USERPROFILE"
            ) {
                return Err(format!("{key} points gh at a config the gate never read"));
            }
            if head.dynamic
                || key.starts_with("GIT_")
                || matches!(
                    key,
                    "HOME"
                        | "GH_CONFIG_DIR"
                        | "XDG_CONFIG_HOME"
                        | "APPDATA"
                        | "USERPROFILE"
                        | "PATH"
                )
            {
                return Err("an environment assignment changes what the gate can verify".into());
            }
            words = rest;
        } else {
            break;
        }
    }
    let Some(head) = words.first() else {
        return Ok(None);
    };
    let tool = name(&head.value);
    let static_basename =
        head.value.contains('/') && !tool.contains(['$', '`', '*', '?', '[', '{', '~']);
    if head.dynamic && !static_basename {
        if git_context || words.iter().skip(1).any(|w| w.dynamic || gated(&w.value)) {
            return Err("a command name is computed at run time".into());
        }
        if let Some(first) = words.get(1) {
            safe_git_alias(cwd, &first.value)?;
        }
        return Ok(None);
    }
    if tool != "git" && tool != "gh" {
        if !matches!(tool, "echo" | "printf" | "cat")
            && words
                .iter()
                .skip(1)
                .any(|w| matches!(name(&w.value), "git" | "gh"))
        {
            return Err("a wrapper or environment assignment hides git or gh".into());
        }
        static INTERPRETER: OnceLock<regex::Regex> = OnceLock::new();
        let interpreter = INTERPRETER.get_or_init(|| regex::Regex::new(r"^(python[\d.]*|node|nodejs|deno|bun|perl|ruby|php|lua|osascript|pwsh|powershell|tclsh|awk|gawk|jq)$").expect("static regex"));
        let opaque = interpreter.is_match(tool) || "mksh ash builtin nice ionice stdbuf caffeinate chrt taskset unbuffer doas watch su runuser flock sg chroot nsenter unshare setsid strace ltrace gdb dbus-run-session busybox sem fd fdfind".split_whitespace().any(|word|word == tool) || matches!(
            tool,
            "bash"
                | "sh"
                | "zsh"
                | "dash"
                | "ksh"
                | "fish"
                | "eval"
                | "env"
                | "command"
                | "sudo"
                | "exec"
                | "xargs"
                | "parallel"
                | "source"
                | "."
                | "node"
                | "python"
                | "python3"
                | "ruby"
                | "perl"
                | "pwsh"
                | "powershell"
                | "ssh"
                | "find"
                | "timeout"
                | "nohup"
                | "time"
                | "script"
        );
        if opaque
            && words
                .iter()
                .any(|w| gated(&w.value) || w.value.contains("git") || w.value.contains("gh"))
        {
            return Err("a wrapper or script runs commands the gate cannot verify".into());
        }
        return Ok(None);
    }
    let mut cwd = cwd.to_owned();
    let mut configs = Vec::new();
    let mut i = 1;
    while i < words.len() && words[i].value.starts_with('-') {
        let word = &words[i];
        if word.dynamic {
            return Err("a git/gh option is computed at run time".into());
        }
        let (flag, attached) = word
            .value
            .split_once('=')
            .map_or((word.value.as_str(), None), |(k, v)| (k, Some(v)));
        let takes = if tool == "git" {
            matches!(
                flag,
                "-C" | "-c"
                    | "--config-env"
                    | "--git-dir"
                    | "--work-tree"
                    | "--namespace"
                    | "--super-prefix"
                    | "--attr-source"
            )
        } else {
            matches!(flag, "-R" | "--repo" | "--hostname")
        };
        if matches!(flag, "--git-dir" | "--work-tree" | "--exec-path") {
            return Err("git is redirected somewhere the token never saw".into());
        }
        if takes {
            let next = if let Some(value) = attached {
                value
            } else {
                i += 1;
                let w = words.get(i).ok_or("missing global option value")?;
                if w.dynamic {
                    return Err("a global option value is computed".into());
                }
                &w.value
            };
            if flag == "-C" {
                cwd = cwd.join(next);
            }
            if flag == "-c" || flag == "--config-env" {
                let key = next.split('=').next().unwrap_or("").trim().to_lowercase();
                if key.starts_with("alias.") || key.starts_with("include") {
                    return Err("inline git config defines an alias or include".into());
                }
                configs.push(key);
            }
        } else if tool == "git"
            && !matches!(
                flag,
                "--no-pager"
                    | "--paginate"
                    | "-p"
                    | "-P"
                    | "--no-optional-locks"
                    | "--literal-pathspecs"
                    | "--no-literal-pathspecs"
                    | "--glob-pathspecs"
                    | "--noglob-pathspecs"
                    | "--icase-pathspecs"
            )
        {
            return Err(format!("cannot verify global git option {flag}"));
        }
        i += 1;
    }
    let Some(sub) = words.get(i) else {
        return Ok(None);
    };
    if sub.dynamic {
        return Err("a git/gh subcommand is computed at run time".into());
    }
    let mut kind = None;
    if tool == "git" {
        if sub.value == "commit" {
            kind = Some("commit");
        }
        if sub.value == "push" {
            kind = Some("push");
        }
        if sub.value == "config"
            && words[i + 1..].iter().any(|w| {
                w.dynamic || w.value.starts_with("alias.") || w.value.starts_with("include")
            })
        {
            return Err("a git alias or include change".into());
        }
        if !known_git(&sub.value) {
            if !mutates && safe_git_alias(&cwd, &sub.value)? {
                return Ok(None);
            }
            return Err("an unknown git subcommand may be an alias".into());
        }
        i += 1;
    } else {
        if let (true, Some(action)) = (sub.value == "pr", words.get(i + 1)) {
            if action.dynamic {
                return Err("a gh subcommand is computed at run time".into());
            }
            if matches!(action.value.as_str(), "create" | "new") {
                kind = Some("pr");
            }
        }
        if sub.value == "alias"
            && words
                .get(i + 1)
                .is_some_and(|w| matches!(w.value.as_str(), "set" | "import"))
        {
            return Err("a gh alias change".into());
        }
        if sub.value == "api"
            && words
                .iter()
                .any(|w| w.value.contains("pulls") || w.value.contains("graphql"))
        {
            return Err("gh api can open pull requests without the gate".into());
        }
        if !"agent-task alias api attestation auth browse cache codespace completion config copilot extension gist gpg-key help issue label org pr preview project release repo ruleset run search secret ssh-key status variable version workflow".split_whitespace().any(|s| s == sub.value) { return Err("an unknown gh subcommand may be an alias".into()); }
        i += 2;
    }
    Ok(kind.map(|kind| Call {
        kind,
        cwd,
        configs,
        args: words[i..].to_vec(),
    }))
}

pub fn analyze(command: &str, cwd: &Path) -> Result<Option<Call>> {
    analyze_depth(command, cwd, 0)
}

fn analyze_depth(command: &str, cwd: &Path, depth: usize) -> Result<Option<Call>> {
    if depth > 4 {
        return Err("commands are nested too deeply to check".into());
    }
    let mut tokens = lex(command)?;
    while tokens
        .last()
        .is_some_and(|t| matches!(t,Token::Op(op) if op == ";" || op == "\n"))
    {
        tokens.pop();
    }
    match tokens.as_slice() {
        [Token::Word(head), Token::Word(options), Token::Word(script)]
            if !head.dynamic
                && matches!(
                    name(&head.value),
                    "sh" | "bash" | "zsh" | "dash" | "ksh" | "mksh" | "ash"
                )
                && !options.dynamic
                && matches!(options.value.as_str(), "-c" | "-lc")
                && !script.dynamic =>
        {
            return analyze_depth(&script.value, cwd, depth + 1);
        }
        _ => {}
    }
    let mut without_dup = Vec::new();
    let mut index = 0;
    while index < tokens.len() {
        match &tokens[index..] {
            [
                Token::Word(fd),
                Token::Op(redir),
                Token::Op(amp),
                Token::Word(target),
                ..,
            ] if !fd.dynamic
                && !target.dynamic
                && matches!(fd.value.as_str(), "1" | "2")
                && matches!(target.value.as_str(), "1" | "2")
                && redir == ">"
                && amp == "&" =>
            {
                index += 4;
                continue;
            }
            _ => {}
        }
        without_dup.push(tokens[index].clone());
        index += 1;
    }
    let mut stripped = Vec::new();
    let mut iter = without_dup.into_iter().peekable();
    while let Some(token) = iter.next() {
        if matches!(&token,Token::Op(op) if op == ">")
            && matches!(iter.peek(), Some(Token::Word(target)) if !target.dynamic)
        {
            iter.next();
            continue;
        }
        stripped.push(token);
    }
    let mut commands = vec![Vec::new()];
    let mut ops = Vec::new();
    for token in stripped {
        match token {
            Token::Word(word) => commands.last_mut().unwrap().push(word),
            Token::Op(op) => {
                ops.push(op);
                commands.push(Vec::new());
            }
        }
    }
    while commands.last().is_some_and(Vec::is_empty)
        && ops.last().is_some_and(|op| op == ";" || op == "\n")
    {
        commands.pop();
        ops.pop();
    }
    let mut dir = cwd.to_owned();
    let mut found = None;
    let mut plain_cd = false;
    let mutates = commands.iter().any(|words| {
        words.first().is_some_and(|w| {
            matches!(
                name(&w.value),
                "export"
                    | "declare"
                    | "typeset"
                    | "readonly"
                    | "local"
                    | "set"
                    | "unset"
                    | "alias"
                    | "unalias"
                    | "source"
                    | "."
                    | "shopt"
                    | "enable"
                    | "hash"
            )
        })
    });
    for (n, words) in commands.iter().enumerate() {
        if (command.contains("git") || command.contains("gh"))
            && words.first().is_some_and(|w| {
                matches!(
                    name(&w.value),
                    "eval" | "bash" | "sh" | "zsh" | "dash" | "ksh" | "fish"
                )
            })
            && words.iter().skip(1).any(|w| w.dynamic)
        {
            return Err("a shell script is computed at run time beside git or gh".into());
        }
        if words.first().is_some_and(|w| w.value == "cd")
            && n == 0
            && words.len() == 2
            && !words[1].dynamic
        {
            dir = dir.join(&words[1].value);
            plain_cd = true;
        }
        if let Some(call) = inspect(
            words,
            &dir,
            command.contains("git") || command.contains("gh"),
            mutates,
        )? {
            if found.is_some() {
                return Err("it shares the line with another gated command".into());
            }
            found = Some(call);
        }
    }
    if let Some(call) = &found {
        if !(commands.len() == 1 || commands.len() == 2 && plain_cd && ops == ["&&"]) {
            return Err("run the gated command alone (optionally after one cd <dir> &&)".into());
        }
        if call.args.iter().any(|w| w.dynamic && !w.safe_value) {
            return Err("a gated argument is computed at run time".into());
        }
    } else if gated(command) && (!ops.is_empty() || command.contains('$') || command.contains('`'))
    {
        return Err("unsupported shell syntax on a line that mentions a gated command".into());
    }
    Ok(found)
}

#[derive(Debug)]
pub struct OptionValue {
    pub name: String,
    pub negated: bool,
    pub value: Option<String>,
}
#[derive(Debug)]
pub struct Options {
    pub opts: Vec<OptionValue>,
    pub positional: Vec<String>,
}
impl Options {
    pub fn has(&self, names: &[&str]) -> bool {
        names.iter().any(|name| {
            self.opts
                .iter()
                .rev()
                .find(|o| o.name == *name)
                .is_some_and(|o| !o.negated)
        })
    }
    pub fn last(&self, name: &str) -> Option<&str> {
        self.opts
            .iter()
            .rev()
            .find(|o| o.name == name)
            .and_then(|o| o.value.as_deref())
    }
}

pub fn options(args: &[Word], kind: &str) -> Result<Options> {
    let (none, required, optional, short) = match kind {
        "commit" => (
            "all patch interactive include only pathspec-file-nul quiet verbose dry-run short branch porcelain long null reset-author signoff verify allow-empty allow-empty-message edit amend post-rewrite status ahead-behind help",
            "pathspec-from-file reuse-message reedit-message fixup squash file author date message template trailer cleanup",
            "untracked-files gpg-sign",
            "a:all p:patch i:include o:only h:help n:no-verify m:message F:file C:reuse-message c:reedit-message t:template u:untracked-files S:gpg-sign s:signoff e:edit q:quiet v:verbose z:null",
        ),
        "push" => (
            "all branches mirror tags follow-tags atomic dry-run porcelain delete prune force force-if-includes set-upstream thin quiet verbose progress verify ipv4 ipv6 help",
            "repo recurse-submodules receive-pack exec push-option",
            "force-with-lease signed",
            "v:verbose q:quiet f:force n:dry-run d:delete u:set-upstream 4:ipv4 6:ipv6 o:push-option h:help",
        ),
        _ => (
            "draft fill fill-first fill-verbose web editor no-maintainer-edit dry-run help",
            "title body body-file base head assignee label milestone project reviewer recover template repo",
            "",
            "t:title b:body F:body-file B:base H:head d:draft f:fill w:web e:editor a:assignee l:label m:milestone p:project r:reviewer T:template R:repo h:help",
        ),
    };
    let long = none
        .split_whitespace()
        .map(|s| (s, 0))
        .chain(required.split_whitespace().map(|s| (s, 1)))
        .chain(optional.split_whitespace().map(|s| (s, 2)))
        .collect::<Vec<_>>();
    let mut out = Options {
        opts: Vec::new(),
        positional: Vec::new(),
    };
    let mut i = 0;
    let mut rest = false;
    while i < args.len() {
        let word = &args[i];
        if word.dynamic {
            return Err("an argument is computed at run time".into());
        }
        let v = word.value.as_str();
        if !rest && v == "--" {
            rest = true;
            i += 1;
            continue;
        }
        if rest || !v.starts_with('-') || v == "-" {
            out.positional.push(v.into());
            i += 1;
            continue;
        }
        if let Some(raw) = v.strip_prefix("--") {
            let (name, attached) = raw
                .split_once('=')
                .map_or((raw, None), |(k, v)| (k, Some(v)));
            let exact = long
                .iter()
                .find(|(n, _)| *n == name)
                .map(|&(n, t)| (n, t, false));
            let negative = name.strip_prefix("no-");
            let mut choices = Vec::new();
            if let Some(exact) = exact {
                choices.push(exact);
            } else if kind != "pr" {
                if let Some(&(n, _)) = negative.and_then(|neg| long.iter().find(|(n, _)| *n == neg))
                {
                    choices.push((n, 0, true));
                }
                if choices.is_empty() {
                    for &(n, t) in &long {
                        if n.starts_with(name) {
                            choices.push((n, t, false));
                        }
                        if negative.is_some_and(|neg| n.starts_with(neg)) {
                            choices.push((n, 0, true));
                        }
                    }
                }
            }
            if choices.len() != 1 {
                return Err(format!(
                    "{} option --{name}",
                    if choices.is_empty() {
                        "unknown"
                    } else {
                        "ambiguous"
                    }
                ));
            }
            let (name, ty, negated) = choices[0];
            let value = if let Some(v) = attached {
                if ty == 0 && kind != "pr" {
                    return Err(format!("--{name} takes no value"));
                }
                Some(v.to_owned())
            } else if ty == 1 {
                i += 1;
                Some(
                    args.get(i)
                        .ok_or_else(|| format!("--{name} needs a value"))?
                        .value
                        .clone(),
                )
            } else {
                None
            };
            out.opts.push(OptionValue {
                name: if kind == "push" && name == "branches" {
                    "all"
                } else {
                    name
                }
                .into(),
                negated,
                value,
            });
        } else {
            for (offset, c) in v[1..].char_indices() {
                let name = short
                    .split_whitespace()
                    .find_map(|s| s.strip_prefix(&format!("{c}:")))
                    .ok_or_else(|| format!("unknown option -{c}"))?;
                let ty = long
                    .iter()
                    .find(|(n, _)| *n == name)
                    .map(|x| x.1)
                    .unwrap_or(0);
                let value = if ty == 0 {
                    None
                } else {
                    let attached = &v[offset + 2..];
                    if !attached.is_empty() {
                        Some(attached.to_owned())
                    } else if ty == 1 {
                        i += 1;
                        Some(
                            args.get(i)
                                .ok_or_else(|| format!("-{c} needs a value"))?
                                .value
                                .clone(),
                        )
                    } else {
                        None
                    }
                };
                out.opts.push(OptionValue {
                    name: name.into(),
                    negated: false,
                    value,
                });
                if ty != 0 {
                    break;
                }
            }
        }
        i += 1;
    }
    Ok(out)
}
