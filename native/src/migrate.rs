use crate::{
    install,
    runtime::{self, Result},
    selftest,
};
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fs,
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant},
};

const MANIFEST: &str = include_str!("../../src/legacy/v2-manifest.json");
const DEPS: &[&str] = &["exonous", "@tron/claude-config"];
const SCOPE: &[&str] = &[
    ".claude/.exonous-scope.json",
    ".claude/.tron-scope.json",
    ".claude/.ecc-scope.json",
];
const STATE: &[&str] = &[
    ".claude/.exonous",
    ".claude/.commit-authorized",
    ".claude/.pr-body-draft.md",
    ".claude/.harness-last-update",
    ".claude/.harness-session",
];
const DESIGN: &[&str] = &[
    ".cursor/hooks.json",
    ".github/hooks/ui-design.json",
    ".github/hooks/tron-design.json",
    ".github/hooks/impeccable.json",
    ".github/hooks/kallos.json",
];
const MARKERS: &[&str] = &[
    "/.agents/skills/ui-design/scripts/",
    "/skills/tron-design/scripts/tron-design",
    "/skills/impeccable/scripts/impeccable",
    "/skills/kallos/scripts/kallos",
];

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct Summary {
    status: String,
    removed: Vec<String>,
    kept_modified: Vec<String>,
    stripped: Vec<String>,
    skipped: Vec<String>,
    notes: Vec<String>,
    tracked_removed: usize,
    dev_dependency: String,
}
fn read_json(path: &Path) -> Option<Value> {
    serde_json::from_str(&runtime::read_limited(path, 16 * 1024 * 1024).ok()?).ok()
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn raw_git(root: &Path, args: &[&str]) -> Result<String> {
    let out = Command::new("git")
        .args(["--no-optional-locks", "-c", "core.fsmonitor=false"])
        .args(args)
        .current_dir(root)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|_| "cannot execute git query")?;
    if !out.status.success() {
        return Err("git query failed".into());
    }
    String::from_utf8(out.stdout)
        .map(|s| s.trim_end_matches('\n').to_owned())
        .map_err(|_| "invalid git query output".into())
}
fn inside(root: &Path, path: &Path) -> bool {
    let Ok(rel) = path.strip_prefix(root) else {
        return false;
    };
    if rel.as_os_str().is_empty() {
        return false;
    }
    let mut current = root.to_owned();
    for part in rel.components() {
        if !matches!(part, Component::Normal(_)) {
            return false;
        }
        current.push(part);
        match fs::symlink_metadata(&current) {
            Ok(meta) if meta.file_type().is_symlink() => return false,
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
            Err(_) => return false,
        }
    }
    fs::canonicalize(path).map_or(true, |p| p.starts_with(root))
}
fn guarded(root: &Path, relative: &str, summary: &mut Summary) -> Option<PathBuf> {
    let path = root.join(relative);
    if !inside(root, &path) {
        if !summary.skipped.iter().any(|s| s == relative) {
            summary.skipped.push(relative.into());
        }
        return None;
    }
    Some(path)
}
fn remove(
    root: &Path,
    relative: &str,
    tracked: &BTreeSet<String>,
    summary: &mut Summary,
) -> Result<()> {
    let Some(path) = guarded(root, relative, summary) else {
        return Ok(());
    };
    let Ok(meta) = fs::symlink_metadata(&path) else {
        return Ok(());
    };
    if meta.is_dir() {
        fs::remove_dir_all(&path)
    } else {
        fs::remove_file(&path)
    }
    .map_err(|_| format!("cannot remove legacy {relative}"))?;
    summary.removed.push(relative.into());
    summary.tracked_removed += usize::from(tracked.contains(relative));
    let mut parent = path.parent();
    while let Some(dir) = parent {
        if dir == root
            || !inside(root, dir)
            || [".claude", ".github", ".cursor"]
                .iter()
                .any(|keep| dir == root.join(keep))
        {
            break;
        }
        if fs::remove_dir(dir).is_err() {
            break;
        }
        parent = dir.parent();
    }
    Ok(())
}
fn atomic_json(root: &Path, path: &Path, value: &Value) -> Result<()> {
    if !inside(root, path) {
        return Err("legacy configuration path became unsafe".into());
    }
    let meta = fs::metadata(path).map_err(|_| "cannot inspect legacy config")?;
    let temp = path.with_extension(format!("{}.migration", runtime::nonce()));
    let result = (|| {
        let mut out = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|_| "cannot create legacy config update")?;
        use std::io::Write;
        out.set_permissions(meta.permissions())
            .map_err(|_| "cannot preserve config permissions")?;
        out.write_all(
            format!(
                "{}\n",
                serde_json::to_string_pretty(value).map_err(|_| "cannot encode legacy config")?
            )
            .as_bytes(),
        )
        .map_err(|_| "cannot write legacy config")?;
        out.sync_all().map_err(|_| "cannot sync legacy config")?;
        if !inside(root, path) {
            return Err("legacy configuration path became unsafe".into());
        }
        fs::rename(&temp, path).map_err(|_| "cannot replace legacy config".into())
    })();
    let _ = fs::remove_file(temp);
    result
}
fn strip_hooks(config: &mut Value, ours: impl Fn(&Value) -> bool) -> bool {
    let Some(hooks) = config.get_mut("hooks").and_then(Value::as_object_mut) else {
        return false;
    };
    let mut changed = false;
    for entries in hooks.values_mut() {
        let Some(list) = entries.as_array_mut() else {
            continue;
        };
        list.retain_mut(|entry| {
            if let Some(inner) = entry.get_mut("hooks").and_then(Value::as_array_mut) {
                let count = inner.len();
                inner.retain(|h| !ours(h));
                changed |= count != inner.len();
                !inner.is_empty()
            } else if ours(entry) {
                changed = true;
                false
            } else {
                true
            }
        });
    }
    hooks.retain(|_, entries| !entries.as_array().is_some_and(Vec::is_empty));
    if changed && hooks.is_empty() {
        config.as_object_mut().unwrap().remove("hooks");
    }
    changed
}
fn dependencies(root: &Path) -> Vec<String> {
    let package = read_json(&root.join("package.json")).unwrap_or(Value::Null);
    DEPS.iter()
        .filter(|name| {
            ["dependencies", "devDependencies"].iter().any(|key| {
                package[*key][**name]
                    .as_str()
                    .is_some_and(|s| !s.is_empty())
            })
        })
        .map(|s| (*s).into())
        .collect()
}
fn has_legacy(root: &Path, manifest: &Value) -> bool {
    !dependencies(root).is_empty()
        || manifest["files"].as_object().is_some_and(|files| {
            files
                .keys()
                .filter(|p| !p.starts_with("git-hooks:"))
                .any(|p| root.join(p).exists())
        })
        || SCOPE.iter().any(|p| root.join(p).exists())
}
fn protect_home(home: &Path, root: &Path) -> Result<()> {
    let mut homes = vec![home.to_owned()];
    if let Some(actual) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }) {
        homes.push(actual.into());
    }
    for home in homes {
        match fs::canonicalize(home) {
            Ok(home) if home == root || home.starts_with(root) => {
                return Err("migration root is your home directory or above it; run exonous migrate inside the repository".into());
            }
            _ => {}
        }
    }
    Ok(())
}
fn verify_machine(home: &Path, root: &Path) -> Result<()> {
    let info = read_json(&home.join(".claude/exonous/install.json"))
        .ok_or("native machine install is missing; run exonous install before migration")?;
    if info["complete"] != true
        || !info["capabilities"]
            .as_array()
            .is_some_and(|caps| caps.iter().any(|cap| cap == "pyle"))
    {
        return Err("native gate capability is not verified; repository left unchanged".into());
    }
    let report: Value = serde_json::from_str(&install::doctor(home, root, &["--json".into()])?)
        .map_err(|_| "invalid native doctor report")?;
    if report["complete"] != true {
        return Err("native machine install did not pass doctor; repository left unchanged".into());
    }
    let tools = report["adapters"]
        .as_array()
        .ok_or("native adapters are missing")?;
    let wanted = tools
        .iter()
        .filter(|t| matches!(t["id"].as_str(), Some("claude" | "cursor")) && t["detected"] == true)
        .collect::<Vec<_>>();
    if wanted.is_empty() {
        return Err(
            "neither Claude Code nor Cursor is installed; repository left unchanged".into(),
        );
    }
    for tool in wanted {
        if tool["installed"] != true
            || !tool["gate"]
                .as_str()
                .is_some_and(|s| s.starts_with("registered"))
        {
            return Err("native gate is not registered; repository left unchanged".into());
        }
        selftest::probe(home, root, tool["id"].as_str().ok_or("invalid adapter id")?)?;
    }
    Ok(())
}
fn clean_repo(root: &Path, manifest: &Value, summary: &mut Summary) -> Result<()> {
    let tracked = raw_git(root, &["ls-files", "-z"])?
        .split('\0')
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .collect::<BTreeSet<_>>();
    let files = manifest["files"]
        .as_object()
        .ok_or("invalid legacy manifest")?;
    for (relative, hashes) in files {
        if relative.starts_with("git-hooks:") || relative == ".claude/settings.json" {
            continue;
        }
        let Some(path) = guarded(root, relative, summary) else {
            continue;
        };
        let Ok(meta) = fs::metadata(&path) else {
            continue;
        };
        if !meta.is_file() {
            continue;
        }
        let digest = hash(&fs::read(&path).map_err(|_| "cannot read legacy file")?);
        if hashes
            .as_array()
            .is_some_and(|values| values.iter().any(|v| v == &digest))
        {
            remove(root, relative, &tracked, summary)?;
        } else {
            summary.kept_modified.push(relative.into());
        }
    }
    for relative in SCOPE {
        let Some(path) = guarded(root, relative, summary) else {
            continue;
        };
        if read_json(&path).is_some_and(|data| {
            data["folders"].is_array()
                && data.as_object().is_some_and(|obj| {
                    obj.keys().all(|k| {
                        ["folders", "scoped", "signals", "updatedAt"].contains(&k.as_str())
                    })
                })
        }) {
            remove(root, relative, &tracked, summary)?;
        }
    }
    for relative in STATE {
        remove(root, relative, &tracked, summary)?;
    }
    for relative in std::iter::once(".claude/settings.json").chain(DESIGN.iter().copied()) {
        let Some(path) = guarded(root, relative, summary) else {
            continue;
        };
        if !path.exists() {
            continue;
        }
        let bytes = fs::read(&path).map_err(|_| "cannot read legacy settings")?;
        if relative == ".claude/settings.json"
            && files
                .get(relative)
                .and_then(Value::as_array)
                .is_some_and(|values| values.iter().any(|v| v == &hash(&bytes)))
        {
            remove(root, relative, &tracked, summary)?;
            continue;
        }
        let Ok(mut config) = serde_json::from_slice::<Value>(&bytes) else {
            summary
                .notes
                .push(format!("{relative} is not valid JSON; kept"));
            continue;
        };
        let changed = if relative == ".claude/settings.json" {
            strip_hooks(&mut config, |hook| {
                manifest["settingsCommands"]
                    .as_array()
                    .is_some_and(|commands| commands.contains(&hook["command"]))
            })
        } else {
            strip_hooks(&mut config, |hook| {
                let text = hook.to_string().replace("\\\\", "/");
                MARKERS.iter().any(|marker| text.contains(marker))
            })
        };
        if !changed {
            continue;
        }
        if config.as_object().is_some_and(|obj| {
            obj.keys()
                .all(|key| key == "version" && relative != ".claude/settings.json")
        }) {
            remove(root, relative, &tracked, summary)?;
        } else {
            atomic_json(root, &path, &config)?;
        }
        summary.stripped.push(relative.into());
    }
    clean_git_hooks(root, manifest, summary)
}
fn clean_git_hooks(root: &Path, manifest: &Value, summary: &mut Summary) -> Result<()> {
    if raw_git(root, &["config", "--get", "core.hooksPath"]).is_ok_and(|s| !s.is_empty()) {
        return Ok(());
    }
    let gitdir = fs::canonicalize(root.join(raw_git(root, &["rev-parse", "--absolute-git-dir"])?))
        .map_err(|_| "cannot resolve git directory")?;
    let common = fs::canonicalize(root.join(raw_git(root, &["rev-parse", "--git-common-dir"])?))
        .map_err(|_| "cannot resolve common git directory")?;
    if gitdir != common {
        summary.notes.push(format!(
            "git hooks are shared with {}; migrate the main checkout",
            common.parent().unwrap_or(&common).display()
        ));
        return Ok(());
    }
    let hookpath = root.join(raw_git(root, &["rev-parse", "--git-path", "hooks"])?);
    let Ok(hooks) = fs::canonicalize(&hookpath) else {
        return Ok(());
    };
    if !hooks.starts_with(&common) || !inside(&common, &hookpath) {
        summary.skipped.push("git hooks directory".into());
        return Ok(());
    }
    let owned_hook = regex::Regex::new("(?i)exonous|tron|claude-config").expect("static regex");
    for name in ["pre-commit", "pre-push"] {
        let path = hooks.join(name);
        let Ok(meta) = fs::symlink_metadata(&path) else {
            continue;
        };
        if !meta.is_file() || meta.file_type().is_symlink() {
            summary.skipped.push(format!("git hook {name}"));
            continue;
        }
        let bytes = fs::read(&path).map_err(|_| "cannot read git hook")?;
        if manifest["files"][format!("git-hooks:{name}")]
            .as_array()
            .is_some_and(|hashes| hashes.iter().any(|v| v == &hash(&bytes)))
        {
            fs::remove_file(path).map_err(|_| "cannot remove owned git hook")?;
            summary.removed.push(format!("git hook {name}"));
        } else if owned_hook.is_match(&String::from_utf8_lossy(&bytes)) {
            summary.kept_modified.push(format!("git hook {name}"));
        }
    }
    Ok(())
}
fn without_ours(mut value: Value, lock: bool) -> Value {
    fn drop(obj: &mut Value) {
        for key in ["dependencies", "devDependencies"] {
            if let Some(deps) = obj.get_mut(key).and_then(Value::as_object_mut) {
                for name in DEPS {
                    deps.remove(*name);
                }
                if deps.is_empty() {
                    obj.as_object_mut().unwrap().remove(key);
                }
            }
        }
    }
    if !lock {
        drop(&mut value);
    } else {
        for name in DEPS {
            if let Some(packages) = value.get_mut("packages").and_then(Value::as_object_mut) {
                packages.remove(&format!("node_modules/{name}"));
            }
            if let Some(deps) = value.get_mut("dependencies").and_then(Value::as_object_mut) {
                deps.remove(*name);
            }
        }
        if let Some(package) = value.get_mut("packages").and_then(|p| p.get_mut("")) {
            drop(package);
        }
        if value["dependencies"]
            .as_object()
            .is_some_and(serde_json::Map::is_empty)
        {
            value.as_object_mut().unwrap().remove("dependencies");
        }
    }
    value
}
fn package_clean(root: &Path, files: &[&str]) -> Result<()> {
    let mut args = vec!["status", "--porcelain", "--"];
    args.extend(files);
    for line in raw_git(root, &args)?.lines().filter(|s| !s.is_empty()) {
        let file = line.get(3..).ok_or("invalid git status")?;
        let tolerant =
            matches!(file, "package.json" | "package-lock.json") && line[..2].trim() == "M";
        let same = if tolerant {
            let head = raw_git(root, &["show", &format!("HEAD:{file}")])
                .ok()
                .and_then(|s| serde_json::from_str::<Value>(&s).ok());
            let now = read_json(&root.join(file));
            match (head, now) {
                (Some(head), Some(now)) => {
                    without_ours(head, file != "package.json")
                        == without_ours(now, file != "package.json")
                }
                _ => false,
            }
        } else {
            false
        };
        if !same {
            return Err(format!("{file} has uncommitted changes"));
        }
    }
    Ok(())
}
fn pm_run(root: &Path, pm: &str, args: &[&str]) -> Result<String> {
    let output = root.join(format!(".exonous-pm-{}", runtime::nonce()));
    let mut opts = fs::OpenOptions::new();
    opts.create_new(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let file = opts
        .open(&output)
        .map_err(|_| "cannot create package manager output")?;
    let result = (|| {
        let stderr = file
            .try_clone()
            .map_err(|_| "cannot capture package manager output")?;
        let mut child = Command::new(pm)
            .args(args)
            .current_dir(root)
            .env("npm_config_ignore_scripts", "true")
            .stdin(Stdio::null())
            .stdout(Stdio::from(file))
            .stderr(Stdio::from(stderr))
            .spawn()
            .map_err(|_| format!("cannot execute {pm}"))?;
        let start = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    if !status.success() {
                        return Err(format!("{pm} did not complete successfully"));
                    }
                    break;
                }
                Ok(None) if start.elapsed() < Duration::from_secs(600) => {
                    std::thread::sleep(Duration::from_millis(25))
                }
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!("{pm} timed out"));
                }
            }
        }
        runtime::read_limited(&output, 4 * 1024 * 1024)
    })();
    let _ = fs::remove_file(output);
    result
}
fn drop_dependency(root: &Path, summary: &mut Summary) -> Result<()> {
    let deps = dependencies(root);
    if deps.is_empty() {
        summary.dev_dependency = "none".into();
        return Ok(());
    }
    summary.dev_dependency = "note".into();
    if std::env::var_os("npm_lifecycle_event").is_some_and(|s| !s.is_empty()) {
        summary.notes.push(
            "devDependency kept inside package-manager lifecycle; run exonous migrate later".into(),
        );
        return Ok(());
    }
    let package = read_json(&root.join("package.json")).unwrap_or(Value::Null);
    let field = package["packageManager"]
        .as_str()
        .and_then(|s| s.split_once('@'))
        .map(|(pm, _)| pm)
        .filter(|pm| matches!(*pm, "npm" | "pnpm" | "bun"));
    let locks = [
        ("npm", &["package-lock.json"][..]),
        ("pnpm", &["pnpm-lock.yaml"][..]),
        ("bun", &["bun.lock", "bun.lockb"][..]),
    ];
    let pm = field
        .map(str::to_owned)
        .or_else(|| {
            locks
                .iter()
                .find(|(_, files)| files.iter().any(|f| root.join(f).exists()))
                .map(|(pm, _)| (*pm).into())
        })
        .or_else(|| {
            std::env::var("npm_config_user_agent")
                .ok()
                .and_then(|s| s.split_once('/').map(|(pm, _)| pm.to_owned()))
                .filter(|pm| matches!(pm.as_str(), "npm" | "pnpm" | "bun"))
        })
        .unwrap_or_else(|| "npm".into());
    let mut files = vec!["package.json"];
    files.extend(
        locks
            .iter()
            .find(|(name, _)| *name == pm)
            .unwrap()
            .1
            .iter()
            .copied()
            .filter(|file| root.join(file).exists()),
    );
    if files.iter().any(|file| !inside(root, &root.join(file))) {
        summary
            .notes
            .push("package files contain a symlink; dependency kept".into());
        return Ok(());
    }
    if let Err(why) = package_clean(root, &files) {
        summary.notes.push(format!(
            "devDependency kept: {why}; run exonous migrate after review"
        ));
        return Ok(());
    }
    let verb = if pm == "npm" { "uninstall" } else { "remove" };
    if pm != "npm"
        && !pm_run(root, &pm, &[verb, "--help"])
            .unwrap_or_default()
            .contains("--ignore-scripts")
    {
        summary.notes.push(format!(
            "devDependency kept: {pm} {verb} cannot skip lifecycle scripts"
        ));
        return Ok(());
    }
    let mut args = vec![verb, "--ignore-scripts"];
    if pm == "npm" {
        args.extend(["--no-audit", "--no-fund"]);
    }
    args.extend(deps.iter().map(String::as_str));
    match pm_run(root, &pm, &args) {
        Ok(_) => {
            summary.dev_dependency = "removed".into();
            summary.notes.push(format!(
                "removed {} with {pm}; scripts disabled",
                deps.join(", ")
            ));
        }
        Err(error) => summary.notes.push(format!(
            "devDependency kept: {error}; run exonous migrate later"
        )),
    }
    Ok(())
}

pub fn migrate_installed(home: &Path, root: &Path, manifest: &Value) -> Result<Value> {
    let root = fs::canonicalize(root).map_err(|_| "cannot resolve migration repository")?;
    protect_home(home, &root)?;
    verify_machine(home, &root)?;
    let mut summary = Summary {
        status: "migrated".into(),
        ..Default::default()
    };
    clean_repo(&root, manifest, &mut summary)?;
    drop_dependency(&root, &mut summary)?;
    serde_json::to_value(summary).map_err(|_| "cannot encode migration summary".into())
}

pub fn command(home: &Path, cwd: &Path, args: &[String], verified_caps: &[&str]) -> Result<String> {
    let mut selected = cwd.to_owned();
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--json" | "--dry-run" => {}
            "--repo" => {
                index += 1;
                let value = args
                    .get(index)
                    .filter(|value| !value.starts_with("--"))
                    .ok_or("--repo requires a directory")?;
                selected = cwd.join(value);
            }
            _ => return Err("usage: exonous migrate [--repo <dir>] [--json] [--dry-run]".into()),
        }
        index += 1;
    }
    let root = runtime::repo_root(&selected)?;
    protect_home(home, &root)?;
    let manifest: Value =
        serde_json::from_str(MANIFEST).map_err(|_| "invalid bundled legacy manifest")?;
    if !has_legacy(&root, &manifest) {
        return Ok(format!("{}\n", json!({"status":"nothing","removed":[]})));
    }
    if args.iter().any(|a| a == "--dry-run") {
        return Ok(format!(
            "{}\n",
            json!({"status":"planned","root":root,"cleanupRequires":"verified native gate registration and executable probe"})
        ));
    }
    if !verified_caps.contains(&"pyle") {
        return Err("native gate capability is unavailable; repository left unchanged".into());
    }
    install::command_with_capabilities(home, &root, &[], verified_caps)?;
    let result = migrate_installed(home, &root, &manifest)?;
    if args.iter().any(|a| a == "--json") {
        return Ok(format!(
            "{}\n",
            serde_json::to_string_pretty(&result).map_err(|_| "cannot encode migration output")?
        ));
    }
    let mut details = result["notes"]
        .as_array()
        .map(|notes| {
            notes
                .iter()
                .filter_map(Value::as_str)
                .map(|s| format!("{s}\n"))
                .collect::<String>()
        })
        .unwrap_or_default();
    for (key, label) in [
        ("keptModified", "kept edited files"),
        ("skipped", "skipped unsafe paths"),
    ] {
        if let Some(paths) = result[key].as_array().filter(|paths| !paths.is_empty()) {
            details.push_str(&format!(
                "{label}: {}\n",
                paths
                    .iter()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        }
    }
    if result["trackedRemoved"]
        .as_u64()
        .is_some_and(|count| count > 0)
    {
        details.push_str(&format!(
            "{} tracked files removed; review and commit the cleanup\n",
            result["trackedRemoved"]
        ));
    }
    Ok(format!(
        "repo-mode install migrated: {} removed, {} kept, {} config files stripped; devDependency {}\n{}",
        result["removed"].as_array().map_or(0, Vec::len),
        result["keptModified"].as_array().map_or(0, Vec::len),
        result["stripped"].as_array().map_or(0, Vec::len),
        result["devDependency"].as_str().unwrap_or("kept"),
        details
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn package_clean_tolerates_only_legacy_dependency_spec_changes() {
        let repo = tempfile::tempdir().unwrap();
        runtime::git(repo.path(), &["init", "-q"]).unwrap();
        let package =
            json!({"name":"app","dependencies":{"other":"1"},"devDependencies":{"exonous":"old"}});
        let lock = json!({"packages":{"":{"dependencies":{"other":"1"},"devDependencies":{"exonous":"old"}},"node_modules/exonous":{"resolved":"old"},"node_modules/other":{"version":"1"}}});
        fs::write(repo.path().join("package.json"), package.to_string()).unwrap();
        fs::write(repo.path().join("package-lock.json"), lock.to_string()).unwrap();
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
        let mut package = package;
        package["devDependencies"]["exonous"] = json!("new");
        let mut lock = lock;
        lock["packages"][""]["devDependencies"]["exonous"] = json!("new");
        lock["packages"]["node_modules/exonous"]["resolved"] = json!("new");
        fs::write(repo.path().join("package.json"), package.to_string()).unwrap();
        fs::write(repo.path().join("package-lock.json"), lock.to_string()).unwrap();
        assert!(package_clean(repo.path(), &["package.json", "package-lock.json"]).is_ok());
        package["name"] = json!("edited");
        fs::write(repo.path().join("package.json"), package.to_string()).unwrap();
        assert!(package_clean(repo.path(), &["package.json", "package-lock.json"]).is_err());
        package["name"] = json!("app");
        fs::write(repo.path().join("package.json"), package.to_string()).unwrap();
        lock["packages"]["node_modules/other"]["version"] = json!("2");
        fs::write(repo.path().join("package-lock.json"), lock.to_string()).unwrap();
        assert!(package_clean(repo.path(), &["package.json", "package-lock.json"]).is_err());
    }
}
