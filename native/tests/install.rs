use exonous::{install, settings};
use serde_json::{Value, json};
use std::fs;
use std::path::{Path, PathBuf};

#[cfg(unix)]
#[test]
fn native_update_activates_verified_release_through_real_candidate_process() {
    use sha2::{Digest, Sha512};
    use std::os::unix::fs::PermissionsExt;
    use std::process::Command;
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home$cash");
    fs::create_dir(&home).unwrap();
    let mock = temp.path().join("network-tools");
    fs::create_dir(&mock).unwrap();
    let target = match std::env::consts::OS {
        "macos" if std::env::consts::ARCH == "aarch64" => "aarch64-apple-darwin",
        "macos" => "x86_64-apple-darwin",
        _ if std::env::consts::ARCH == "aarch64" => "aarch64-unknown-linux-gnu",
        _ => "x86_64-unknown-linux-gnu",
    };
    let filename = format!("exonous-{}.tgz", env!("CARGO_PKG_VERSION"));
    let archive = temp.path().join(&filename);
    let output = fs::File::create(&archive).unwrap();
    let mut tar = tar::Builder::new(flate2::write::GzEncoder::new(
        output,
        flate2::Compression::fast(),
    ));
    tar.sparse(false);
    tar.append_path_with_name(
        env!("CARGO_BIN_EXE_exonous"),
        format!("package/native/{target}/exonous"),
    )
    .unwrap();
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    tar.append_dir_all("package/assets", root.join("assets"))
        .unwrap();
    let sparse = temp.path().join("sparse-asset");
    fs::File::create(&sparse).unwrap().set_len(65536).unwrap();
    tar.append_path_with_name(&sparse, "package/assets/sparse-asset")
        .unwrap();
    let mut package = json_file(&root.join("package.json"));
    package["gitHead"] = json!("a".repeat(40));
    let bytes = serde_json::to_vec(&package).unwrap();
    let mut header = tar::Header::new_gnu();
    header.set_size(bytes.len() as u64);
    header.set_mode(0o600);
    header.set_cksum();
    tar.append_data(&mut header, "package/package.json", bytes.as_slice())
        .unwrap();
    tar.into_inner().unwrap().finish().unwrap();
    let mut release = tar::Archive::new(flate2::read::GzDecoder::new(
        fs::File::open(&archive).unwrap(),
    ));
    for entry in release.entries().unwrap() {
        let entry = entry.unwrap();
        let kind = entry.header().entry_type();
        assert!(
            kind.is_file() || kind.is_dir(),
            "release fixture contains unsupported entry {:?}: {:?}",
            kind,
            entry.path().unwrap()
        );
    }
    let hash = Sha512::digest(fs::read(&archive).unwrap());
    let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut encoded = String::new();
    for chunk in hash.chunks(3) {
        let bits = ((chunk[0] as u32) << 16)
            | ((chunk.get(1).copied().unwrap_or(0) as u32) << 8)
            | chunk.get(2).copied().unwrap_or(0) as u32;
        for (index, shift) in [18, 12, 6, 0].into_iter().enumerate() {
            encoded.push(if index > chunk.len() {
                '='
            } else {
                alphabet[((bits >> shift) & 63) as usize] as char
            });
        }
    }
    let metadata = temp.path().join("metadata.json");
    fs::write(&metadata, serde_json::to_vec(&json!({"name":"exonous","version":env!("CARGO_PKG_VERSION"),"gitHead":"a".repeat(40),"dist":{"integrity":format!("sha512-{encoded}"),"tarball":format!("https://registry.npmjs.org/exonous/-/{filename}")}})).unwrap()).unwrap();
    let git = mock.join("git");
    fs::write(
        &git,
        format!(
            "#!/bin/sh\nprintf '%s\\trefs/tags/v{}\\n' '{}'\n",
            env!("CARGO_PKG_VERSION"),
            "a".repeat(40)
        ),
    )
    .unwrap();
    let curl = mock.join("curl");
    let shell_path = |path: &Path| format!("'{}'", path.to_str().unwrap().replace('\'', "'\\''"));
    fs::write(&curl, format!("#!/bin/sh\nwhile [ \"$#\" -gt 0 ]; do\n if [ \"$1\" = --output ]; then shift; dest=$1; fi\n url=$1\n shift\ndone\ncase \"$url\" in https://registry.npmjs.org/exonous/{}) /bin/cp {} \"$dest\";; https://registry.npmjs.org/exonous/-/{filename}) /bin/cp {} \"$dest\";; *) exit 1;; esac\n", env!("CARGO_PKG_VERSION"), shell_path(&metadata), shell_path(&archive))).unwrap();
    for executable in [&git, &curl] {
        fs::set_permissions(executable, fs::Permissions::from_mode(0o700)).unwrap();
    }
    let directory = home.join(".claude/exonous");
    fs::create_dir_all(&directory).unwrap();
    fs::write(directory.join("install.json"), serde_json::to_vec(&json!({"version":"2.0.0","runtime":"rust","complete":true,"ref":"v2.0.0","tools":["claude"]})).unwrap()).unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_exonous"))
        .arg("update")
        .current_dir(temp.path())
        .env("HOME", &home)
        .env("EXONOUS_HOME", &home)
        .env("PATH", format!("{}:/usr/bin:/bin", mock.display()))
        .env("EXONOUS_NO_FORWARD", "1")
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "stdout={} stderr={}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let info: Value =
        serde_json::from_slice(&fs::read(directory.join("install.json")).unwrap()).unwrap();
    assert_eq!(info["version"], env!("CARGO_PKG_VERSION"));
    assert_eq!(info["complete"], true);
    assert_eq!(info["tagSha"], "a".repeat(40));
    fs::write(
        &git,
        format!(
            "#!/bin/sh\nprintf '%s\\trefs/tags/v{}\\n' '{}'\n",
            env!("CARGO_PKG_VERSION"),
            "b".repeat(40)
        ),
    )
    .unwrap();
    let moved = Command::new(env!("CARGO_BIN_EXE_exonous"))
        .args(["update", "--check"])
        .current_dir(temp.path())
        .env("HOME", &home)
        .env("EXONOUS_HOME", &home)
        .env("PATH", format!("{}:/usr/bin:/bin", mock.display()))
        .env("EXONOUS_NO_FORWARD", "1")
        .output()
        .unwrap();
    assert!(!moved.status.success());
    assert!(String::from_utf8_lossy(&moved.stderr).contains("tag moved"));
    let active = exonous::update::active_binary(&home).unwrap().unwrap();
    let version = Command::new(active)
        .arg("--version")
        .env("HOME", &home)
        .env("EXONOUS_HOME", &home)
        .output()
        .unwrap();
    assert!(version.status.success());
    assert_eq!(
        String::from_utf8(version.stdout).unwrap().trim(),
        env!("CARGO_PKG_VERSION")
    );
}

const CAPS: &[&str] = &[
    "pyle",
    "ethos",
    "metron",
    "taxis-spawn",
    "taxis-session",
    "anamnesis",
    "kairos",
];
const SKILLS: &[&str] = &[
    "commit-changes",
    "make-pr",
    "code-review",
    "security-review",
    "deliver",
    "project-memory",
    "session-handoff",
    "doc",
    "issue-board",
    "ui-design",
    "ui-motion",
    "native-ui",
    "ui-mockup",
    "ui-patterns",
];

struct Fixture {
    _temp: tempfile::TempDir,
    home: PathBuf,
    assets: PathBuf,
    binary: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let assets = temp.path().join("assets");
        fs::create_dir(&home).unwrap();
        for (file, body) in [
            (
                "rules/nomos.md",
                "# Nomos\n\n## Communication\nBe clear.\n## Agents\nUse twelve.\n## Engineering\nProve it.\n## Verify\nCheck.\n## Git\nReview.\n",
            ),
            (
                "rules/praxis.md",
                "# Praxis\n## Make it work\nReproduce.\n## Architecture\nOwn decisions.\n## Make it right\nVerify.\n",
            ),
            ("machine/PR-TEMPLATE.md", "## Change\n"),
            ("techne/rules/general.md", "Own decisions.\n"),
            ("techne/.claude-plugin/plugin.json", "{\"name\":\"techne\"}"),
            ("agents/roster.json", "{\"agents\":[\"exo-backend\"]}"),
        ] {
            write(&assets.join(file), body);
        }
        for name in SKILLS {
            write(
                &assets.join(format!("skills/{name}/SKILL.md")),
                &format!("---\ndescription: {name}\n---\n\nBehavior for {name}.\n$ARGUMENTS\n"),
            );
        }
        for name in [
            "backend",
            "cto",
            "data-ai",
            "designer",
            "devops",
            "frontend",
            "infra",
            "mobile",
            "pm",
            "qa",
            "researcher",
            "security",
        ] {
            write(
                &assets.join(format!("agents/exo-{name}.md")),
                "---\ndescription: role\nmodel: opus\n---\n\nDo the work.\n",
            );
        }
        let binary = temp.path().join("exonous");
        fs::write(&binary, b"native fixture executable").unwrap();
        Self {
            _temp: temp,
            home,
            assets,
            binary,
        }
    }
    fn install(&self, args: &[&str]) -> Result<String, String> {
        install::install_from(
            &self.home,
            &self.home,
            &args.iter().map(|arg| (*arg).into()).collect::<Vec<_>>(),
            &self.assets,
            &self.binary,
            CAPS,
        )
    }
    fn installed_binary(&self) -> PathBuf {
        json_file(&self.home.join(".claude/exonous/install.json"))["binary"]
            .as_str()
            .unwrap()
            .into()
    }
}
fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}
fn json_file(path: &Path) -> Value {
    serde_json::from_slice(&fs::read(path).unwrap()).unwrap()
}
fn snapshot(root: &Path) -> Vec<(PathBuf, Vec<u8>)> {
    fn walk(root: &Path, current: &Path, result: &mut Vec<(PathBuf, Vec<u8>)>) {
        for entry in fs::read_dir(current).unwrap() {
            let entry = entry.unwrap();
            if entry.path().is_dir() {
                walk(root, &entry.path(), result);
            } else {
                result.push((
                    entry.path().strip_prefix(root).unwrap().into(),
                    fs::read(entry.path()).unwrap(),
                ));
            }
        }
    }
    let mut result = Vec::new();
    walk(root, root, &mut result);
    result.sort();
    result
}

#[test]
fn install_is_idempotent_and_dry_run_has_no_side_effects() {
    let fixture = Fixture::new();
    let before = snapshot(&fixture.home);
    let output = fixture
        .install(&[
            "--tools",
            "claude,codex,gemini,opencode,cursor",
            "--dry-run",
        ])
        .unwrap();
    assert!(output.contains("DRY RUN"));
    assert_eq!(before, snapshot(&fixture.home));
    fixture
        .install(&["--tools", "claude,codex,gemini,opencode,cursor"])
        .unwrap();
    let once = snapshot(&fixture.home);
    fixture
        .install(&["--tools", "claude,codex,gemini,opencode,cursor"])
        .unwrap();
    let twice = snapshot(&fixture.home);
    let changed = once
        .iter()
        .filter(|entry| !twice.contains(entry))
        .map(|entry| &entry.0)
        .chain(
            twice
                .iter()
                .filter(|entry| !once.contains(entry))
                .map(|entry| &entry.0),
        )
        .collect::<Vec<_>>();
    assert!(changed.is_empty(), "changed on repeat: {changed:?}");
    assert!(fixture.installed_binary().exists());
    assert!(
        fixture
            .home
            .join(if cfg!(windows) {
                ".local/bin/exonous.cmd"
            } else {
                ".local/bin/exonous"
            })
            .exists()
    );
    assert!(
        fs::read_to_string(fixture.home.join(".agents/skills/deliver/SKILL.md"))
            .unwrap()
            .contains(&fixture.installed_binary().to_string_lossy().to_string())
    );
    assert_eq!(
        json_file(&fixture.home.join(".claude/exonous/installed.json"))["complete"],
        true
    );
}

#[test]
fn all_adapters_preserve_user_config_and_native_commands_use_absolute_binary() {
    let fixture = Fixture::new();
    write(
        &fixture.home.join(".claude/settings.json"),
        "{\"env\":{\"PERSONAL\":\"keep\"},\"hooks\":{\"PreToolUse\":[{\"matcher\":\"Bash\",\"hooks\":[{\"command\":\"personal guard\"}]}]}}\n",
    );
    write(
        &fixture.home.join(".claude/.mcp.json"),
        "{\"mcpServers\":{\"atlas\":{\"command\":\"graph\",\"args\":[\"--stdio\"],\"env\":{\"TOKEN\":\"private\"}},\"biblos\":{\"url\":\"https://docs.example.invalid/mcp\"}}}",
    );
    write(
        &fixture.home.join(".codex/config.toml"),
        "# personal\nmodel = \"mine\"\n[projects.\"/work\"]\ntrust_level = \"trusted\"\n",
    );
    write(
        &fixture.home.join(".codex/AGENTS.md"),
        "Personal instructions.\n",
    );
    write(
        &fixture.home.join(".codeium/windsurf/hooks.json"),
        "{\"version\":1}",
    );
    write(
        &fixture
            .home
            .join(".codeium/windsurf/memories/global_rules.md"),
        "Personal memory.\n",
    );
    fs::create_dir_all(fixture.home.join("Documents/Cline")).unwrap();
    fs::create_dir_all(fixture.home.join(".qwen")).unwrap();
    fixture.install(&["--all", "--skip-tool", "kiro"]).unwrap();
    let config = json_file(&fixture.home.join(".claude/settings.json"));
    assert_eq!(config["env"]["PERSONAL"], "keep");
    assert!(
        config["hooks"]["PreToolUse"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry.to_string().contains("personal guard"))
    );
    let native = config["hooks"]["PreToolUse"]
        .as_array()
        .unwrap()
        .iter()
        .find(|entry| entry.to_string().contains("hook pyle"))
        .unwrap();
    assert_eq!(
        native["hooks"][0]["command"],
        format!(
            "\"{}\" hook pyle --adapter claude",
            fixture.installed_binary().display()
        )
    );
    assert!(!native.to_string().contains("pyle.cjs"));
    let gemini = json_file(&fixture.home.join(".gemini/settings.json"));
    assert_eq!(gemini["mcpServers"]["atlas"]["command"], "graph");
    assert!(gemini["mcpServers"]["atlas"].get("env").is_none());
    assert!(
        gemini["hooks"]["BeforeTool"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry.to_string().contains("hook pyle"))
    );
    let toml = fs::read_to_string(fixture.home.join(".codex/config.toml")).unwrap();
    assert!(toml.contains("# personal\nmodel = \"mine\""));
    toml::from_str::<toml::Value>(&toml).unwrap();
    assert!(
        fixture
            .home
            .join(".config/opencode/plugins/exonous.js")
            .exists()
    );
    assert!(
        fixture
            .home
            .join("Documents/Cline/Rules/exonous-praxis.md")
            .exists()
    );
    let before = snapshot(&fixture.home);
    assert!(install::doctor(&fixture.home, &fixture.home, &["--json".into()]).is_ok());
    assert_eq!(before, snapshot(&fixture.home));
}

#[test]
fn installed_binary_can_reinstall_doctor_and_uninstall_its_owned_runtime() {
    let mut fixture = Fixture::new();
    fixture.assets = Path::new(env!("CARGO_MANIFEST_DIR")).join("assets");
    fs::copy(env!("CARGO_BIN_EXE_exonous"), &fixture.binary).unwrap();
    fixture.install(&["--tools", "claude"]).unwrap();
    let installed = fixture.installed_binary();
    assert_ne!(installed, fixture.binary);
    for args in [
        vec!["install", "--tools", "claude", "--quiet"],
        vec!["doctor", "--json"],
    ] {
        let output = std::process::Command::new(&installed)
            .args(&args)
            .current_dir(&fixture.home)
            .env("EXONOUS_HOME", &fixture.home)
            .env("EXONOUS_ASSETS", &fixture.assets)
            .env("EXONOUS_NO_FORWARD", "1")
            .env("EXONOUS_NO_UPDATE", "1")
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{args:?}: stdout={} stderr={}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }
    let edited = fixture.home.join(".claude/rules/nomos.md");
    write(&edited, "My edited rule\n");
    let foreign = fixture.home.join(".claude/exonous/agent-roles/custom.md");
    write(&foreign, "My role\n");
    let output = std::process::Command::new(&installed)
        .args(["uninstall", "--yes"])
        .current_dir(&fixture.home)
        .env("EXONOUS_HOME", &fixture.home)
        .env("EXONOUS_ASSETS", &fixture.assets)
        .env("EXONOUS_NO_FORWARD", "1")
        .env("EXONOUS_NO_UPDATE", "1")
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "uninstall: stdout={} stderr={}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(!installed.exists());
    assert!(!fixture.home.join(".claude/exonous/installed.json").exists());
    assert_eq!(fs::read_to_string(edited).unwrap(), "My edited rule\n");
    assert_eq!(fs::read_to_string(foreign).unwrap(), "My role\n");
}

#[cfg(windows)]
#[test]
fn windows_launcher_preserves_failed_status_and_uninstalls_itself() {
    let mut fixture = Fixture::new();
    fixture.assets = Path::new(env!("CARGO_MANIFEST_DIR")).join("assets");
    fs::copy(env!("CARGO_BIN_EXE_exonous"), &fixture.binary).unwrap();
    fixture.install(&["--tools", "claude"]).unwrap();
    let installed = fixture.installed_binary();
    let launcher = fixture.home.join(".local/bin/exonous.cmd");
    let run = |executable: &Path, args: &[&str]| {
        std::process::Command::new(executable)
            .args(args)
            .current_dir(&fixture.home)
            .env("EXONOUS_HOME", &fixture.home)
            .env("EXONOUS_ASSETS", &fixture.assets)
            .env("EXONOUS_NO_FORWARD", "1")
            .env("EXONOUS_NO_UPDATE", "1")
            .output()
            .unwrap()
    };
    let ledger = fixture.home.join(".claude/exonous/installed.json");
    let before = fs::read(&ledger).unwrap();
    for args in [["uninstall"], ["unknown-command"]] {
        let direct = run(&installed, &args);
        let failed = run(&launcher, &args);
        assert!(!direct.status.success());
        assert_eq!(failed.status.code(), direct.status.code());
        assert_eq!(failed.stderr, direct.stderr);
    }
    assert_eq!(fs::read(&ledger).unwrap(), before);
    assert!(launcher.exists());
    assert!(installed.exists());
    let output = run(&launcher, &["uninstall", "--yes"]);
    assert!(
        output.status.success(),
        "launcher uninstall: stdout={} stderr={}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(!launcher.exists());
    assert!(!installed.exists());
    assert!(!ledger.exists());
}

#[test]
fn invalid_json_aborts_before_any_install_writes_and_edited_files_survive_uninstall() {
    let fixture = Fixture::new();
    write(
        &fixture.home.join(".claude/settings.json"),
        "{broken private config",
    );
    let before = snapshot(&fixture.home);
    assert!(
        fixture
            .install(&["--tools", "claude"])
            .unwrap_err()
            .contains("invalid JSON")
    );
    assert_eq!(before, snapshot(&fixture.home));
    fs::remove_file(fixture.home.join(".claude/settings.json")).unwrap();
    fixture.install(&["--tools", "claude"]).unwrap();
    let installed_binary = fixture.installed_binary();
    write(
        &fixture.home.join(".claude/rules/nomos.md"),
        "My edited rule\n",
    );
    write(
        &fixture.home.join(".claude/exonous/config.json"),
        "{\"rulesReminder\":false}",
    );
    write(
        &fixture.home.join(".claude/exonous/agent-roles/custom.md"),
        "My role\n",
    );
    install::uninstall(&fixture.home, &fixture.home, &["--yes".into()]).unwrap();
    assert_eq!(
        fs::read_to_string(fixture.home.join(".claude/rules/nomos.md")).unwrap(),
        "My edited rule\n"
    );
    assert!(fixture.home.join(".claude/exonous/config.json").exists());
    assert!(
        fixture
            .home
            .join(".claude/exonous/agent-roles/custom.md")
            .exists()
    );
    assert!(!installed_binary.exists());
}

#[test]
fn uninstall_removes_only_owned_json_entries_and_preserves_user_toml_tables() {
    let fixture = Fixture::new();
    write(
        &fixture.home.join(".claude/settings.json"),
        "{\"env\":{\"mine\":true}}",
    );
    write(
        &fixture.home.join(".claude/.mcp.json"),
        "{\"mcpServers\":{\"atlas\":{\"command\":\"atlas\",\"args\":[]}}}",
    );
    write(
        &fixture.home.join(".codex/config.toml"),
        "model = \"mine\"\n",
    );
    fixture
        .install(&["--tools", "claude,codex,gemini"])
        .unwrap();
    let config_path = fixture.home.join(".gemini/settings.json");
    let mut config = json_file(&config_path);
    config["mcpServers"]["atlas"]["command"] = json!("my changed graph");
    config["hooks"]["BeforeTool"]
        .as_array_mut()
        .unwrap()
        .push(json!({"matcher":"*","hooks":[{"command":"my hook"}]}));
    fs::write(&config_path, serde_json::to_vec(&config).unwrap()).unwrap();
    let toml_path = fixture.home.join(".codex/config.toml");
    let raw = fs::read_to_string(&toml_path).unwrap().replace(
        "# exonous:end",
        "[projects.\"/mine\"]\ntrust_level = \"trusted\"\n# exonous:end",
    );
    fs::write(&toml_path, raw).unwrap();
    let before = snapshot(&fixture.home);
    install::uninstall(&fixture.home, &fixture.home, &["--dry-run".into()]).unwrap();
    assert_eq!(before, snapshot(&fixture.home));
    install::uninstall(&fixture.home, &fixture.home, &["--yes".into()]).unwrap();
    assert_eq!(
        json_file(&config_path)["mcpServers"]["atlas"]["command"],
        "my changed graph"
    );
    assert_eq!(
        json_file(&config_path)["hooks"]["BeforeTool"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    let kept = fs::read_to_string(&toml_path).unwrap();
    assert!(kept.contains("[projects.\"/mine\"]"));
    assert!(!kept.contains("mcp_servers.atlas"));
    toml::from_str::<toml::Value>(&kept).unwrap();
}

#[test]
fn missing_capabilities_record_incomplete_without_registering_unavailable_hooks() {
    let fixture = Fixture::new();
    write(
        &fixture.home.join(".claude/settings.json"),
        "{\"hooks\":{\"SessionStart\":[{\"hooks\":[{\"command\":\"legacy session\"}]}]}}",
    );
    let error = install::install_from(
        &fixture.home,
        &fixture.home,
        &["--tools".into(), "claude".into()],
        &fixture.assets,
        &fixture.binary,
        &["ethos"],
    )
    .unwrap_err();
    assert!(error.contains("INCOMPLETE"));
    assert!(
        !fs::read_to_string(fixture.home.join(".claude/settings.json"))
            .unwrap()
            .contains("hook pyle")
    );
    assert_eq!(
        json_file(&fixture.home.join(".claude/exonous/installed.json"))["complete"],
        false
    );
    assert!(install::doctor(&fixture.home, &fixture.home, &["--json".into()]).is_err());
}

#[test]
fn malformed_markers_and_unsafe_ledger_paths_fail_closed() {
    assert!(
        settings::upsert_section("before\n<!-- exonous:start v2 -->\nunclosed", "new", "html")
            .is_err()
    );
    let fixture = Fixture::new();
    write(
        &fixture.home.join(".claude/exonous/installed.json"),
        "{\"files\":{\"../outside\":{\"hash\":\"x\"}}}",
    );
    assert!(fixture.install(&["--tools", "qwen"]).is_err());
}

#[test]
fn upgrade_retires_only_unchanged_owned_files_and_replaces_legacy_hooks() {
    let fixture = Fixture::new();
    write(
        &fixture.assets.join("skills/deliver/retired.md"),
        "owned old file\n",
    );
    write(
        &fixture.assets.join("skills/deliver/edited.md"),
        "original text\n",
    );
    write(
        &fixture.home.join(".claude/settings.json"),
        "{\"hooks\":{\"PreToolUse\":[{\"hooks\":[{\"command\":\"node /some/.claude/exonous/hooks/pyle.cjs auto --adapter claude\"}]}],\"SessionStart\":[{\"hooks\":[{\"command\":\"node /some/.claude/exonous/taxis.js claude\"}]}]}}",
    );
    fixture.install(&["--tools", "claude"]).unwrap();
    let hooks = fs::read_to_string(fixture.home.join(".claude/settings.json")).unwrap();
    assert!(!hooks.contains("pyle.cjs"));
    assert!(!hooks.contains("taxis.js"));
    write(
        &fixture.home.join(".agents/skills/deliver/edited.md"),
        "my personal edits\n",
    );
    fs::remove_file(fixture.assets.join("skills/deliver/retired.md")).unwrap();
    fs::remove_file(fixture.assets.join("skills/deliver/edited.md")).unwrap();
    fixture.install(&["--tools", "claude"]).unwrap();
    assert!(
        !fixture
            .home
            .join(".agents/skills/deliver/retired.md")
            .exists()
    );
    assert!(
        fixture
            .home
            .join(".agents/skills/deliver/edited.md")
            .exists()
    );
}

#[test]
fn foreign_tool_skills_are_kept_and_doctor_detects_removed_registrations() {
    let fixture = Fixture::new();
    write(
        &fixture.home.join(".cursor/skills/deliver/SKILL.md"),
        "---\nname: personal-delivery\n---\nMy work.\n",
    );
    fixture.install(&["--tools", "cursor"]).unwrap();
    assert!(
        fs::read_to_string(fixture.home.join(".cursor/skills/deliver/SKILL.md"))
            .unwrap()
            .contains("personal-delivery")
    );
    let path = fixture.home.join(".cursor/hooks.json");
    let mut value = json_file(&path);
    value["hooks"]["beforeShellExecution"] = json!([]);
    fs::write(path, serde_json::to_vec(&value).unwrap()).unwrap();
    assert!(install::doctor(&fixture.home, &fixture.home, &["--json".into()]).is_err());
}

#[test]
fn jsonc_requires_explicit_rewrite_and_preserves_backup() {
    let fixture = Fixture::new();
    let raw = "{ // personal\n\"instructions\":[\"mine\",],\n}\n";
    write(&fixture.home.join(".config/opencode/opencode.jsonc"), raw);
    assert!(fixture.install(&["--tools", "opencode"]).is_err());
    fixture
        .install(&["--tools", "opencode", "--rewrite-jsonc"])
        .unwrap();
    assert_eq!(
        fs::read_to_string(
            fixture
                .home
                .join(".config/opencode/opencode.jsonc.exonous.bak")
        )
        .unwrap(),
        raw
    );
    let instructions =
        json_file(&fixture.home.join(".config/opencode/opencode.jsonc"))["instructions"]
            .as_array()
            .unwrap()
            .clone();
    assert!(instructions.contains(&json!("mine")));
}

#[cfg(unix)]
#[test]
fn symlinked_destinations_cannot_escape_isolated_home() {
    let fixture = Fixture::new();
    let outside = fixture._temp.path().join("outside");
    fs::create_dir(&outside).unwrap();
    std::os::unix::fs::symlink(&outside, fixture.home.join(".claude")).unwrap();
    assert!(fixture.install(&["--tools", "claude"]).is_err());
    assert_eq!(fs::read_dir(outside).unwrap().count(), 0);
}

#[test]
fn live_install_lock_blocks_writes_and_dead_owner_can_resume() {
    let fixture = Fixture::new();
    let lock = fixture.home.join(".claude/exonous/state/install.lock");
    write(
        &lock,
        &json!({"pid":std::process::id(),"token":"held"}).to_string(),
    );
    let before = snapshot(&fixture.home);
    assert!(
        fixture
            .install(&["--tools", "qwen"])
            .unwrap_err()
            .contains("another install")
    );
    assert_eq!(before, snapshot(&fixture.home));
    write(
        &lock,
        &json!({"pid":99999999,"token":"dead-owner"}).to_string(),
    );
    fixture.install(&["--tools", "qwen"]).unwrap();
    assert!(!lock.exists());
}

#[test]
fn foreign_path_launcher_is_preserved() {
    let fixture = Fixture::new();
    let launcher = fixture.home.join(if cfg!(windows) {
        ".local/bin/exonous.cmd"
    } else {
        ".local/bin/exonous"
    });
    write(&launcher, "personal launcher\n");
    fixture.install(&["--tools", "qwen"]).unwrap();
    assert_eq!(
        fs::read_to_string(&launcher).unwrap(),
        "personal launcher\n"
    );
}

#[test]
fn vault_install_respects_skip_and_dry_run_then_preserves_configured_root() {
    let fixture = Fixture::new();
    fixture.install(&["--tools", "qwen", "--dry-run"]).unwrap();
    assert!(snapshot(&fixture.home).is_empty());
    fixture.install(&["--tools", "qwen", "--no-vault"]).unwrap();
    assert!(!fixture.home.join("exonous-vault").exists());
    assert!(!fixture.home.join(".claude/exonous/config.json").exists());
    let target = fixture.home.join("central");
    fs::create_dir(&target).unwrap();
    let config = fixture.home.join(".claude/exonous/config.json");
    write(
        &config,
        &json!({"vault":target,"memory":false,"autoUpdate":false,"custom":"keep"}).to_string(),
    );
    fixture.install(&["--tools", "qwen"]).unwrap();
    let next = json_file(&config);
    assert_eq!(next["vault"], json!(target));
    assert_eq!(next["memory"], false);
    assert_eq!(next["autoUpdate"], false);
    assert_eq!(next["custom"], "keep");
}

#[test]
fn vault_collision_blocks_install_before_overwriting_gates_or_documents() {
    let fixture = Fixture::new();
    fixture.install(&["--tools", "qwen", "--no-vault"]).unwrap();
    let source = fixture.home.join("exonous-vault");
    let target = fixture.home.join("central");
    write(&source.join("repo/memory/doc/a.md"), "source");
    write(&target.join("repo/memory/doc/a.md"), "different");
    write(
        &fixture.home.join(".claude/exonous/config.json"),
        &json!({"vault":target,"vaultMigrationSources":[source]}).to_string(),
    );
    let before = snapshot(&fixture.home);
    assert!(
        fixture
            .install(&["--tools", "qwen"])
            .unwrap_err()
            .contains("consolidation blocked")
    );
    assert_eq!(before, snapshot(&fixture.home));
}

#[test]
fn vault_install_selects_open_obsidian_root_without_touching_registry() {
    let fixture = Fixture::new();
    let target = fixture.home.join("notes");
    fs::create_dir_all(target.join(".obsidian")).unwrap();
    let registry = exonous::vault::registry_paths(&fixture.home).remove(0);
    let raw = json!({"vaults":{"active":{"path":target,"open":true,"ts":100}}}).to_string();
    write(&registry, &raw);
    fixture.install(&["--tools", "qwen"]).unwrap();
    assert_eq!(
        json_file(&fixture.home.join(".claude/exonous/config.json"))["vault"],
        json!(target)
    );
    assert_eq!(fs::read_to_string(registry).unwrap(), raw);
}

#[test]
fn jsonc_rewrite_rejects_unterminated_block_comment() {
    assert!(settings::parse_json(Some("{} /* unterminated"), true).is_err());
}

#[test]
fn native_upgrade_retains_previous_runtime_and_assets_for_reinstall() {
    let fixture = Fixture::new();
    fixture.install(&["--tools", "qwen", "--no-vault"]).unwrap();
    let previous = fixture.installed_binary();
    let assets = previous.parent().unwrap().join("assets");
    let previous_rule = fs::read(assets.join("rules/nomos.md")).unwrap();
    fs::write(&fixture.binary, "second binary").unwrap();
    write(
        &fixture.assets.join("rules/nomos.md"),
        "# Nomos\n\nChanged rules.\n",
    );
    fixture.install(&["--tools", "qwen", "--no-vault"]).unwrap();
    let current = fixture.installed_binary();
    assert_ne!(previous, current);
    assert!(previous.is_file());
    assert_eq!(
        fs::read(assets.join("rules/nomos.md")).unwrap(),
        previous_rule
    );
    install::install_from(
        &fixture.home,
        &fixture.home,
        &["--tools".into(), "qwen".into(), "--no-vault".into()],
        &assets,
        &previous,
        CAPS,
    )
    .unwrap();
    assert_eq!(fixture.installed_binary(), previous);
    assert!(current.is_file());
    install::doctor(&fixture.home, &fixture.home, &["--json".into()]).unwrap();
}

#[cfg(unix)]
#[test]
fn canonical_legacy_skill_symlinks_remain_shared_and_foreign_links_are_rejected() {
    use std::os::unix::fs::symlink;
    let fixture = Fixture::new();
    let name = "deliver";
    let shared = fixture.home.join(format!(".agents/skills/{name}"));
    write(
        &shared.join("SKILL.md"),
        &format!("---\nname: {name}\n---\nlegacy\n"),
    );
    let projection = fixture.home.join(format!(".claude/skills/{name}"));
    fs::create_dir_all(projection.parent().unwrap()).unwrap();
    symlink(&shared, &projection).unwrap();
    use sha2::{Digest, Sha256};
    let hash = format!(
        "{:x}",
        Sha256::digest(fs::read(shared.join("SKILL.md")).unwrap())
    );
    write(
        &fixture.home.join(".claude/exonous/installed.json"),
        &json!({"version":"2.0.0","files":{
            format!(".agents/skills/{name}/SKILL.md"):hash,
            format!(".claude/skills/{name}/SKILL.md"):hash
        }})
        .to_string(),
    );
    fixture
        .install(&["--tools", "claude", "--no-vault"])
        .unwrap();
    assert!(
        fs::symlink_metadata(&projection)
            .unwrap()
            .file_type()
            .is_symlink()
    );
    assert_eq!(
        fs::read(projection.join("SKILL.md")).unwrap(),
        fs::read(shared.join("SKILL.md")).unwrap()
    );
    assert!(
        json_file(&fixture.home.join(".claude/exonous/installed.json"))["files"]
            .get(format!(".claude/skills/{name}/SKILL.md"))
            .is_none()
    );
    install::doctor(&fixture.home, &fixture.home, &["--json".into()]).unwrap();
    let foreign = Fixture::new();
    let outside = foreign._temp.path().join("foreign");
    write(&outside.join("SKILL.md"), "foreign");
    let link = foreign.home.join(".claude/skills/deliver");
    fs::create_dir_all(link.parent().unwrap()).unwrap();
    symlink(&outside, &link).unwrap();
    let before = snapshot(&foreign.home);
    assert!(
        foreign
            .install(&["--tools", "claude", "--no-vault"])
            .is_err()
    );
    assert_eq!(before, snapshot(&foreign.home));
    assert_eq!(
        fs::read_to_string(outside.join("SKILL.md")).unwrap(),
        "foreign"
    );
}
