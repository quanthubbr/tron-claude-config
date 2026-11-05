use exonous::{handoff, vault};
use serde_json::{Value, json};
use std::fs;
use std::path::Path;

fn write(path: &Path, body: impl AsRef<[u8]>) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, body).unwrap();
}

fn graph() -> Value {
    json!({"v":1,"k":"full","g":[["work","proof","tests passed"],["work","next","review"]]})
}

fn configured(home: &Path, root: &Path) {
    write(
        &home.join(".claude/exonous/config.json"),
        json!({"vault":root,"memory":false}).to_string(),
    );
}

#[test]
fn absent_roots_are_not_created_and_missing_configured_roots_do_not_redirect() {
    let home = tempfile::tempdir().unwrap();
    assert_eq!(
        handoff::save(home.path(), home.path(), &graph(), None).unwrap(),
        json!({"status":"not-saved","reason":"no-vault"})
    );
    assert!(!home.path().join("exonous-vault").exists());
    configured(home.path(), &home.path().join("missing"));
    assert!(
        handoff::save(home.path(), home.path(), &graph(), None)
            .unwrap_err()
            .contains("unavailable")
    );
    assert!(!home.path().join("missing").exists());
}

#[test]
fn native_save_and_javascript_envelopes_share_the_same_disk_format() {
    let home = tempfile::tempdir().unwrap();
    let root = home.path().join("vault");
    fs::create_dir(&root).unwrap();
    configured(home.path(), &root);
    let body = json!({"v":1,"k":"pr","g":[["work","proof","tests passed"],["work","next","review"],["work","evidence",format!("ghp_{}", "a".repeat(30))]]});
    let saved = handoff::save(
        home.path(),
        home.path(),
        &body,
        Some("2026-11-05T12:00:00Z"),
    )
    .unwrap();
    let path = Path::new(saved["path"].as_str().unwrap());
    let raw = fs::read_to_string(path).unwrap();
    let parsed: Value = serde_json::from_str(&raw).unwrap();
    assert_eq!(parsed["r"], "avulsas");
    assert_eq!(parsed["ts"], "2026-11-05T12:00:00Z");
    assert!(!raw.contains(&"a".repeat(30)));
    assert_eq!(raw.lines().count(), 1);
    write(&root.join("avulsas/js-envelope.md"), json!({"v":1,"ts":"2026-11-06T12:00:00+00:00","k":"full","r":"avulsas","b":"","h":"","g":graph()["g"]}).to_string());
    let latest = handoff::latest(home.path(), home.path()).unwrap();
    assert!(latest["path"].as_str().unwrap().ends_with("js-envelope.md"));
    assert_eq!(latest["timestamp"], "2026-11-06T12:00:00.000Z");
}

#[test]
fn graph_validation_timestamp_collisions_and_foreign_versions_are_explicit() {
    let home = tempfile::tempdir().unwrap();
    fs::create_dir(home.path().join("exonous-vault")).unwrap();
    assert!(handoff::validate_graph(&json!({"v":1,"k":"full","g":[]})).is_err());
    assert!(
        handoff::validate_graph(&json!({"v":1,"k":"full","g":[["x","next","secret"]]}))
            .unwrap_err()
            .contains("proof")
    );
    assert!(
        handoff::save(
            home.path(),
            home.path(),
            &graph(),
            Some("2026-02-30T00:00:00Z")
        )
        .unwrap_err()
        .contains("timestamp")
    );
    let mut decimal_version = graph();
    decimal_version["v"] = json!(1.0);
    assert!(handoff::validate_graph(&decimal_version).is_ok());
    assert!(
        handoff::save(
            home.path(),
            home.path(),
            &graph(),
            Some("2026-11-05T12:00:60Z")
        )
        .is_err()
    );
    assert!(
        handoff::save(
            home.path(),
            home.path(),
            &graph(),
            Some("2026-11-05T24:00:00Z")
        )
        .is_ok()
    );
    let one = handoff::save(
        home.path(),
        home.path(),
        &graph(),
        Some("2026-11-05T12:00:00Z"),
    )
    .unwrap();
    let two = handoff::save(
        home.path(),
        home.path(),
        &graph(),
        Some("2026-11-05T12:00:00Z"),
    )
    .unwrap();
    assert_ne!(one["path"], two["path"]);
    write(
        &home.path().join("exonous-vault/avulsas/future.md"),
        json!({"v":{"secret":format!("ghp_{}", "b".repeat(30))},"ts":"2030-01-01T00:00:00Z"})
            .to_string(),
    );
    let future = handoff::latest(home.path(), home.path()).unwrap();
    assert_eq!(future["status"], "unsupported-version");
    assert!(future["version"].is_null());
    assert!(!future.to_string().contains(&"b".repeat(30)));
}

#[test]
fn legacy_filename_precision_beats_date_metadata_and_unrelated_markdown() {
    let home = tempfile::tempdir().unwrap();
    let folder = home.path().join("exonous-vault/avulsas");
    write(
        &folder.join("2026-11-04 2359 old.md"),
        "---\ndata: 2026-11-04\n---\nold",
    );
    write(
        &folder.join("2026-11-05 1200 new.md"),
        "---\ndata: 2026-11-05\n---\nnew",
    );
    write(&folder.join("README.md"), "unrelated");
    let latest = handoff::latest(home.path(), home.path()).unwrap();
    assert!(latest["path"].as_str().unwrap().ends_with("1200 new.md"));
    assert_eq!(latest["kind"], "legacy");
    assert_eq!(latest["timestamp"], "2026-11-05T12:00:00.000Z");
    write(
        &folder.join("2030-01-01 1200 too-big.md"),
        vec![b'x'; 1024 * 1024 + 1],
    );
    assert!(
        handoff::latest(home.path(), home.path())
            .unwrap_err()
            .contains("too large")
    );
}

#[cfg(unix)]
#[test]
fn symlinked_session_folder_and_config_cannot_redirect_writes() {
    use std::os::unix::fs::symlink;
    let home = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let root = home.path().join("exonous-vault");
    fs::create_dir(&root).unwrap();
    symlink(outside.path(), root.join("avulsas")).unwrap();
    assert!(handoff::save(home.path(), home.path(), &graph(), None).is_err());
    assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
    fs::create_dir_all(home.path().join(".claude/exonous")).unwrap();
    write(&outside.path().join("config.json"), "{}");
    symlink(
        outside.path().join("config.json"),
        home.path().join(".claude/exonous/config.json"),
    )
    .unwrap();
    assert!(vault::central(home.path(), home.path()).is_err());
}

#[test]
fn configured_root_precedence_and_registry_detection_preserve_user_preferences() {
    let home = tempfile::tempdir().unwrap();
    let current = home.path().join("current");
    let registered = home.path().join("registered");
    fs::create_dir(&current).unwrap();
    fs::create_dir(&registered).unwrap();
    configured(home.path(), &current);
    write(&vault::registry_paths(home.path())[0], json!({"vaults":{"x":{"path":registered,"ts":20,"open":true},"y":{"path":current,"ts":30,"open":false}}}).to_string());
    assert_eq!(
        vault::central(home.path(), home.path())
            .unwrap()
            .path
            .unwrap(),
        current
    );
    assert_eq!(vault::detect(home.path()).unwrap()[0].path, registered);
    assert!(
        vault::command(home.path(), home.path(), &["show".into()])
            .unwrap()
            .contains("source: exonous-config")
    );
}

#[test]
fn consolidation_previews_without_mutation_then_preserves_bytes_config_and_personal_notes() {
    let home = tempfile::tempdir().unwrap();
    let source = home.path().join("exonous-vault");
    let target = home.path().join("central");
    fs::create_dir(&target).unwrap();
    write(&source.join("repo/memory/doc/a.md"), b"decision\0bytes");
    write(&source.join("repo/personal.md"), "personal");
    configured(home.path(), &source);
    let original_mtime = fs::metadata(source.join("repo/memory/doc/a.md"))
        .unwrap()
        .modified()
        .unwrap();
    let preview = vault::consolidate(home.path(), home.path(), Some(&target), true).unwrap();
    assert_eq!(preview["status"], "planned");
    assert!(!target.join("repo").exists());
    assert_eq!(
        vault::read_config(home.path()).unwrap()["vault"],
        json!(source)
    );
    let result = vault::consolidate(home.path(), home.path(), Some(&target), false).unwrap();
    assert_eq!(result["status"], "complete", "{result}");
    assert_eq!(
        fs::read(target.join("repo/memory/doc/a.md")).unwrap(),
        b"decision\0bytes"
    );
    assert_eq!(
        fs::metadata(target.join("repo/memory/doc/a.md"))
            .unwrap()
            .modified()
            .unwrap(),
        original_mtime
    );
    assert!(!source.join("repo/memory/doc/a.md").exists());
    assert_eq!(
        fs::read_to_string(source.join("repo/personal.md")).unwrap(),
        "personal"
    );
    let config = vault::read_config(home.path()).unwrap();
    assert_eq!(config["vault"], json!(target));
    assert_eq!(config["memory"], false);
    assert_eq!(
        vault::consolidate(home.path(), home.path(), Some(&target), false).unwrap()["status"],
        "complete"
    );
}

#[test]
fn migration_conflicts_and_hostile_journal_preserve_every_original() {
    let home = tempfile::tempdir().unwrap();
    let source = home.path().join("exonous-vault");
    let target = home.path().join("central");
    write(&source.join("repo/memory/doc/a.md"), "source");
    write(&target.join("repo/memory/doc/a.md"), "different");
    configured(home.path(), &source);
    let result = vault::consolidate(home.path(), home.path(), Some(&target), false).unwrap();
    assert_eq!(result["status"], "conflict");
    assert_eq!(
        fs::read_to_string(source.join("repo/memory/doc/a.md")).unwrap(),
        "source"
    );
    assert_eq!(
        vault::read_config(home.path()).unwrap()["vault"],
        json!(source)
    );
    for relative in ["../personal.md", "/personal.md", ""] {
        write(&home.path().join(".claude/exonous/state/vault-consolidation.json"), json!({"v":1,"phase":"cleanup","oldVault":source,"target":fs::canonicalize(&target).unwrap(),"sources":[fs::canonicalize(&source).unwrap()],"entries":[{"source":fs::canonicalize(&source).unwrap(),"relative":relative,"size":0,"hash":"x","dev":0,"ino":0,"mtimeMs":0}]}).to_string());
        let rejected = vault::consolidate(home.path(), home.path(), Some(&target), false).unwrap();
        assert_eq!(rejected["status"], "blocked", "{rejected}");
        assert!(
            rejected["errors"][0]
                .as_str()
                .unwrap()
                .contains("invalid vault path"),
            "{rejected}"
        );
    }
    assert_eq!(
        fs::read_to_string(target.join("repo/memory/doc/a.md")).unwrap(),
        "different"
    );
}

#[cfg(unix)]
#[test]
fn migration_rejects_nested_targets_and_symlink_aliases() {
    use std::os::unix::fs::symlink;
    let home = tempfile::tempdir().unwrap();
    let source = home.path().join("exonous-vault");
    let target = home.path().join("central");
    write(&source.join("repo/memory/doc/a.md"), "source");
    fs::create_dir(&target).unwrap();
    fs::create_dir(source.join("inside")).unwrap();
    assert_eq!(
        vault::consolidate(
            home.path(),
            home.path(),
            Some(&source.join("inside")),
            false
        )
        .unwrap()["status"],
        "blocked"
    );
    let outside = tempfile::tempdir().unwrap();
    symlink(outside.path(), target.join("repo")).unwrap();
    assert_eq!(
        vault::consolidate(home.path(), home.path(), Some(&target), false).unwrap()["status"],
        "blocked"
    );
    assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
    assert_eq!(
        fs::read_to_string(source.join("repo/memory/doc/a.md")).unwrap(),
        "source"
    );
}

#[test]
fn node_compatible_cleanup_journal_resumes_and_reverifies_already_removed_originals() {
    for (corrupt, changed_mtime) in [(false, false), (true, false), (false, true)] {
        let home = tempfile::tempdir().unwrap();
        let source = home.path().join("custom-old");
        let target = home.path().join("central");
        write(&source.join("repo/memory/doc/a.md"), "first");
        write(&source.join("repo/sessions/b.md"), "second");
        let modified = std::time::UNIX_EPOCH + std::time::Duration::new(1_700_000_000, 900_028);
        fs::File::options()
            .write(true)
            .open(source.join("repo/sessions/b.md"))
            .unwrap()
            .set_modified(modified)
            .unwrap();
        fs::create_dir(&target).unwrap();
        configured(home.path(), &source);
        let preview = vault::consolidate(home.path(), home.path(), Some(&target), true).unwrap();
        assert_eq!(preview["status"], "planned");
        for entry in preview["entries"].as_array().unwrap() {
            let relative = entry["relative"].as_str().unwrap();
            write(
                &target.join(relative),
                fs::read(source.join(relative)).unwrap(),
            );
        }
        fs::remove_file(source.join("repo/memory/doc/a.md")).unwrap();
        write(&home.path().join(".claude/exonous/state/vault-consolidation.json"), json!({"v":1,"phase":"cleanup","target":fs::canonicalize(&target).unwrap(),"oldVault":source,"sources":[fs::canonicalize(&source).unwrap()],"entries":preview["entries"]}).to_string());
        write(
            &home.path().join(".claude/exonous/config.json"),
            json!({"vault":target,"memory":false,"vaultMigrationSources":[source]}).to_string(),
        );
        if corrupt {
            write(&target.join("repo/memory/doc/a.md"), "corrupted");
        }
        if changed_mtime {
            fs::File::options()
                .write(true)
                .open(source.join("repo/sessions/b.md"))
                .unwrap()
                .set_modified(modified + std::time::Duration::from_millis(1))
                .unwrap();
        }
        let resumed = vault::consolidate(home.path(), home.path(), Some(&target), false).unwrap();
        assert_eq!(
            resumed["status"],
            if corrupt || changed_mtime {
                "blocked"
            } else {
                "complete"
            },
            "{resumed}"
        );
        assert_eq!(
            source.join("repo/sessions/b.md").exists(),
            corrupt || changed_mtime
        );
        if changed_mtime {
            assert_eq!(resumed["errors"], json!(["journal source changed"]));
        }
        assert_eq!(vault::read_config(home.path()).unwrap()["memory"], false);
    }
}

#[test]
fn cli_set_create_consolidate_and_json_handoff_are_real_native_operations() {
    let home = tempfile::tempdir().unwrap();
    write(
        &home.path().join("exonous-vault/repo/sessions/a.md"),
        "session",
    );
    let target = home.path().join("central");
    assert!(
        vault::command(
            home.path(),
            home.path(),
            &["set".into(), target.to_string_lossy().into_owned()]
        )
        .is_err()
    );
    let set = vault::command(
        home.path(),
        home.path(),
        &[
            "set".into(),
            target.to_string_lossy().into_owned(),
            "--create".into(),
        ],
    )
    .unwrap();
    assert!(set.contains("vault set:"));
    assert_eq!(
        fs::read_to_string(target.join("repo/sessions/a.md")).unwrap(),
        "session"
    );
    write(&home.path().join("body.json"), graph().to_string());
    let saved: Value = serde_json::from_str(
        &handoff::command(
            home.path(),
            home.path(),
            &["save".into(), "--body-file".into(), "body.json".into()],
        )
        .unwrap(),
    )
    .unwrap();
    let latest: Value = serde_json::from_str(
        &handoff::command(
            home.path(),
            home.path(),
            &["latest".into(), "--json".into()],
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(saved["path"], latest["path"]);
    assert!(
        vault::command(
            home.path(),
            home.path(),
            &["consolidate".into(), "--apply".into(), "--dry-run".into()]
        )
        .is_err()
    );
}

#[test]
fn graph_links_tags_folders_code_and_escaped_html_are_written_offline() {
    let home = tempfile::tempdir().unwrap();
    let root = home.path().join("vault");
    write(
        &root.join("repo/A.md"),
        "---\ntags: [design, 'Team']\n---\n[[B]] [[missing]] [[photo.png]] #rust\n`[[ignored]]`\n```js\n[[hidden]]\n```\n",
    );
    write(&root.join("repo/B.md"), "[[A]] #rust");
    write(&root.join("evil.md"), "[[evil</script>]]");
    configured(home.path(), &root);
    let result = vault::command(home.path(), home.path(), &["graph".into()]).unwrap();
    assert!(result.contains("graph:"));
    let graph: Value =
        serde_json::from_slice(&fs::read(root.join(".exonous/graph.json")).unwrap()).unwrap();
    assert!(
        graph["edges"]
            .as_array()
            .unwrap()
            .iter()
            .any(|edge| edge["source"] == "repo/A.md"
                && edge["target"] == "repo/B.md"
                && edge["type"] == "link")
    );
    assert!(
        graph["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|node| node["id"] == "tag:team")
    );
    assert!(
        !graph["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|node| node["id"] == "ghost:ignored"
                || node["id"] == "ghost:hidden"
                || node["id"] == "ghost:photo.png")
    );
    let html = fs::read_to_string(root.join(".exonous/graph.html")).unwrap();
    assert!(!html.contains("evil</script>"));
    assert!(html.contains("evil\\u003c/script>"));
}

#[test]
fn windows_and_wsl_paths_map_only_the_current_distro() {
    assert_eq!(
        vault::wsl_path(r"C:\Users\Test\Vault", Path::new("/mnt"), Some("Ubuntu")),
        "/mnt/c/Users/Test/Vault"
    );
    assert_eq!(
        vault::wsl_path("D:/Notes", Path::new("/windows"), None),
        "/windows/d/Notes"
    );
    for raw in ["C:", "C:\\", "C:/"] {
        assert_eq!(vault::wsl_path(raw, Path::new("/mnt/"), None), "/mnt/c");
        assert_eq!(vault::wsl_path(raw, Path::new("/"), None), "/c");
    }
    assert_eq!(
        vault::wsl_path("C:/Notes/", Path::new("/"), None),
        "/c/Notes"
    );
    assert_eq!(vault::wsl_path("", Path::new("/mnt"), None), "");
    assert_eq!(
        vault::wsl_path(
            r"\\wsl$\Ubuntu\home\test\vault",
            Path::new("/mnt"),
            Some("ubuntu")
        ),
        "/home/test/vault"
    );
    let foreign = r"\\wsl.localhost\Other\home\test";
    assert_eq!(
        vault::wsl_path(foreign, Path::new("/mnt"), Some("Ubuntu")),
        foreign
    );
}

#[test]
fn worktrees_share_handoff_identity_and_git_suffix_cannot_traverse() {
    use std::process::Command;
    let home = tempfile::tempdir().unwrap();
    fs::create_dir(home.path().join("exonous-vault")).unwrap();
    let main = home.path().join("project");
    fs::create_dir(&main).unwrap();
    let git = |cwd: &Path, args: &[&str]| {
        let output = Command::new("git")
            .args(args)
            .current_dir(cwd)
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    };
    git(&main, &["init", "-q"]);
    git(
        &main,
        &[
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.test",
            "commit",
            "--allow-empty",
            "-qm",
            "fixture",
        ],
    );
    let worktree = home.path().join("worktree");
    git(
        &main,
        &[
            "worktree",
            "add",
            "-qb",
            "feature",
            worktree.to_str().unwrap(),
        ],
    );
    let saved = handoff::save(home.path(), &worktree, &graph(), None).unwrap();
    let data: Value =
        serde_json::from_slice(&fs::read(saved["path"].as_str().unwrap()).unwrap()).unwrap();
    assert_eq!(data["r"], "project");
    assert_eq!(data["b"], "feature");
    assert_eq!(data["h"].as_str().unwrap().len(), 40);
    assert_eq!(
        handoff::latest(home.path(), &main).unwrap()["path"],
        saved["path"]
    );
    let hostile = home.path().join("...git");
    fs::create_dir(&hostile).unwrap();
    git(&hostile, &["init", "-q"]);
    assert!(
        handoff::save(home.path(), &hostile, &graph(), None)
            .unwrap_err()
            .contains("repository")
    );
    assert!(!home.path().join("exonous-vault/avulsas").exists());
}
