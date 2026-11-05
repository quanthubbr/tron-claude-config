use exonous::{gate, runtime, token};
use serde_json::json;
use std::fs;

fn setup() -> (tempfile::TempDir, tempfile::TempDir) {
    let home = tempfile::tempdir().unwrap();
    let repo = tempfile::tempdir().unwrap();
    runtime::git(repo.path(), &["init", "-q", "-b", "feature"]).unwrap();
    fs::write(repo.path().join("a"), "one").unwrap();
    runtime::git(repo.path(), &["add", "a"]).unwrap();
    runtime::git(
        repo.path(),
        &[
            "-c",
            "user.name=T",
            "-c",
            "user.email=t@t",
            "commit",
            "-qm",
            "init",
        ],
    )
    .unwrap();
    fs::write(repo.path().join("a"), "two").unwrap();
    runtime::git(repo.path(), &["add", "a"]).unwrap();
    (home, repo)
}

fn run(home: &std::path::Path, repo: &std::path::Path, cmd: &str) -> exonous::payload::Decision {
    gate::run(home, repo, "claude", &json!({"command":cmd}).to_string())
}

#[test]
fn commit_authorization_is_one_use_and_bound_to_staged_tree() {
    let (home, repo) = setup();
    assert_eq!(run(home.path(), repo.path(), "git commit -m x").code, 2);
    token::mint(home.path(), token::Kind::Commit, repo.path()).unwrap();
    assert_eq!(run(home.path(), repo.path(), "git commit -m x").code, 0);
    assert_eq!(run(home.path(), repo.path(), "git commit -m x").code, 2);
    token::mint(home.path(), token::Kind::Commit, repo.path()).unwrap();
    fs::write(repo.path().join("a"), "three").unwrap();
    runtime::git(repo.path(), &["add", "a"]).unwrap();
    assert!(
        run(home.path(), repo.path(), "git commit -m x")
            .stderr
            .contains("staged changes differ")
    );
}

#[test]
fn staging_and_compound_commands_cannot_spend_token() {
    let (home, repo) = setup();
    token::mint(home.path(), token::Kind::Commit, repo.path()).unwrap();
    for cmd in [
        "git commit -am x",
        "git commit --on -m x",
        "git commit -m x a",
        "git add . && git commit -m x",
        "git commit -m x | cat",
        "bash -c 'git add . && git commit -m x'",
        "git commit -m $MESSAGE",
        "env GIT_INDEX_FILE=x git commit -m x",
        "GIT_INDEX_FILE=x git commit -m x",
        "builtin git commit -m x",
        "script -q -c 'git commit -m x' /dev/null",
        "eval \"$X\" && git status",
        "bash -c \"$SCRIPT\"; gh pr list",
    ] {
        assert_eq!(run(home.path(), repo.path(), cmd).code, 2, "{cmd}");
        assert!(
            token::verify(home.path(), token::Kind::Commit, repo.path(), &[], false).is_ok(),
            "{cmd}"
        );
    }
    assert_eq!(
        run(home.path(), repo.path(), "git commit --dry-run").code,
        0
    );
}

#[test]
fn ordinary_commands_and_adapter_denials() {
    let (home, repo) = setup();
    for cmd in [
        "git log",
        "git status && ls",
        "gh pr list",
        "echo 'git commit'",
        "git commit --help",
    ] {
        assert_eq!(run(home.path(), repo.path(), cmd).code, 0, "{cmd}");
    }
    let out = gate::run(
        home.path(),
        repo.path(),
        "copilot",
        "{\"command\":\"git commit -m x\"}",
    );
    assert_eq!(out.code, 0);
    assert!(out.stdout.contains("\"permissionDecision\":\"deny\""));
    assert_eq!(
        gate::run(home.path(), repo.path(), "claude", "garbage").code,
        0
    );
    assert_eq!(
        gate::run(home.path(), repo.path(), "claude", "garbage git").code,
        2
    );
}

#[test]
fn protected_push_and_pr_body_are_checked() {
    let (home, repo) = setup();
    assert_eq!(
        run(home.path(), repo.path(), "git push origin feature").code,
        0
    );
    assert_eq!(
        run(home.path(), repo.path(), "git push origin HEAD:main").code,
        2
    );
    token::mint(home.path(), token::Kind::Push, repo.path()).unwrap();
    assert_eq!(
        run(home.path(), repo.path(), "git push origin HEAD:main").code,
        0
    );
    for cmd in [
        "git push --all --force",
        "git push --force origin :main",
        "git -c push.default=matching push",
        "gh pr create --body x",
        "gh pr create --body-file -",
    ] {
        assert_eq!(run(home.path(), repo.path(), cmd).code, 2, "{cmd}");
    }
    fs::create_dir(repo.path().join(".github")).unwrap();
    fs::write(
        repo.path().join(".github/pull_request_template.md"),
        "## Why\n## Tests",
    )
    .unwrap();
    assert_eq!(
        run(
            home.path(),
            repo.path(),
            "gh pr create --body 'Why: fix; Tests: pass'"
        )
        .code,
        0
    );
}

#[test]
fn changed_scanner_config_and_allow_comments_preserve_token() {
    let (home, repo) = setup();
    token::mint(home.path(), token::Kind::Commit, repo.path()).unwrap();
    fs::write(repo.path().join(".GITLEAKS.toml"), "").unwrap();
    assert!(
        run(home.path(), repo.path(), "git commit -m x")
            .stderr
            .contains("gitleaks config")
    );
    assert!(token::verify(home.path(), token::Kind::Commit, repo.path(), &[], false).is_ok());
}

#[test]
fn cd_and_git_directory_options_select_token_repository() {
    let (home, repo) = setup();
    let outside = tempfile::tempdir().unwrap();
    token::mint(home.path(), token::Kind::Commit, repo.path()).unwrap();
    assert_eq!(
        run(
            home.path(),
            outside.path(),
            &format!("cd '{}' && git commit -m x", repo.path().display())
        )
        .code,
        0
    );
    token::mint(home.path(), token::Kind::Commit, repo.path()).unwrap();
    assert_eq!(
        run(
            home.path(),
            outside.path(),
            &format!("git -C '{}' commit -m x", repo.path().display())
        )
        .code,
        0
    );
}

#[test]
fn aliases_and_pr_api_cannot_bypass_review() {
    let (home, repo) = setup();
    runtime::git(repo.path(), &["config", "alias.ci", "commit"]).unwrap();
    for cmd in [
        "git ci -m x",
        "git -c alias.ci=commit ci -m x",
        "git config alias.ci commit",
        "gh alias set ship 'pr create'",
        "gh api repos/o/r/pulls -f title=x",
        "gh api graphql -f query=x",
    ] {
        assert_eq!(run(home.path(), repo.path(), cmd).code, 2, "{cmd}");
    }
}

#[test]
fn allow_comment_additions_deny_before_scanner_and_token_consumption() {
    let (home, repo) = setup();
    fs::write(repo.path().join("a"), "secret # gitleaks:allow").unwrap();
    runtime::git(repo.path(), &["add", "a"]).unwrap();
    token::mint(home.path(), token::Kind::Commit, repo.path()).unwrap();
    assert!(
        run(home.path(), repo.path(), "git commit -m x")
            .stderr
            .contains("gitleaks:allow")
    );
    assert!(token::verify(home.path(), token::Kind::Commit, repo.path(), &[], false).is_ok());
}

#[test]
fn protected_push_checks_each_source_and_preserves_token_on_mismatch() {
    let (home, repo) = setup();
    let first = runtime::git(repo.path(), &["rev-parse", "HEAD"]).unwrap();
    runtime::git(
        repo.path(),
        &[
            "-c",
            "user.name=T",
            "-c",
            "user.email=t@t",
            "commit",
            "-qm",
            "second",
        ],
    )
    .unwrap();
    token::mint(home.path(), token::Kind::Push, repo.path()).unwrap();
    let cmd = format!("git push origin {first}:main");
    assert!(
        run(home.path(), repo.path(), &cmd)
            .stderr
            .contains("not the one")
    );
    assert!(token::verify(home.path(), token::Kind::Push, repo.path(), &[], false).is_ok());
    assert_eq!(
        run(
            home.path(),
            repo.path(),
            "git push --force-with-lease origin HEAD:feature"
        )
        .code,
        0
    );
}

#[test]
fn cli_option_abbreviations_values_and_negations_match_safety_rules() {
    let (home, repo) = setup();
    token::mint(home.path(), token::Kind::Commit, repo.path()).unwrap();
    for cmd in [
        "git commit --al",
        "git commit --a",
        "git commit --message",
        "git commit --unknown",
        "git commit -m x --pathspec-from-file=paths",
        "git commit --message=-a --include",
    ] {
        assert_eq!(run(home.path(), repo.path(), cmd).code, 2, "{cmd}");
        assert!(token::verify(home.path(), token::Kind::Commit, repo.path(), &[], false).is_ok());
    }
    assert_eq!(
        run(home.path(), repo.path(), "git commit --no-all --message=-a").code,
        0
    );
}

#[test]
fn pr_size_counts_content_changes_but_excludes_pure_moves() {
    let (home, repo) = setup();
    runtime::git(
        repo.path(),
        &["update-ref", "refs/remotes/origin/main", "HEAD"],
    )
    .unwrap();
    for i in 0..31 {
        fs::write(repo.path().join(format!("extra{i}")), "x").unwrap();
    }
    runtime::git(repo.path(), &["add", "."]).unwrap();
    runtime::git(
        repo.path(),
        &[
            "-c",
            "user.name=T",
            "-c",
            "user.email=t@t",
            "commit",
            "-qm",
            "many",
        ],
    )
    .unwrap();
    assert!(
        run(
            home.path(),
            repo.path(),
            "gh pr create --base main --body x"
        )
        .stderr
        .contains("max 30")
    );
}

#[test]
fn safely_readable_shell_forms_keep_commit_authorization() {
    let (home, repo) = setup();
    for cmd in [
        "bash -lc 'git commit -m x'",
        "FOO=1 git commit -m x",
        "git commit -m x >out",
        "git commit -m \"$MESSAGE\"",
    ] {
        token::mint(home.path(), token::Kind::Commit, repo.path()).unwrap();
        assert_eq!(run(home.path(), repo.path(), cmd).code, 0, "{cmd}");
    }
}

#[test]
fn pr_false_help_is_not_authorization() {
    let (home, repo) = setup();
    assert_eq!(
        run(
            home.path(),
            repo.path(),
            "gh pr create --help=false --body x"
        )
        .code,
        2
    );
}

#[test]
fn computed_tool_names_only_gate_when_they_can_reach_git_or_gh() {
    let (home, repo) = setup();
    runtime::git(repo.path(), &["config", "alias.ci", "commit"]).unwrap();
    runtime::git(repo.path(), &["config", "alias.st2", "status"]).unwrap();
    for command in [
        "$HOME/bin/tool --x",
        "\"$PYTHON\" script.py",
        "$(which node) x",
        "\"$VENV/bin/python\" -m pytest",
        "\"$BIN\" run",
        "gi${t} status",
        "git st2",
    ] {
        assert_eq!(run(home.path(), repo.path(), command).code, 0, "{command}");
    }
    for command in [
        "gi${t} ci -m x",
        "$(echo git) status",
        "\"$BIN\" run \"$ARG\"",
    ] {
        assert_eq!(run(home.path(), repo.path(), command).code, 2, "{command}");
    }
    token::mint(home.path(), token::Kind::Commit, repo.path()).unwrap();
    assert_eq!(
        run(home.path(), repo.path(), "$HOME/bin/git commit -m x").code,
        0
    );
}

#[test]
fn cancelled_dry_run_commits_in_git_and_requires_gate_authorization() {
    let (home, repo) = setup();
    let before = runtime::git(repo.path(), &["rev-parse", "HEAD"]).unwrap();
    runtime::git(
        repo.path(),
        &[
            "-c",
            "user.name=T",
            "-c",
            "user.email=t@t",
            "commit",
            "--dry-run",
            "--no-dry-run",
            "-m",
            "real negation proof",
        ],
    )
    .unwrap();
    let after = runtime::git(repo.path(), &["rev-parse", "HEAD"]).unwrap();
    assert_ne!(before, after, "real Git must commit after --no-dry-run");
    eprintln!("real git commit --dry-run --no-dry-run changed HEAD: {before} -> {after}");
    for cmd in [
        "git commit --dry-run --no-dry-run -m x",
        "git commit --dry --no-dry -m x",
        "git commit -m x --dry-run --no-dry-run",
        "git commit --no-dry-run --dry-run --no-dry-run -m x",
    ] {
        assert_eq!(run(home.path(), repo.path(), cmd).code, 2, "{cmd}");
    }
    assert_eq!(
        run(
            home.path(),
            repo.path(),
            "git commit --no-dry-run --dry-run -m x"
        )
        .code,
        0
    );
}

#[test]
fn cancelled_dry_run_pushes_in_git_and_requires_gate_authorization() {
    let (home, repo) = setup();
    let remote = home.path().join("remote.git");
    runtime::git(
        home.path(),
        &["init", "--bare", "-q", remote.to_str().unwrap()],
    )
    .unwrap();
    runtime::git(
        repo.path(),
        &["remote", "add", "origin", remote.to_str().unwrap()],
    )
    .unwrap();
    runtime::git(
        repo.path(),
        &["push", "--dry-run", "--no-dry-run", "origin", "HEAD:main"],
    )
    .unwrap();
    let local = runtime::git(repo.path(), &["rev-parse", "HEAD"]).unwrap();
    assert_eq!(
        runtime::git(&remote, &["rev-parse", "refs/heads/main"]).unwrap(),
        local,
        "real Git must update the remote after --no-dry-run"
    );
    eprintln!("real git push --dry-run --no-dry-run created remote main at {local}");
    for cmd in [
        "git push --dry-run --no-dry-run origin HEAD:main",
        "git push --dry --no-dry origin HEAD:main",
        "git push -n --no-dry-run --force origin HEAD:feature",
    ] {
        assert_eq!(run(home.path(), repo.path(), cmd).code, 2, "{cmd}");
    }
    assert_eq!(
        run(
            home.path(),
            repo.path(),
            "git push --no-dry-run --dry-run origin HEAD:main"
        )
        .code,
        0
    );
}

#[test]
fn persistent_push_configuration_cannot_send_unreviewed_branches() {
    for matching in [true, false] {
        let (home, repo) = setup();
        let remote = home.path().join("remote.git");
        runtime::git(
            home.path(),
            &["init", "--bare", "-q", remote.to_str().unwrap()],
        )
        .unwrap();
        runtime::git(
            repo.path(),
            &["remote", "add", "origin", remote.to_str().unwrap()],
        )
        .unwrap();
        runtime::git(repo.path(), &["branch", "main"]).unwrap();
        runtime::git(repo.path(), &["push", "-u", "origin", "feature", "main"]).unwrap();
        let initial = runtime::git(repo.path(), &["rev-parse", "HEAD"]).unwrap();
        runtime::git(
            repo.path(),
            &[
                "-c",
                "user.name=T",
                "-c",
                "user.email=t@t",
                "commit",
                "-qm",
                "unreviewed main",
            ],
        )
        .unwrap();
        let unreviewed = runtime::git(repo.path(), &["rev-parse", "HEAD"]).unwrap();
        runtime::git(repo.path(), &["branch", "-f", "main", "HEAD"]).unwrap();
        runtime::git(repo.path(), &["update-ref", "refs/heads/feature", &initial]).unwrap();
        if matching {
            runtime::git(repo.path(), &["config", "push.default", "matching"]).unwrap();
        } else {
            runtime::git(
                repo.path(),
                &["config", "--add", "remote.origin.push", "feature:feature"],
            )
            .unwrap();
            runtime::git(
                repo.path(),
                &["config", "--add", "remote.origin.push", "main:main"],
            )
            .unwrap();
        }
        runtime::git(repo.path(), &["push", "origin"]).unwrap();
        assert_eq!(
            runtime::git(&remote, &["rev-parse", "refs/heads/main"]).unwrap(),
            unreviewed
        );
        assert_ne!(initial, unreviewed, "Git sent a branch other than HEAD");
        eprintln!(
            "real git push origin with {} advanced remote main independently of HEAD",
            if matching {
                "push.default=matching"
            } else {
                "multiple remote.origin.push mappings"
            }
        );
        assert_eq!(
            run(home.path(), repo.path(), "git push origin").code,
            2,
            "matching={matching}"
        );
        token::mint(home.path(), token::Kind::Push, repo.path()).unwrap();
        assert_eq!(
            run(home.path(), repo.path(), "git push origin").code,
            2,
            "HEAD token must not cover configured multiple branches"
        );
        assert_eq!(
            run(home.path(), repo.path(), "git push origin HEAD:feature").code,
            0
        );
    }
}

#[test]
fn security_sensitive_options_follow_the_last_effective_value() {
    let (home, repo) = setup();
    for cmd in [
        "git commit --all --no-all -m x",
        "git commit -a --no-all -m x",
        "git commit --include --no-include -m x",
        "git commit --only --no-only -m x",
    ] {
        token::mint(home.path(), token::Kind::Commit, repo.path()).unwrap();
        assert_eq!(run(home.path(), repo.path(), cmd).code, 0, "{cmd}");
    }
    for flags in ["--no-all -a", "--no-include --include", "--no-only --only"] {
        token::mint(home.path(), token::Kind::Commit, repo.path()).unwrap();
        assert_eq!(
            run(
                home.path(),
                repo.path(),
                &format!("git commit {flags} -m x")
            )
            .code,
            2,
            "{flags}"
        );
        assert!(token::verify(home.path(), token::Kind::Commit, repo.path(), &[], false).is_ok());
    }
    for flags in [
        "-f --no-force",
        "--force-with-lease --no-force-with-lease",
        "--force-if-includes --no-force-if-includes",
        "--mirror --no-mirror",
        "--all --no-all",
        "--prune --no-prune",
        "--branches --no-all",
        "--all --no-branches",
    ] {
        assert_eq!(
            run(
                home.path(),
                repo.path(),
                &format!("git push {flags} origin HEAD:feature")
            )
            .code,
            0,
            "{flags}"
        );
    }
    for flags in [
        "--no-force -f",
        "--no-force-with-lease --force-with-lease",
        "--no-force-if-includes --force-if-includes",
        "--no-mirror --mirror",
        "--no-all --all",
        "--no-prune --prune",
        "--no-branches --all",
        "--no-all --branches",
    ] {
        assert_eq!(
            run(
                home.path(),
                repo.path(),
                &format!("git push {flags} origin HEAD:feature")
            )
            .code,
            2,
            "{flags}"
        );
    }
    token::mint(home.path(), token::Kind::Push, repo.path()).unwrap();
    assert_eq!(
        run(
            home.path(),
            repo.path(),
            "git push --delete --no-delete origin HEAD:main"
        )
        .code,
        0
    );
    token::mint(home.path(), token::Kind::Push, repo.path()).unwrap();
    assert_eq!(
        run(
            home.path(),
            repo.path(),
            "git push --no-delete --delete origin main"
        )
        .code,
        2
    );
    assert!(token::verify(home.path(), token::Kind::Push, repo.path(), &[], false).is_ok());
}

#[test]
fn legacy_remote_refspecs_cannot_send_unreviewed_branches() {
    for legacy_dir in ["remotes", "branches"] {
        let (home, repo) = setup();
        let remote = home.path().join("remote.git");
        runtime::git(
            home.path(),
            &["init", "--bare", "-q", remote.to_str().unwrap()],
        )
        .unwrap();
        runtime::git(
            repo.path(),
            &["remote", "add", "origin", remote.to_str().unwrap()],
        )
        .unwrap();
        runtime::git(repo.path(), &["branch", "main"]).unwrap();
        runtime::git(repo.path(), &["push", "-u", "origin", "feature", "main"]).unwrap();
        let initial = runtime::git(repo.path(), &["rev-parse", "HEAD"]).unwrap();
        runtime::git(
            repo.path(),
            &[
                "-c",
                "user.name=T",
                "-c",
                "user.email=t@t",
                "commit",
                "-qm",
                "unreviewed legacy branch",
            ],
        )
        .unwrap();
        let unreviewed = runtime::git(repo.path(), &["rev-parse", "HEAD"]).unwrap();
        runtime::git(repo.path(), &["branch", "-f", "main", "HEAD"]).unwrap();
        runtime::git(repo.path(), &["branch", "origin", "HEAD"]).unwrap();
        if legacy_dir == "remotes" {
            runtime::git(repo.path(), &["update-ref", "refs/heads/feature", &initial]).unwrap();
        }
        runtime::git(
            repo.path(),
            &["config", "--remove-section", "remote.origin"],
        )
        .unwrap();
        let legacy = repo.path().join(".git").join(legacy_dir);
        fs::create_dir_all(&legacy).unwrap();
        fs::write(
            legacy.join("origin"),
            if legacy_dir == "remotes" {
                format!(
                    "URL: {}\nPush: feature:feature\nPush: main:main\n",
                    remote.display()
                )
            } else {
                format!("{}#main\n", remote.display())
            },
        )
        .unwrap();
        runtime::git(repo.path(), &["push", "origin"]).unwrap();
        assert_eq!(
            runtime::git(&remote, &["rev-parse", "refs/heads/main"]).unwrap(),
            unreviewed,
            "legacy {legacy_dir} sent an unreviewed branch"
        );
        eprintln!("real git push origin with .git/{legacy_dir}/origin advanced protected main");
        assert_eq!(
            run(home.path(), repo.path(), "git push origin").code,
            2,
            "legacy {legacy_dir}"
        );
        token::mint(home.path(), token::Kind::Push, repo.path()).unwrap();
        assert_eq!(
            run(home.path(), repo.path(), "git push origin").code,
            2,
            "HEAD token cannot cover legacy {legacy_dir}"
        );
        assert_eq!(
            run(home.path(), repo.path(), "git push origin HEAD:feature").code,
            0
        );
    }
}
