use crate::{memory::MemoryLock, payload::Decision, runtime, vault};
use chrono::Utc;
use regex::Regex;
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
    sync::OnceLock,
};
use unicode_normalization::UnicodeNormalization;

const MAX_NOTE: u64 = 2 * 1024 * 1024;
const USAGE: &str = "project-memory <search|show|list|add|update|remove|validate> [flags]";
const STOP: &str = "a an and are as at be by de do da das dos e em for from how in is it na no o of on or os para por que the to um uma was what when where which with";

pub(crate) struct CliError {
    pub code: i32,
    pub message: String,
}
pub(crate) type CliResult<T> = std::result::Result<T, CliError>;
impl From<String> for CliError {
    fn from(message: String) -> Self {
        Self { code: 1, message }
    }
}
impl From<&str> for CliError {
    fn from(message: &str) -> Self {
        Self {
            code: 1,
            message: message.into(),
        }
    }
}
pub(crate) fn fail(code: i32, message: impl Into<String>) -> CliError {
    CliError {
        code,
        message: message.into(),
    }
}
pub(crate) fn output(code: i32, stdout: String) -> Decision {
    Decision {
        code,
        stdout,
        stderr: String::new(),
    }
}
pub(crate) fn result(result: CliResult<Decision>) -> Decision {
    result.unwrap_or_else(|error| Decision {
        code: error.code,
        stdout: String::new(),
        stderr: format!("{}\n", error.message),
    })
}

#[derive(Default)]
pub(crate) struct Arguments {
    pub positional: Vec<String>,
    pub flags: BTreeMap<String, Vec<Option<String>>>,
}
impl Arguments {
    pub fn parse(args: &[String]) -> Self {
        let mut result = Self::default();
        let mut index = 0;
        while index < args.len() {
            let arg = &args[index];
            if let Some(flag) = arg.strip_prefix("--") {
                let (key, value) = if let Some((key, value)) = flag.split_once('=') {
                    (key, Some(value.to_string()))
                } else if args
                    .get(index + 1)
                    .is_some_and(|arg| !arg.starts_with("--"))
                {
                    index += 1;
                    (flag, Some(args[index].clone()))
                } else {
                    (flag, None)
                };
                result.flags.entry(key.to_string()).or_default().push(value);
            } else {
                result.positional.push(arg.clone());
            }
            index += 1;
        }
        result
    }
    pub fn one(&self, key: &str) -> Option<&str> {
        self.flags
            .get(key)
            .and_then(|values| values.last())
            .and_then(|value| value.as_deref())
    }
    pub fn many(&self, key: &str) -> Vec<String> {
        self.flags
            .get(key)
            .map(|values| values.iter().filter_map(Clone::clone).collect())
            .unwrap_or_default()
    }
    pub fn has(&self, key: &str) -> bool {
        self.flags.contains_key(key)
    }
}

pub(crate) struct Repo {
    pub root: PathBuf,
    pub name: String,
    pub main: PathBuf,
}
pub(crate) fn repo(cwd: &Path) -> runtime::Result<Repo> {
    let root = PathBuf::from(runtime::git(cwd, &["rev-parse", "--show-toplevel"])?);
    let list = runtime::git(&root, &["worktree", "list", "--porcelain"])?;
    let main = list
        .lines()
        .next()
        .and_then(|line| line.strip_prefix("worktree "))
        .map(PathBuf::from)
        .unwrap_or_else(|| root.clone());
    let raw = main
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("invalid repository name")?;
    let name = raw.strip_suffix(".git").unwrap_or(raw).to_string();
    Ok(Repo { root, name, main })
}

struct Context {
    repo: Option<Repo>,
    root: PathBuf,
    dir: PathBuf,
}
fn context(home: &Path, cwd: &Path, args: &Arguments) -> CliResult<Context> {
    let repo = repo(cwd).ok();
    let project = args
        .one("project")
        .or_else(|| repo.as_ref().map(|repo| repo.name.as_str()))
        .ok_or_else(|| fail(2, "Not inside a git repo: pass --project <name>."))?;
    if project.is_empty()
        || project == "."
        || project == ".."
        || project.contains(['/', '\\', '\0'])
    {
        return Err(fail(2, "Invalid project name."));
    }
    let raw = std::env::var("PROJECT_MEMORY_VAULT")
        .ok()
        .filter(|raw| !raw.is_empty());
    let root = if let Some(raw) = raw {
        vault::local_path(home, cwd, &raw)?
    } else {
        let config = vault::read_config(home).map_err(|error| {
            fail(
                3,
                format!("Invalid {}: {error}", vault::config_path(home).display()),
            )
        })?;
        match &config["vault"] {
            Value::String(raw) if !raw.is_empty() => vault::local_path(home, cwd, raw)?,
            Value::Null | Value::String(_) => {
                return Err(fail(
                    3,
                    "No vault configured. Run `exonous vault detect` (then `exonous vault set <path>`), or set PROJECT_MEMORY_VAULT.",
                ));
            }
            _ => {
                return Err(fail(
                    3,
                    format!(
                        "Invalid {}: \"vault\" must be a string",
                        vault::config_path(home).display()
                    ),
                ));
            }
        }
    };
    if !root.is_dir() {
        return Err(fail(3, format!("Vault not found: {}", root.display())));
    }
    let dir = root.join(project);
    vault::no_symlink_children(&root, &dir)?;
    Ok(Context { repo, root, dir })
}

fn scalar(raw: &str) -> String {
    let value = raw.trim();
    if value.starts_with('"') && value.ends_with('"') {
        serde_json::from_str::<String>(value).unwrap_or_else(|_| value[1..value.len() - 1].into())
    } else if value.starts_with('\'') && value.ends_with('\'') && value.len() > 1 {
        value[1..value.len() - 1].into()
    } else {
        value.into()
    }
}

pub fn parse_note(text: &str) -> (Map<String, Value>, String) {
    static FRONT: OnceLock<Regex> = OnceLock::new();
    static ITEM: OnceLock<Regex> = OnceLock::new();
    static PAIR: OnceLock<Regex> = OnceLock::new();
    let Some(found) = FRONT
        .get_or_init(|| Regex::new(r"(?s)^---\r?\n(.*?)\r?\n---\r?\n?").unwrap())
        .captures(text)
    else {
        return (Map::new(), text.into());
    };
    let item = ITEM.get_or_init(|| Regex::new(r"^\s+-\s+(.*)$").unwrap());
    let pair = PAIR.get_or_init(|| Regex::new(r"^([\w-]+):\s*(.*)$").unwrap());
    let mut meta = Map::new();
    let mut list = None::<String>;
    for line in found[1].lines() {
        if let Some(item) = item.captures(line)
            && let Some(key) = &list
        {
            meta.get_mut(key)
                .and_then(Value::as_array_mut)
                .unwrap()
                .push(json!(scalar(&item[1])));
            continue;
        }
        let Some(pair) = pair.captures(line) else {
            continue;
        };
        let key = pair[1].to_string();
        let raw = pair[2].trim();
        list = None;
        let value = if raw.is_empty() {
            list = Some(key.clone());
            json!([])
        } else if raw.starts_with('[') && raw.ends_with(']') {
            json!(
                raw[1..raw.len() - 1]
                    .split(',')
                    .map(scalar)
                    .filter(|value| !value.is_empty())
                    .collect::<Vec<_>>()
            )
        } else {
            json!(scalar(raw))
        };
        meta.insert(key, value);
    }
    (meta, text[found.get(0).unwrap().end()..].into())
}

fn quote(value: &str) -> String {
    static PLAIN: OnceLock<Regex> = OnceLock::new();
    if PLAIN
        .get_or_init(|| Regex::new(r"^[A-Za-z0-9_./][A-Za-z0-9_ ./@#:+-]*$").unwrap())
        .is_match(value)
        && !value.contains(": ")
        && !value.contains(" #")
        && !value.ends_with(char::is_whitespace)
    {
        value.into()
    } else {
        json!(value).to_string()
    }
}
pub fn serialize_note(meta: &Map<String, Value>, body: &str) -> String {
    let mut lines = vec!["---".into()];
    for (key, value) in meta {
        if let Some(values) = value.as_array() {
            if !values.is_empty() {
                lines.push(format!("{key}:"));
                lines.extend(
                    values
                        .iter()
                        .map(|value| format!("  - {}", quote(value.as_str().unwrap_or("")))),
                );
            }
        } else if let Some(value) = value.as_str().filter(|value| !value.is_empty()) {
            lines.push(format!("{key}: {}", quote(value)));
        }
    }
    lines.extend(["---".into(), String::new()]);
    format!("{}{}\n", lines.join("\n"), body.trim())
}

struct Note {
    path: PathBuf,
    id: String,
    kind: String,
    title: String,
    status: String,
    tags: Vec<String>,
    links: Vec<String>,
    evidence: Vec<String>,
    meta: Map<String, Value>,
    body: String,
}
fn strings(meta: &Map<String, Value>, key: &str) -> Vec<String> {
    meta.get(key)
        .map(|value| {
            if let Some(values) = value.as_array() {
                values
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect()
            } else {
                value
                    .as_str()
                    .map(|value| vec![value.into()])
                    .unwrap_or_default()
            }
        })
        .unwrap_or_default()
}
fn field(meta: &Map<String, Value>, key: &str) -> String {
    meta.get(key).and_then(Value::as_str).unwrap_or("").into()
}
fn walk(dir: &Path, out: &mut Vec<PathBuf>) -> runtime::Result<()> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|_| "Cannot read memory directory")? {
        let entry = entry.map_err(|_| "Cannot read memory entry")?;
        let kind = entry
            .file_type()
            .map_err(|_| "Cannot inspect memory entry")?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if kind.is_symlink() {
            return Err("Memory symlinks are not allowed".into());
        }
        if kind.is_dir() {
            if !name.starts_with('.')
                && !matches!(
                    name.as_ref(),
                    "node_modules" | ".obsidian" | ".trash" | ".git"
                )
            {
                walk(&entry.path(), out)?;
            }
        } else if kind.is_file()
            && name.ends_with(".md")
            && entry.metadata().map_err(|_| "Cannot inspect note")?.len() <= MAX_NOTE
        {
            out.push(entry.path());
        }
    }
    Ok(())
}
fn notes(dir: &Path) -> runtime::Result<Vec<Note>> {
    let mut files = Vec::new();
    walk(dir, &mut files)?;
    files.sort();
    files
        .into_iter()
        .map(|path| {
            let raw = String::from_utf8(vault::read_regular(&path, MAX_NOTE)?)
                .map_err(|_| "Memory is not UTF-8")?;
            let (meta, body) = parse_note(&raw);
            let relative = path
                .strip_prefix(dir)
                .map_err(|_| "Memory outside vault")?
                .to_string_lossy()
                .replace('\\', "/");
            let id = if field(&meta, "id").is_empty() {
                relative
            } else {
                field(&meta, "id")
            };
            let kind = field(&meta, "kind");
            let kind = if matches!(kind.as_str(), "adr" | "plan" | "doc" | "session") {
                kind
            } else {
                "note".into()
            };
            let title = if field(&meta, "title").is_empty() {
                path.file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned()
            } else {
                field(&meta, "title")
            };
            Ok(Note {
                path,
                id,
                kind,
                title,
                status: field(&meta, "status"),
                tags: strings(&meta, "tags"),
                links: strings(&meta, "links"),
                evidence: strings(&meta, "evidence"),
                meta,
                body,
            })
        })
        .collect()
}
fn find<'a>(notes: &'a [Note], id: &str) -> CliResult<&'a Note> {
    notes
        .iter()
        .find(|note| note.id == id)
        .ok_or_else(|| fail(1, format!("No memory with id \"{id}\".")))
}

fn tokenize(text: &str) -> Vec<String> {
    let normalized = text
        .to_lowercase()
        .nfd()
        .filter(|ch| !('\u{300}'..='\u{36f}').contains(ch))
        .collect::<String>();
    normalized
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .filter(|term| term.len() > 1 && !STOP.split(' ').any(|word| word == *term))
        .map(str::to_owned)
        .collect()
}
fn rank<'a>(notes: &'a [Note], query: &str) -> Vec<(&'a Note, f64)> {
    let terms = tokenize(query).into_iter().collect::<BTreeSet<_>>();
    if terms.is_empty() {
        return Vec::new();
    }
    let fields = notes
        .iter()
        .map(|note| {
            [
                tokenize(&note.title),
                tokenize(&note.tags.join(" ")),
                tokenize(&note.links.join(" ")),
                tokenize(&note.body),
            ]
        })
        .collect::<Vec<_>>();
    let avg = fields.iter().map(|fields| fields[3].len()).sum::<usize>() as f64
        / notes.len().max(1) as f64;
    let avg = if avg == 0.0 { 1.0 } else { avg };
    let mut ranked = Vec::new();
    for (index, note) in notes.iter().enumerate() {
        let mut score = 0.0;
        for term in &terms {
            let df = fields
                .iter()
                .filter(|fields| fields.iter().any(|field| field.contains(term)))
                .count() as f64;
            let idf = (1.0 + (notes.len() as f64 - df + 0.5) / (df + 0.5)).ln();
            for (field, weight) in [(0, 3.0), (1, 2.5), (2, 1.5)] {
                if fields[index][field].contains(term) {
                    score += weight * idf;
                }
            }
            let tf = fields[index][3].iter().filter(|word| *word == term).count() as f64;
            if tf > 0.0 {
                let norm = 1.2 * (1.0 - 0.75 + 0.75 * fields[index][3].len() as f64 / avg);
                score += idf * (tf * 2.2) / (tf + norm);
            }
        }
        if score > 0.0 {
            ranked.push((note, score));
        }
    }
    ranked.sort_by(|a, b| b.1.total_cmp(&a.1));
    ranked
}
fn header(note: &Note) -> String {
    format!(
        "{}  [{}{}]  {}",
        note.id,
        note.kind,
        if note.status.is_empty() {
            String::new()
        } else {
            format!(" ({})", note.status)
        },
        note.title
    )
}
fn full(note: &Note) -> String {
    let mut out = format!("## {}\n", header(note));
    for (key, values) in [
        ("tags", &note.tags),
        ("links", &note.links),
        ("evidence", &note.evidence),
    ] {
        if !values.is_empty() {
            out.push_str(&format!("{key}: {}\n", values.join(", ")));
        }
    }
    out.push_str(&format!("\n{}\n\n", note.body.trim()));
    out
}
fn first_line(body: &str) -> String {
    let line = body
        .lines()
        .map(|line| line.trim_start_matches('#').trim())
        .find(|line| !line.is_empty() && *line != "---")
        .unwrap_or("");
    if line.chars().count() > 120 {
        format!("{}...", line.chars().take(117).collect::<String>())
    } else {
        line.into()
    }
}

struct Evidence {
    path: String,
    start: usize,
    end: usize,
    hash: Option<String>,
}
fn evidence(spec: &str) -> Option<Evidence> {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    let found = PATTERN
        .get_or_init(|| Regex::new(r"^(.+):(\d+)(?:-(\d+))?(?:#([0-9a-f]{8}))?$").unwrap())
        .captures(spec)?;
    let start = found[2].parse().ok()?;
    let end = found
        .get(3)
        .map_or(Some(start), |value| value.as_str().parse().ok())?;
    if start == 0 || end < start {
        return None;
    }
    Some(Evidence {
        path: found[1].into(),
        start,
        end,
        hash: found.get(4).map(|value| value.as_str().into()),
    })
}
fn range_hash(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))[..8].into()
}
fn slice(text: &str, start: usize, end: usize) -> String {
    text.split('\n')
        .skip(start.saturating_sub(1))
        .take(end.saturating_sub(start) + 1)
        .collect::<Vec<_>>()
        .join("\n")
}
fn repo_file(root: &Path, raw: &str) -> runtime::Result<PathBuf> {
    let path = vault::local_path(root, root, raw)?;
    if !path.starts_with(root) {
        return Err("Code reference escapes repository".into());
    }
    vault::no_symlink_children(root, &path)?;
    Ok(path)
}
fn anchor(repo: Option<&Repo>, spec: &str) -> CliResult<String> {
    let ev = evidence(spec)
        .ok_or_else(|| fail(2, format!("Bad evidence \"{spec}\": expected path:L1-L2.")))?;
    let repo =
        repo.ok_or_else(|| fail(2, "Evidence needs a git repo (run inside the project)."))?;
    let file = repo_file(&repo.root, &ev.path)?;
    if !file.exists() {
        return Err(fail(1, format!("Evidence file not found: {}", ev.path)));
    }
    let raw = String::from_utf8(vault::read_regular(&file, 16 * 1024 * 1024)?)
        .map_err(|_| "Evidence is not UTF-8")?;
    let total = raw.split('\n').count();
    if ev.end > total {
        return Err(fail(
            1,
            format!(
                "Evidence {spec} is past the end of {} ({total} lines).",
                ev.path
            ),
        ));
    }
    Ok(format!(
        "{}:{}-{}#{}",
        ev.path,
        ev.start,
        ev.end,
        range_hash(&slice(&raw, ev.start, ev.end))
    ))
}
fn check_link(link: &str) -> CliResult<String> {
    if link
        .strip_prefix("file:")
        .or_else(|| link.strip_prefix("symbol:"))
        .is_none_or(str::is_empty)
    {
        Err(fail(
            2,
            format!("Bad link \"{link}\": expected file:<path> or symbol:<name>."),
        ))
    } else {
        Ok(link.into())
    }
}
fn body(cwd: &Path, args: &Arguments) -> CliResult<Option<String>> {
    if let Some(file) = args.one("body-file") {
        let file = if Path::new(file).is_absolute() {
            PathBuf::from(file)
        } else {
            cwd.join(file)
        };
        return Ok(Some(
            String::from_utf8(vault::read_regular(&file, MAX_NOTE)?)
                .map_err(|_| "Body is not UTF-8")?,
        ));
    }
    Ok(args.one("body").map(str::to_owned))
}
fn write_note(ctx: &Context, path: &Path, meta: &Map<String, Value>, body: &str) -> CliResult<()> {
    vault::no_symlink_children(&ctx.root, path)?;
    fs::create_dir_all(path.parent().ok_or("Invalid note path")?)
        .map_err(|_| "Cannot create memory directory")?;
    vault::no_symlink_children(&ctx.root, path)?;
    runtime::atomic_private(path, serialize_note(meta, body).as_bytes())?;
    Ok(())
}
fn unique(values: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut out = Vec::new();
    for value in values {
        if !out.contains(&value) {
            out.push(value);
        }
    }
    out
}

fn validate(repo: &Repo, note: &Note) -> Vec<String> {
    let mut problems = Vec::new();
    for spec in &note.evidence {
        let Some(ev) = evidence(spec) else {
            problems.push(format!("bad evidence {spec}"));
            continue;
        };
        let file = match repo_file(&repo.root, &ev.path) {
            Ok(file) => file,
            Err(_) => {
                problems.push(format!("missing file {}", ev.path));
                continue;
            }
        };
        if !file.exists() {
            problems.push(format!("missing file {}", ev.path));
            continue;
        }
        if let Some(hash) = ev.hash {
            let raw = match vault::read_regular(&file, 16 * 1024 * 1024).and_then(|raw| {
                String::from_utf8(raw).map_err(|_| "Invalid evidence encoding".into())
            }) {
                Ok(raw) => raw,
                Err(_) => {
                    problems.push(format!("unreadable file {}", ev.path));
                    continue;
                }
            };
            if range_hash(&slice(&raw, ev.start, ev.end)) != hash {
                let lines = raw.split('\n').collect::<Vec<_>>();
                let span = ev.end - ev.start + 1;
                let moved = (1..=lines.len().saturating_sub(span) + 1)
                    .find(|start| range_hash(&slice(&raw, *start, *start + span - 1)) == hash);
                problems.push(match moved {
                    Some(start) => format!(
                        "moved {}:{}-{} → {}-{}",
                        ev.path,
                        ev.start,
                        ev.end,
                        start,
                        start + span - 1
                    ),
                    None => format!("drift {}:{}-{}", ev.path, ev.start, ev.end),
                });
            }
        }
    }
    for link in &note.links {
        if let Some(file) = link.strip_prefix("file:") {
            if repo_file(&repo.root, file).map_or(true, |file| !file.exists()) {
                problems.push(format!("unresolved {link}"));
            }
        } else if let Some(symbol) = link.strip_prefix("symbol:")
            && runtime::git(
                &repo.root,
                &["grep", "-I", "-q", "-w", "-F", "-e", symbol, "--", "."],
            )
            .is_err()
        {
            problems.push(format!("unresolved {link}"));
        }
    }
    problems
}

fn run(home: &Path, cwd: &Path, args: &[String]) -> CliResult<Decision> {
    let Some(command) = args.first().map(String::as_str) else {
        return Ok(output(0, format!("{USAGE}\n")));
    };
    if !matches!(
        command,
        "search" | "show" | "list" | "add" | "update" | "remove" | "validate"
    ) {
        return Err(fail(2, USAGE));
    }
    let args = Arguments::parse(&args[1..]);
    let ctx = context(home, cwd, &args)?;
    let writing = matches!(command, "add" | "update" | "remove");
    let _lock = if writing {
        vault::no_symlink_children(&ctx.root, &ctx.dir)?;
        fs::create_dir_all(&ctx.dir).map_err(|_| "Cannot create project memory")?;
        Some(MemoryLock::acquire(&ctx.dir.join(".project-memory.lock"))?)
    } else {
        None
    };
    let notes = notes(&ctx.dir)?;
    let mut out = String::new();
    match command {
        "search" => {
            let query = args.positional.join(" ");
            if query.is_empty() {
                return Err(fail(2, USAGE));
            }
            let selected = notes
                .into_iter()
                .filter(|note| args.one("kind").is_none_or(|kind| kind == note.kind))
                .collect::<Vec<_>>();
            let limit = args
                .one("limit")
                .and_then(|raw| raw.parse::<usize>().ok())
                .filter(|limit| *limit > 0)
                .unwrap_or(8);
            for (note, score) in rank(&selected, &query).into_iter().take(limit) {
                if args.has("full") {
                    out.push_str(&full(note));
                } else {
                    out.push_str(&format!(
                        "{}  {score:.2}\n    {}\n",
                        header(note),
                        first_line(&note.body)
                    ));
                }
            }
            if out.is_empty() {
                out = "No matches.\n".into();
            }
        }
        "show" => {
            let id = args.positional.first().ok_or_else(|| fail(2, USAGE))?;
            out = full(find(&notes, id)?);
        }
        "list" => {
            let mut selected = notes
                .iter()
                .filter(|note| {
                    note.kind != "note"
                        && args
                            .one("kind")
                            .map_or(note.kind != "session", |kind| kind == note.kind)
                        && args
                            .one("status")
                            .is_none_or(|status| status == note.status)
                })
                .collect::<Vec<_>>();
            selected.sort_by(|a, b| a.id.cmp(&b.id));
            for note in selected {
                out.push_str(&format!("{}\n", header(note)));
            }
            if out.is_empty() {
                out = "No memories.\n".into();
            }
        }
        "add" => {
            let kind = args
                .positional
                .first()
                .map(String::as_str)
                .filter(|kind| matches!(*kind, "adr" | "plan" | "doc"))
                .ok_or_else(|| fail(2, USAGE))?;
            let title = args
                .one("title")
                .filter(|title| !title.is_empty())
                .ok_or_else(|| fail(2, "add needs --title and --body/--body-file."))?;
            let body = body(cwd, &args)?
                .ok_or_else(|| fail(2, "add needs --title and --body/--body-file."))?;
            let max = notes
                .iter()
                .filter_map(|note| {
                    note.id
                        .strip_prefix(&format!("{kind}-"))
                        .and_then(|suffix| suffix.parse::<u64>().ok())
                })
                .max()
                .unwrap_or(0);
            let id = format!(
                "{kind}-{:04}",
                max.checked_add(1).ok_or("Memory id overflow")?
            );
            let tags = args.many("tag");
            let links = args
                .many("link")
                .iter()
                .map(|link| check_link(link))
                .collect::<CliResult<Vec<_>>>()?;
            let evidence = args
                .many("evidence")
                .iter()
                .map(|spec| anchor(ctx.repo.as_ref(), spec))
                .collect::<CliResult<Vec<_>>>()?;
            let meta = json!({"id":id,"kind":kind,"title":title,"status":args.one("status").unwrap_or(if kind=="plan"{"open"}else{"active"}),"created":Utc::now().format("%Y-%m-%d").to_string(),"tags":tags,"links":links,"evidence":evidence});
            let slug = tokenize(title)
                .into_iter()
                .take(6)
                .collect::<Vec<_>>()
                .join("-");
            let slug = if slug.is_empty() { "note" } else { &slug };
            let path = ctx
                .dir
                .join("memory")
                .join(kind)
                .join(format!("{id}-{slug}.md"));
            if path.exists() {
                return Err("Memory path conflict".into());
            }
            write_note(&ctx, &path, meta.as_object().unwrap(), &body)?;
            out = format!(
                "{id}  {}\n",
                path.strip_prefix(&ctx.dir)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/")
            );
        }
        "update" => {
            let id = args.positional.first().ok_or_else(|| fail(2, USAGE))?;
            let note = find(&notes, id)?;
            if note.kind == "note" {
                return Err(fail(
                    1,
                    format!("\"{}\" is not a project-memory note (no kind).", note.id),
                ));
            }
            let mut meta = note.meta.clone();
            for key in ["title", "status"] {
                if let Some(value) = args.one(key).filter(|value| !value.is_empty()) {
                    meta.insert(key.into(), json!(value));
                }
            }
            meta.insert(
                "updated".into(),
                json!(Utc::now().format("%Y-%m-%d").to_string()),
            );
            meta.insert(
                "tags".into(),
                json!(unique(
                    note.tags.iter().cloned().chain(args.many("add-tag"))
                )),
            );
            let links = args
                .many("add-link")
                .iter()
                .map(|link| check_link(link))
                .collect::<CliResult<Vec<_>>>()?;
            meta.insert(
                "links".into(),
                json!(unique(note.links.iter().cloned().chain(links))),
            );
            let dropped = args.many("remove-evidence");
            let mut specs = note
                .evidence
                .iter()
                .filter(|spec| {
                    !dropped.contains(spec)
                        && evidence(spec).is_none_or(|ev| !dropped.contains(&ev.path))
                })
                .cloned()
                .collect::<Vec<_>>();
            specs.extend(
                args.many("add-evidence")
                    .iter()
                    .map(|spec| anchor(ctx.repo.as_ref(), spec))
                    .collect::<CliResult<Vec<_>>>()?,
            );
            meta.insert("evidence".into(), json!(specs));
            write_note(
                &ctx,
                &note.path,
                &meta,
                &body(cwd, &args)?.unwrap_or_else(|| note.body.clone()),
            )?;
            out = format!("{} updated\n", note.id);
        }
        "remove" => {
            let id = args.positional.first().ok_or_else(|| fail(2, USAGE))?;
            let note = find(&notes, id)?;
            if note.kind == "note" {
                return Err(fail(
                    1,
                    format!(
                        "\"{}\" is not a project-memory note; remove it by hand.",
                        note.id
                    ),
                ));
            }
            if note.kind != "plan" && !args.has("force") {
                return Err(fail(
                    1,
                    format!(
                        "{} memories are durable; pass --force to remove {}.",
                        note.kind, note.id
                    ),
                ));
            }
            vault::no_symlink_children(&ctx.root, &note.path)?;
            fs::remove_file(&note.path).map_err(|_| "Cannot remove memory")?;
            out = format!("{} removed\n", note.id);
        }
        "validate" => {
            let repo = ctx
                .repo
                .as_ref()
                .ok_or_else(|| fail(2, "validate runs inside the project repo."))?;
            let selected = notes
                .iter()
                .filter(|note| note.kind != "note")
                .collect::<Vec<_>>();
            let mut broken = 0;
            for note in &selected {
                let problems = validate(repo, note);
                if !problems.is_empty() {
                    broken += 1;
                    out.push_str(&format!(
                        "{}\n{}\n",
                        header(note),
                        problems
                            .iter()
                            .map(|problem| format!("    {problem}"))
                            .collect::<Vec<_>>()
                            .join("\n")
                    ));
                }
            }
            out.push_str(&format!(
                "{} memories checked, {broken} with problems.\n",
                selected.len()
            ));
            return Ok(output(if broken == 0 { 0 } else { 1 }, out));
        }
        _ => unreachable!(),
    }
    Ok(output(0, out))
}

pub fn execute(home: &Path, cwd: &Path, args: &[String]) -> Decision {
    result(run(home, cwd, args))
}
pub fn command(home: &Path, cwd: &Path, args: &[String]) -> runtime::Result<String> {
    let output = execute(home, cwd, args);
    if output.code == 0 {
        Ok(output.stdout)
    } else {
        Err(if output.stderr.is_empty() {
            output.stdout
        } else {
            output.stderr
        })
    }
}
