use crate::runtime::{self, Result};
use crate::settings::{self, JsonOwnership};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};

const LEDGER: &str = ".claude/exonous/installed.json";
const COMMANDS: &[&str] = &[
    "commit-changes",
    "make-pr",
    "code-review",
    "security-review",
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
const TOOLS: &[(&str, &str, &str)] = &[
    ("claude", ".claude", "hard"),
    ("cursor", ".cursor", "hard"),
    ("gemini", ".gemini", "hard"),
    ("codex", ".codex", "hard"),
    ("opencode", ".config/opencode", "hard"),
    ("windsurf", ".codeium/windsurf", "hard"),
    ("copilot", ".copilot", "hard"),
    ("cline", "Documents/Cline", "soft"),
    ("qwen", ".qwen", "soft"),
    ("kiro", ".kiro", "detected-only"),
    ("aider", ".aider.conf.yml", "unsupported"),
];

#[derive(Clone, Default, Deserialize, Serialize)]
struct FileEntry {
    hash: String,
    #[serde(default)]
    tool: String,
}
#[derive(Clone, Default, Deserialize, Serialize)]
struct SectionEntry {
    path: String,
    marker: String,
    hash: String,
    #[serde(default)]
    tool: String,
    #[serde(default)]
    created: bool,
    #[serde(default)]
    owned: Vec<String>,
}
#[derive(Clone, Default, Deserialize, Serialize)]
struct JsonEntry {
    path: String,
    #[serde(default)]
    tool: String,
    entries: Vec<JsonOwnership>,
}
#[derive(Clone, Default, Deserialize, Serialize)]
struct Ledger {
    #[serde(default)]
    version: String,
    #[serde(default)]
    files: BTreeMap<String, FileEntry>,
    #[serde(default)]
    sections: Vec<SectionEntry>,
    #[serde(default)]
    json: Vec<JsonEntry>,
    #[serde(default)]
    tools: Vec<String>,
    #[serde(default)]
    complete: bool,
}

#[derive(Default)]
struct Options {
    dry: bool,
    real: bool,
    all: bool,
    tools: Option<BTreeSet<String>>,
    skip: BTreeSet<String>,
    permissions: bool,
    rewrite: bool,
    yes: bool,
    json: bool,
    no_vault: bool,
}

fn options(args: &[String]) -> Result<Options> {
    let mut result = Options::default();
    let mut index = 0;
    while index < args.len() {
        let arg = args[index].as_str();
        match arg {
            "--dry-run" => result.dry = true,
            "--real-home" => result.real = true,
            "--all" => result.all = true,
            "--permissions" => result.permissions = true,
            "--rewrite-jsonc" => result.rewrite = true,
            "--yes" | "-y" => result.yes = true,
            "--json" => result.json = true,
            "--no-vault" => result.no_vault = true,
            "--quiet" | "--no-external" | "--verbose" => {}
            "--tools" | "--skip-tool" => {
                index += 1;
                let value = args
                    .get(index)
                    .filter(|value| !value.starts_with('-'))
                    .ok_or("tool option requires a value")?;
                for name in value.split(',') {
                    if !TOOLS.iter().any(|(id, _, _)| id == &name) {
                        return Err(format!("unknown tool: {name}"));
                    }
                    if arg == "--tools" {
                        result
                            .tools
                            .get_or_insert_with(BTreeSet::new)
                            .insert(name.into());
                    } else {
                        result.skip.insert(name.into());
                    }
                }
            }
            _ if arg.starts_with("--tools=") || arg.starts_with("--skip-tool=") => {
                let (key, value) = arg.split_once('=').ok_or("invalid tool option")?;
                let parsed = options(&[key.into(), value.into()])?;
                if let Some(tools) = parsed.tools {
                    result.tools.get_or_insert_with(BTreeSet::new).extend(tools);
                }
                result.skip.extend(parsed.skip);
            }
            _ => return Err(format!("unsupported install option: {arg}")),
        }
        index += 1;
    }
    Ok(result)
}

fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn contained(home: &Path, relative: &str) -> Result<PathBuf> {
    let relative = Path::new(relative);
    if relative.as_os_str().is_empty()
        || relative
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err("ownership path escapes target home".into());
    }
    Ok(home.join(relative))
}

pub(crate) fn check(home: &Path, path: &Path) -> Result<()> {
    if !home.is_absolute() || !home.is_dir() {
        return Err("target home must be an existing absolute directory".into());
    }
    let relative = path
        .strip_prefix(home)
        .map_err(|_| "target path escapes home")?;
    if relative
        .components()
        .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err("target path contains traversal".into());
    }
    let mut current = home.to_owned();
    let paths = std::iter::once(home.to_owned()).chain(relative.components().map(|part| {
        current.push(part);
        current.clone()
    }));
    for candidate in paths {
        match fs::symlink_metadata(&candidate) {
            Ok(meta) => {
                if meta.file_type().is_symlink() {
                    return Err(format!("refusing symlink at {}", candidate.display()));
                }
                #[cfg(unix)]
                {
                    use std::os::unix::fs::MetadataExt;
                    if meta.uid() != unsafe { libc::geteuid() } || meta.mode() & 0o022 != 0 {
                        return Err(format!(
                            "unsafe owner or permissions at {}",
                            candidate.display()
                        ));
                    }
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("cannot inspect install path".into()),
        }
    }
    Ok(())
}

fn read(path: &Path) -> Result<Option<Vec<u8>>> {
    match fs::read(path) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err(format!("cannot read {}", path.display())),
    }
}

fn shared_projection(home: &Path, tool_root: &str, name: &str) -> Result<bool> {
    let projection = home.join(tool_root).join("skills").join(name);
    check(home, projection.parent().ok_or("invalid skill projection")?)?;
    let metadata = match fs::symlink_metadata(&projection) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(_) => return Err("cannot inspect skill projection".into()),
    };
    if !metadata.file_type().is_symlink() {
        return Ok(false);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.uid() != unsafe { libc::geteuid() } {
            return Err("foreign skill projection owner".into());
        }
    }
    let shared = home.join(".agents/skills").join(name);
    check(home, &shared)?;
    let target =
        fs::read_link(&projection).map_err(|_| "cannot inspect skill projection target")?;
    let relative = PathBuf::from("../../.agents/skills").join(name);
    if target != shared && target != relative {
        return Err("foreign skill projection target; no files changed".into());
    }
    if !shared.is_dir() || fs::canonicalize(&projection).ok() != fs::canonicalize(&shared).ok() {
        return Err("invalid shared skill projection".into());
    }
    Ok(true)
}

fn text(bytes: Option<Vec<u8>>) -> Result<Option<String>> {
    bytes
        .map(|bytes| String::from_utf8(bytes).map_err(|_| "configuration is not UTF-8".into()))
        .transpose()
}

fn ledger(home: &Path) -> Result<Ledger> {
    let path = contained(home, LEDGER)?;
    check(home, &path)?;
    let Some(bytes) = read(&path)? else {
        return Ok(Ledger::default());
    };
    let mut value: Value =
        serde_json::from_slice(&bytes).map_err(|_| "invalid ownership ledger; no files changed")?;
    if let Some(files) = value.get_mut("files").and_then(Value::as_object_mut) {
        for entry in files.values_mut() {
            if entry.is_string() {
                *entry = json!({"hash":entry.as_str(),"tool":"shared"});
            }
        }
    }
    let result: Ledger =
        serde_json::from_value(value).map_err(|_| "invalid ownership ledger shape")?;
    for path in result
        .files
        .keys()
        .chain(result.sections.iter().map(|entry| &entry.path))
        .chain(result.json.iter().map(|entry| &entry.path))
    {
        contained(home, path)?;
    }
    Ok(result)
}

struct Change {
    before: Option<Vec<u8>>,
    after: Option<Vec<u8>>,
    executable: bool,
    backup: bool,
}
struct Plan<'a> {
    home: &'a Path,
    changes: BTreeMap<String, Change>,
    previous: Ledger,
    next: Ledger,
    notes: Vec<String>,
    files: BTreeSet<String>,
    projections: BTreeSet<String>,
}

impl<'a> Plan<'a> {
    fn new(home: &'a Path) -> Result<Self> {
        let previous = ledger(home)?;
        Ok(Self {
            home,
            changes: BTreeMap::new(),
            next: previous.clone(),
            previous,
            notes: Vec::new(),
            files: BTreeSet::new(),
            projections: BTreeSet::new(),
        })
    }
    fn current(&self, path: &str) -> Result<Option<Vec<u8>>> {
        let full = contained(self.home, path)?;
        check(self.home, &full)?;
        if let Some(change) = self.changes.get(path) {
            return Ok(change.after.clone());
        }
        read(&full)
    }
    fn change(
        &mut self,
        path: &str,
        after: Option<Vec<u8>>,
        executable: bool,
        backup: bool,
    ) -> Result<()> {
        let before = self.current(path)?;
        if before == after {
            return Ok(());
        }
        if self
            .changes
            .get(path)
            .is_some_and(|change| change.before == after)
        {
            self.changes.remove(path);
            return Ok(());
        }
        if let Some(change) = self.changes.get_mut(path) {
            change.after = after;
            change.backup |= backup;
            change.executable |= executable;
        } else {
            self.changes.insert(
                path.into(),
                Change {
                    before,
                    after,
                    executable,
                    backup,
                },
            );
        }
        Ok(())
    }
    fn file(&mut self, path: &str, bytes: Vec<u8>, tool: &str, executable: bool) -> Result<()> {
        self.files.insert(path.into());
        let before = if let Some(change) = self.changes.get(path) {
            change.before.clone()
        } else {
            self.current(path)?
        };
        let edited = before.as_ref().is_some_and(|old| {
            old != &bytes
                && self
                    .previous
                    .files
                    .get(path)
                    .is_none_or(|entry| entry.hash != hash(old))
        });
        self.next.files.insert(
            path.into(),
            FileEntry {
                hash: hash(&bytes),
                tool: tool.into(),
            },
        );
        self.change(path, Some(bytes), executable, edited)
    }
    fn json(
        &mut self,
        path: &str,
        desired: Vec<JsonOwnership>,
        tool: &str,
        rewrite: bool,
    ) -> Result<()> {
        let raw = text(self.current(path)?)?;
        let migrated = if desired
            .iter()
            .any(|entry| entry.path.first().is_some_and(|key| key == "hooks"))
        {
            raw.as_deref()
                .map(|raw| settings::migrate_legacy_hooks(raw, rewrite))
                .transpose()?
        } else {
            raw.clone()
        };
        let domains: BTreeSet<_> = desired
            .iter()
            .filter_map(|entry| entry.path.first())
            .collect();
        let previous: Vec<_> = self
            .next
            .json
            .iter()
            .filter(|entry| entry.path == path)
            .flat_map(|entry| entry.entries.clone())
            .collect();
        let active: Vec<_> = previous
            .iter()
            .filter(|entry| entry.path.first().is_some_and(|key| domains.contains(key)))
            .cloned()
            .collect();
        let mut kept: Vec<_> = previous
            .into_iter()
            .filter(|entry| entry.path.first().is_none_or(|key| !domains.contains(key)))
            .collect();
        let (next, entries) = settings::merge_json(migrated.as_deref(), &desired, &active, rewrite)
            .map_err(|error| format!("{path}: {error}"))?;
        kept.extend(entries);
        self.next.json.retain(|entry| entry.path != path);
        if !kept.is_empty() {
            self.next.json.push(JsonEntry {
                path: path.into(),
                tool: tool.into(),
                entries: kept,
            });
        }
        self.change(path, Some(next.into_bytes()), false, raw.is_some())
    }
    fn section(&mut self, path: &str, body: &str, tool: &str, marker: &str) -> Result<()> {
        let raw = text(self.current(path)?)?;
        let next = settings::upsert_section(raw.as_deref().unwrap_or(""), body, marker)
            .map_err(|error| format!("{path}: {error}"))?;
        let old = self
            .previous
            .sections
            .iter()
            .find(|entry| entry.path == path && entry.marker == marker);
        let created = old.map(|entry| entry.created).unwrap_or(raw.is_none());
        self.next
            .sections
            .retain(|entry| entry.path != path || entry.marker != marker);
        self.next.sections.push(SectionEntry {
            path: path.into(),
            marker: marker.into(),
            hash: hash(
                format!("{}\n", body.replace("\r\n", "\n").trim_end_matches('\n')).as_bytes(),
            ),
            tool: tool.into(),
            created,
            owned: Vec::new(),
        });
        self.change(path, Some(next.into_bytes()), false, raw.is_some())
    }
    fn tree(&mut self, source: &Path, target: &str, tool: &str) -> Result<()> {
        let mut entries: Vec<_> = fs::read_dir(source)
            .map_err(|_| format!("missing asset directory {}", source.display()))?
            .collect::<std::result::Result<_, _>>()
            .map_err(|_| "cannot list asset directory")?;
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| "asset filename is not UTF-8")?;
            if [".DS_Store", "__pycache__", "node_modules", ".git"].contains(&name.as_str()) {
                continue;
            }
            if name == "hooks" && target.ends_with("/assets/machine") {
                continue;
            }
            if name == "config.json"
                && [".agents/skills/", ".claude/skills/", ".cursor/skills/"]
                    .iter()
                    .any(|prefix| target.starts_with(prefix))
                && target.split('/').count() == 3
            {
                continue;
            }
            let kind = entry.file_type().map_err(|_| "cannot inspect asset")?;
            let dest = format!("{target}/{name}");
            if kind.is_dir() {
                self.tree(&entry.path(), &dest, tool)?;
            } else if kind.is_file() {
                self.file(
                    &dest,
                    fs::read(entry.path()).map_err(|_| "cannot read asset")?,
                    tool,
                    Path::new(&name)
                        .extension()
                        .is_none_or(|ext| ext == "sh" || ext == "cmd"),
                )?;
            } else {
                return Err("asset symlinks are not supported".into());
            }
        }
        Ok(())
    }
    fn prune(&mut self, tools: &[String]) -> Result<()> {
        let mut runtimes = BTreeSet::new();
        let metadata = if let Some(change) = self.changes.get(".claude/exonous/install.json") {
            change.before.clone()
        } else {
            self.current(".claude/exonous/install.json")?
        };
        if let Some(raw) = metadata
            && let Ok(info) = serde_json::from_slice::<Value>(&raw)
            && let Some(binary) = info["binary"].as_str()
        {
            let binary = Path::new(binary);
            if let Ok(relative) = binary.strip_prefix(self.home)
                && let Some(relative) = relative.to_str()
            {
                let relative = relative.replace('\\', "/");
                if relative.starts_with(".claude/exonous/bin/")
                    && self.previous.files.contains_key(&relative)
                {
                    contained(self.home, &relative)?;
                    if let Some((root, _)) = relative.rsplit_once('/') {
                        runtimes.insert(format!("{root}/"));
                    }
                }
            }
        }
        if let (Ok(binary), Ok(home)) = (
            std::env::current_exe().and_then(fs::canonicalize),
            fs::canonicalize(self.home),
        ) && let Ok(relative) = binary.strip_prefix(home)
            && let Some(relative) = relative.to_str()
        {
            let relative = relative.replace('\\', "/");
            if relative.starts_with(".claude/exonous/bin/")
                && let Some((root, _)) = relative.rsplit_once('/')
            {
                runtimes.insert(format!("{root}/"));
            }
        }
        for (path, entry) in self.previous.files.clone() {
            if self.projections.iter().any(|root| path.starts_with(root)) {
                self.next.files.remove(&path);
                continue;
            }
            if self.files.contains(&path)
                || !entry.tool.is_empty() && entry.tool != "shared" && !tools.contains(&entry.tool)
            {
                continue;
            }
            if runtimes.iter().any(|root| path.starts_with(root)) {
                continue;
            }
            match self.current(&path)? {
                Some(bytes) if hash(&bytes) == entry.hash => {
                    self.change(&path, None, false, false)?;
                    self.next.files.remove(&path);
                }
                None => {
                    self.next.files.remove(&path);
                }
                Some(_) => self.notes.push(format!("kept edited retired file {path}")),
            }
        }
        Ok(())
    }
}

pub fn assets_root() -> Result<PathBuf> {
    if let Some(path) = std::env::var_os("EXONOUS_ASSETS") {
        let path = PathBuf::from(path);
        if !path.is_absolute() || !path.is_dir() {
            return Err("EXONOUS_ASSETS must be an existing absolute directory".into());
        }
        return Ok(path);
    }
    let executable = std::env::current_exe().map_err(|_| "cannot resolve native executable")?;
    if let Some(parent) = executable.parent() {
        let sibling = parent.join("assets");
        if sibling.is_dir() {
            return Ok(sibling);
        }
    }
    let development = Path::new(env!("CARGO_MANIFEST_DIR")).join("assets");
    if development.is_dir() {
        return Ok(development);
    }
    Err("native assets unavailable; set EXONOUS_ASSETS".into())
}

fn on_path(name: &str) -> bool {
    std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()).any(|path| {
        path.is_absolute()
            && [
                name.to_owned(),
                format!("{name}.exe"),
                format!("{name}.cmd"),
            ]
            .iter()
            .any(|file| path.join(file).is_file())
    })
}

fn select(home: &Path, opts: &Options) -> Result<Vec<String>> {
    let config = text(read(&home.join(".claude/exonous/config.json"))?)?;
    let disabled = config
        .as_deref()
        .map(|raw| settings::parse_json(Some(raw), false))
        .transpose()?
        .and_then(|config| {
            config
                .get("disabledTools")
                .and_then(Value::as_array)
                .cloned()
        })
        .unwrap_or_default();
    Ok(TOOLS
        .iter()
        .filter(|(id, path, gate)| {
            if *gate == "unsupported" || opts.skip.contains(*id) {
                return false;
            }
            if let Some(tools) = &opts.tools {
                return tools.contains(*id);
            }
            (opts.all
                || home.join(path).exists()
                || ["claude", "cursor", "gemini", "codex", "opencode"].contains(id) && on_path(id))
                && !disabled.contains(&json!(id))
        })
        .map(|(id, _, _)| (*id).into())
        .collect())
}

fn guard(home: &Path, assets: &Path, options: &Options) -> Result<()> {
    check(home, home)?;
    let real =
        std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from);
    let same = real.is_some_and(|real| fs::canonicalize(real).ok() == fs::canonicalize(home).ok());
    if !options.dry
        && !options.real
        && same
        && assets
            .parent()
            .is_some_and(|root| root.join(".git").exists())
    {
        return Err("refusing to install or uninstall the real home from a dev checkout; set EXONOUS_HOME or pass --real-home".into());
    }
    Ok(())
}

pub(crate) fn quote(path: &Path) -> Result<String> {
    let value = path.to_str().ok_or("binary path is not UTF-8")?;
    if value.contains(['\r', '\n']) || cfg!(windows) && value.contains(['%', '!', '"']) {
        return Err("unsafe binary path for host hook shell".into());
    }
    if cfg!(windows) {
        return Ok(format!("\"{value}\""));
    }
    let value = value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('$', "\\$")
        .replace('`', "\\`");
    Ok(format!("\"{value}\""))
}

fn array(path: &[&str], value: Value) -> JsonOwnership {
    JsonOwnership {
        path: path.iter().map(|key| (*key).into()).collect(),
        value,
        array: true,
    }
}
fn map(path: &[&str], value: Value) -> JsonOwnership {
    JsonOwnership {
        path: path.iter().map(|key| (*key).into()).collect(),
        value,
        array: false,
    }
}

fn requirements(tool: &str) -> &'static [&'static str] {
    match tool {
        "claude" => &[
            "pyle",
            "ethos",
            "metron",
            "taxis-spawn",
            "taxis-session",
            "anamnesis",
            "kairos",
        ],
        "cursor" => &[
            "pyle",
            "ethos",
            "taxis-spawn",
            "taxis-session",
            "anamnesis",
            "kairos",
        ],
        "gemini" | "codex" | "copilot" => &["pyle", "ethos", "anamnesis", "kairos"],
        "opencode" | "windsurf" => &["pyle", "anamnesis", "kairos"],
        _ => &[],
    }
}

fn hooks(tool: &str, binary: &Path) -> Result<Vec<JsonOwnership>> {
    let bin = quote(binary)?;
    let cmd = |name: &str| format!("{bin} hook {name} --adapter {tool}");
    let memory = |event: &str| format!("{bin} hook anamnesis --event {event} --adapter {tool}");
    let grouped = |matcher: Option<&str>, command: String| {
        let mut value = json!({"hooks":[{"type":"command","command":command}]});
        if let Some(matcher) = matcher {
            value["matcher"] = matcher.into();
        }
        value
    };
    let mut result = Vec::new();
    let mut add = |event: &str, value| result.push(array(&["hooks", event], value));
    match tool {
        "claude" | "codex" | "gemini" => {
            let gemini = tool == "gemini";
            add(
                if gemini { "BeforeTool" } else { "PreToolUse" },
                grouped(
                    Some(if gemini { "run_shell_command" } else { "Bash" }),
                    cmd("pyle"),
                ),
            );
            add("SessionStart", grouped(None, cmd("kairos")));
            add("SessionStart", grouped(None, memory("start")));
            let prompt = if gemini {
                "BeforeAgent"
            } else {
                "UserPromptSubmit"
            };
            add(prompt, grouped(None, memory("prompt")));
            add(prompt, grouped(None, cmd("ethos")));
            add(
                if gemini { "AfterTool" } else { "PostToolUse" },
                grouped(None, memory("tool")),
            );
            add(
                if gemini { "AfterAgent" } else { "Stop" },
                grouped(None, memory("stop")),
            );
            add("SessionEnd", grouped(None, memory("end")));
            if tool == "claude" {
                add("PreToolUse", grouped(Some("Read"), cmd("metron")));
                add("PreToolUse", grouped(Some("Task|Agent"), cmd("taxis")));
                add("SessionStart", grouped(None, cmd("taxis")));
            }
        }
        "cursor" => {
            for (event, name) in [
                ("beforeShellExecution", "pyle"),
                ("beforeSubmitPrompt", "ethos"),
                ("sessionStart", "kairos"),
                ("sessionStart", "taxis"),
                ("subagentStart", "taxis"),
            ] {
                add(event, json!({"command":cmd(name)}));
            }
            add(
                "preToolUse",
                json!({"command":cmd("taxis"),"matcher":"Task"}),
            );
            for (event, name) in [
                ("sessionStart", "start"),
                ("beforeSubmitPrompt", "prompt"),
                ("postToolUse", "tool"),
                ("stop", "stop"),
                ("sessionEnd", "end"),
            ] {
                add(event, json!({"command":memory(name)}));
            }
        }
        "windsurf" => {
            add(
                "pre_run_command",
                json!({"command":cmd("pyle"),"show_output":true}),
            );
            add("pre_user_prompt", json!({"command":cmd("kairos")}));
            for (event, name) in [
                ("pre_user_prompt", "prompt"),
                ("post_write_code", "tool"),
                ("post_run_command", "tool"),
                ("post_cascade_response", "stop"),
            ] {
                add(event, json!({"command":memory(name)}));
            }
        }
        "copilot" => {
            for (event, name) in [
                ("preToolUse", "pyle"),
                ("sessionStart", "kairos"),
                ("userPromptSubmitted", "ethos"),
            ] {
                add(
                    event,
                    json!({"type":"command","command":cmd(name),"timeoutSec":30}),
                );
            }
            for (event, name) in [
                ("sessionStart", "start"),
                ("userPromptSubmitted", "prompt"),
                ("postToolUse", "tool"),
                ("sessionEnd", "end"),
            ] {
                add(
                    event,
                    json!({"type":"command","command":memory(name),"timeoutSec":10}),
                );
            }
        }
        _ => {}
    }
    Ok(result)
}

fn rule_variant(source: &str, variant: &str, praxis: bool) -> String {
    if variant == "full" || praxis && variant == "no-agents" {
        return source.into();
    }
    let mut output = String::new();
    let mut keep = true;
    for line in source.split_inclusive('\n') {
        if line.starts_with("## ") {
            let title = line.trim_start_matches("## ");
            keep = if variant == "no-agents" {
                !title.starts_with("Agents")
            } else if praxis {
                ["Make it work", "Make it right"]
                    .iter()
                    .any(|name| title.starts_with(name))
            } else {
                ["Communication", "Engineering", "Verify", "Git"]
                    .iter()
                    .any(|name| title.starts_with(name))
            };
        }
        if keep {
            output.push_str(line);
        }
    }
    format!("{}\n", output.trim_end_matches('\n'))
}

fn frontmatter(source: &str) -> (BTreeMap<String, String>, String) {
    let normalized = source.replace("\r\n", "\n");
    let Some(content) = normalized.strip_prefix("---\n") else {
        return (BTreeMap::new(), normalized);
    };
    let Some((head, body)) = content.split_once("\n---\n") else {
        return (BTreeMap::new(), normalized);
    };
    let fields = head
        .lines()
        .filter_map(|line| line.split_once(':'))
        .map(|(key, value)| (key.into(), value.trim().trim_matches('"').into()))
        .collect();
    (fields, body.trim_start_matches('\n').into())
}

fn converted(source: &str, name: &str, gemini: bool, agent: bool) -> String {
    let (fields, body) = frontmatter(source);
    let description = serde_json::to_string(
        fields
            .get("description")
            .map(String::as_str)
            .unwrap_or(name),
    )
    .unwrap_or_else(|_| "\"\"".into());
    if gemini {
        let prompt = if COMMANDS.contains(&name) {
            body.replace("!{", "! {")
                .replace("@{", "@ {")
                .replace("$ARGUMENTS", "{{args}}")
        } else {
            format!(
                "Activate the `{name}` skill (activate_skill) and follow its SKILL.md.\n\n{{{{args}}}}\n"
            )
        };
        format!(
            "description = {description}\nprompt = {}\n",
            serde_json::to_string(&prompt).unwrap_or_else(|_| "\"\"".into())
        )
    } else {
        let prompt = if agent || COMMANDS.contains(&name) {
            regex::Regex::new(r"(?m)(^|[\s(])@([\w./~-])")
                .expect("fixed regex")
                .replace_all(&body.replace("!`", "! `"), "$1@ $2")
                .into_owned()
        } else {
            format!(
                "Load the `{name}` skill with the skill tool and follow its SKILL.md.\n\n$ARGUMENTS\n"
            )
        };
        format!(
            "---\ndescription: {description}\n{}---\n\n{prompt}",
            if agent { "mode: subagent\n" } else { "" }
        )
    }
}

fn plugin(binary: &Path) -> Result<String> {
    let binary = serde_json::to_string(&binary.to_string_lossy())
        .map_err(|_| "cannot encode plugin binary")?;
    Ok(format!(
        r#"import {{ spawn }} from 'node:child_process';
import {{ resolve }} from 'node:path';
const BINARY = {binary};
function invoke(name, payload, event) {{
  return new Promise((resolve, reject) => {{
    const child = spawn(BINARY, ['hook', name, ...(event ? ['--event', event] : []), '--adapter', 'opencode'], {{ stdio: ['pipe', 'pipe', 'pipe'] }});
    let out = '', err = '';
    const timeout = setTimeout(() => {{ child.kill(); reject(new Error('Exonous native hook timed out')); }}, 30000);
    child.stdout.on('data', chunk => {{ out += chunk; if (out.length > 1048576) child.kill(); }});
    child.stderr.on('data', chunk => {{ if (err.length < 1048576) err += chunk; }});
    child.on('error', () => {{ clearTimeout(timeout); reject(new Error('Exonous native runtime unavailable')); }});
    child.on('close', code => {{ clearTimeout(timeout); if (code !== 0) reject(new Error(err || 'Exonous native gate failed')); else {{ try {{ resolve(out.trim() ? JSON.parse(out) : {{}}); }} catch {{ reject(new Error('Invalid Exonous native response')); }} }} }});
    child.stdin.on('error', () => {{}});
    child.stdin.end(JSON.stringify(payload));
  }});
}}
function background(name, payload, event) {{ invoke(name, payload, event).catch(() => console.error('Exonous native background hook unavailable')); }}
export const ExonousGate = async ({{ directory }} = {{}}) => ({{
  'chat.message': async (input, output) => {{
    const prompt = (output?.parts || []).filter(part => part?.type === 'text').map(part => part.text).join('\n');
    if (prompt) background('anamnesis', {{ session_id: input?.sessionID, cwd: directory || process.cwd(), prompt }}, 'prompt');
  }},
  'tool.execute.before': async (input, output) => {{
    const base = directory || process.cwd();
    background('anamnesis', {{ session_id: input?.sessionID, cwd: base, tool_name: input?.tool, tool_input: output?.args }}, 'tool');
    if (!['bash', 'shell'].includes(input?.tool) || typeof output?.args?.command !== 'string') return;
    const cwd = typeof output.args.workdir === 'string' ? resolve(base, output.args.workdir) : base;
    const decision = await invoke('pyle', {{ command: output.args.command, cwd }});
    if (decision.permission === 'deny' || decision.permissionDecision === 'deny' || decision.hookSpecificOutput?.permissionDecision === 'deny') throw new Error(decision.message || decision.reason || 'Exonous review required');
  }},
  event: async ({{ event }} = {{}}) => {{
    const props = event?.properties || {{}};
    const payload = {{ session_id: props.sessionID || props.info?.id, cwd: directory || process.cwd() }};
    const capture = {{ 'session.created': 'start', 'session.idle': 'stop', 'session.deleted': 'end' }}[event?.type];
    if (capture) background('anamnesis', payload, capture);
    if (event?.type === 'session.created') background('kairos', payload);
  }}
}});
"#
    ))
}

fn mcp_entries(home: &Path) -> Result<Map<String, Value>> {
    let mut result = Map::new();
    let secret = regex::Regex::new("(?i)key|token|secret|password|auth").expect("fixed regex");
    for path in [".claude/.mcp.json", ".claude.json"] {
        let Some(raw) = text(read(&home.join(path))?)? else {
            continue;
        };
        let config = settings::parse_json(Some(&raw), false)?;
        for name in ["atlas", "biblos"] {
            if result.contains_key(name) {
                continue;
            }
            let Some(entry) = config
                .get("mcpServers")
                .and_then(|servers| servers.get(name))
            else {
                continue;
            };
            if let Some(command) = entry.get("command").and_then(Value::as_str) {
                let args = entry
                    .get("args")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                if args
                    .iter()
                    .any(|arg| !arg.is_string() || secret.is_match(arg.as_str().unwrap_or("")))
                {
                    continue;
                }
                result.insert(name.into(), json!({"command":command,"args":args}));
            } else if let Some(url) = entry.get("url").and_then(Value::as_str)
                && url.starts_with("https://")
                && !url.contains(['@', '?', '#'])
            {
                result.insert(name.into(), json!({"url":url}));
            }
        }
    }
    Ok(result)
}

pub fn command(home: &Path, cwd: &Path, args: &[String]) -> Result<String> {
    command_with_capabilities(home, cwd, args, &["ethos", "metron", "taxis-spawn"])
}

pub fn command_with_capabilities(
    home: &Path,
    cwd: &Path,
    args: &[String],
    verified: &[&str],
) -> Result<String> {
    let assets = assets_root()?;
    let binary = std::env::current_exe().map_err(|_| "cannot locate native binary")?;
    install_from(home, cwd, args, &assets, &binary, verified)
}

pub fn install_from(
    home: &Path,
    cwd: &Path,
    args: &[String],
    assets: &Path,
    source_binary: &Path,
    verified: &[&str],
) -> Result<String> {
    let opts = options(args)?;
    let cursor_model = regex::Regex::new(r"(?m)^model: .*$").expect("fixed regex");
    guard(home, assets, &opts)?;
    let tools = select(home, &opts)?;
    let mut plan = Plan::new(home)?;
    let read_asset = |path: &str| runtime::read_limited(&assets.join(path), 1024 * 1024);
    let nomos = read_asset("rules/nomos.md")?;
    let praxis = read_asset("rules/praxis.md")?;
    let root = ".claude/exonous";
    let source_bytes = fs::read(source_binary).map_err(|_| "cannot read native executable")?;
    let bin_rel = format!(
        "{root}/bin/{}-{}/exonous{}",
        env!("CARGO_PKG_VERSION"),
        &hash(&source_bytes)[..12],
        if cfg!(windows) { ".exe" } else { "" }
    );
    let binary = home.join(&bin_rel);
    let bundle_root = bin_rel.rsplit_once('/').ok_or("invalid runtime path")?.0;
    plan.tree(assets, &format!("{bundle_root}/assets"), "shared")?;
    plan.file(&bin_rel, source_bytes, "shared", true)?;
    let launcher = if cfg!(windows) {
        ".local/bin/exonous.cmd"
    } else {
        ".local/bin/exonous"
    };
    if plan.current(launcher)?.is_none() || plan.previous.files.contains_key(launcher) {
        let command = if cfg!(windows) {
            format!("@echo off\r\n{} %* & exit /b\r\n", quote(&binary)?)
        } else {
            format!("#!/bin/sh\nexec {} \"$@\"\n", quote(&binary)?)
        };
        plan.file(launcher, command.into_bytes(), "shared", true)?;
    } else {
        plan.notes.push(format!(
            "kept foreign launcher {launcher}; use the absolute native binary from the skill hint"
        ));
    }
    if !std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default())
        .any(|path| path == home.join(".local/bin"))
    {
        plan.notes.push("~/.local/bin is not on PATH; add it yourself or use the absolute native binary in skill instructions".into());
    }
    for variant in ["full", "no-agents", "min"] {
        plan.file(
            &format!(
                "{root}/rules/{}",
                if variant == "full" {
                    "nomos.md".into()
                } else {
                    format!("nomos.{variant}.md")
                }
            ),
            rule_variant(&nomos, variant, false).into_bytes(),
            "shared",
            false,
        )?;
    }
    plan.file(
        &format!("{root}/rules/praxis.md"),
        praxis.as_bytes().to_vec(),
        "shared",
        false,
    )?;
    plan.file(
        &format!("{root}/PR-TEMPLATE.md"),
        fs::read(assets.join("machine/PR-TEMPLATE.md")).map_err(|_| "missing PR template asset")?,
        "shared",
        false,
    )?;
    for name in SKILLS {
        let target = format!(".agents/skills/{name}");
        let existing = text(plan.current(&format!("{target}/SKILL.md"))?)?;
        if existing
            .as_ref()
            .is_some_and(|text| !text.lines().any(|line| line == format!("name: {name}")))
            && !plan
                .previous
                .files
                .contains_key(&format!("{target}/SKILL.md"))
        {
            plan.notes.push(format!("kept foreign skill {name}"));
            continue;
        }
        plan.tree(&assets.join("skills").join(name), &target, "shared")?;
        let content = read_asset(&format!("skills/{name}/SKILL.md"))?;
        let content = if !frontmatter(&content).0.contains_key("name") {
            if let Some(body) = content.strip_prefix("---\n") {
                format!("---\nname: {name}\n{body}")
            } else {
                format!("---\nname: {name}\n---\n\n{content}")
            }
        } else {
            content
        };
        let (head, body) = content
            .strip_prefix("---\n")
            .and_then(|text| text.split_once("\n---\n"))
            .ok_or("skill frontmatter unavailable")?;
        let content = format!(
            "---\n{head}\n---\n\nNative command: `{}`. Use this absolute binary for every `exonous` command below.\n\n{}",
            quote(&binary)?,
            body.trim_start_matches('\n')
        );
        plan.file(
            &format!("{target}/SKILL.md"),
            content.into_bytes(),
            "shared",
            false,
        )?;
    }
    let mcp = mcp_entries(home)?;
    let mut missing = Vec::new();
    for tool in &tools {
        let (_, tool_root, gate) = TOOLS
            .iter()
            .find(|(id, _, _)| id == tool)
            .ok_or("unknown adapter")?;
        let body = format!(
            "{}\n{}",
            rule_variant(
                &nomos,
                if tool == "qwen" || tool == "cline" {
                    "no-agents"
                } else {
                    "full"
                },
                false
            ),
            praxis
        );
        let absent: Vec<_> = requirements(tool)
            .iter()
            .filter(|capability| !verified.contains(capability))
            .copied()
            .collect();
        let ready = absent.is_empty();
        if !ready {
            missing.push(format!(
                "{tool}: native capabilities unavailable: {}",
                absent.join(", ")
            ));
        }
        let hook_file = match tool.as_str() {
            "claude" => Some(".claude/settings.json"),
            "cursor" => Some(".cursor/hooks.json"),
            "gemini" => Some(".gemini/settings.json"),
            "codex" => Some(".codex/hooks.json"),
            "windsurf" if home.join(".codeium/windsurf/hooks.json").is_file() => {
                Some(".codeium/windsurf/hooks.json")
            }
            "copilot" => Some(".copilot/hooks/exonous.json"),
            _ => None,
        };
        if tool == "windsurf" && hook_file.is_none() {
            missing.push("windsurf: hooks.json absent; create it before installing".into());
        }
        if ready && let Some(path) = hook_file {
            let mut entries = hooks(tool, &binary)?;
            if ["cursor", "copilot"].contains(&tool.as_str()) {
                entries.push(map(&["version"], json!(1)));
            }
            if tool == "claude" {
                if opts.permissions {
                    for permission in ["workflow*", "template*", "draft-path*", "validate-pr*"] {
                        entries.push(array(
                            &["permissions", "allow"],
                            json!(format!("Bash(exonous {permission})")),
                        ));
                    }
                }
                entries.push(map(
                    &["extraKnownMarketplaces", "exonous"],
                    json!({"source":{"source":"directory","path":home.join(".claude/techne")}}),
                ));
                entries.push(map(&["enabledPlugins", "techne@exonous"], json!(true)));
            }
            plan.json(path, entries, tool, opts.rewrite)?;
        }
        match tool.as_str() {
            "claude" | "cursor" => {
                for (name, source) in [("nomos", &nomos), ("praxis", &praxis)] {
                    let content = if tool == "cursor" {
                        format!(
                            "---\ndescription: Exonous {name}\nalwaysApply: true\n---\n\n{source}"
                        )
                    } else {
                        source.to_string()
                    };
                    plan.file(
                        &format!(
                            "{tool_root}/rules/{name}.{}",
                            if tool == "cursor" { "mdc" } else { "md" }
                        ),
                        content.into_bytes(),
                        tool,
                        false,
                    )?;
                }
                if tool == "claude" {
                    plan.tree(&assets.join("techne/rules"), ".claude/rules/exonous", tool)?;
                    plan.tree(&assets.join("techne"), ".claude/techne", tool)?;
                    plan.notes.push("techne content and marketplace settings prepared; host plugin installation must be verified in Claude".into());
                }
                for name in SKILLS {
                    let target = format!("{tool_root}/skills/{name}");
                    if shared_projection(home, tool_root, name)? {
                        plan.projections.insert(format!("{target}/"));
                        plan.notes
                            .push(format!("kept shared skill projection {target}"));
                        continue;
                    }
                    let existing = text(plan.current(&format!("{target}/SKILL.md"))?)?;
                    if existing.as_ref().is_some_and(|text| {
                        frontmatter(text)
                            .0
                            .get("name")
                            .is_some_and(|value| value != name)
                    }) {
                        plan.notes.push(format!("kept foreign {tool} skill {name}"));
                        continue;
                    }
                    plan.tree(&assets.join("skills").join(name), &target, tool)?;
                    if let Some(content) =
                        plan.current(&format!(".agents/skills/{name}/SKILL.md"))?
                    {
                        plan.file(&format!("{target}/SKILL.md"), content, tool, false)?;
                    }
                }
                if tool == "claude" {
                    for name in COMMANDS {
                        plan.file(
                            &format!(".claude/commands/{name}.md"),
                            read_asset(&format!("skills/{name}/SKILL.md"))?.into_bytes(),
                            tool,
                            false,
                        )?;
                    }
                }
            }
            "codex" => {
                plan.section(".codex/AGENTS.md", &format!("{body}\n## exonous hooks (Codex)\nHook registration does not grant approval: approve Exonous in /hooks for each profile and verify with exonous doctor.\n"), tool, "html")?;
            }
            "gemini" => {
                plan.section(".gemini/GEMINI.md", &body, tool, "html")?;
            }
            "opencode" => {
                let path = if !home.join(".config/opencode/opencode.json").exists()
                    && home.join(".config/opencode/opencode.jsonc").exists()
                {
                    ".config/opencode/opencode.jsonc"
                } else {
                    ".config/opencode/opencode.json"
                };
                let mut entries = vec![
                    array(
                        &["instructions"],
                        json!(home.join(".claude/exonous/rules/nomos.md")),
                    ),
                    array(
                        &["instructions"],
                        json!(home.join(".claude/exonous/rules/praxis.md")),
                    ),
                ];
                for (name, entry) in &mcp {
                    let value = if let Some(command) = entry.get("command") {
                        let mut command = vec![command.clone()];
                        command.extend(entry["args"].as_array().cloned().unwrap_or_default());
                        json!({"type":"local","command":command,"enabled":true})
                    } else {
                        json!({"type":"remote","url":entry["url"],"enabled":true})
                    };
                    entries.push(map(&["mcp", name], value));
                }
                plan.json(path, entries, tool, opts.rewrite)?;
                if ready {
                    plan.file(
                        ".config/opencode/plugins/exonous.js",
                        plugin(&binary)?.into_bytes(),
                        tool,
                        false,
                    )?;
                }
            }
            "windsurf" => {
                let path = ".codeium/windsurf/memories/global_rules.md";
                if let Some(raw) = text(plan.current(path)?)? {
                    let body = format!(
                        "{}\n{}",
                        rule_variant(&nomos, "min", false),
                        rule_variant(&praxis, "min", true)
                    );
                    if settings::upsert_section(&raw, &body, "html")?
                        .chars()
                        .count()
                        > 6000
                    {
                        missing.push("windsurf: global rules would exceed 6000 characters".into());
                    } else {
                        plan.section(path, &body, tool, "html")?;
                    }
                } else {
                    missing.push("windsurf: existing global_rules.md required".into());
                }
            }
            "qwen" if home.join(tool_root).exists() => {
                plan.section(".qwen/QWEN.md", &body, tool, "html")?
            }
            "cline" if home.join(tool_root).exists() => {
                plan.file(
                    "Documents/Cline/Rules/exonous-nomos.md",
                    rule_variant(&nomos, "no-agents", false).into_bytes(),
                    tool,
                    false,
                )?;
                plan.file(
                    "Documents/Cline/Rules/exonous-praxis.md",
                    praxis.as_bytes().to_vec(),
                    tool,
                    false,
                )?;
            }
            _ => {}
        }
        if ["claude", "cursor", "opencode"].contains(&tool.as_str()) {
            let mut agents: Vec<_> = fs::read_dir(assets.join("agents"))
                .map_err(|_| "missing agents assets")?
                .collect::<std::result::Result<_, _>>()
                .map_err(|_| "cannot list agents")?;
            agents.sort_by_key(|entry| entry.file_name());
            for entry in agents {
                let name = entry
                    .file_name()
                    .into_string()
                    .map_err(|_| "invalid agent filename")?;
                if !name.starts_with("exo-") || !name.ends_with(".md") {
                    continue;
                }
                let content = runtime::read_limited(&entry.path(), 1024 * 1024)?;
                let content = if tool == "opencode" {
                    converted(&content, &name, false, true)
                } else if tool == "cursor" {
                    cursor_model
                        .replace_all(&content, "model: inherit")
                        .into_owned()
                } else {
                    content
                };
                plan.file(
                    &format!("{tool_root}/agents/{name}"),
                    content.into_bytes(),
                    tool,
                    false,
                )?;
            }
            plan.file(
                ".claude/exonous/roster.json",
                fs::read(assets.join("agents/roster.json")).map_err(|_| "missing agent roster")?,
                "shared",
                false,
            )?;
        }
        if tool == "gemini" || tool == "opencode" {
            for name in SKILLS {
                let content = read_asset(&format!("skills/{name}/SKILL.md"))?;
                plan.file(
                    &format!(
                        "{tool_root}/commands/{name}.{}",
                        if tool == "gemini" { "toml" } else { "md" }
                    ),
                    converted(&content, name, tool == "gemini", false).into_bytes(),
                    tool,
                    false,
                )?;
            }
        }
        if ["gemini", "cursor", "windsurf"].contains(&tool.as_str()) {
            let path = match tool.as_str() {
                "gemini" => ".gemini/settings.json",
                "cursor" => ".cursor/mcp.json",
                _ => ".codeium/windsurf/mcp_config.json",
            };
            if tool != "windsurf" || home.join(path).exists() {
                let mut desired = Vec::new();
                if ready && tool == "gemini" {
                    desired.extend(hooks(tool, &binary)?);
                }
                for (name, entry) in &mcp {
                    let mut entry = entry.clone();
                    if tool == "gemini" && entry.get("url").is_some() {
                        entry["httpUrl"] = entry["url"].clone();
                        entry.as_object_mut().ok_or("invalid MCP")?.remove("url");
                    }
                    if tool == "windsurf" && entry.get("url").is_some() {
                        entry["serverUrl"] = entry["url"].clone();
                        entry.as_object_mut().ok_or("invalid MCP")?.remove("url");
                    }
                    desired.push(map(&["mcpServers", name], entry));
                }
                if !desired.is_empty() {
                    plan.json(path, desired, tool, opts.rewrite)?;
                }
            }
        }
        if tool == "codex" && !mcp.is_empty() {
            let path = ".codex/config.toml";
            let raw = text(plan.current(path)?)?;
            let owned = vec!["atlas".into(), "biblos".into()];
            let (next, body) = settings::mcp_toml(raw.as_deref().unwrap_or(""), &mcp, &owned)?;
            if !body.is_empty() {
                let old = plan
                    .previous
                    .sections
                    .iter()
                    .find(|entry| entry.path == path);
                let created = old.map(|entry| entry.created).unwrap_or(raw.is_none());
                plan.next.sections.retain(|entry| entry.path != path);
                plan.next.sections.push(SectionEntry {
                    path: path.into(),
                    marker: "hash".into(),
                    hash: hash(format!("{}\n", body.trim_end_matches('\n')).as_bytes()),
                    tool: tool.into(),
                    created,
                    owned,
                });
            }
            plan.change(path, Some(next.into_bytes()), false, raw.is_some())?;
        }
        if *gate != "hard" {
            plan.notes
                .push(format!("{tool}: {gate}; commits are NOT gated"));
        }
    }
    plan.next.version = env!("CARGO_PKG_VERSION").into();
    plan.next.tools = tools.clone();
    plan.next.complete = missing.is_empty();
    let previous_info = text(plan.current(".claude/exonous/install.json")?)?;
    let mut info = settings::parse_json(previous_info.as_deref(), false)?;
    if let Some(root) = assets.parent().filter(|root| root.join(".git").exists()) {
        info["packageRoot"] = json!(root);
    }
    let verified_release = std::env::var("EXONOUS_VERIFIED_RELEASE")
        .ok()
        .map(|value| {
            let (version, sha) = value
                .split_once(':')
                .ok_or("invalid verified release provenance")?;
            if version != env!("CARGO_PKG_VERSION")
                || sha.len() != 40
                || !sha.bytes().all(|byte| byte.is_ascii_hexdigit())
            {
                return Err("verified release provenance does not match candidate".to_owned());
            }
            Ok(sha.to_ascii_lowercase())
        })
        .transpose()?;
    let version_changed = info["version"].as_str() != Some(env!("CARGO_PKG_VERSION"));
    if version_changed
        && info["ref"].as_str().is_none_or(|value| {
            regex::Regex::new(r"^v\d+\.\d+\.\d+$")
                .expect("fixed regex")
                .is_match(value)
        })
    {
        info["ref"] = json!(format!("v{}", env!("CARGO_PKG_VERSION")));
        info.as_object_mut()
            .ok_or("invalid install metadata")?
            .remove("tagSha");
    }
    for (key, value) in json!({"version":env!("CARGO_PKG_VERSION"),"runtime":"rust","binary":binary,"tools":tools,"capabilities":verified,"complete":missing.is_empty()}).as_object().ok_or("invalid install metadata")? { info[key] = value.clone(); }
    if let Some(sha) = verified_release {
        info["tagSha"] = Value::String(sha);
    }
    plan.file(
        ".claude/exonous/install.json",
        serde_json::to_vec_pretty(&info).map_err(|_| "cannot serialize install metadata")?,
        "shared",
        false,
    )?;
    if missing.is_empty() {
        plan.prune(&tools)?;
    }
    let changes = plan.changes.len();
    let mut report = format!(
        "target home: {}\n{}native install: {} planned changes; tools: {}\n",
        home.display(),
        if opts.dry { "DRY RUN: " } else { "" },
        changes,
        tools.join(", ")
    );
    for note in &plan.notes {
        report.push_str(&format!("WARN: {note}\n"));
    }
    for problem in &missing {
        report.push_str(&format!("INCOMPLETE: {problem}\n"));
    }
    let vault = if opts.no_vault {
        None
    } else {
        let selected = crate::vault::consolidation_target(home, cwd)?;
        let target = selected
            .path
            .unwrap_or_else(|| crate::vault::fallback_path(home));
        let mut needs_apply = true;
        if target.exists() {
            let preview = crate::vault::consolidate(home, cwd, Some(&target), true)?;
            if matches!(preview["status"].as_str(), Some("blocked" | "conflict")) {
                return Err(format!("{report}vault consolidation blocked: {preview}\n"));
            }
            if preview["entries"].as_array().is_some_and(Vec::is_empty)
                && crate::vault::read_config(home)?["vault"] == json!(target)
            {
                let journal = runtime::state(home).join("vault-consolidation.json");
                check(home, &journal)?;
                if journal.exists() {
                    let state: Value =
                        serde_json::from_str(&runtime::read_limited(&journal, 16 * 1024 * 1024)?)
                            .map_err(|_| "invalid vault consolidation state")?;
                    needs_apply = state["phase"] != "complete";
                }
            }
        } else if target != crate::vault::fallback_path(home) {
            return Err(format!(
                "{report}vault target must be an existing directory\n"
            ));
        }
        report.push_str(&format!(
            "vault: {} (deterministic configured/Obsidian/fallback selection)\n",
            target.display()
        ));
        needs_apply.then_some(target)
    };
    if !opts.dry {
        execute(&plan)?;
        if let Some(target) = vault {
            if !target.exists() {
                runtime::ensure_private_dir(home, &target)?;
            }
            let result = crate::vault::consolidate(home, cwd, Some(&target), false)?;
            if result["status"] != "complete" {
                return Err(format!(
                    "{report}vault consolidation incomplete: {result}\n"
                ));
            }
        }
    }
    if !missing.is_empty() && !opts.dry {
        return Err(report);
    }
    Ok(report)
}

fn backup(home: &Path, path: &Path, bytes: &[u8]) -> Result<()> {
    for suffix in 0..1000 {
        let backup = path.with_file_name(format!(
            "{}.exonous.bak{}",
            path.file_name()
                .ok_or("invalid backup filename")?
                .to_string_lossy(),
            if suffix == 0 {
                String::new()
            } else {
                format!(".{suffix}")
            }
        ));
        check(home, &backup)?;
        match read(&backup)? {
            Some(existing) if existing == bytes => return Ok(()),
            Some(_) => continue,
            None => {
                runtime::atomic_private(&backup, bytes)?;
                return Ok(());
            }
        }
    }
    Err("too many existing backups".into())
}

fn process_alive(pid: u32) -> bool {
    if pid == 0 || pid > i32::MAX as u32 {
        return true;
    }
    #[cfg(unix)]
    {
        unsafe {
            libc::kill(pid as i32, 0) == 0
                || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
        }
    }
    #[cfg(windows)]
    {
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut std::ffi::c_void;
            fn GetExitCodeProcess(process: *mut std::ffi::c_void, code: *mut u32) -> i32;
            fn CloseHandle(handle: *mut std::ffi::c_void) -> i32;
        }
        unsafe {
            let handle = OpenProcess(0x1000, 0, pid);
            if handle.is_null() {
                return std::io::Error::last_os_error().raw_os_error() != Some(87);
            }
            let mut code = 259;
            let queried = GetExitCodeProcess(handle, &mut code);
            CloseHandle(handle);
            queried == 0 || code == 259
        }
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = pid;
        true
    }
}

pub(crate) struct InstallLock {
    path: PathBuf,
    contents: Vec<u8>,
    _guard: crate::memory::MemoryLock,
}
fn lock_owner(raw: &str) -> Result<u32> {
    let lock: Value = serde_json::from_str(raw)
        .map_err(|_| "invalid install lock; inspect it before retrying")?;
    lock["pid"]
        .as_u64()
        .and_then(|pid| u32::try_from(pid).ok())
        .ok_or_else(|| "invalid install lock owner".into())
}
impl InstallLock {
    fn acquire(home: &Path) -> Result<Self> {
        Self::named(home, "install.lock")
    }
    pub(crate) fn named(home: &Path, name: &str) -> Result<Self> {
        if !["install.lock", "update.lock"].contains(&name) {
            return Err("unknown machine mutation lock".into());
        }
        let directory = runtime::state(home);
        runtime::ensure_private_dir(home, &directory)?;
        let path = directory.join(name);
        check(home, &path)?;
        let guard_path = directory.join(format!("{name}.guard"));
        if !guard_path.exists()
            && let Ok(raw) = runtime::read_limited(&path, 4096)
            && process_alive(lock_owner(&raw)?)
        {
            return Err("another install or uninstall is running".into());
        }
        check(home, &guard_path)?;
        let guard = crate::memory::MemoryLock::acquire(&guard_path)?;
        let contents =
            serde_json::to_vec(&json!({"pid":std::process::id(),"token":runtime::nonce()}))
                .map_err(|_| "cannot encode install lock")?;
        for _ in 0..2 {
            let mut options = fs::OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            match options.open(&path) {
                Ok(mut file) => {
                    file.write_all(&contents)
                        .map_err(|_| "cannot persist install lock")?;
                    return Ok(Self {
                        path,
                        contents,
                        _guard: guard,
                    });
                }
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    let raw = runtime::read_limited(&path, 4096)?;
                    let pid = lock_owner(&raw)?;
                    if process_alive(pid) {
                        return Err("another install or uninstall is running".into());
                    }
                    if runtime::read_limited(&path, 4096)? == raw {
                        fs::remove_file(&path).map_err(|_| "cannot retire stale install lock")?;
                    }
                }
                Err(_) => return Err("cannot acquire install lock".into()),
            }
        }
        Err("another install or uninstall is running".into())
    }
}
impl Drop for InstallLock {
    fn drop(&mut self) {
        if fs::read(&self.path).ok().as_deref() == Some(self.contents.as_slice()) {
            let _ = fs::remove_file(&self.path);
        }
    }
}

fn execute(plan: &Plan<'_>) -> Result<()> {
    execute_with(plan, &mut runtime::atomic_private)
}

#[cfg(windows)]
mod windows_removal {
    use super::*;
    use std::io::{self, Read};
    use std::os::windows::{fs::OpenOptionsExt, io::AsRawHandle};
    use windows_sys::Win32::Storage::FileSystem::*;

    fn open(path: &Path) -> io::Result<fs::File> {
        fs::OpenOptions::new()
            .read(true)
            .access_mode(DELETE | FILE_GENERIC_READ)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
            .open(path)
    }

    fn identity(file: &fs::File) -> io::Result<(u32, u32, u32)> {
        let mut info = BY_HANDLE_FILE_INFORMATION::default();
        if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0 {
            return Err(io::Error::last_os_error());
        }
        if info.dwFileAttributes & (FILE_ATTRIBUTE_REPARSE_POINT | FILE_ATTRIBUTE_DIRECTORY) != 0 {
            return Err(io::Error::other("owned executable is not a regular file"));
        }
        Ok((
            info.dwVolumeSerialNumber,
            info.nFileIndexHigh,
            info.nFileIndexLow,
        ))
    }

    fn rename_stream(file: &fs::File, name: &str, replace: bool) -> io::Result<()> {
        let name = name.encode_utf16().collect::<Vec<_>>();
        let size = std::mem::offset_of!(FILE_RENAME_INFO, FileName) + name.len() * 2;
        let mut buffer = vec![0usize; size.div_ceil(std::mem::size_of::<usize>())];
        let info = buffer.as_mut_ptr().cast::<FILE_RENAME_INFO>();
        let renamed = unsafe {
            (*info).Anonymous.ReplaceIfExists = replace;
            (*info).FileNameLength = (name.len() * 2) as u32;
            std::ptr::copy_nonoverlapping(
                name.as_ptr(),
                std::ptr::addr_of_mut!((*info).FileName).cast::<u16>(),
                name.len(),
            );
            SetFileInformationByHandle(
                file.as_raw_handle(),
                FileRenameInfo,
                info.cast(),
                size as u32,
            )
        };
        if renamed == 0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(())
        }
    }

    fn dispose(file: &fs::File) -> io::Result<()> {
        let info = FILE_DISPOSITION_INFO_EX {
            Flags: FILE_DISPOSITION_FLAG_DELETE | FILE_DISPOSITION_FLAG_POSIX_SEMANTICS,
        };
        if unsafe {
            SetFileInformationByHandle(
                file.as_raw_handle(),
                FileDispositionInfoEx,
                (&info as *const FILE_DISPOSITION_INFO_EX).cast(),
                std::mem::size_of_val(&info) as u32,
            )
        } == 0
        {
            Err(io::Error::last_os_error())
        } else {
            Ok(())
        }
    }

    fn remove_stream(
        path: &Path,
        stream: fs::File,
        name: &str,
        dispose: &mut dyn FnMut(&fs::File) -> io::Result<()>,
        recovery_failed: &mut bool,
    ) -> io::Result<()> {
        let original = identity(&stream)?;
        rename_stream(&stream, name, false)?;
        let result = (|| {
            let file = open(path)?;
            if identity(&file)? != original {
                return Err(io::Error::other("owned executable identity changed"));
            }
            dispose(&file)?;
            drop(file);
            match fs::symlink_metadata(path) {
                Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
                _ => Err(io::Error::other(
                    "owned executable removal was not completed",
                )),
            }
        })();
        if let Err(error) = result {
            if let Err(restore) = rename_stream(&stream, "::$DATA", true) {
                *recovery_failed = true;
                return Err(io::Error::other(format!(
                    "{error}; cannot restore executable stream {name}: {restore}"
                )));
            }
            return Err(error);
        }
        Ok(())
    }

    pub(super) fn remove_current(
        path: &Path,
        expected: &[u8],
        recovery_failed: &mut bool,
    ) -> io::Result<()> {
        let stream = open(path)?;
        let current = fs::File::open(std::env::current_exe()?)?;
        if identity(&stream)? != identity(&current)? {
            return Err(io::Error::other("owned file is not the running executable"));
        }
        let mut bytes = Vec::new();
        (&stream)
            .take(expected.len() as u64 + 1)
            .read_to_end(&mut bytes)?;
        if bytes != expected {
            return Err(io::Error::other("owned executable changed before removal"));
        }
        drop(current);
        remove_stream(
            path,
            stream,
            &format!(":exonous-delete-{}", runtime::nonce()),
            &mut dispose,
            recovery_failed,
        )
    }

    #[test]
    fn successful_disposition_removes_the_file_and_temporary_stream() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("runtime.exe");
        fs::write(&path, b"owned executable bytes").unwrap();
        let stream = open(&path).unwrap();
        let mut recovery_failed = false;
        remove_stream(
            &path,
            stream,
            ":exonous-delete-test",
            &mut dispose,
            &mut recovery_failed,
        )
        .unwrap();
        assert!(!recovery_failed);
        assert_eq!(
            fs::symlink_metadata(&path).unwrap_err().kind(),
            io::ErrorKind::NotFound
        );
        assert!(open(&dir.path().join("runtime.exe:exonous-delete-test")).is_err());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    #[test]
    fn failed_disposition_restores_the_original_stream() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("runtime.exe");
        fs::write(&path, b"owned executable bytes").unwrap();
        let stream = open(&path).unwrap();
        let original = identity(&stream).unwrap();
        let mut recovery_failed = false;
        let error = remove_stream(
            &path,
            stream,
            ":exonous-delete-test",
            &mut |_| Err(io::Error::other("injected disposition failure")),
            &mut recovery_failed,
        )
        .unwrap_err();
        assert_eq!(error.to_string(), "injected disposition failure");
        assert!(!recovery_failed);
        assert_eq!(fs::read(&path).unwrap(), b"owned executable bytes");
        assert_eq!(identity(&open(&path).unwrap()).unwrap(), original);
        assert!(open(&dir.path().join("runtime.exe:exonous-delete-test")).is_err());
    }
}

fn remove_owned_file(
    path: &Path,
    _expected: &[u8],
    _recovery_failed: &mut bool,
) -> std::io::Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) => {
            #[cfg(windows)]
            if error.kind() == std::io::ErrorKind::PermissionDenied
                && fs::canonicalize(path).ok()
                    == std::env::current_exe().and_then(fs::canonicalize).ok()
            {
                return windows_removal::remove_current(path, _expected, _recovery_failed);
            }
            Err(error)
        }
    }
}

fn execute_with(plan: &Plan<'_>, write: &mut dyn FnMut(&Path, &[u8]) -> Result<()>) -> Result<()> {
    let _lock = InstallLock::acquire(plan.home)?;
    let mut previous_permissions = BTreeMap::new();
    for (relative, change) in &plan.changes {
        let path = contained(plan.home, relative)?;
        check(plan.home, &path)?;
        if read(&path)? != change.before {
            return Err(format!("{relative} changed during install; retry"));
        }
        if change.before.is_some() {
            previous_permissions.insert(
                relative,
                fs::metadata(&path)
                    .map_err(|_| "cannot snapshot installed permissions")?
                    .permissions(),
            );
        }
    }
    let ledger_path = plan.home.join(LEDGER);
    let original_ledger = read(&ledger_path)?;
    runtime::ensure_private_dir(
        plan.home,
        ledger_path.parent().ok_or("invalid ledger path")?,
    )?;
    let mut pending = plan.next.clone();
    pending.complete = false;
    for (path, entry) in &plan.previous.files {
        pending
            .files
            .entry(path.clone())
            .or_insert_with(|| entry.clone());
    }
    for entry in &plan.previous.json {
        if !pending
            .json
            .iter()
            .any(|next| next.path == entry.path && next.entries == entry.entries)
        {
            pending.json.push(entry.clone());
        }
    }
    runtime::atomic_private(
        &ledger_path,
        &serde_json::to_vec_pretty(&pending)
            .map_err(|_| "cannot encode pending ownership ledger")?,
    )?;
    let mut applied = Vec::new();
    let mut removal_recovery_failed = false;
    let result = (|| {
        for (relative, change) in &plan.changes {
            let path = contained(plan.home, relative)?;
            runtime::ensure_private_dir(plan.home, path.parent().ok_or("invalid install path")?)?;
            if change.backup
                && let Some(before) = &change.before
            {
                backup(plan.home, &path, before)?;
            }
            if let Some(bytes) = &change.after {
                write(&path, bytes)?;
                applied.push(relative);
                #[cfg(unix)]
                if change.executable {
                    use std::os::unix::fs::PermissionsExt;
                    fs::set_permissions(&path, fs::Permissions::from_mode(0o700))
                        .map_err(|_| "cannot set installed executable mode")?;
                }
            } else if path.exists() {
                remove_owned_file(
                    &path,
                    change
                        .before
                        .as_deref()
                        .ok_or("missing owned file snapshot")?,
                    &mut removal_recovery_failed,
                )
                .map_err(|error| format!("cannot remove owned file {relative}: {error}"))?;
                applied.push(relative);
            }
        }
        runtime::atomic_private(
            &ledger_path,
            &serde_json::to_vec_pretty(&plan.next).map_err(|_| "cannot encode ownership ledger")?,
        )
    })();
    if let Err(error) = result {
        let mut restored = !removal_recovery_failed;
        for relative in applied.into_iter().rev() {
            let change = &plan.changes[relative];
            let path = contained(plan.home, relative)?;
            if read(&path)? != change.after {
                restored = false;
                continue;
            }
            let rollback = if let Some(before) = &change.before {
                runtime::atomic_private(&path, before).and_then(|()| {
                    fs::set_permissions(&path, previous_permissions[relative].clone())
                        .map_err(|_| "cannot restore installed permissions".into())
                })
            } else {
                fs::remove_file(&path).map_err(|_| "cannot remove newly installed file".to_owned())
            };
            if rollback.is_err() {
                restored = false;
            }
        }
        if restored {
            if let Some(bytes) = original_ledger {
                runtime::atomic_private(&ledger_path, &bytes)?;
            } else {
                fs::remove_file(&ledger_path).map_err(|_| "cannot retire rolled-back ledger")?;
            }
            return Err(format!("{error}; previous install restored"));
        }
        return Err(format!(
            "{error}; rollback incomplete; recoverable ownership ledger retained"
        ));
    }
    Ok(())
}

pub fn uninstall(home: &Path, _cwd: &Path, args: &[String]) -> Result<String> {
    let opts = options(args)?;
    let assets = assets_root()?;
    guard(home, &assets, &opts)?;
    if !opts.yes && !opts.dry {
        return Err("uninstall requires --yes (or --dry-run); no files changed".into());
    }
    let mut plan = Plan::new(home)?;
    let mut kept = Vec::new();
    for entry in plan.previous.json.clone() {
        if let Some(raw) = text(plan.current(&entry.path)?)? {
            let (next, _) = settings::merge_json(Some(&raw), &[], &entry.entries, false)?;
            plan.change(&entry.path, Some(next.into_bytes()), false, true)?;
        }
    }
    for entry in plan.previous.sections.clone() {
        let Some(raw) = text(plan.current(&entry.path)?)? else {
            continue;
        };
        let removed = settings::remove_section(&raw, &entry.marker)?;
        let Some(body) = removed.body else { continue };
        let (ours, foreign) = if entry.marker == "hash" {
            settings::split_mcp(&body, &entry.owned)
        } else {
            (body.clone(), String::new())
        };
        let mut outside = removed.outside;
        if !foreign.trim().is_empty() {
            outside.push_str(&format!("\n{foreign}"));
        }
        let edited = hash(ours.replace("\r\n", "\n").as_bytes()) != entry.hash;
        plan.change(
            &entry.path,
            if outside.is_empty() && entry.created {
                None
            } else {
                Some(outside.into_bytes())
            },
            false,
            edited,
        )?;
    }
    for (relative, entry) in plan.previous.files.clone() {
        if let Some(bytes) = plan.current(&relative)? {
            if hash(&bytes) == entry.hash {
                plan.change(&relative, None, false, false)?;
            } else {
                kept.push(relative);
            }
        }
    }
    plan.next = Ledger::default();
    let count = plan.changes.len();
    if !opts.dry {
        execute(&plan)?;
        fs::remove_file(home.join(LEDGER)).map_err(|_| "cannot retire ownership ledger")?;
    }
    Ok(format!(
        "{}uninstall: {count} owned changes; kept user config, vault, backups and {} edited files{}\n",
        if opts.dry { "DRY RUN: " } else { "" },
        kept.len(),
        if kept.is_empty() {
            String::new()
        } else {
            format!(": {}", kept.join(", "))
        }
    ))
}

pub fn doctor(home: &Path, _cwd: &Path, args: &[String]) -> Result<String> {
    let opts = options(args)?;
    let ledger = ledger(home)?;
    let mut checks = Vec::new();
    let mut failed_tools = BTreeSet::new();
    checks.push(
        json!({"name":"native install complete","ok":ledger.complete,"fix":"exonous install"}),
    );
    for (relative, entry) in &ledger.files {
        let path = contained(home, relative)?;
        check(home, &path)?;
        let ok = read(&path)?.is_some_and(|bytes| hash(&bytes) == entry.hash);
        if !ok {
            failed_tools.insert(entry.tool.clone());
        }
        checks.push(json!({"name":relative,"ok":ok,"fix":"exonous install"}));
    }
    for record in &ledger.json {
        let path = contained(home, &record.path)?;
        check(home, &path)?;
        let raw = text(read(&path)?)?;
        let config = raw
            .as_deref()
            .map(|raw| settings::parse_json(Some(raw), false))
            .transpose()?
            .unwrap_or(Value::Null);
        for entry in &record.entries {
            let mut value = &config;
            for key in &entry.path {
                value = value.get(key).unwrap_or(&Value::Null);
            }
            let ok = if entry.array {
                value
                    .as_array()
                    .is_some_and(|list| list.contains(&entry.value))
            } else {
                value == &entry.value
            };
            if !ok {
                failed_tools.insert(record.tool.clone());
            }
            checks.push(json!({"name":format!("{}:{}",record.path,entry.path.join(".")),"ok":ok,"fix":"exonous install"}));
        }
    }
    for entry in &ledger.sections {
        let path = contained(home, &entry.path)?;
        check(home, &path)?;
        let raw = text(read(&path)?)?.unwrap_or_default();
        let section = settings::remove_section(&raw, &entry.marker)?;
        let ok = section.body.is_some_and(|body| {
            let body = if entry.marker == "hash" {
                settings::split_mcp(&body, &entry.owned).0
            } else {
                body
            };
            hash(body.replace("\r\n", "\n").as_bytes()) == entry.hash
        });
        if !ok {
            failed_tools.insert(entry.tool.clone());
        }
        checks.push(
            json!({"name":format!("{}:owned section",entry.path),"ok":ok,"fix":"exonous install"}),
        );
    }
    let mut adapters = Vec::new();
    for (id, path, gate) in TOOLS {
        let installed = ledger.tools.iter().any(|tool| tool == id);
        adapters.push(json!({"id":id,"detected":home.join(path).exists(),"installed":installed,"gate":if *gate=="hard" && installed && ledger.complete && !failed_tools.contains(*id) { "registered; host approval/load not verified" } else if *gate=="hard" { "not established" } else { gate }}));
    }
    let failed = checks.iter().filter(|entry| entry["ok"] == false).count();
    let report = json!({"runtime":"rust","complete":failed==0,"checks":checks,"adapters":adapters,"warnings":["Host hook approval and loading require host verification; registration does not prove enforcement.","External MCP availability, plugin host load and update transport are not verified by this read-only check."]});
    let output = if opts.json {
        format!(
            "{}\n",
            serde_json::to_string_pretty(&report).map_err(|_| "cannot encode doctor report")?
        )
    } else {
        format!(
            "native doctor: {} checks, {failed} problems\n{}\nHost hook approval/load is not verified.\n",
            checks.len(),
            adapters
                .iter()
                .map(|entry| format!(
                    "{}: {}",
                    entry["id"].as_str().unwrap_or(""),
                    entry["gate"].as_str().unwrap_or("")
                ))
                .collect::<Vec<_>>()
                .join("\n")
        )
    };
    if failed > 0 { Err(output) } else { Ok(output) }
}

#[cfg(test)]
mod transaction_tests {
    use super::*;
    #[test]
    fn stale_lock_recovery_remains_exclusive_across_contenders() {
        use std::sync::{
            Arc, Barrier,
            atomic::{AtomicUsize, Ordering},
        };
        let home = tempfile::tempdir().unwrap();
        runtime::ensure_private_dir(home.path(), &runtime::state(home.path())).unwrap();
        runtime::atomic_private(
            &runtime::state(home.path()).join("install.lock"),
            br#"{"pid":9999999,"token":"dead"}"#,
        )
        .unwrap();
        let barrier = Arc::new(Barrier::new(8));
        let active = Arc::new(AtomicUsize::new(0));
        let mut threads = Vec::new();
        for _ in 0..8 {
            let path = home.path().to_owned();
            let barrier = barrier.clone();
            let active = active.clone();
            threads.push(std::thread::spawn(move || {
                barrier.wait();
                let _lock = InstallLock::named(&path, "install.lock").unwrap();
                assert_eq!(active.fetch_add(1, Ordering::SeqCst), 0);
                std::thread::sleep(std::time::Duration::from_millis(10));
                assert_eq!(active.fetch_sub(1, Ordering::SeqCst), 1);
            }));
        }
        for thread in threads {
            thread.join().unwrap();
        }
        assert!(
            runtime::state(home.path())
                .join("install.lock.guard")
                .is_file()
        );
        assert!(!runtime::state(home.path()).join("install.lock").exists());
    }
    #[test]
    fn failed_activation_restores_files_and_previous_ledger() {
        let home = tempfile::tempdir().unwrap();
        fs::write(home.path().join("a"), "original").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(home.path().join("a"), fs::Permissions::from_mode(0o700)).unwrap();
        }
        let mut plan = Plan::new(home.path()).unwrap();
        plan.file("a", b"updated".to_vec(), "shared", false)
            .unwrap();
        plan.file("b", b"new".to_vec(), "shared", false).unwrap();
        let mut calls = 0;
        let error = execute_with(&plan, &mut |path, bytes| {
            calls += 1;
            if calls == 2 {
                return Err("injected write failure".into());
            }
            runtime::atomic_private(path, bytes)
        })
        .unwrap_err();
        assert!(error.contains("previous install restored"));
        assert_eq!(
            fs::read_to_string(home.path().join("a")).unwrap(),
            "original"
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(home.path().join("a"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o700
            );
        }
        assert!(!home.path().join("b").exists());
        assert!(!home.path().join(LEDGER).exists());
    }
}
