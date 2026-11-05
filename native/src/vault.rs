use crate::runtime::{self, Result};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;

const CONFIG_LIMIT: u64 = 16 * 1024 * 1024;
const USAGE: &str = "usage: exonous vault [show | detect | set <path> [--create] | graph | consolidate [target] <--dry-run|--apply>]";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Selection {
    pub path: Option<PathBuf>,
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Detected {
    pub path: PathBuf,
    pub ts: f64,
    pub open: bool,
}

pub fn no_symlink_children(root: &Path, path: &Path) -> Result<()> {
    let relative = path.strip_prefix(root).map_err(|_| "path outside vault")?;
    let mut current = root.to_path_buf();
    for part in std::iter::once(None).chain(relative.components().map(Some)) {
        if let Some(component) = part {
            if !matches!(component, Component::Normal(_)) {
                return Err("invalid vault path".into());
            }
            current.push(component.as_os_str());
        }
        match fs::symlink_metadata(&current) {
            Ok(meta) if meta.file_type().is_symlink() => {
                return Err("vault path must not be a symlink".into());
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("cannot inspect vault path".into()),
        }
    }
    Ok(())
}

pub fn read_regular(path: &Path, limit: u64) -> Result<Vec<u8>> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let file = options
        .open(path)
        .map_err(|_| "cannot read regular vault file")?;
    let meta = file.metadata().map_err(|_| "cannot inspect vault file")?;
    if !meta.is_file() || meta.len() > limit {
        return Err("vault file is not regular or too large".into());
    }
    let mut bytes = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "cannot read vault file")?;
    if bytes.len() as u64 > limit {
        return Err("vault file too large".into());
    }
    Ok(bytes)
}

pub fn config_path(home: &Path) -> PathBuf {
    home.join(".claude/exonous/config.json")
}

pub fn read_config(home: &Path) -> Result<Value> {
    let path = config_path(home);
    no_symlink_children(home, &path)?;
    if !path.exists() {
        return Ok(json!({}));
    }
    let value: Value = serde_json::from_slice(&read_regular(&path, CONFIG_LIMIT)?)
        .map_err(|_| "config.json is not valid JSON")?;
    if !value.is_object() {
        return Err("config.json must hold a JSON object".into());
    }
    Ok(value)
}

pub fn write_config(home: &Path, path: &Path, sources: &[PathBuf]) -> Result<()> {
    let mut value = read_config(home)?;
    value["vault"] = json!(path);
    value["vaultMigrationSources"] = json!(sources);
    let file = config_path(home);
    runtime::ensure_private_dir(home, file.parent().unwrap())?;
    no_symlink_children(home, &file)?;
    runtime::atomic_private(
        &file,
        format!(
            "{}\n",
            serde_json::to_string_pretty(&value).map_err(|_| "cannot encode config")?
        )
        .as_bytes(),
    )
}

fn isolated(home: &Path) -> bool {
    std::env::var_os("EXONOUS_HOME").is_some() || runtime::home().ok().as_deref() != Some(home)
}

fn wsl(home: &Path) -> bool {
    cfg!(target_os = "linux")
        && !isolated(home)
        && (std::env::var_os("WSL_DISTRO_NAME").is_some()
            || std::env::var_os("WSL_INTEROP").is_some()
            || fs::read_to_string("/proc/version")
                .is_ok_and(|value| value.to_lowercase().contains("microsoft")))
}

fn mount_root() -> PathBuf {
    let text = fs::read_to_string("/etc/wsl.conf").unwrap_or_default();
    let mut automount = false;
    for raw in text.lines() {
        let line = raw.split(['#', ';']).next().unwrap_or("").trim();
        if line.starts_with('[') && line.ends_with(']') {
            automount = line[1..line.len() - 1]
                .trim()
                .eq_ignore_ascii_case("automount");
        }
        if automount && let Some((key, value)) = line.split_once('=') {
            let value = value.trim().trim_matches('"');
            if key.trim() == "root" && value.starts_with('/') {
                return PathBuf::from(value);
            }
        }
    }
    PathBuf::from("/mnt")
}

pub fn wsl_path(raw: &str, mount: &Path, distro: Option<&str>) -> String {
    static DRIVE: OnceLock<Regex> = OnceLock::new();
    static UNC: OnceLock<Regex> = OnceLock::new();
    if let Some(found) = DRIVE
        .get_or_init(|| Regex::new(r"^([A-Za-z]):(?:[\\/](.*))?$").unwrap())
        .captures(raw)
    {
        let root = format!(
            "{}/{}",
            mount.to_string_lossy().trim_end_matches('/'),
            found[1].to_lowercase()
        );
        let tail = found
            .get(2)
            .map_or("", |value| value.as_str())
            .replace('\\', "/");
        let path = if tail.starts_with('/') {
            tail
        } else {
            format!("{root}/{tail}")
        };
        return path.trim_end_matches('/').to_owned();
    }
    if let Some(found) = UNC
        .get_or_init(|| {
            Regex::new(r"(?i)^[\\/]{2}wsl(?:\$|\.localhost)[\\/]([^\\/]+)(?:[\\/](.*))?$").unwrap()
        })
        .captures(raw)
        && distro.is_none_or(|distro| distro.eq_ignore_ascii_case(&found[1]))
    {
        return format!(
            "/{}",
            found
                .get(2)
                .map_or("", |value| value.as_str())
                .replace('\\', "/")
        );
    }
    raw.into()
}

fn local_input(home: &Path, raw: &str) -> String {
    if wsl(home) {
        wsl_path(
            raw,
            &mount_root(),
            std::env::var("WSL_DISTRO_NAME").ok().as_deref(),
        )
    } else {
        raw.into()
    }
}

pub fn registry_paths(home: &Path) -> Vec<PathBuf> {
    if cfg!(target_os = "macos") {
        return vec![home.join("Library/Application Support/obsidian/obsidian.json")];
    }
    if cfg!(windows) {
        let roaming = if isolated(home) {
            None
        } else {
            std::env::var_os("APPDATA").map(PathBuf::from)
        };
        return vec![
            roaming
                .unwrap_or_else(|| home.join("AppData/Roaming"))
                .join("obsidian/obsidian.json"),
        ];
    }
    let xdg = if isolated(home) {
        None
    } else {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
    };
    let mut paths = vec![
        xdg.unwrap_or_else(|| home.join(".config"))
            .join("obsidian/obsidian.json"),
        home.join(".var/app/md.obsidian.Obsidian/config/obsidian/obsidian.json"),
        home.join("snap/obsidian/current/.config/obsidian/obsidian.json"),
    ];
    if wsl(home) {
        let tail = "AppData/Roaming/obsidian/obsidian.json";
        if let Some(profile) = std::env::var("WSL_USERPROFILE")
            .ok()
            .filter(|value| !value.is_empty())
        {
            paths.push(PathBuf::from(local_input(home, profile.trim())).join(tail));
        } else if let Ok(drives) = fs::read_dir(mount_root()) {
            let mut windows = Vec::new();
            for drive in drives.flatten() {
                let name = drive.file_name().to_string_lossy().into_owned();
                if name.len() != 1 || !name.as_bytes()[0].is_ascii_alphabetic() {
                    continue;
                }
                if let Ok(users) = fs::read_dir(drive.path().join("Users")) {
                    for user in users.flatten() {
                        if matches!(
                            user.file_name().to_string_lossy().to_lowercase().as_str(),
                            "default" | "default user" | "public" | "all users"
                        ) {
                            continue;
                        }
                        let path = user.path().join(tail);
                        if path.exists() {
                            windows.push(path);
                        }
                    }
                }
            }
            windows.sort();
            paths.extend(windows);
        }
    }
    paths
}

pub fn detect(home: &Path) -> Result<Vec<Detected>> {
    let mut found: Vec<Detected> = Vec::new();
    for file in registry_paths(home) {
        let Ok(raw) = read_regular(&file, CONFIG_LIMIT) else {
            continue;
        };
        let Ok(value) = serde_json::from_slice::<Value>(&raw) else {
            continue;
        };
        let Some(vaults) = value["vaults"].as_object() else {
            continue;
        };
        for entry in vaults.values() {
            let Some(raw) = entry["path"].as_str() else {
                continue;
            };
            let path = PathBuf::from(local_input(home, raw));
            if !path.is_absolute() || !path.exists() || found.iter().any(|other| other.path == path)
            {
                continue;
            }
            let ts = entry["ts"]
                .as_f64()
                .or_else(|| entry["ts"].as_str().and_then(|value| value.parse().ok()))
                .filter(|n| n.is_finite())
                .unwrap_or(0.0);
            found.push(Detected {
                path,
                ts,
                open: entry["open"] == true,
            });
        }
    }
    found.sort_by(|a, b| b.open.cmp(&a.open).then_with(|| b.ts.total_cmp(&a.ts)));
    Ok(found)
}

pub fn local_path(home: &Path, cwd: &Path, raw: &str) -> Result<PathBuf> {
    if raw.contains('\0') || raw.is_empty() {
        return Err("invalid vault path".into());
    }
    let input = local_input(home, raw);
    let raw = input.as_str();
    let expanded = if raw == "~" {
        home.to_path_buf()
    } else if raw.starts_with("~/") || raw.starts_with("~\\") {
        home.join(&raw[2..])
    } else {
        PathBuf::from(raw)
    };
    let absolute = if expanded.is_absolute() {
        expanded
    } else {
        cwd.join(expanded)
    };
    let mut clean = PathBuf::new();
    for part in absolute.components() {
        match part {
            Component::CurDir => {}
            Component::ParentDir => {
                clean.pop();
            }
            _ => clean.push(part.as_os_str()),
        }
    }
    Ok(clean)
}

pub fn fallback_path(home: &Path) -> PathBuf {
    if home.join("Documents").is_dir() {
        home.join("Documents/exonous-vault")
    } else {
        home.join("exonous-vault")
    }
}

fn selection(path: PathBuf, source: &str) -> Selection {
    Selection {
        path: Some(path),
        source: Some(source.into()),
    }
}

fn fallback(path: &Path) -> bool {
    path.file_name()
        .is_some_and(|name| name.to_string_lossy().eq_ignore_ascii_case("exonous-vault"))
}

fn skill_config(home: &Path, tool: &str, skill: &str) -> Result<Option<Value>> {
    let file = home
        .join(tool)
        .join("skills")
        .join(skill)
        .join("config.json");
    no_symlink_children(home, &file)?;
    if !file.exists() {
        return Ok(None);
    }
    let value = serde_json::from_slice(&read_regular(&file, CONFIG_LIMIT)?)
        .map_err(|_| "invalid vault config")?;
    Ok(Some(value))
}

pub fn consolidation_target(home: &Path, cwd: &Path) -> Result<Selection> {
    if let Some(raw) = std::env::var("PROJECT_MEMORY_VAULT")
        .ok()
        .filter(|value| !value.is_empty())
    {
        return Ok(selection(local_path(home, cwd, &raw)?, "env"));
    }
    let config = read_config(home)?;
    let configured = match &config["vault"] {
        Value::Null => None,
        Value::String(raw) if raw.is_empty() => None,
        Value::String(raw) => Some(local_path(home, cwd, raw)?),
        _ => return Err("config vault must be a string".into()),
    };
    if let Some(path) = &configured
        && (!fallback(path) || !path.is_dir())
    {
        return Ok(selection(path.clone(), "exonous-config"));
    }
    for tool in [".claude", ".agents", ".codex"] {
        if let Some(config) = skill_config(home, tool, "project-memory")?
            && let Some(raw) = config["vault"].as_str().filter(|raw| !raw.is_empty())
        {
            let path = local_path(home, cwd, raw)?;
            if !fallback(&path) {
                return Ok(selection(path, "skill-config"));
            }
        }
    }
    if let Some(entry) = detect(home)?
        .into_iter()
        .find(|entry| !fallback(&entry.path) && entry.path.is_dir())
    {
        return Ok(selection(entry.path, "obsidian"));
    }
    if let Some(path) = configured {
        return Ok(selection(path, "exonous-config"));
    }
    for path in [fallback_path(home), home.join("exonous-vault")] {
        if path.is_dir() {
            return Ok(selection(path, "fallback"));
        }
    }
    Ok(Selection {
        path: None,
        source: None,
    })
}

pub fn central(home: &Path, cwd: &Path) -> Result<Selection> {
    if let Some(raw) = std::env::var("PROJECT_MEMORY_VAULT")
        .ok()
        .filter(|value| !value.is_empty())
    {
        return Ok(selection(local_path(home, cwd, &raw)?, "env"));
    }
    let config = read_config(home)?;
    match &config["vault"] {
        Value::String(raw) if !raw.is_empty() => {
            Ok(selection(local_path(home, cwd, raw)?, "exonous-config"))
        }
        Value::Null | Value::String(_) => consolidation_target(home, cwd),
        _ => Err("config vault must be a string".into()),
    }
}

pub fn legacy_roots(home: &Path, cwd: &Path) -> Result<Vec<PathBuf>> {
    let mut values = vec![
        json!(home.join("Documents/exonous-vault")),
        json!(home.join("exonous-vault")),
    ];
    let config = read_config(home)?;
    values.extend([config["vault"].clone(), config["sessionsVault"].clone()]);
    if let Some(sources) = config["vaultMigrationSources"].as_array() {
        values.extend(sources.iter().cloned());
    }
    for tool in [".agents", ".claude", ".codex"] {
        for skill in ["project-memory", "session-handoff"] {
            if let Some(config) = skill_config(home, tool, skill)? {
                values.extend([config["vault"].clone(), config["sessionsVault"].clone()]);
            }
        }
    }
    let mut paths = Vec::new();
    for raw in values
        .iter()
        .filter_map(Value::as_str)
        .filter(|raw| !raw.is_empty())
    {
        let path = local_path(home, cwd, raw)?;
        if !paths.contains(&path) {
            paths.push(path);
        }
    }
    Ok(paths)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Fingerprint {
    size: u64,
    hash: String,
    dev: u64,
    ino: u64,
    #[serde(rename = "mtimeMs")]
    mtime_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Entry {
    source: PathBuf,
    relative: PathBuf,
    #[serde(flatten)]
    fingerprint: Fingerprint,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Journal {
    v: u8,
    target: PathBuf,
    #[serde(rename = "oldVault")]
    old_vault: Value,
    sources: Vec<PathBuf>,
    entries: Vec<Entry>,
    phase: String,
}

fn fingerprint(path: &Path) -> Result<Fingerprint> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let mut file = options
        .open(path)
        .map_err(|_| "cannot open migration file")?;
    let meta = file
        .metadata()
        .map_err(|_| "cannot inspect migration file")?;
    if !meta.is_file() {
        return Err("migration requires regular files".into());
    }
    let mut hasher = Sha256::new();
    let mut size = 0;
    let mut buffer = [0u8; 65536];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|_| "cannot hash migration file")?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
        size += count as u64;
    }
    #[cfg(unix)]
    let (dev, ino, mtime_ms) = {
        use std::os::unix::fs::MetadataExt;
        (
            meta.dev(),
            meta.ino(),
            meta.mtime() as f64 * 1000.0 + meta.mtime_nsec() as f64 / 1_000_000.0,
        )
    };
    #[cfg(not(unix))]
    let (dev, ino, mtime_ms) = (
        0,
        0,
        meta.modified()
            .map_err(|_| "cannot read migration mtime")?
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| "invalid migration mtime")?
            .as_secs_f64()
            * 1000.0,
    );
    let result = Fingerprint {
        size,
        hash: format!("{:x}", hasher.finalize()),
        dev,
        ino,
        mtime_ms,
    };
    if !mtime_ms.is_finite() || meta.len() != size {
        return Err("migration source changed while hashing".into());
    }
    Ok(result)
}

fn same(a: &Fingerprint, b: &Fingerprint) -> bool {
    a.size == b.size && a.hash == b.hash
}

fn unchanged(a: &Fingerprint, b: &Fingerprint) -> bool {
    same(a, b) && a.dev == b.dev && a.ino == b.ino && a.mtime_ms == b.mtime_ms
}

fn omitted(name: &str) -> bool {
    matches!(
        name,
        ".obsidian" | ".git" | ".trash" | ".DS_Store" | "node_modules"
    )
}

fn owned(relative: &Path, file: &Path, dedicated: bool) -> Result<bool> {
    let parts = relative
        .components()
        .map(|part| match part {
            Component::Normal(name) => name.to_str(),
            _ => None,
        })
        .collect::<Option<Vec<_>>>();
    let Some(parts) = parts else { return Ok(false) };
    if parts.len() < 2 || parts.iter().any(|name| omitted(name)) {
        return Ok(false);
    }
    if parts.len() >= 3 && matches!(parts[1], "memory" | "sessions") {
        return Ok(true);
    }
    if parts.len() != 2 || !parts[1].ends_with(".md") {
        return Ok(false);
    }
    if dedicated && crate::handoff::dated_name(parts[1]) {
        return Ok(true);
    }
    let Ok(raw) = read_regular(file, 1024 * 1024) else {
        return Ok(false);
    };
    let Ok(text) = String::from_utf8(raw) else {
        return Ok(false);
    };
    if crate::handoff::dated_name(parts[1]) && crate::handoff::legacy_handoff(&text) {
        return Ok(true);
    }
    Ok(serde_json::from_str::<Value>(&text)
        .ok()
        .is_some_and(|data| {
            crate::handoff::graph_envelope(&data)
                && data["v"].as_f64() == Some(1.0)
                && matches!(data["k"].as_str(), Some("full" | "pr"))
                && data["g"].is_array()
        }))
}

fn walk_source(
    source: &Path,
    directory: &Path,
    entries: &mut BTreeMap<PathBuf, Entry>,
    skipped: &mut Vec<Value>,
) -> Result<()> {
    let mut children = fs::read_dir(directory)
        .map_err(|_| "cannot read migration source")?
        .collect::<std::io::Result<Vec<_>>>()
        .map_err(|_| "cannot read migration entry")?;
    children.sort_by_key(|entry| entry.file_name());
    for child in children {
        let file = child.path();
        let meta = fs::symlink_metadata(&file).map_err(|_| "cannot inspect migration entry")?;
        if meta.file_type().is_symlink() {
            return Err("symlink in migration source".into());
        }
        if omitted(&child.file_name().to_string_lossy()) {
            skipped.push(json!(file));
            continue;
        }
        if meta.is_dir() {
            walk_source(source, &file, entries, skipped)?;
            continue;
        }
        let relative = file
            .strip_prefix(source)
            .map_err(|_| "path outside migration source")?;
        if !meta.is_file() || !owned(relative, &file, fallback(source))? {
            skipped.push(json!(file));
            continue;
        }
        entries.insert(
            file.clone(),
            Entry {
                source: source.to_path_buf(),
                relative: relative.to_path_buf(),
                fingerprint: fingerprint(&file)?,
            },
        );
    }
    Ok(())
}

fn persist_journal(home: &Path, path: &Path, journal: &Journal) -> Result<()> {
    runtime::ensure_private_dir(home, path.parent().ok_or("invalid journal path")?)?;
    no_symlink_children(home, path)?;
    runtime::atomic_private(
        path,
        format!(
            "{}\n",
            serde_json::to_string(journal).map_err(|_| "cannot encode journal")?
        )
        .as_bytes(),
    )
}

fn migration_result() -> Value {
    json!({"status":"planned","target":null,"entries":[],"moved":[],"identical":[],"pending":[],"skipped":[],"conflicts":[],"errors":[]})
}

fn push(result: &mut Value, field: &str, value: Value) {
    result[field].as_array_mut().unwrap().push(value);
}

pub fn consolidate(
    home: &Path,
    cwd: &Path,
    requested: Option<&Path>,
    dry_run: bool,
) -> Result<Value> {
    let mut result = migration_result();
    if let Err(error) = consolidate_inner(home, cwd, requested, dry_run, &mut result) {
        result["status"] = json!("blocked");
        push(&mut result, "errors", json!(error));
    }
    Ok(result)
}

fn consolidate_inner(
    home: &Path,
    cwd: &Path,
    requested: Option<&Path>,
    dry_run: bool,
    result: &mut Value,
) -> Result<()> {
    let selected = match requested {
        Some(path) => Some(local_path(
            home,
            cwd,
            path.to_str().ok_or("invalid target path encoding")?,
        )?),
        None => consolidation_target(home, cwd)?.path,
    };
    let Some(target) = selected else {
        result["status"] = json!("no-vault");
        return Ok(());
    };
    result["target"] = json!(target);
    if !target.is_dir() {
        return Err("target is not an existing directory".into());
    }
    no_symlink_children(&target, &target)?;
    let target_real = fs::canonicalize(&target).map_err(|_| "cannot resolve target vault")?;
    let state = runtime::state(home).join("vault-consolidation.json");
    no_symlink_children(home, &state)?;
    let previous = read_config(home)?;
    let mut old = if state.exists() {
        let journal: Journal = serde_json::from_slice(&read_regular(&state, CONFIG_LIMIT)?)
            .map_err(|_| "invalid consolidation journal")?;
        if journal.v != 1 || !matches!(journal.phase.as_str(), "copy" | "cleanup" | "complete") {
            return Err("invalid consolidation journal".into());
        }
        if journal.phase == "complete" {
            None
        } else {
            if journal.target != target_real {
                return Err("another vault consolidation has pending cleanup".into());
            }
            Some(journal)
        }
    } else {
        None
    };
    let mut sources = Vec::<PathBuf>::new();
    for raw in legacy_roots(home, cwd)? {
        if !raw.exists() {
            if fs::symlink_metadata(&raw).is_ok() {
                return Err("symlink source vault".into());
            }
            continue;
        }
        if !raw.is_dir() {
            continue;
        }
        no_symlink_children(&raw, &raw)?;
        let source = fs::canonicalize(&raw).map_err(|_| "cannot resolve source vault")?;
        if source == target_real || sources.contains(&source) {
            continue;
        }
        if target_real.starts_with(&source) {
            return Err("target lies inside source vault".into());
        }
        if sources
            .iter()
            .any(|other| source.starts_with(other) || other.starts_with(&source))
        {
            return Err("nested source vaults".into());
        }
        sources.push(source);
    }
    sources.sort();
    if old.as_ref().is_some_and(|journal| {
        journal
            .sources
            .iter()
            .any(|source| !sources.contains(source))
    }) {
        return Err("journal contains an unconfigured source root".into());
    }
    let mut entries = BTreeMap::<PathBuf, Entry>::new();
    let mut skipped = Vec::new();
    for source in &sources {
        walk_source(source, source, &mut entries, &mut skipped)?;
    }
    result["skipped"] = json!(skipped);
    if let Some(journal) = &old {
        for entry in &journal.entries {
            if !sources.contains(&entry.source) || !entry.fingerprint.mtime_ms.is_finite() {
                return Err("invalid journal source".into());
            }
            if entry.relative.as_os_str().is_empty()
                || entry
                    .relative
                    .components()
                    .any(|component| !matches!(component, Component::Normal(_)))
            {
                return Err("invalid vault path".into());
            }
            let file = entry.source.join(&entry.relative);
            let destination = target_real.join(&entry.relative);
            no_symlink_children(&entry.source, &file)?;
            no_symlink_children(&target_real, &destination)?;
            if sources.iter().any(|source| destination.starts_with(source)) {
                return Err("journal destination aliases a source vault".into());
            }
            if !owned(
                &entry.relative,
                if file.exists() { &file } else { &destination },
                fallback(&entry.source),
            )? {
                return Err("invalid journal entry".into());
            }
            match entries.get(&file) {
                Some(current) if unchanged(&entry.fingerprint, &current.fingerprint) => {}
                Some(_) => return Err("journal source changed".into()),
                None if file.exists() => return Err("journal source changed".into()),
                None if !same(&entry.fingerprint, &fingerprint(&destination)?) => {
                    return Err("journal destination changed".into());
                }
                None => {}
            }
        }
    }
    let entries = entries.into_values().collect::<Vec<_>>();
    result["entries"] =
        serde_json::to_value(&entries).map_err(|_| "cannot encode migration manifest")?;
    let mut destinations = BTreeMap::<PathBuf, &Entry>::new();
    for entry in &entries {
        let destination = target_real.join(&entry.relative);
        if sources.iter().any(|source| destination.starts_with(source)) {
            return Err("destination aliases a source vault".into());
        }
        no_symlink_children(&target_real, &destination)?;
        if let Some(other) = destinations.insert(destination.clone(), entry)
            && !same(&entry.fingerprint, &other.fingerprint)
        {
            push(
                result,
                "conflicts",
                json!({"source":entry.source.join(&entry.relative),"destination":destination,"otherSource":other.source.join(&other.relative)}),
            );
        }
        if destination.exists() {
            if same(&entry.fingerprint, &fingerprint(&destination)?) {
                push(result, "identical", json!(destination));
            } else {
                push(
                    result,
                    "conflicts",
                    json!({"source":entry.source.join(&entry.relative),"destination":destination}),
                );
            }
        }
    }
    if !result["conflicts"].as_array().unwrap().is_empty() {
        result["status"] = json!("conflict");
        return Ok(());
    }
    if dry_run {
        return Ok(());
    }
    let mut retained = BTreeMap::<PathBuf, Entry>::new();
    if let Some(journal) = &old {
        for entry in &journal.entries {
            retained.insert(entry.source.join(&entry.relative), entry.clone());
        }
    }
    for entry in &entries {
        retained.insert(entry.source.join(&entry.relative), entry.clone());
    }
    let old_vault = old
        .take()
        .map(|journal| journal.old_vault)
        .unwrap_or_else(|| previous["vault"].clone());
    let mut journal = Journal {
        v: 1,
        target: target_real.clone(),
        old_vault,
        sources: sources.clone(),
        entries: retained.into_values().collect(),
        phase: "copy".into(),
    };
    persist_journal(home, &state, &journal)?;
    for entry in &entries {
        let file = entry.source.join(&entry.relative);
        let destination = target_real.join(&entry.relative);
        no_symlink_children(&entry.source, &file)?;
        no_symlink_children(&target_real, &destination)?;
        if !unchanged(&entry.fingerprint, &fingerprint(&file)?) {
            return Err("source changed before copy".into());
        }
        if !destination.exists() {
            fs::create_dir_all(destination.parent().unwrap())
                .map_err(|_| "cannot create migration destination")?;
            no_symlink_children(&target_real, &destination)?;
            let mut source_options = OpenOptions::new();
            source_options.read(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                source_options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
            }
            let input = source_options
                .open(&file)
                .map_err(|_| "cannot open migration source")?;
            let source_metadata = input
                .metadata()
                .map_err(|_| "cannot inspect migration source")?;
            if !source_metadata.is_file() {
                return Err("migration source is not regular".into());
            }
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
            }
            let mut output = options
                .open(&destination)
                .map_err(|_| "cannot create exclusive migration copy")?;
            std::io::copy(&mut &input, &mut output)
                .and_then(|_| output.flush())
                .and_then(|_| output.sync_all())
                .map_err(|_| "cannot persist migration copy")?;
            let times = fs::FileTimes::new().set_modified(
                source_metadata
                    .modified()
                    .map_err(|_| "cannot read migration source mtime")?,
            );
            output
                .set_times(times)
                .map_err(|_| "cannot preserve migration mtime")?;
        }
        if !same(&entry.fingerprint, &fingerprint(&destination)?)
            || !unchanged(&entry.fingerprint, &fingerprint(&file)?)
        {
            return Err("copy verification failed".into());
        }
    }
    for entry in &entries {
        let file = entry.source.join(&entry.relative);
        let destination = target_real.join(&entry.relative);
        no_symlink_children(&entry.source, &file)?;
        no_symlink_children(&target_real, &destination)?;
        if !unchanged(&entry.fingerprint, &fingerprint(&file)?)
            || !same(&entry.fingerprint, &fingerprint(&destination)?)
        {
            return Err("source changed before switch".into());
        }
    }
    write_config(home, &target, &sources)?;
    journal.phase = "cleanup".into();
    persist_journal(home, &state, &journal)?;
    for entry in &entries {
        let file = entry.source.join(&entry.relative);
        let destination = target_real.join(&entry.relative);
        let cleanup = (|| -> Result<()> {
            no_symlink_children(&entry.source, &file)?;
            no_symlink_children(&target_real, &destination)?;
            if !unchanged(&entry.fingerprint, &fingerprint(&file)?)
                || !same(&entry.fingerprint, &fingerprint(&destination)?)
            {
                return Err("cleanup verification failed".into());
            }
            fs::remove_file(&file).map_err(|_| "cannot remove verified migrated source".to_string())
        })();
        match cleanup {
            Ok(()) => push(result, "moved", json!(file)),
            Err(error) => {
                push(result, "pending", json!(file));
                push(result, "errors", json!(error));
            }
        }
    }
    journal.phase = if result["pending"].as_array().unwrap().is_empty() {
        "complete"
    } else {
        "cleanup"
    }
    .into();
    persist_journal(home, &state, &journal)?;
    result["status"] = json!(if journal.phase == "complete" {
        "complete"
    } else {
        "pending-cleanup"
    });
    Ok(())
}

fn markdown_files(root: &Path, dir: &Path, out: &mut Vec<String>) -> Result<()> {
    for entry in fs::read_dir(dir).map_err(|_| "cannot read vault graph directory")? {
        let entry = entry.map_err(|_| "cannot read vault graph entry")?;
        let name = entry.file_name();
        if name.to_string_lossy().starts_with('.') || name == "node_modules" {
            continue;
        }
        let kind = entry
            .file_type()
            .map_err(|_| "cannot inspect graph entry")?;
        if kind.is_dir() {
            markdown_files(root, &entry.path(), out)?;
        } else if kind.is_file() && name.to_string_lossy().to_lowercase().ends_with(".md") {
            out.push(
                entry
                    .path()
                    .strip_prefix(root)
                    .map_err(|_| "graph path escapes vault")?
                    .to_string_lossy()
                    .replace('\\', "/"),
            );
        }
    }
    Ok(())
}

fn stem(relative: &str) -> String {
    let name = relative.rsplit('/').next().unwrap_or(relative);
    name[..name.len() - 3].into()
}

fn parent(relative: &str) -> &str {
    relative.rsplit_once('/').map_or(".", |(dir, _)| dir)
}

fn strip_markdown_code(text: &str) -> String {
    let mut out = String::new();
    let lines = text.lines().collect::<Vec<_>>();
    let mut index = 0;
    while index < lines.len() {
        let fence = if lines[index].starts_with("```") {
            Some("```")
        } else if lines[index].starts_with("~~~") {
            Some("~~~")
        } else {
            None
        };
        if let Some(fence) = fence
            && let Some(end) = lines[index + 1..]
                .iter()
                .position(|line| line.starts_with(fence))
        {
            index += end + 2;
            continue;
        }
        out.push_str(lines[index]);
        out.push('\n');
        index += 1;
    }
    static INLINE: OnceLock<Regex> = OnceLock::new();
    INLINE
        .get_or_init(|| Regex::new(r"`[^`\n]*`").unwrap())
        .replace_all(&out, "")
        .into_owned()
}

fn parse_note(text: &str) -> (Vec<String>, Vec<String>) {
    static FRONT: OnceLock<Regex> = OnceLock::new();
    static TAG_LINE: OnceLock<Regex> = OnceLock::new();
    static LIST: OnceLock<Regex> = OnceLock::new();
    static LINKS: OnceLock<Regex> = OnceLock::new();
    static ATTACHMENT: OnceLock<Regex> = OnceLock::new();
    static TAG: OnceLock<Regex> = OnceLock::new();
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    let front = FRONT
        .get_or_init(|| Regex::new(r"(?s)^---\n(.*?)\n(?:---|\.\.\.)(?:\n|$)").unwrap())
        .captures(&normalized);
    let body = front.as_ref().map_or(normalized.as_str(), |matched| {
        &normalized[matched.get(0).unwrap().end()..]
    });
    let clean = strip_markdown_code(body);
    let mut tags = Vec::<String>::new();
    let tag_line = TAG_LINE.get_or_init(|| Regex::new(r"(?i)^tags?\s*:\s*(.*)$").unwrap());
    let list = LIST.get_or_init(|| Regex::new(r"^\s+-\s*(.*)$").unwrap());
    let attachment = ATTACHMENT.get_or_init(|| Regex::new(r"(?i)\.(png|jpe?g|gif|svg|webp|bmp|avif|pdf|mp[34]|webm|wav|ogg|m4a|mov|canvas|excalidraw)$").unwrap());
    if let Some(front) = &front {
        let lines = front[1].lines().collect::<Vec<_>>();
        for (index, line) in lines.iter().enumerate() {
            let Some(matched) = tag_line.captures(line) else {
                continue;
            };
            let inline = matched[1]
                .trim()
                .trim_start_matches('[')
                .trim_end_matches(']');
            tags.extend(
                inline
                    .split(|ch: char| ch == ',' || ch.is_whitespace())
                    .filter(|tag| !tag.is_empty())
                    .map(str::to_owned),
            );
            for line in &lines[index + 1..] {
                let Some(item) = list.captures(line) else {
                    break;
                };
                tags.push(item[1].to_owned());
            }
        }
    }
    let mut links = Vec::new();
    for found in LINKS
        .get_or_init(|| Regex::new(r"\[\[([^\]\n]+?)\]\]").unwrap())
        .captures_iter(&clean)
    {
        let target = found[1].split(['|', '#', '^']).next().unwrap_or("").trim();
        if !target.is_empty() && !attachment.is_match(target) {
            links.push(target.to_owned());
        }
    }
    for found in TAG
        .get_or_init(|| {
            Regex::new(r"(?:^|[\s(,])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)").unwrap()
        })
        .captures_iter(&clean)
    {
        tags.push(found[1].to_owned());
    }
    let tags = tags
        .into_iter()
        .map(|tag| {
            tag.trim()
                .trim_matches(['\'', '"'])
                .trim_start_matches('#')
                .to_lowercase()
                .trim_end_matches('/')
                .to_owned()
        })
        .filter(|tag| !tag.is_empty())
        .collect();
    (links, tags)
}

fn normalized_link(path: &str) -> String {
    let mut parts = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." if parts.last().is_some_and(|part| *part != "..") => {
                parts.pop();
            }
            _ => parts.push(part),
        }
    }
    parts.join("/")
}

fn resolve_link(notes: &[String], target: &str, from: &str) -> Option<String> {
    let mut bare = target.replace('\\', "/").to_lowercase();
    if bare.ends_with(".md") {
        bare.truncate(bare.len() - 3);
    }
    if !bare.contains('/') {
        let mut hits = notes
            .iter()
            .filter(|note| stem(note).to_lowercase() == bare)
            .collect::<Vec<_>>();
        if let Some(hit) = hits.iter().find(|hit| parent(hit) == parent(from)) {
            return Some((*hit).to_string());
        }
        hits.sort_by(|a, b| {
            a.encode_utf16()
                .count()
                .cmp(&b.encode_utf16().count())
                .then_with(|| a.cmp(b))
        });
        return hits.first().map(|hit| (*hit).clone());
    }
    let relative = normalized_link(&format!("{}/{}", parent(from), bare));
    notes
        .iter()
        .find(|note| note[..note.len() - 3].to_lowercase() == bare.trim_start_matches('/'))
        .or_else(|| {
            notes
                .iter()
                .find(|note| note[..note.len() - 3].to_lowercase() == relative)
        })
        .cloned()
}

fn folder_nodes(
    dir: &str,
    nodes: &mut BTreeMap<String, Value>,
    edges: &mut BTreeMap<(String, String, String), Value>,
) -> Option<String> {
    if dir == "." {
        return None;
    }
    let id = format!("folder:{dir}");
    if !nodes.contains_key(&id) {
        nodes.insert(
            id.clone(),
            json!({"id":id,"label":dir.rsplit('/').next().unwrap_or(dir),"type":"folder"}),
        );
        if let Some(parent) = folder_nodes(parent(dir), nodes, edges) {
            add_edge(edges, parent, id.clone(), "file");
        }
    }
    Some(id)
}

fn add_edge(
    edges: &mut BTreeMap<(String, String, String), Value>,
    source: String,
    target: String,
    kind: &str,
) {
    if source != target {
        edges.insert(
            (kind.into(), source.clone(), target.clone()),
            json!({"source":source,"target":target,"type":kind}),
        );
    }
}

pub fn build_graph(root: &Path) -> Result<Value> {
    no_symlink_children(root, root)?;
    let mut notes = Vec::new();
    markdown_files(root, root, &mut notes)?;
    notes.sort();
    let mut nodes = BTreeMap::new();
    let mut edges = BTreeMap::new();
    for note in &notes {
        nodes.insert(
            note.clone(),
            json!({"id":note,"label":stem(note),"type":"note"}),
        );
        if let Some(folder) = folder_nodes(parent(note), &mut nodes, &mut edges) {
            add_edge(&mut edges, folder, note.clone(), "file");
        }
    }
    for note in &notes {
        let raw = read_regular(&root.join(note), CONFIG_LIMIT)?;
        let text = String::from_utf8(raw).map_err(|_| "invalid Markdown encoding")?;
        let (links, tags) = parse_note(&text);
        for target in links {
            let hit = resolve_link(&notes, &target, note).unwrap_or_else(|| {
                let id = format!("ghost:{}", target.to_lowercase());
                nodes
                    .entry(id.clone())
                    .or_insert_with(|| json!({"id":id,"label":target,"type":"ghost","ghost":true}));
                id
            });
            add_edge(&mut edges, note.clone(), hit, "link");
        }
        for tag in tags {
            let id = format!("tag:{tag}");
            nodes
                .entry(id.clone())
                .or_insert_with(|| json!({"id":id,"label":format!("#{tag}"),"type":"tag"}));
            add_edge(&mut edges, note.clone(), id, "tag");
        }
    }
    Ok(
        json!({"nodes":nodes.into_values().collect::<Vec<_>>(),"edges":edges.into_values().collect::<Vec<_>>()}),
    )
}

pub fn write_graph(root: &Path) -> Result<Value> {
    let graph = build_graph(root)?;
    let directory = root.join(".exonous");
    no_symlink_children(root, &directory)?;
    fs::create_dir_all(&directory).map_err(|_| "cannot create vault graph directory")?;
    let json_path = directory.join("graph.json");
    let html_path = directory.join("graph.html");
    no_symlink_children(root, &json_path)?;
    no_symlink_children(root, &html_path)?;
    let inline = graph.to_string().replace('<', "\\u003c");
    let html = include_str!("../../src/lib/vault-template.html").replace("__GRAPH_DATA__", &inline);
    runtime::atomic_private(
        &json_path,
        format!(
            "{}\n",
            serde_json::to_string_pretty(&graph).map_err(|_| "cannot encode graph")?
        )
        .as_bytes(),
    )?;
    runtime::atomic_private(&html_path, html.as_bytes())?;
    Ok(
        json!({"json":json_path,"html":html_path,"nodes":graph["nodes"].as_array().unwrap().len(),"edges":graph["edges"].as_array().unwrap().len()}),
    )
}

pub fn command(home: &Path, cwd: &Path, args: &[String]) -> Result<String> {
    let sub = args.first().map(String::as_str).unwrap_or("show");
    match sub {
        "show" if args.len() <= 1 => {
            let selected = central(home, cwd)?;
            let path = selected.path.ok_or(
                "no vault configured — run `exonous vault detect`, then `exonous vault set <path>`",
            )?;
            Ok(format!(
                "vault:  {}\nsource: {}\nexists: {}\n",
                path.display(),
                selected.source.unwrap_or_default(),
                if path.is_dir() { "yes" } else { "no" }
            ))
        }
        "detect" if args.len() == 1 => {
            let mut out = "Obsidian registries searched:\n".to_string();
            for path in registry_paths(home) {
                out.push_str(&format!(
                    "  {} {}\n",
                    if path.exists() { "✓" } else { "·" },
                    path.display()
                ));
            }
            let configured = central(home, cwd)?;
            if let Some(path) = configured.path.filter(|path| !path.is_dir()) {
                out.push_str(&format!(
                    "configured vault {} ({}) not found — mount it or pick another below\n",
                    path.display(),
                    configured.source.unwrap_or_default()
                ));
            }
            let found = detect(home)?;
            if found.is_empty() {
                out.push_str(&format!(
                    "no Obsidian vault found — install would create {}\n",
                    fallback_path(home).display()
                ));
            } else {
                out.push_str("Vaults (open first, then most recent):\n");
                for entry in found {
                    out.push_str(&format!(
                        "  {}{}\n",
                        entry.path.display(),
                        if entry.open { " (open)" } else { "" }
                    ));
                }
                out.push_str("use one with `exonous vault set <path>`\n");
            }
            Ok(out)
        }
        "set" => {
            let rest = &args[1..];
            let inputs = rest
                .iter()
                .filter(|arg| !arg.starts_with("--"))
                .collect::<Vec<_>>();
            if inputs.len() != 1
                || rest
                    .iter()
                    .any(|arg| arg.starts_with("--") && arg != "--create")
            {
                return Err(USAGE.into());
            }
            let target = local_path(home, cwd, inputs[0])?;
            if target.starts_with(home) {
                no_symlink_children(home, &target)?;
            }
            if target.exists() && !target.is_dir() {
                return Err(format!("{} is a file, not a folder", target.display()));
            }
            if !target.exists() {
                if !rest.iter().any(|arg| arg == "--create") {
                    return Err(format!(
                        "{} does not exist — create it first or pass --create",
                        target.display()
                    ));
                }
                fs::create_dir_all(&target).map_err(|_| "cannot create vault directory")?;
            }
            let result = consolidate(home, cwd, Some(&target), false)?;
            if result["status"] != "complete" {
                return Err(result.to_string());
            }
            let mut out = format!("vault set: {}\n", target.display());
            let effective = central(home, cwd)?;
            if effective.source.as_deref() != Some("exonous-config") {
                out.push_str(&format!(
                    "note: {} still wins ({})\n",
                    effective.source.unwrap_or_default(),
                    effective
                        .path
                        .map_or(String::new(), |path| path.display().to_string())
                ));
            }
            Ok(out)
        }
        "consolidate" => {
            let rest = &args[1..];
            let inputs = rest
                .iter()
                .filter(|arg| !arg.starts_with("--"))
                .collect::<Vec<_>>();
            let dry = rest.iter().any(|arg| arg == "--dry-run");
            let apply = rest.iter().any(|arg| arg == "--apply");
            if inputs.len() > 1
                || dry == apply
                || rest
                    .iter()
                    .any(|arg| arg.starts_with("--") && arg != "--dry-run" && arg != "--apply")
            {
                return Err(USAGE.into());
            }
            let target = inputs
                .first()
                .map(|raw| local_path(home, cwd, raw))
                .transpose()?;
            let result = consolidate(home, cwd, target.as_deref(), dry)?;
            if !matches!(result["status"].as_str(), Some("planned" | "complete")) {
                return Err(result.to_string());
            }
            Ok(format!("{result}\n"))
        }
        "graph" if args.len() == 1 => {
            let root = central(home, cwd)?.path.ok_or(
                "no vault configured — run `exonous vault detect`, then `exonous vault set <path>`",
            )?;
            if !root.is_dir() {
                return Err(format!("vault {} does not exist", root.display()));
            }
            let result = write_graph(&root)?;
            Ok(format!(
                "graph: {} notes, {} links\n  {}\n  {}\n",
                result["nodes"],
                result["edges"],
                result["html"].as_str().unwrap(),
                result["json"].as_str().unwrap()
            ))
        }
        _ => Err(USAGE.into()),
    }
}
