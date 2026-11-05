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
