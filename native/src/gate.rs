use crate::runtime::Result;
use crate::{payload, runtime, shell, template, token};
use std::fs::{self, OpenOptions};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

fn deny_text(kind: &str, why: &str) -> String {
    match kind {
        "commit" => format!(
            "exonous: git commit blocked — {why}. Run `exonous workflow commit`, follow it (review), then `exonous token commit` and retry."
        ),
        "push" => format!(
            "exonous: git push blocked — {why}. Run `exonous workflow commit`, review, then `exonous token push` and retry."
        ),
        "pr" => format!(
            "exonous: gh pr create blocked — {why}. Run `exonous workflow pr`, review, then retry."
        ),
        _ => format!("exonous: blocked — {why}. Run the command again on its own line."),
    }
}

fn token_error(kind: &str, reason: String) -> String {
    match (kind, reason.as_str()) {
        ("commit", "none") => "no commit token for this repo",
        ("commit", "expired") => "the commit token expired (15 min)",
        ("commit", "mismatch") => "the staged changes differ from what was reviewed",
        ("push", "none") => "no push token for this repo",
        ("push", "expired") => "the push token expired (15 min)",
        ("push", "mismatch") => {
            "the commit being pushed is not the one the push token was minted for"
        }
        ("commit", _) => "the commit token is unreadable",
        _ => "the push token is unreadable",
    }
    .into()
}

fn scan_process(cwd: &Path, args: &[&str], timeout: Duration) -> Result<Option<(bool, String)>> {
    let path = std::env::temp_dir().join(format!("exonous-gitleaks-{}", runtime::nonce()));
    let mut builder = OpenOptions::new();
    builder.create_new(true).write(true).read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        builder.mode(0o600);
    }
    let file = builder
        .open(&path)
        .map_err(|_| "cannot create scanner output")?;
    let result = (|| {
        let stderr = file
            .try_clone()
            .map_err(|_| "cannot capture scanner output")?;
        let mut command = Command::new("gitleaks");
        command
            .args(args)
            .current_dir(cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::from(file))
            .stderr(Stdio::from(stderr));
        command.env("GIT_TERMINAL_PROMPT", "0");
        let mut count = std::env::var("GIT_CONFIG_COUNT")
            .ok()
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(0);
        for (key, value) in [
            ("core.fsmonitor", "false"),
            (
                "core.hooksPath",
                if cfg!(windows) { "NUL" } else { "/dev/null" },
            ),
        ] {
            command
                .env(format!("GIT_CONFIG_KEY_{count}"), key)
                .env(format!("GIT_CONFIG_VALUE_{count}"), value);
            count += 1;
        }
        command.env("GIT_CONFIG_COUNT", count.to_string());
        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(format!("gitleaks could not start ({error})")),
        };
        let start = Instant::now();
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) if start.elapsed() < timeout => {
                    std::thread::sleep(Duration::from_millis(20))
                }
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("gitleaks timed out or could not be monitored".into());
                }
            }
        };
        let output = runtime::read_limited(&path, 1024 * 1024)
            .unwrap_or_else(|_| "scanner output exceeded limit".into());
        Ok(Some((status.success(), output)))
    })();
    let _ = fs::remove_file(path);
    result
}

fn scan_staged(cwd: &Path, warnings: &mut Vec<String>) -> Result<()> {
    let root = runtime::repo_root(cwd)?;
    let spec = ":(glob,icase)**/.gitleaks*";
    let tracked = runtime::git(
        &root,
        &[
            "status",
            "--porcelain=v1",
            "-z",
            "--untracked-files=no",
            "--",
            spec,
        ],
    )?;
    let others = runtime::git(&root, &["ls-files", "-z", "--others", "--", spec])?;
    if !tracked.is_empty() || !others.is_empty() {
        let files = tracked
            .split('\0')
            .chain(others.split('\0'))
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(", ");
        return Err(format!(
            "the gitleaks config differs from HEAD ({files}); a human must commit it"
        ));
    }
    let diff = runtime::git(
        &root,
        &[
            "diff",
            "--cached",
            "-U0",
            "--no-color",
            "--no-ext-diff",
            "--no-textconv",
        ],
    )?;
    if diff.lines().any(|line| {
        line.starts_with('+') && !line.starts_with("+++ ") && line.contains("gitleaks:allow")
    }) {
        return Err("a staged line adds a `gitleaks:allow` comment; a human must commit it".into());
    }
    let Some((_, help)) = scan_process(&root, &["git", "--help"], Duration::from_secs(5))? else {
        warnings.push("exonous: gitleaks not installed — staged content was NOT scanned for secrets (https://github.com/gitleaks/gitleaks#installing).".into());
        return Ok(());
    };
    let mut args = vec!["git", "--staged", "--redact", "--no-banner"];
    if help.contains("--ignore-gitleaks-allow") {
        args.push("--ignore-gitleaks-allow");
    }
    match scan_process(&root, &args, Duration::from_secs(20))? {
        Some((true, _)) => Ok(()),
        Some((false, output)) => Err(format!(
            "gitleaks did not pass the staged changes; remove any secret and re-stage, or allowlist a false positive in a separately reviewed commit:\n{}",
            output
                .lines()
                .filter(|s| !s.trim().is_empty())
                .take(15)
                .collect::<Vec<_>>()
                .join("\n")
        )),
        None => Err("gitleaks disappeared before scanning the staged changes".into()),
    }
}

fn check_commit(
    home: &Path,
    call: &shell::Call,
    opts: &shell::Options,
    warnings: &mut Vec<String>,
) -> Result<()> {
    if opts.has(&["help", "dry-run"]) {
        return Ok(());
    }
    if opts.has(&[
        "all",
        "patch",
        "interactive",
        "include",
        "only",
        "pathspec-from-file",
    ]) || !opts.positional.is_empty()
    {
        return Err("commits that stage at commit time (-a, -i, -o, -p, pathspecs) are not covered by the token; stage with `git add`, mint the token, then run a plain `git commit`".into());
    }
    token::verify(home, token::Kind::Commit, &call.cwd, &[], false)
        .map_err(|e| token_error("commit", e))?;
    scan_staged(&call.cwd, warnings)?;
    token::verify(home, token::Kind::Commit, &call.cwd, &[], true)
        .map_err(|e| token_error("commit", e))
}

fn check_push(home: &Path, call: &shell::Call, opts: &shell::Options) -> Result<()> {
    if let Some(config) = call.configs.iter().find(|s| {
        ["push.", "remote.", "branch."]
            .iter()
            .any(|prefix| s.starts_with(prefix))
    }) {
        return Err(format!("inline `-c {config}` changes where the push goes"));
    }
    if opts.has(&["help", "dry-run"]) {
        return Ok(());
    }
    let mut force = opts.has(&["force", "force-with-lease", "force-if-includes", "mirror"]);
    let mut all = opts.has(&["all", "branches", "mirror", "prune"]);
    let refs = if opts.has(&["repo"]) {
        opts.positional.as_slice()
    } else {
        opts.positional.get(1..).unwrap_or(&[])
    };
    let branch = runtime::git(&call.cwd, &["branch", "--show-current"]).unwrap_or_default();
    let config = |key: &str| {
        runtime::git(&call.cwd, &["config", "--get", key])
            .ok()
            .filter(|s| !s.is_empty())
    };
    let remote = if opts.has(&["repo"]) {
        opts.last("repo").map(str::to_owned)
    } else {
        opts.positional.first().cloned()
    }
    .or_else(|| config(&format!("branch.{branch}.pushRemote")))
    .or_else(|| config("remote.pushDefault"))
    .or_else(|| config(&format!("branch.{branch}.remote")))
    .or_else(|| {
        let names = runtime::git(&call.cwd, &["remote"]).unwrap_or_default();
        let names = names.lines().collect::<Vec<_>>();
        if names.contains(&"origin") {
            Some("origin".into())
        } else if names.len() == 1 {
            Some(names[0].into())
        } else {
            Some("origin".into())
        }
    });
    if let Some(remote) = remote {
        if refs.is_empty() {
            for directory in ["remotes", "branches"] {
                if runtime::git(
                    &call.cwd,
                    &["rev-parse", "--git-path", &format!("{directory}/{remote}")],
                )
                .is_ok_and(|path| fs::symlink_metadata(call.cwd.join(path)).is_ok())
                {
                    return Err("legacy remote refspecs may send unreviewed branches; name one explicit source and destination".into());
                }
            }
        }
        if runtime::git(
            &call.cwd,
            &[
                "config",
                "--type=bool",
                "--get",
                &format!("remote.{remote}.mirror"),
            ],
        )
        .is_ok_and(|s| s == "true")
        {
            return Err("the configured remote mirrors every branch; use a non-mirror remote and push one explicit branch at a time".into());
        }
        if refs.is_empty()
            && runtime::git(
                &call.cwd,
                &["config", "--get-all", &format!("remote.{remote}.push")],
            )
            .is_ok_and(|s| !s.is_empty())
        {
            return Err("configured remote push refspecs may send unreviewed branches; name one explicit source and destination".into());
        }
    }
    if refs.is_empty() && config("push.default").is_some_and(|s| s == "matching") {
        return Err("push.default=matching touches every matching branch; name one explicit source and destination".into());
    }
    let short = |name: &str| {
        let n = name.strip_prefix("refs/heads/").unwrap_or(name);
        if n == "HEAD" {
            branch.clone()
        } else {
            n.to_owned()
        }
    };
    let mut pushes: Vec<(Option<String>, Option<String>)> = Vec::new();
    if refs.is_empty() && !all {
        let dst = runtime::git(
            &call.cwd,
            &[
                "rev-parse",
                "--abbrev-ref",
                "--symbolic-full-name",
                "@{push}",
            ],
        )
        .ok()
        .filter(|s| !s.is_empty())
        .map(|s| s.split_once('/').map_or(s.clone(), |(_, b)| b.to_owned()));
        pushes.push((Some("HEAD".into()), dst));
    }
    for raw in refs {
        force |= raw.starts_with('+');
        let spec = raw.strip_prefix('+').unwrap_or(raw);
        all |= spec.contains('*') || spec == ":";
        if opts.has(&["delete"]) {
            pushes.push((None, Some(short(spec))));
        } else if let Some((src, dst)) = spec.split_once(':') {
            pushes.push((
                if src.is_empty() {
                    None
                } else {
                    Some(src.into())
                },
                Some(short(if dst.is_empty() { src } else { dst })),
            ));
        } else {
            pushes.push((Some(spec.into()), Some(short(spec))));
        }
    }
    let guarded = pushes
        .iter()
        .any(|(_, dst)| dst.as_deref().is_none_or(|d| d == "main" || d == "master"));
    if !force && !all && !guarded {
        return Ok(());
    }
    if all {
        return Err("push touches every branch; push one branch at a time".into());
    }
    if pushes.iter().any(|(src, _)| src.is_none()) {
        return Err("deleting a protected or force-pushed branch needs a human".into());
    }
    let shas = pushes
        .iter()
        .map(|(src, dst)| {
            runtime::git(
                &call.cwd,
                &[
                    "rev-parse",
                    "--verify",
                    "--end-of-options",
                    &format!("{}^{{commit}}", src.as_deref().unwrap_or("")),
                ],
            )
            .map_err(|_| {
                let source = src.as_deref().unwrap_or("");
                if !source.is_empty() && source != "HEAD" && !source.contains(['~','^',':','@']) {
                    format!("there is no local branch \"{}\" to push; push the branch you mean, e.g. `git push origin HEAD:{}`, after review",source.strip_prefix("refs/heads/").unwrap_or(source),dst.as_deref().unwrap_or(""))
                } else { "cannot resolve what the push would send".into() }
            })
        })
        .collect::<Result<Vec<_>>>()?;
    token::verify(home, token::Kind::Push, &call.cwd, &shas, false)
        .map_err(|e| format!("push needs review; {}", token_error("push", e)))?;
    token::verify(home, token::Kind::Push, &call.cwd, &shas, true)
        .map_err(|e| format!("push needs review; {}", token_error("push", e)))
}

fn check_pr(home: &Path, call: &shell::Call, opts: &shell::Options) -> Result<()> {
    if opts.has(&["help"])
        && !matches!(
            opts.last("help"),
            Some("false" | "False" | "FALSE" | "0" | "f" | "F")
        )
    {
        return Ok(());
    }
    if let Some(arg) = opts.positional.first() {
        return Err(format!("unexpected argument \"{arg}\""));
    }
    let base = opts.last("base").map(str::to_owned).or_else(|| {
        runtime::git(
            &call.cwd,
            &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
        )
        .ok()
        .map(|s| s.strip_prefix("origin/").unwrap_or(&s).to_owned())
    });
    if let Some(base) = base {
        let head = opts
            .last("head")
            .map(|h| format!("origin/{}", h.split_once(':').map_or(h, |(_, b)| b)))
            .unwrap_or_else(|| "HEAD".into());
        if let Ok(diff) = runtime::git(
            &call.cwd,
            &[
                "diff",
                "--name-status",
                "-M100%",
                &format!("origin/{base}...{head}"),
            ],
        ) {
            let count = diff
                .lines()
                .filter(|s| !s.is_empty() && !s.starts_with("R100"))
                .count();
            if count > 30 {
                return Err(format!(
                    "PR has {count} changed files (max 30). Split it into smaller PRs, each with one cohesive goal (stack them if they depend on each other)"
                ));
            }
        }
    }
    let body = match opts.last("body-file") {
        Some("-") => return Err(
            "A PR body read from stdin cannot be checked; write it to a file and pass --body-file"
                .into(),
        ),
        Some(file) if !file.is_empty() => {
            runtime::read_limited(&call.cwd.join(file), 16 * 1024 * 1024)
                .map_err(|_| format!("PR body file not found or unreadable: {file}"))?
        }
        _ => opts.last("body").unwrap_or("").to_owned(),
    };
    template::validate(&body, &template::resolve(&call.cwd, home))
        .map_err(|s| s.trim_end_matches('.').into())
}

pub fn run(home: &Path, cwd: &Path, adapter: &str, raw: &str) -> payload::Decision {
    let Some(input) = payload::parse(adapter, raw, &cwd.to_string_lossy()) else {
        return if raw.contains("git") || raw.contains("gh") {
            payload::deny(
                adapter,
                &deny_text(
                    "auto",
                    "hook input had no shell command, and the input mentions git or gh",
                ),
            )
        } else {
            payload::allow(
                adapter,
                &["exonous: hook input had no shell command — command not checked.".into()],
            )
        };
    };
    let call = match shell::analyze(&input.command, Path::new(&input.cwd)) {
        Ok(Some(call)) => call,
        Ok(None) => return payload::allow(adapter, &[]),
        Err(why) => return payload::deny(adapter, &deny_text("auto", &why)),
    };
    let mut warnings = Vec::new();
    let result = shell::options(&call.args, call.kind)
        .map_err(|why| format!("cannot verify its options: {why}"))
        .and_then(|opts| match call.kind {
            "commit" => check_commit(home, &call, &opts, &mut warnings),
            "push" => check_push(home, &call, &opts),
            _ => check_pr(home, &call, &opts),
        });
    match result {
        Ok(()) => payload::allow(adapter, &warnings),
        Err(why) => {
            let mut out = payload::deny(adapter, &deny_text(call.kind, &why));
            if !warnings.is_empty() {
                out.stderr = format!("{}\n{}", warnings.join("\n"), out.stderr);
            }
            out
        }
    }
}
