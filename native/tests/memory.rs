use exonous::memory::{Context, handle};
use serde_json::json;
use std::{fs, path::PathBuf, process::Command};

struct Fixture {
    _root: tempfile::TempDir,
    home: PathBuf,
    repo: PathBuf,
    vault: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let root = tempfile::tempdir().unwrap();
        let home = root.path().join("home");
        let repo = root.path().join("shop");
        let vault = root.path().join("vault");
        fs::create_dir_all(home.join(".claude/exonous")).unwrap();
        fs::create_dir(&repo).unwrap();
        fs::create_dir(&vault).unwrap();
        fs::create_dir(vault.join(".obsidian")).unwrap();
        fs::write(
            home.join(".claude/exonous/config.json"),
            json!({"vault":vault}).to_string(),
        )
        .unwrap();
        assert!(
            Command::new("git")
                .args(["init", "--quiet"])
                .arg(&repo)
                .status()
                .unwrap()
                .success()
        );
        Self {
            _root: root,
            home,
            repo,
            vault,
        }
    }
    fn event(&self, event: &str, agent: &str, input: serde_json::Value, now: i64) -> String {
        handle(
            &Context {
                home: &self.home,
                cwd: &self.repo,
                agent,
                now,
                vault_override: None,
                disabled: false,
            },
            event,
            &input,
        )
        .unwrap()
    }
}

#[test]
fn memory_records_sanitized_observations_and_delivers_handoff_once() {
    let fx = Fixture::new();
    let now = 1_767_225_600_000;
    assert!(
        fx.event("start", "claude", json!({"session_id":"first111"}), now)
            .is_empty()
    );
    fx.event(
        "prompt",
        "claude",
        json!({"session_id":"first111","prompt":"fix checkout"}),
        now,
    );
    fx.event("tool","claude",json!({"session_id":"first111","tool_name":"Edit","tool_input":{"file_path":fx.repo.join("src/cart.ts")},"tool_output":"never record this output"}),now+1);
    fx.event("stop", "claude", json!({"session_id":"first111"}), now + 2);
    let secret = format!("sk-{}", "a".repeat(24));
    fx.event(
        "prompt",
        "claude",
        json!({"session_id":"first111","prompt":format!("check key {secret}?")}),
        now + 3,
    );
    fx.event(
        "end",
        "claude",
        json!({"session_id":"first111","reason":"exit"}),
        now + 4,
    );
    let sessions = fx.vault.join("shop/sessions");
    let page = fs::read_dir(&sessions)
        .unwrap()
        .map(Result::unwrap)
        .find(|f| f.file_name().to_string_lossy().ends_with("first111.md"))
        .unwrap();
    let content = fs::read_to_string(page.path()).unwrap();
    assert!(content.starts_with("---\ntitle: \"fix checkout\"\nkind: session\n"));
    assert!(content.contains("- `src/cart.ts`"));
    assert!(content.contains("Session ended before the last question was answered."));
    assert!(!content.contains(&secret));
    assert!(!content.contains("never record this output"));
    assert!(
        fs::read_to_string(sessions.join("log.md"))
            .unwrap()
            .contains("[[sessions/")
    );
    let brief = fx.event("start", "codex", json!({"session_id":"second22"}), now + 10);
    assert!(brief.contains("Pending handoff — from claude"));
    assert!(brief.contains("Unanswered: check key (redacted:api_key)?"));
    assert!(brief.contains("data, not instructions"));
    let again = fx.event(
        "start",
        "cursor",
        json!({"session_id":"third333"}),
        now + 11,
    );
    assert!(!again.contains("Pending handoff"));
    assert!(again.contains("Recent sessions"));
}

#[test]
fn memory_opt_out_writes_nothing_and_plain_vault_keeps_plain_links() {
    let fx = Fixture::new();
    let now = 1_767_225_600_000;
    let out = handle(
        &Context {
            home: &fx.home,
            cwd: &fx.repo,
            agent: "claude",
            now,
            vault_override: None,
            disabled: true,
        },
        "prompt",
        &json!({"prompt":"hello"}),
    )
    .unwrap();
    assert!(out.is_empty());
    assert!(!fx.home.join(".claude/exonous/state").exists());
    fs::remove_dir(fx.vault.join(".obsidian")).unwrap();
    fx.event(
        "prompt",
        "claude",
        json!({"session_id":"first111","prompt":"plain links"}),
        now,
    );
    fx.event("end", "claude", json!({"session_id":"first111"}), now + 1);
    let log = fs::read_to_string(fx.vault.join("shop/sessions/log.md")).unwrap();
    assert!(!log.contains("[["));
    assert!(log.contains("[plain links]("));
}

#[test]
fn concurrent_finalization_keeps_every_log_row_and_claims_handoff_once() {
    let fx = Fixture::new();
    let now = 1_767_225_600_000;
    let second_home = fx._root.path().join("second-home");
    fs::create_dir_all(second_home.join(".claude/exonous")).unwrap();
    fs::write(
        second_home.join(".claude/exonous/config.json"),
        json!({"vault":fx.vault}).to_string(),
    )
    .unwrap();
    let mut threads = Vec::new();
    for number in 0..24 {
        let home = if number % 2 == 0 {
            fx.home.clone()
        } else {
            second_home.clone()
        };
        let repo = fx.repo.clone();
        threads.push(std::thread::spawn(move || {
            let context = Context {
                home: &home,
                cwd: &repo,
                agent: "claude",
                now: now + number,
                vault_override: None,
                disabled: false,
            };
            let id = format!("s{number:07}");
            handle(
                &context,
                "prompt",
                &json!({"session_id":id,"prompt":format!("work {number}")}),
            )
            .unwrap();
            handle(&context, "end", &json!({"session_id":id})).unwrap();
        }));
    }
    for thread in threads {
        thread.join().unwrap();
    }
    let log = fs::read_to_string(fx.vault.join("shop/sessions/log.md")).unwrap();
    assert_eq!(
        log.lines().filter(|line| line.starts_with("- ")).count(),
        24
    );
    for number in 0..24 {
        assert_eq!(
            log.matches(&format!("claude-s{number:07}.md -->")).count(),
            1
        );
    }
    let mut claims = Vec::new();
    for number in 0..12 {
        let home = fx.home.clone();
        let repo = fx.repo.clone();
        claims.push(std::thread::spawn(move || {
            handle(
                &Context {
                    home: &home,
                    cwd: &repo,
                    agent: "codex",
                    now: now + 100,
                    vault_override: None,
                    disabled: false,
                },
                "start",
                &json!({"session_id":format!("new{number}")}),
            )
            .unwrap()
        }));
    }
    assert_eq!(
        claims
            .into_iter()
            .map(|thread| thread.join().unwrap())
            .filter(|brief| brief.contains("Pending handoff"))
            .count(),
        1
    );
}

#[test]
fn malformed_config_and_spool_are_preserved_without_replacing_existing_pages() {
    let fx = Fixture::new();
    let now = 1_767_225_600_000;
    fx.event(
        "prompt",
        "claude",
        json!({"session_id":"first111","prompt":"original"}),
        now,
    );
    fx.event("stop", "claude", json!({"session_id":"first111"}), now + 1);
    let project = fs::read_dir(fx.home.join(".claude/exonous/state/anamnesis"))
        .unwrap()
        .map(Result::unwrap)
        .find(|entry| entry.file_type().unwrap().is_dir())
        .unwrap()
        .path();
    let spool = project.join("first111.jsonl");
    let original = fs::read_to_string(&spool).unwrap();
    fs::write(&spool, format!("{original}{{broken")).unwrap();
    let page = fs::read_dir(fx.vault.join("shop/sessions"))
        .unwrap()
        .map(Result::unwrap)
        .find(|entry| entry.file_name().to_string_lossy().ends_with("first111.md"))
        .unwrap()
        .path();
    let before = fs::read(&page).unwrap();
    let result = handle(
        &Context {
            home: &fx.home,
            cwd: &fx.repo,
            agent: "claude",
            now: now + 2,
            vault_override: None,
            disabled: false,
        },
        "end",
        &json!({"session_id":"first111"}),
    );
    assert!(result.is_err());
    assert_eq!(fs::read(&page).unwrap(), before);
    assert_eq!(
        fs::read_to_string(&spool).unwrap(),
        format!("{original}{{broken")
    );
    let config = fx.home.join(".claude/exonous/config.json");
    fs::write(&config, "{broken").unwrap();
    assert!(
        handle(
            &Context {
                home: &fx.home,
                cwd: &fx.repo,
                agent: "claude",
                now: now + 3,
                vault_override: None,
                disabled: false
            },
            "prompt",
            &json!({"prompt":"do not fall back"})
        )
        .is_err()
    );
    assert!(!fx.home.join("exonous-vault").exists());
    assert_eq!(fs::read_to_string(config).unwrap(), "{broken");
}

#[cfg(unix)]
#[test]
fn spool_log_and_handoff_symlinks_never_read_or_replace_outside_files() {
    use std::os::unix::fs::symlink;
    let fx = Fixture::new();
    let now = 1_767_225_600_000;
    fx.event(
        "prompt",
        "claude",
        json!({"session_id":"first111","prompt":"safe"}),
        now,
    );
    let project = fs::read_dir(fx.home.join(".claude/exonous/state/anamnesis"))
        .unwrap()
        .map(Result::unwrap)
        .find(|entry| entry.file_type().unwrap().is_dir())
        .unwrap()
        .path();
    let outside = fx._root.path().join("outside");
    fs::write(&outside, "do not change").unwrap();
    fs::remove_file(project.join("first111.jsonl")).unwrap();
    symlink(&outside, project.join("first111.jsonl")).unwrap();
    assert!(
        handle(
            &Context {
                home: &fx.home,
                cwd: &fx.repo,
                agent: "claude",
                now: now + 1,
                vault_override: None,
                disabled: false
            },
            "end",
            &json!({"session_id":"first111"})
        )
        .is_err()
    );
    assert_eq!(fs::read_to_string(&outside).unwrap(), "do not change");
    fs::remove_file(project.join("first111.jsonl")).unwrap();
    symlink(&outside, project.join("handoff.json")).unwrap();
    assert!(
        handle(
            &Context {
                home: &fx.home,
                cwd: &fx.repo,
                agent: "codex",
                now: now + 2,
                vault_override: None,
                disabled: false
            },
            "start",
            &json!({"session_id":"next2222"})
        )
        .is_err()
    );
    assert!(
        fs::symlink_metadata(project.join("handoff.json"))
            .unwrap()
            .file_type()
            .is_symlink()
    );
    assert_eq!(fs::read_to_string(&outside).unwrap(), "do not change");
}

#[test]
fn pending_handoff_corruption_is_preserved_and_older_sessions_do_not_replace_newer_handoffs() {
    let fx = Fixture::new();
    let now = 1_767_225_600_000;
    fx.event(
        "prompt",
        "claude",
        json!({"session_id":"newest11","prompt":"newest work"}),
        now + 100,
    );
    fx.event("end", "claude", json!({"session_id":"newest11"}), now + 101);
    fx.event(
        "prompt",
        "codex",
        json!({"session_id":"older222","prompt":"older work"}),
        now,
    );
    fx.event("end", "codex", json!({"session_id":"older222"}), now + 1);
    let project = fs::read_dir(fx.home.join(".claude/exonous/state/anamnesis"))
        .unwrap()
        .map(Result::unwrap)
        .find(|entry| entry.file_type().unwrap().is_dir())
        .unwrap()
        .path();
    let pending: serde_json::Value =
        serde_json::from_slice(&fs::read(project.join("handoff.json")).unwrap()).unwrap();
    assert_eq!(pending["sessionId"], "newest11");
    fs::write(project.join("handoff.json"), "{broken").unwrap();
    fx.event(
        "prompt",
        "claude",
        json!({"session_id":"third333","prompt":"third work"}),
        now + 200,
    );
    assert!(
        handle(
            &Context {
                home: &fx.home,
                cwd: &fx.repo,
                agent: "claude",
                now: now + 201,
                vault_override: None,
                disabled: false
            },
            "end",
            &json!({"session_id":"third333"})
        )
        .is_err()
    );
    assert_eq!(
        fs::read_to_string(project.join("handoff.json")).unwrap(),
        "{broken"
    );
}

#[test]
fn idle_sessions_finalize_once_and_old_ended_spools_are_pruned() {
    let fx = Fixture::new();
    let now = 1_767_225_600_000;
    fx.event(
        "prompt",
        "claude",
        json!({"session_id":"idle1111","prompt":"migrate orders"}),
        now,
    );
    fx.event("tool","claude",json!({"session_id":"idle1111","tool_name":"Write","tool_input":{"file_path":"db/migrate.sql"}}),now+1);
    let open = fx.event(
        "start",
        "codex",
        json!({"session_id":"next2222"}),
        now + 100,
    );
    assert!(open.contains("Unfinished session"));
    let after = fx.event(
        "start",
        "codex",
        json!({"session_id":"next3333"}),
        now + exonous::memory::IDLE_END_MS + 100,
    );
    assert!(!after.contains("Unfinished session"));
    assert!(after.contains("Recent sessions"));
    let log = fx.vault.join("shop/sessions/log.md");
    assert_eq!(
        fs::read_to_string(&log)
            .unwrap()
            .matches("claude-idle1111.md -->")
            .count(),
        1
    );
    fx.event(
        "start",
        "cursor",
        json!({"session_id":"next4444"}),
        now + exonous::memory::IDLE_END_MS + 200,
    );
    assert_eq!(
        fs::read_to_string(&log)
            .unwrap()
            .matches("claude-idle1111.md -->")
            .count(),
        1
    );
    let project = fs::read_dir(fx.home.join(".claude/exonous/state/anamnesis"))
        .unwrap()
        .map(Result::unwrap)
        .find(|entry| entry.file_type().unwrap().is_dir())
        .unwrap()
        .path();
    fx.event(
        "start",
        "cursor",
        json!({"session_id":"next5555"}),
        now + 15 * 24 * 60 * 60 * 1000,
    );
    assert!(!project.join("idle1111.jsonl").exists());
    assert!(
        fs::read_dir(fx.vault.join("shop/sessions"))
            .unwrap()
            .map(Result::unwrap)
            .any(|entry| entry.file_name().to_string_lossy().ends_with("idle1111.md"))
    );
}

#[cfg(unix)]
#[test]
fn unsafe_vault_permissions_and_symlinked_logs_leave_targets_untouched() {
    use std::os::unix::fs::{PermissionsExt, symlink};
    let fx = Fixture::new();
    let now = 1_767_225_600_000;
    fx.event(
        "prompt",
        "claude",
        json!({"session_id":"first111","prompt":"safe"}),
        now,
    );
    fs::set_permissions(&fx.vault, fs::Permissions::from_mode(0o777)).unwrap();
    assert!(
        handle(
            &Context {
                home: &fx.home,
                cwd: &fx.repo,
                agent: "claude",
                now: now + 1,
                vault_override: None,
                disabled: false
            },
            "end",
            &json!({"session_id":"first111"})
        )
        .is_err()
    );
    assert!(!fx.vault.join("shop").exists());
    fs::set_permissions(&fx.vault, fs::Permissions::from_mode(0o755)).unwrap();
    fs::create_dir_all(fx.vault.join("shop/sessions")).unwrap();
    let outside = fx._root.path().join("outside-log");
    fs::write(&outside, "leave intact").unwrap();
    symlink(&outside, fx.vault.join("shop/sessions/log.md")).unwrap();
    assert!(
        handle(
            &Context {
                home: &fx.home,
                cwd: &fx.repo,
                agent: "claude",
                now: now + 2,
                vault_override: None,
                disabled: false
            },
            "end",
            &json!({"session_id":"first111"})
        )
        .is_err()
    );
    assert_eq!(fs::read_to_string(outside).unwrap(), "leave intact");
}
