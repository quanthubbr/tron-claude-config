use exonous::{doc, project_memory};
use serde_json::{Value, json};
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
        let repo = root.path().join("demo");
        let vault = root.path().join("vault");
        fs::create_dir_all(home.join(".claude/exonous")).unwrap();
        fs::create_dir_all(repo.join("src")).unwrap();
        fs::create_dir_all(vault.join("demo")).unwrap();
        fs::write(
            home.join(".claude/exonous/config.json"),
            json!({"vault":vault}).to_string(),
        )
        .unwrap();
        fs::write(
            repo.join("src/store.js"),
            "const a = 1\nfunction openStore() {\n  return wal()\n}\n",
        )
        .unwrap();
        for args in [&["init", "-q"][..], &["add", "."][..]] {
            assert!(
                Command::new("git")
                    .args(args)
                    .current_dir(&repo)
                    .status()
                    .unwrap()
                    .success()
            );
        }
        fs::write(
            vault.join("demo/CLAUDE.md"),
            "# Demo\nLegacy deploy pipelines.\n",
        )
        .unwrap();
        Self {
            _root: root,
            home,
            repo,
            vault,
        }
    }
    fn run(&self, args: &[&str]) -> exonous::payload::Decision {
        project_memory::execute(
            &self.home,
            &self.repo,
            &args.iter().map(|arg| arg.to_string()).collect::<Vec<_>>(),
        )
    }
}

#[test]
fn project_memory_crud_search_and_pinned_evidence_keep_the_existing_note_format() {
    let fx = Fixture::new();
    let added = fx.run(&[
        "add",
        "adr",
        "--title",
        "Use WAL mode",
        "--body",
        "Readers never block writers.",
        "--tag",
        "db",
        "--link",
        "symbol:openStore",
        "--evidence",
        "src/store.js:2-4",
    ]);
    assert_eq!(added.code, 0, "{}", added.stderr);
    assert!(
        added
            .stdout
            .starts_with("adr-0001  memory/adr/adr-0001-use-wal-mode.md")
    );
    let found = fx.run(&["search", "wal writers"]);
    assert_eq!(found.code, 0);
    assert!(
        found
            .stdout
            .starts_with("adr-0001  [adr (active)]  Use WAL mode")
    );
    assert!(!found.stdout.contains("tags:"));
    assert!(
        fx.run(&["search", "deploy pipelines"])
            .stdout
            .starts_with("CLAUDE.md  [note]")
    );
    let shown = fx.run(&["show", "adr-0001"]);
    assert!(shown.stdout.contains("evidence: src/store.js:2-4#"));
    assert_eq!(fx.run(&["validate"]).code, 0);
    fs::write(
        fx.repo.join("src/store.js"),
        "// header\nconst a = 1\nfunction openStore() {\n  return wal()\n}\n",
    )
    .unwrap();
    let moved = fx.run(&["validate"]);
    assert_eq!(moved.code, 1);
    assert!(moved.stdout.contains("moved src/store.js:2-4 → 3-5"));
    fs::write(
        fx.repo.join("src/store.js"),
        "function openDb() {\n return 1\n}\n// x\n",
    )
    .unwrap();
    let drift = fx.run(&["validate"]);
    assert_eq!(drift.code, 1);
    assert!(drift.stdout.contains("drift src/store.js:2-4"));
    assert!(drift.stdout.contains("unresolved symbol:openStore"));
    assert_ne!(fx.run(&["remove", "adr-0001"]).code, 0);
    assert_eq!(fx.run(&["remove", "adr-0001", "--force"]).code, 0);
}

#[test]
fn updates_keep_unknown_frontmatter_merge_lists_and_plan_ids_increment() {
    let fx = Fixture::new();
    assert_eq!(
        fx.run(&[
            "add",
            "plan",
            "--title",
            "Refactor: auth \"flow\"",
            "--body",
            "old",
            "--tag",
            "auth"
        ])
        .code,
        0
    );
    let file = fs::read_dir(fx.vault.join("demo/memory/plan"))
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .path();
    let text = fs::read_to_string(&file)
        .unwrap()
        .replacen("---\n", "---\ncustom: keep\n", 1);
    fs::write(&file, text).unwrap();
    assert_eq!(
        fx.run(&[
            "update",
            "plan-0001",
            "--body",
            "new body",
            "--add-tag",
            "api",
            "--status",
            "in-progress"
        ])
        .code,
        0
    );
    let shown = fx.run(&["show", "plan-0001"]).stdout;
    assert!(shown.contains("Refactor: auth \"flow\""));
    assert!(shown.contains("tags: auth, api"));
    assert!(shown.contains("new body"));
    assert!(fs::read_to_string(file).unwrap().contains("custom: keep"));
    assert!(
        fx.run(&["add", "plan", "--title", "Second", "--body", "b"])
            .stdout
            .starts_with("plan-0002")
    );
    assert_eq!(fx.run(&["remove", "plan-0001"]).code, 0);
}

#[test]
fn unsafe_project_names_and_symlinked_projects_cannot_escape_the_vault() {
    let fx = Fixture::new();
    let escaped = fx.run(&[
        "add",
        "doc",
        "--project",
        "../outside",
        "--title",
        "No",
        "--body",
        "x",
    ]);
    assert_eq!(escaped.code, 2);
    assert!(!fx.vault.parent().unwrap().join("outside").exists());
    #[cfg(unix)]
    {
        use std::os::unix::fs::symlink;
        let outside = fx._root.path().join("outside");
        fs::create_dir(&outside).unwrap();
        symlink(&outside, fx.vault.join("alias")).unwrap();
        let result = fx.run(&[
            "add",
            "doc",
            "--project",
            "alias",
            "--title",
            "No",
            "--body",
            "x",
        ]);
        assert_ne!(result.code, 0);
        assert_eq!(fs::read_dir(outside).unwrap().count(), 0);
    }
}

#[test]
fn doc_locate_and_refs_report_repo_vault_and_ambiguous_broken_host_references() {
    let fx = Fixture::new();
    let docs = fx.repo.join("docs/Guide");
    fs::create_dir_all(docs.join(".obsidian")).unwrap();
    fs::write(docs.join(".obsidian/app.json"), "{}").unwrap();
    fs::write(
        docs.join("_CONTEXTO.md"),
        "`src/store.js:2-99` `missing.ts:1` `localhost:8080` `status:200` `store.js:2`\n",
    )
    .unwrap();
    fs::create_dir_all(fx.repo.join("other")).unwrap();
    fs::write(fx.repo.join("other/store.js"), "other\n").unwrap();
    let args = |args: &[&str]| args.iter().map(|arg| arg.to_string()).collect::<Vec<_>>();
    let locate = doc::execute(&fx.home, &fx.repo, &args(&["locate"]));
    assert_eq!(locate.code, 0, "{}", locate.stderr);
    let located: Value = serde_json::from_str(&locate.stdout).unwrap();
    assert_eq!(located["repo"]["name"], "demo");
    assert_eq!(located["vaults"][0]["entry"], "_CONTEXTO.md");
    let refs = doc::execute(&fx.home, &fx.repo, &args(&["refs", "docs/Guide"]));
    assert_eq!(refs.code, 0, "{}", refs.stderr);
    let report: Value = serde_json::from_str(&refs.stdout).unwrap();
    assert_eq!(report["referencias"], 3);
    assert_eq!(report["quebradas"].as_array().unwrap().len(), 2);
    assert_eq!(report["ambiguas"].as_array().unwrap().len(), 1);
    assert_eq!(report["ignoradasPorParecerHost"][0], "`localhost:8080`");
    let invalid = doc::execute(
        &fx.home,
        &fx.repo,
        &args(&["refs", "docs/Guide", "--since=--output=escaped"]),
    );
    assert_ne!(invalid.code, 0);
    assert!(!fx.repo.join("escaped").exists());
}

#[test]
fn missing_vault_is_observable_without_writes() {
    let fx = Fixture::new();
    fs::write(fx.home.join(".claude/exonous/config.json"), "{}").unwrap();
    let result = fx.run(&["list", "--project", "demo"]);
    assert_eq!(result.code, 3);
    assert!(result.stderr.contains("exonous vault detect"));
    assert!(!fx.home.join("exonous-vault").exists());
}

#[test]
fn concurrent_adds_allocate_unique_ids_without_overwriting_notes() {
    let fx = Fixture::new();
    let barrier = std::sync::Barrier::new(12);
    let mut ids = std::thread::scope(|scope| {
        let workers = (0..12)
            .map(|index| {
                let fx = &fx;
                let barrier = &barrier;
                scope.spawn(move || {
                    barrier.wait();
                    let title = format!("Concurrent plan {index}");
                    let result = fx.run(&["add", "plan", "--title", &title, "--body", &title]);
                    assert_eq!(result.code, 0, "{}", result.stderr);
                    result.stdout.split_whitespace().next().unwrap().to_string()
                })
            })
            .collect::<Vec<_>>();
        workers
            .into_iter()
            .map(|worker| worker.join().unwrap())
            .collect::<Vec<_>>()
    });
    ids.sort();
    assert_eq!(
        ids,
        (1..=12)
            .map(|id| format!("plan-{id:04}"))
            .collect::<Vec<_>>()
    );
    let notes = fs::read_dir(fx.vault.join("demo/memory/plan"))
        .unwrap()
        .map(|entry| fs::read_to_string(entry.unwrap().path()).unwrap())
        .collect::<Vec<_>>();
    assert_eq!(notes.len(), 12);
    for index in 0..12 {
        assert_eq!(
            notes
                .iter()
                .filter(|note| note.contains(&format!("title: Concurrent plan {index}\n")))
                .count(),
            1
        );
    }
}
