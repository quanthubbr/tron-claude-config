#![cfg(unix)]
use exonous::{install, migrate, runtime};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

const CAPS: &[&str] = &[
    "pyle",
    "ethos",
    "metron",
    "taxis-spawn",
    "taxis-session",
    "anamnesis",
    "kairos",
];
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}
fn hash(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}

fn isolated_git_config(name: &str) -> bool {
    if std::env::var("EXONOUS_MIGRATION_TEST").as_deref() == Ok(name) {
        return false;
    }
    let status = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", name, "--nocapture"])
        .env("EXONOUS_MIGRATION_TEST", name)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .status()
        .unwrap();
    assert!(status.success());
    true
}
struct Fixture {
    _temp: tempfile::TempDir,
    home: PathBuf,
    repo: PathBuf,
    manifest: Value,
}
impl Fixture {
    fn new(installed: bool) -> Self {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let repo = temp.path().join("repo");
        fs::create_dir_all(home.join(".claude")).unwrap();
        fs::create_dir(&repo).unwrap();
        runtime::git(&repo, &["init", "-q"]).unwrap();
        write(&repo.join(".claude/old.md"), "generated");
        write(&repo.join(".claude/edited.md"), "edited");
        write(&repo.join(".claude/settings.json"),&json!({"permissions":{"allow":["mine"]},"hooks":{"PreToolUse":[{"hooks":[{"command":"old gate"},{"command":"mine"}]}]}}).to_string());
        write(
            &repo.join(".claude/.exonous-scope.json"),
            "{\"folders\":[\"common\"],\"updatedAt\":\"x\"}",
        );
        write(&repo.join(".claude/.exonous/cache"), "state");
        write(&repo.join(".git/hooks/pre-commit"), "old hook");
        let manifest = json!({"files":{".claude/old.md":[hash("generated")],".claude/edited.md":[hash("generated")],"git-hooks:pre-commit":[hash("old hook")]},"settingsCommands":["old gate"]});
        runtime::git(&repo, &["add", "."]).unwrap();
        runtime::git(
            &repo,
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
        if installed {
            let binary = temp.path().join("exonous-fixture");
            write(
                &binary,
                "#!/bin/sh\nread -r line\ncase \"$line\" in *commit*) echo 'exonous workflow commit' >&2; exit 2;; esac\nexit 0\n",
            );
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&binary, fs::Permissions::from_mode(0o755)).unwrap();
            install::install_from(
                &home,
                &repo,
                &["--tools".into(), "claude".into()],
                &Path::new(env!("CARGO_MANIFEST_DIR")).join("assets"),
                &binary,
                CAPS,
            )
            .unwrap();
        }
        Self {
            _temp: temp,
            home,
            repo,
            manifest,
        }
    }
    fn run(&self) -> Value {
        migrate::migrate_installed(&self.home, &self.repo, &self.manifest).unwrap()
    }
}

#[test]
fn unverified_machine_keeps_every_repo_file() {
    let f = Fixture::new(false);
    assert!(migrate::migrate_installed(&f.home, &f.repo, &f.manifest).is_err());
    assert!(f.repo.join(".claude/old.md").exists());
    assert!(f.repo.join(".git/hooks/pre-commit").exists());
}

#[test]
fn verified_migration_removes_owned_files_preserves_edits_and_foreign_hooks() {
    if isolated_git_config(
        "verified_migration_removes_owned_files_preserves_edits_and_foreign_hooks",
    ) {
        return;
    }
    let f = Fixture::new(true);
    let out = f.run();
    assert_eq!(out["status"], "migrated");
    assert!(!f.repo.join(".claude/old.md").exists());
    assert!(!f.repo.join(".claude/.exonous-scope.json").exists());
    assert!(!f.repo.join(".claude/.exonous").exists());
    assert!(!f.repo.join(".git/hooks/pre-commit").exists());
    assert_eq!(
        fs::read_to_string(f.repo.join(".claude/edited.md")).unwrap(),
        "edited"
    );
    let settings: Value =
        serde_json::from_str(&fs::read_to_string(f.repo.join(".claude/settings.json")).unwrap())
            .unwrap();
    assert_eq!(settings["permissions"]["allow"][0], "mine");
    assert_eq!(
        settings["hooks"]["PreToolUse"][0]["hooks"],
        json!([{"command":"mine"}])
    );
    assert!(out["trackedRemoved"].as_u64().unwrap() >= 2);
    assert_eq!(f.run()["removed"], json!([]));
}

#[test]
fn symlinked_directories_never_redirect_cleanup() {
    let f = Fixture::new(true);
    let outside = f._temp.path().join("outside");
    fs::rename(f.repo.join(".claude"), &outside).unwrap();
    std::os::unix::fs::symlink(&outside, f.repo.join(".claude")).unwrap();
    let out = f.run();
    assert_eq!(
        fs::read_to_string(outside.join("old.md")).unwrap(),
        "generated"
    );
    assert!(!out["skipped"].as_array().unwrap().is_empty());
}

#[test]
fn edited_machine_registration_blocks_cleanup() {
    let f = Fixture::new(true);
    write(&f.home.join(".claude/settings.json"), "{}");
    assert!(migrate::migrate_installed(&f.home, &f.repo, &f.manifest).is_err());
    assert!(f.repo.join(".claude/old.md").exists());
}

#[test]
fn linked_worktree_keeps_shared_git_hooks() {
    if isolated_git_config("linked_worktree_keeps_shared_git_hooks") {
        return;
    }
    let f = Fixture::new(true);
    let worktree = f._temp.path().join("worktree");
    runtime::git(
        &f.repo,
        &["worktree", "add", "-q", worktree.to_str().unwrap()],
    )
    .unwrap();
    let out = migrate::migrate_installed(&f.home, &worktree, &f.manifest).unwrap();
    assert!(f.repo.join(".git/hooks/pre-commit").exists());
    assert!(!out["notes"].as_array().unwrap().is_empty());
}

#[test]
fn changed_package_file_keeps_dependency() {
    let f = Fixture::new(true);
    write(
        &f.repo.join("package.json"),
        "{\"devDependencies\":{\"exonous\":\"old\"},\"name\":\"edited\"}",
    );
    let out = f.run();
    assert_eq!(out["devDependency"], "note");
    assert!(
        fs::read_to_string(f.repo.join("package.json"))
            .unwrap()
            .contains("exonous")
    );
}

fn isolated_pm(name: &str, pm: &str, script: &str) -> bool {
    if std::env::var("EXONOUS_MIGRATION_TEST").as_deref() == Ok(name) {
        return false;
    }
    let bin = tempfile::tempdir().unwrap();
    let path = bin.path().join(pm);
    write(&path, script);
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
    let mut paths = vec![bin.path().to_owned()];
    paths.extend(std::env::split_paths(
        &std::env::var_os("PATH").unwrap_or_default(),
    ));
    let status = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", name, "--nocapture"])
        .env("EXONOUS_MIGRATION_TEST", name)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("PATH", std::env::join_paths(paths).unwrap())
        .status()
        .unwrap();
    assert!(status.success());
    true
}

#[test]
fn clean_dependency_removal_disables_package_scripts() {
    if isolated_pm(
        "clean_dependency_removal_disables_package_scripts",
        "npm",
        "#!/bin/sh\nprintf '%s\\n' \"$npm_config_ignore_scripts\" \"$@\" > .pm-proof\nprintf '{\"name\":\"app\"}\\n' > package.json\n",
    ) {
        return;
    }
    let f = Fixture::new(true);
    write(
        &f.repo.join("package.json"),
        "{\"name\":\"app\",\"devDependencies\":{\"exonous\":\"old\"}}",
    );
    runtime::git(&f.repo, &["add", "package.json"]).unwrap();
    runtime::git(
        &f.repo,
        &[
            "-c",
            "user.name=T",
            "-c",
            "user.email=t@t",
            "commit",
            "-qm",
            "package",
        ],
    )
    .unwrap();
    let out = f.run();
    assert_eq!(out["devDependency"], "removed");
    let proof = fs::read_to_string(f.repo.join(".pm-proof")).unwrap();
    assert_eq!(
        proof.lines().collect::<Vec<_>>(),
        [
            "true",
            "uninstall",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
            "exonous"
        ]
    );
    assert!(
        !fs::read_to_string(f.repo.join("package.json"))
            .unwrap()
            .contains("exonous")
    );
}

#[test]
fn unsupported_script_disabling_keeps_dependency() {
    if isolated_pm(
        "unsupported_script_disabling_keeps_dependency",
        "bun",
        "#!/bin/sh\nprintf '%s\\n' \"$@\" > .pm-proof\necho 'usage: bun remove'\n",
    ) {
        return;
    }
    let f = Fixture::new(true);
    write(
        &f.repo.join("package.json"),
        "{\"packageManager\":\"bun@1\",\"devDependencies\":{\"exonous\":\"old\"}}",
    );
    runtime::git(&f.repo, &["add", "package.json"]).unwrap();
    runtime::git(
        &f.repo,
        &[
            "-c",
            "user.name=T",
            "-c",
            "user.email=t@t",
            "commit",
            "-qm",
            "package",
        ],
    )
    .unwrap();
    let out = f.run();
    assert_eq!(out["devDependency"], "note");
    assert_eq!(
        fs::read_to_string(f.repo.join(".pm-proof")).unwrap(),
        "remove\n--help\n"
    );
    assert!(
        fs::read_to_string(f.repo.join("package.json"))
            .unwrap()
            .contains("exonous")
    );
}
