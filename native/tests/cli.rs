use std::fs;
use std::process::Command;

fn run(home: &std::path::Path, cwd: &std::path::Path, args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_exonous"))
        .args(args)
        .current_dir(cwd)
        .env("EXONOUS_HOME", home)
        .env("EXONOUS_NO_UPDATE", "1")
        .env_remove("PROJECT_MEMORY_VAULT")
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .output()
        .unwrap()
}

#[test]
fn native_workflow_runs_without_node_and_rejects_unknown_workflow() {
    let home = tempfile::tempdir().unwrap();
    let out = Command::new(env!("CARGO_BIN_EXE_exonous"))
        .args(["workflow", "commit"])
        .env("PATH", "")
        .env("EXONOUS_HOME", home.path())
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let text = String::from_utf8(out.stdout).unwrap();
    assert!(text.contains("commit"));
    assert!(!text.starts_with("---"));
    assert_eq!(
        run(home.path(), home.path(), &["workflow", "wat"])
            .status
            .code(),
        Some(2)
    );
}

#[test]
fn native_reminder_opt_out_and_cursor_protocol() {
    let home = tempfile::tempdir().unwrap();
    let out = run(
        home.path(),
        home.path(),
        &["hook", "ethos", "--adapter", "cursor"],
    );
    assert!(out.status.success());
    let value: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
    assert!(
        value["additional_context"]
            .as_str()
            .unwrap()
            .contains("nomos + praxis")
    );
    fs::create_dir_all(home.path().join(".claude/exonous")).unwrap();
    fs::write(
        home.path().join(".claude/exonous/config.json"),
        "{\"rulesReminder\":false}",
    )
    .unwrap();
    let out = run(
        home.path(),
        home.path(),
        &["hook", "ethos", "--adapter", "cursor"],
    );
    assert!(out.status.success());
    assert!(out.stdout.is_empty());
}

#[test]
fn unknown_commands_and_update_options_cannot_silently_succeed() {
    let home = tempfile::tempdir().unwrap();
    assert_eq!(
        run(home.path(), home.path(), &["typo"]).status.code(),
        Some(2)
    );
    let out = run(home.path(), home.path(), &["update", "--invalid"]);
    assert_eq!(out.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&out.stderr).contains("unknown update option"));
    assert!(!home.path().join(".claude").exists());
}

#[test]
fn installed_gate_selftest_checks_registration_binary_and_actual_denial() {
    let base = tempfile::tempdir().unwrap();
    let home = base.path().join("home$cash");
    fs::create_dir(&home).unwrap();
    let cwd = tempfile::tempdir().unwrap();
    let assets = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("assets");
    let binary = std::path::Path::new(env!("CARGO_BIN_EXE_exonous"));
    exonous::install::install_from(
        &home,
        cwd.path(),
        &["--tools".into(), "cursor".into()],
        &assets,
        binary,
        &[
            "pyle",
            "ethos",
            "metron",
            "taxis-spawn",
            "taxis-session",
            "anamnesis",
            "kairos",
        ],
    )
    .unwrap();
    let out = run(&home, cwd.path(), &["gate", "--selftest", "cursor"]);
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(String::from_utf8_lossy(&out.stdout).contains("denies an unreviewed commit"));
    fs::write(home.join(".cursor/hooks.json"), "{}").unwrap();
    let out = run(&home, cwd.path(), &["gate", "--selftest", "cursor"]);
    assert!(!out.status.success());
    assert!(String::from_utf8_lossy(&out.stderr).contains("not registered"));
}

#[test]
fn session_sweep_preserves_roster_and_every_colliding_role_brief() {
    let home = tempfile::tempdir().unwrap();
    let agents = home.path().join(".claude/agents");
    let roles = home.path().join(".claude/exonous/agent-roles/quarantine");
    fs::create_dir_all(&agents).unwrap();
    fs::create_dir_all(&roles).unwrap();
    fs::write(agents.join("exo-pm.md"), "roster").unwrap();
    fs::write(agents.join("planner.md"), "new role").unwrap();
    fs::write(roles.join("planner.md"), "old role").unwrap();
    let result = taxis(
        home.path(),
        "cursor",
        serde_json::json!({"hook_event_name":"SessionStart"}),
    );
    assert_eq!(result, serde_json::json!({}));
    assert_eq!(
        fs::read_to_string(agents.join("exo-pm.md")).unwrap(),
        "roster"
    );
    assert!(!agents.join("planner.md").exists());
    assert_eq!(
        fs::read_to_string(roles.join("planner.md")).unwrap(),
        "old role"
    );
    assert_eq!(
        fs::read_to_string(roles.join("planner.1.md")).unwrap(),
        "new role"
    );
    taxis(
        home.path(),
        "cursor",
        serde_json::json!({"hook_event_name":"SessionStart"}),
    );
    assert_eq!(fs::read_dir(roles).unwrap().count(), 2);
}

#[test]
fn native_cli_wires_gate_and_vault_without_node() {
    use std::io::Write;
    use std::process::Stdio;
    let home = tempfile::tempdir().unwrap();
    let mut child = Command::new(env!("CARGO_BIN_EXE_exonous"))
        .args(["hook", "pyle", "--adapter", "cursor"])
        .env("EXONOUS_HOME", home.path())
        .env("PATH", "")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(br#"{"command":"git commit -m unauthorized"}"#)
        .unwrap();
    let out = child.wait_with_output().unwrap();
    assert_eq!(out.status.code(), Some(2));
    let denial: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
    assert_eq!(denial["permission"], "deny");
    let vault = home.path().join("notes");
    let set = run(
        home.path(),
        home.path(),
        &["vault", "set", vault.to_str().unwrap(), "--create"],
    );
    assert!(
        set.status.success(),
        "{}",
        String::from_utf8_lossy(&set.stderr)
    );
    let out = run(home.path(), home.path(), &["vault", "show"]);
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(!out.stdout.is_empty());
    let out = run(
        home.path(),
        home.path(),
        &[
            "hook",
            "anamnesis",
            "--event",
            "start",
            "--adapter",
            "codex",
        ],
    );
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
}

#[test]
fn migration_repo_option_selects_target_outside_current_working_directory() {
    let home = tempfile::tempdir().unwrap();
    let repo = tempfile::tempdir().unwrap();
    assert!(
        Command::new("git")
            .args(["init", "--quiet"])
            .arg(repo.path())
            .status()
            .unwrap()
            .success()
    );
    let out = run(
        home.path(),
        home.path(),
        &[
            "migrate",
            "--repo",
            repo.path().to_str().unwrap(),
            "--dry-run",
        ],
    );
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let result: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
    assert_eq!(result["status"], "nothing");
    assert!(!home.path().join(".claude").exists());
}

#[test]
fn handoff_and_vault_errors_preserve_json_stream_and_usage_exit_codes() {
    let home = tempfile::tempdir().unwrap();
    let out = run(
        home.path(),
        home.path(),
        &["handoff", "save", "--body-file", "missing.json"],
    );
    assert_eq!(out.status.code(), Some(1));
    let error: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
    assert_eq!(error["status"], "error");
    assert!(out.stderr.is_empty());
    let out = run(
        home.path(),
        home.path(),
        &["handoff", "latest", "--invalid"],
    );
    assert_eq!(out.status.code(), Some(2));
    let out = run(home.path(), home.path(), &["vault", "set"]);
    assert_eq!(out.status.code(), Some(2));
}

#[cfg(unix)]
#[test]
fn native_design_driver_preserves_arguments_privacy_flags_and_engine_exit() {
    let home = tempfile::tempdir().unwrap();
    let scripts = home.path().join(".claude/skills/ui-design/scripts");
    fs::create_dir_all(&scripts).unwrap();
    fs::write(scripts.join("impeccable"), "#!/bin/sh\nprintf '%s\\n' \"args:$*\" \"flags:$IMPECCABLE_NO_UPDATE_CHECK$IMPECCABLE_NO_TELEMETRY$DO_NOT_TRACK\" \"Impeccable's hint\" 'npx impeccable update'\nexit 3\n").unwrap();
    let out = run(
        home.path(),
        home.path(),
        &["ui-design", "context", "--target", "a $HOME `id`"],
    );
    assert_eq!(out.status.code(), Some(3));
    let output = String::from_utf8(out.stdout).unwrap();
    assert!(output.contains("args:context --target a $HOME `id`"));
    assert!(output.contains("flags:111"));
    assert!(output.contains("ui-design's hint"));
    assert!(!output.contains("npx impeccable"));
    assert_eq!(
        run(home.path(), home.path(), &["ui-design", "update"])
            .status
            .code(),
        Some(2)
    );
}

#[cfg(windows)]
#[test]
fn native_design_driver_rejects_untrusted_candidates_and_invalid_override_without_fallback() {
    use sha2::{Digest, Sha256};
    let home = tempfile::tempdir().unwrap();
    let scripts = home.path().join(".claude/skills/ui-design/scripts");
    fs::create_dir_all(scripts.join("bin/windows-x64")).unwrap();
    fs::write(scripts.join("VERSION"), "0.1.5\n").unwrap();
    fs::write(
        scripts.join("ENGINE-CHECKSUMS"),
        format!(
            "version 0.1.5\n{:x}  impeccable-windows-x64.exe\n",
            Sha256::digest(b"verified inert bytes")
        ),
    )
    .unwrap();
    fs::write(
        scripts.join("bin/windows-x64/impeccable.exe"),
        b"tampered inert bytes",
    )
    .unwrap();
    let marker = home.path().join("launcher-ran");
    fs::write(
        scripts.join("impeccable.cmd"),
        format!(
            "@echo off\r\necho ran>\"{}\"\r\nexit /b 0\r\n",
            marker.display()
        ),
    )
    .unwrap();
    for override_bin in [
        None,
        Some(home.path().join("missing.exe")),
        Some(scripts.clone()),
    ] {
        let mut command = Command::new(env!("CARGO_BIN_EXE_exonous"));
        command
            .args(["ui-design", "context", "--target", r#"{"value":"%PATH%!"}"#])
            .env("EXONOUS_HOME", home.path())
            .env("EXONOUS_NO_UPDATE", "1")
            .env_remove("IMPECCABLE_BIN");
        if let Some(binary) = override_bin {
            command.env("IMPECCABLE_BIN", binary);
        }
        let out = command.output().unwrap();
        assert_eq!(
            out.status.code(),
            Some(127),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
        assert!(!marker.exists());
    }
}

#[cfg(unix)]
#[test]
fn an_older_cli_forwards_to_verified_newer_native_runtime() {
    use sha2::{Digest, Sha256};
    use std::os::unix::fs::PermissionsExt;
    let home = tempfile::tempdir().unwrap();
    let relative = ".claude/exonous/bin/9.0.0-test/exonous";
    let binary = home.path().join(relative);
    fs::create_dir_all(binary.parent().unwrap()).unwrap();
    let script = b"#!/bin/sh\nprintf '9.0.0\\n'\n";
    fs::write(&binary, script).unwrap();
    fs::set_permissions(&binary, fs::Permissions::from_mode(0o700)).unwrap();
    fs::write(
        home.path().join(".claude/exonous/install.json"),
        serde_json::json!({"runtime":"rust","version":"9.0.0","binary":binary}).to_string(),
    )
    .unwrap();
    fs::write(
        home.path().join(".claude/exonous/installed.json"),
        serde_json::json!({"files":{relative:{"hash":format!("{:x}",Sha256::digest(script))}}})
            .to_string(),
    )
    .unwrap();
    let out = run(home.path(), home.path(), &["--version"]);
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert_eq!(String::from_utf8(out.stdout).unwrap(), "9.0.0\n");
    fs::write(&binary, "#!/bin/sh\necho tampered\n").unwrap();
    let out = run(home.path(), home.path(), &["--version"]);
    assert!(!out.status.success());
    assert!(!String::from_utf8_lossy(&out.stdout).contains("tampered"));
}

#[test]
fn bundled_template_can_be_validated_without_a_git_repo() {
    let home = tempfile::tempdir().unwrap();
    let body = home.path().join("body.md");
    let template = include_str!("../../assets/machine/PR-TEMPLATE.md");
    fs::write(&body, template).unwrap();
    assert!(
        run(
            home.path(),
            home.path(),
            &["validate-pr", body.to_str().unwrap()]
        )
        .status
        .success()
    );
    fs::write(&body, "missing everything").unwrap();
    let out = run(
        home.path(),
        home.path(),
        &["validate-pr", body.to_str().unwrap()],
    );
    assert_eq!(out.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&out.stderr).contains("missing"));
}

#[cfg(unix)]
#[test]
fn unsafe_home_is_rejected_before_state_is_created() {
    use std::os::unix::fs::PermissionsExt;
    let home = tempfile::tempdir().unwrap();
    let repo = tempfile::tempdir().unwrap();
    assert!(
        Command::new("git")
            .args(["init", "--quiet"])
            .arg(repo.path())
            .status()
            .unwrap()
            .success()
    );
    fs::set_permissions(home.path(), fs::Permissions::from_mode(0o777)).unwrap();
    let out = run(home.path(), repo.path(), &["draft-path"]);
    assert_eq!(out.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&out.stderr).contains("home owner or permissions"));
    assert!(!home.path().join(".claude").exists());
}

fn taxis(home: &std::path::Path, host: &str, input: serde_json::Value) -> serde_json::Value {
    use std::io::Write;
    use std::process::Stdio;
    let mut child = Command::new(env!("CARGO_BIN_EXE_exonous"))
        .args(["hook", "taxis", "--adapter", host])
        .env("EXONOUS_HOME", home)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(input.to_string().as_bytes())
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}

#[test]
fn cursor_subagent_start_denies_unknown_and_legacy_agents() {
    let home = tempfile::tempdir().unwrap();
    let rogue = taxis(
        home.path(),
        "cursor",
        serde_json::json!({"hook_event_name":"subagentStart","subagent_type":"rogue"}),
    );
    assert_eq!(rogue["permission"], "deny");
    let legacy = taxis(
        home.path(),
        "cursor",
        serde_json::json!({"hook_event_name":"subagentStart","subagent_type":"planner"}),
    );
    assert_eq!(legacy["permission"], "deny");
    assert!(legacy["user_message"].as_str().unwrap().contains("exo-pm"));
    let known = taxis(
        home.path(),
        "cursor",
        serde_json::json!({"hook_event_name":"subagentStart","subagent_type":"exo-pm"}),
    );
    assert_eq!(known["permission"], "allow");
}

#[test]
fn legacy_spawn_retains_existing_role_brief_in_prompt() {
    let home = tempfile::tempdir().unwrap();
    let dir = home.path().join(".claude/exonous/agent-roles/quarantine");
    fs::create_dir_all(&dir).unwrap();
    fs::write(
        dir.join("planner.md"),
        "Existing role input/output contract",
    )
    .unwrap();
    let result = taxis(
        home.path(),
        "claude",
        serde_json::json!({"hook_event_name":"PreToolUse","tool_name":"Agent","tool_input":{"subagent_type":"planner","prompt":"plan it"}}),
    );
    let prompt = result["hookSpecificOutput"]["updatedInput"]["prompt"]
        .as_str()
        .unwrap();
    assert!(prompt.contains("Running the legacy `planner` role"));
    assert!(prompt.contains("planner.md"));
    assert!(prompt.ends_with("plan it"));
}

#[cfg(unix)]
mod pr_create {
    use super::*;
    use exonous::runtime;
    use std::os::unix::fs::PermissionsExt;
    struct Fixture {
        home: tempfile::TempDir,
        repo: tempfile::TempDir,
        vault: tempfile::TempDir,
        bin: tempfile::TempDir,
        body: std::path::PathBuf,
    }
    impl Fixture {
        fn new() -> Self {
            let home = tempfile::tempdir().unwrap();
            let repo = tempfile::tempdir().unwrap();
            let vault = tempfile::tempdir().unwrap();
            let bin = tempfile::tempdir().unwrap();
            runtime::git(repo.path(), &["init", "-q", "-b", "feature"]).unwrap();
            fs::write(repo.path().join("a"), "a").unwrap();
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
                    "init",
                ],
            )
            .unwrap();
            fs::write(repo.path().join(".claude-template-unused"), "").unwrap();
            fs::create_dir(repo.path().join(".github")).unwrap();
            fs::write(
                repo.path().join(".github/pull_request_template.md"),
                "## Why\n## Tests\n",
            )
            .unwrap();
            let state = runtime::state(home.path());
            fs::create_dir_all(state.join("pr")).unwrap();
            fs::write(
                home.path().join(".claude/exonous/config.json"),
                serde_json::json!({"vault":vault.path()}).to_string(),
            )
            .unwrap();
            let body = state
                .join("pr")
                .join(format!("{}.md", runtime::repo_key(repo.path()).unwrap()));
            fs::write(&body, "## Why\nprivate body\n## Tests\npassed\n").unwrap();
            Self {
                home,
                repo,
                vault,
                bin,
                body,
            }
        }
        fn gh(&self, tail: &str) {
            let script = format!(
                "#!/bin/sh\nprintf 'called\\n' >>\"$EXONOUS_HOME/calls\"\nprintf '%s\\n' \"$@\" >\"$EXONOUS_HOME/argv\"\nwhile [ \"$#\" -gt 0 ]; do if [ \"$1\" = --body-file ]; then shift; printf '%s' \"$1\" >\"$EXONOUS_HOME/snapshot\"; cat \"$1\" >\"$EXONOUS_HOME/sent\"; break; fi; shift; done\n{tail}\n"
            );
            fs::write(self.bin.path().join("gh"), script).unwrap();
            fs::set_permissions(
                self.bin.path().join("gh"),
                fs::Permissions::from_mode(0o700),
            )
            .unwrap();
        }
        fn run(&self, extra: &[&str]) -> std::process::Output {
            let path = std::env::join_paths(std::iter::once(self.bin.path().to_path_buf()).chain(
                std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()),
            ))
            .unwrap();
            Command::new(env!("CARGO_BIN_EXE_exonous"))
                .args(["pr", "create", "--title", "private title", "--body-file"])
                .arg(&self.body)
                .args(extra)
                .current_dir(self.repo.path())
                .env("EXONOUS_HOME", self.home.path())
                .env("EXONOUS_NO_UPDATE", "1")
                .env("PR_TEST_BODY", &self.body)
                .env("PATH", path)
                .env_remove("PROJECT_MEMORY_VAULT")
                .output()
                .unwrap()
        }
        fn notes(&self) -> Vec<std::path::PathBuf> {
            let folder = self
                .vault
                .path()
                .join(self.repo.path().file_name().unwrap());
            fs::read_dir(folder)
                .map(|rows| rows.map(|row| row.unwrap().path()).collect())
                .unwrap_or_default()
        }
    }
    #[test]
    fn creates_from_private_snapshot_saves_minimal_handoff_and_cleans_expected_draft() {
        let f = Fixture::new();
        f.gh("printf 'https://github.com/acme/repo/pull/12\\n'; printf 'gh warning\\n' >&2");
        let expected = fs::read(&f.body).unwrap();
        let out = f.run(&["--draft"]);
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
        assert_eq!(out.stdout, b"https://github.com/acme/repo/pull/12\n");
        assert!(String::from_utf8_lossy(&out.stderr).contains("gh warning"));
        assert_eq!(fs::read(f.home.path().join("sent")).unwrap(), expected);
        let snapshot = fs::read_to_string(f.home.path().join("snapshot")).unwrap();
        assert!(!std::path::Path::new(&snapshot).exists());
        assert_ne!(std::path::Path::new(&snapshot), f.body);
        assert!(!f.body.exists());
        let notes = f.notes();
        assert_eq!(notes.len(), 1);
        let note = fs::read_to_string(&notes[0]).unwrap();
        assert!(note.contains("https://github.com/acme/repo/pull/12"));
        assert!(!note.contains("private title"));
        assert!(!note.contains("private body"));
        assert!(!note.contains("gh warning"));
    }
    #[test]
    fn failed_or_ambiguous_gh_output_never_saves_or_retries() {
        for (tail, code) in [
            (
                "printf 'https://github.com/acme/repo/pull/12\\n'; exit 7",
                7,
            ),
            (
                "printf 'Created https://github.com/acme/repo/pull/12\\n'",
                0,
            ),
            (
                "printf 'https://github.com/acme/repo/pull/12\\nhttps://github.com/acme/repo/pull/13\\n'",
                0,
            ),
        ] {
            let f = Fixture::new();
            f.gh(tail);
            let out = f.run(&[]);
            assert_eq!(out.status.code(), Some(code));
            assert!(f.body.exists());
            assert!(f.notes().is_empty());
            assert_eq!(
                fs::read_to_string(f.home.path().join("calls")).unwrap(),
                "called\n"
            );
        }
    }

    #[test]
    fn cleanup_preserves_changed_replaced_arbitrary_and_unsaved_drafts() {
        for mode in ["changed", "replaced", "arbitrary", "no-vault", "bad-vault"] {
            let mut f = Fixture::new();
            let mutation = match mode {
                "changed" => "printf changed >\"$PR_TEST_BODY\"; ",
                "replaced" => {
                    "cp \"$PR_TEST_BODY\" \"$PR_TEST_BODY.next\"; mv \"$PR_TEST_BODY.next\" \"$PR_TEST_BODY\"; "
                }
                "arbitrary" => {
                    let original = f.body.clone();
                    f.body = f.repo.path().join("arbitrary.md");
                    fs::rename(original, &f.body).unwrap();
                    ""
                }
                "no-vault" => {
                    fs::remove_file(f.home.path().join(".claude/exonous/config.json")).unwrap();
                    ""
                }
                _ => {
                    fs::write(f.home.path().join(".claude/exonous/config.json"), "invalid")
                        .unwrap();
                    ""
                }
            };
            f.gh(&format!(
                "{mutation}printf 'https://github.com/acme/repo/pull/12\\n'"
            ));
            let out = f.run(&[]);
            assert_eq!(
                out.status.code(),
                Some(0),
                "{mode}: {}",
                String::from_utf8_lossy(&out.stderr)
            );
            assert!(f.body.exists(), "{mode}");
            assert_eq!(
                fs::read_to_string(f.home.path().join("calls")).unwrap(),
                "called\n"
            );
            let snapshot = fs::read_to_string(f.home.path().join("snapshot")).unwrap();
            assert!(!std::path::Path::new(&snapshot).exists());
            if mode.ends_with("vault") {
                assert!(f.notes().is_empty());
            }
        }
    }

    #[test]
    fn validation_rejects_unsupported_duplicate_flags_and_bad_body_before_gh() {
        for options in [
            vec!["--repo", "other/repo"],
            vec!["--draft", "--draft"],
            vec!["--title", "duplicate"],
            vec!["--body", "inline"],
        ] {
            let f = Fixture::new();
            f.gh("exit 0");
            assert_eq!(f.run(&options).status.code(), Some(2));
            assert!(!f.home.path().join("calls").exists());
        }
        let f = Fixture::new();
        f.gh("exit 0");
        fs::write(&f.body, "missing headings").unwrap();
        assert_eq!(f.run(&[]).status.code(), Some(1));
        assert!(!f.home.path().join("calls").exists());
        assert_eq!(
            fs::read_dir(runtime::state(f.home.path()).join("pr"))
                .unwrap()
                .count(),
            1
        );
    }

    #[test]
    fn gh_signals_keep_their_exit_status_and_never_save() {
        let f = Fixture::new();
        f.gh("kill -TERM $$");
        assert_eq!(f.run(&[]).status.code(), Some(143));
        assert!(f.body.exists());
        assert!(f.notes().is_empty());
    }

    #[test]
    fn another_worktree_draft_and_symlinked_body_are_preserved() {
        let mut f = Fixture::new();
        let linked = f.repo.path().join("linked");
        runtime::git(
            f.repo.path(),
            &[
                "worktree",
                "add",
                "-q",
                "-b",
                "linked",
                linked.to_str().unwrap(),
            ],
        )
        .unwrap();
        let other = runtime::state(f.home.path())
            .join("pr")
            .join(format!("{}.md", runtime::repo_key(&linked).unwrap()));
        fs::rename(&f.body, &other).unwrap();
        f.body = other;
        f.gh("printf 'https://github.com/acme/repo/pull/12\\n'");
        assert!(f.run(&[]).status.success());
        assert!(f.body.exists());
        let original = f.body.clone();
        let link = f.repo.path().join("symlink.md");
        std::os::unix::fs::symlink(&original, &link).unwrap();
        f.body = link;
        assert_eq!(f.run(&[]).status.code(), Some(1));
        assert!(f.body.is_symlink());
        assert!(original.exists());
        assert_eq!(
            fs::read_to_string(f.home.path().join("calls")).unwrap(),
            "called\n"
        );
    }
}
