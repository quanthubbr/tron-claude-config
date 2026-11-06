use crate::sanitize::sanitize;
use crate::{
    runtime::{self, Result},
    vault,
};
use chrono::{DateTime, SecondsFormat, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use std::fs::{self, OpenOptions};
use std::hash::BuildHasher;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

const MAX_BYTES: u64 = 1024 * 1024;
const USAGE: &str = "usage: exonous handoff save --body-file <json-file> | latest --json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Graph {
    pub v: u8,
    pub k: String,
    pub g: Vec<[String; 3]>,
}

pub fn canonical_pr_url(url: &str) -> bool {
    static URL: OnceLock<Regex> = OnceLock::new();
    URL.get_or_init(|| {
        Regex::new(
            r"\Ahttps://github\.com/[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_.-]+/pull/[1-9][0-9]*\z",
        )
        .unwrap()
    })
    .is_match(url)
        && !matches!(url.split('/').nth(4), Some("." | ".."))
}

fn pr_url(graph: &Graph) -> Result<&str> {
    let urls = graph
        .g
        .iter()
        .filter(|triple| triple[0] == "pr" && triple[1] == "url")
        .collect::<Vec<_>>();
    if urls.len() != 1 || !canonical_pr_url(&urls[0][2]) {
        return Err(
            "invalid PR handoff graph: expected exactly one canonical pr url triple".into(),
        );
    }
    Ok(&urls[0][2])
}

fn scrub(value: &Value) -> Value {
    match value {
        Value::String(value) => Value::String(sanitize(value)),
        Value::Array(values) => Value::Array(values.iter().map(scrub).collect()),
        Value::Object(values) => Value::Object(
            values
                .iter()
                .map(|(key, value)| (sanitize(key), scrub(value)))
                .collect::<Map<_, _>>(),
        ),
        _ => value.clone(),
    }
}

pub fn validate_graph(body: &Value) -> Result<Graph> {
    if body["v"].as_f64() != Some(1.0) || !matches!(body["k"].as_str(), Some("full" | "pr")) {
        return Err(
            "invalid handoff graph: expected v=1, k=full|pr and nonempty string triples".into(),
        );
    }
    let triples = body["g"]
        .as_array()
        .filter(|g| !g.is_empty())
        .ok_or("invalid handoff graph: expected nonempty string triples")?;
    if triples.len() > 4096
        || serde_json::to_vec(body)
            .map_err(|_| "invalid handoff graph")?
            .len() as u64
            > MAX_BYTES
    {
        return Err("handoff graph too large".into());
    }
    let mut graph = Vec::with_capacity(triples.len());
    for triple in triples {
        let triple = triple
            .as_array()
            .filter(|value| value.len() == 3)
            .ok_or("invalid handoff graph: expected nonempty string triples")?;
        let fields = triple
            .iter()
            .map(|field| {
                field
                    .as_str()
                    .filter(|value| !value.trim().is_empty())
                    .map(sanitize)
            })
            .collect::<Option<Vec<_>>>()
            .ok_or("invalid handoff graph: expected nonempty string triples")?;
        graph.push([fields[0].clone(), fields[1].clone(), fields[2].clone()]);
    }
    for relation in ["next", "proof"] {
        if !triples.iter().any(|triple| triple[1] == relation) {
            return Err(format!("invalid handoff graph: missing {relation}"));
        }
    }
    let result = Graph {
        v: 1,
        k: body["k"].as_str().unwrap().into(),
        g: graph,
    };
    if result.k == "pr" {
        pr_url(&result)?;
    }
    Ok(result)
}

fn timestamp(raw: &str) -> Option<i64> {
    static FORMAT: OnceLock<Regex> = OnceLock::new();
    if !FORMAT
        .get_or_init(|| {
            Regex::new(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$")
                .unwrap()
        })
        .is_match(raw)
    {
        return None;
    }
    if raw.get(17..19).is_none_or(|seconds| seconds >= "60") {
        return None;
    }
    if raw.get(11..13) == Some("24") {
        if raw.get(14..19) != Some("00:00") {
            return None;
        }
        if let Some(fraction) = raw[19..].strip_prefix('.')
            && fraction
                .chars()
                .take_while(char::is_ascii_digit)
                .any(|digit| digit != '0')
        {
            return None;
        }
        let mut normalized = raw.to_owned();
        normalized.replace_range(11..13, "00");
        return DateTime::parse_from_rfc3339(&normalized)
            .ok()?
            .checked_add_signed(chrono::Duration::days(1))
            .map(|date| date.timestamp_millis());
    }
    DateTime::parse_from_rfc3339(raw)
        .ok()
        .map(|date| date.timestamp_millis())
}

fn iso(time: i64) -> Result<String> {
    DateTime::<Utc>::from_timestamp_millis(time)
        .map(|date| date.to_rfc3339_opts(SecondsFormat::Millis, true))
        .ok_or_else(|| "invalid handoff timestamp".into())
}

fn identity(cwd: &Path) -> Result<(String, String, String)> {
    let Ok(top) = runtime::git(cwd, &["rev-parse", "--show-toplevel"]) else {
        return Ok(("avulsas".into(), String::new(), String::new()));
    };
    let root = PathBuf::from(top);
    let list = runtime::git(&root, &["worktree", "list", "--porcelain"]).unwrap_or_default();
    let main = list
        .lines()
        .next()
        .and_then(|line| line.strip_prefix("worktree "))
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| root.clone());
    let raw = main
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("invalid handoff repository name")?;
    let name = raw.strip_suffix(".git").unwrap_or(raw);
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\\']) {
        return Err("invalid handoff repository name".into());
    }
    Ok((
        name.into(),
        runtime::git(&root, &["branch", "--show-current"]).unwrap_or_default(),
        runtime::git(&root, &["rev-parse", "--verify", "HEAD"]).unwrap_or_default(),
    ))
}

fn root(home: &Path, cwd: &Path) -> Result<Option<PathBuf>> {
    let selected = vault::central(home, cwd).map_err(|_| "handoff config.json invalid")?;
    let Some(root) = selected.path else {
        return Ok(None);
    };
    if !root.is_dir() {
        return Err("configured handoff vault is unavailable".into());
    }
    vault::no_symlink_children(&root, &root)?;
    Ok(Some(root))
}

pub fn save(home: &Path, cwd: &Path, body: &Value, now: Option<&str>) -> Result<Value> {
    let graph = validate_graph(body)?;
    let ts = now
        .map(str::to_owned)
        .unwrap_or(iso(runtime::now_ms() as i64)?);
    if timestamp(&ts).is_none() {
        return Err("invalid handoff timestamp".into());
    }
    let Some(root) = root(home, cwd)? else {
        return Ok(json!({"status":"not-saved","reason":"no-vault"}));
    };
    let (repo, branch, head) = identity(cwd)?;
    let folder = root.join(&repo);
    vault::no_symlink_children(&root, &folder)
        .map_err(|_| "handoff folder must not be a symlink")?;
    fs::create_dir_all(&folder).map_err(|_| "cannot create handoff folder")?;
    vault::no_symlink_children(&root, &folder)
        .map_err(|_| "handoff folder must not be a symlink")?;
    let file = if graph.k == "pr" {
        folder.join(format!(
            "pr-{:x}.md",
            Sha256::digest(pr_url(&graph)?.as_bytes())
        ))
    } else {
        folder.join(format!(
            "{}-{}-{}.md",
            ts.replace(':', "-"),
            graph.k,
            runtime::nonce()
        ))
    };
    let content = json!({"v":graph.v,"ts":ts,"k":graph.k,"r":sanitize(&repo),"b":sanitize(&branch),"h":sanitize(&head),"g":graph.g});
    if graph.k == "pr" {
        return publish_pr(&folder, &file, &content, &root, &ts, &repo, pr_url(&graph)?);
    }
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    }
    let mut output = options
        .open(&file)
        .map_err(|_| "cannot create handoff note")?;
    output
        .write_all(format!("{content}\n").as_bytes())
        .and_then(|_| output.sync_all())
        .map_err(|_| "cannot persist handoff note")?;
    Ok(json!({"status":"saved","vault":root,"path":file,"timestamp":ts,"kind":graph.k}))
}

fn publish_pr(
    folder: &Path,
    file: &Path,
    content: &Value,
    root: &Path,
    ts: &str,
    repo: &str,
    url: &str,
) -> Result<Value> {
    let random = std::collections::hash_map::RandomState::new().hash_one(runtime::nonce());
    let temporary = folder.join(format!(".pr-{}-{random:x}.tmp", runtime::nonce()));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    }
    let mut output = options
        .open(&temporary)
        .map_err(|_| "cannot create private handoff temporary")?;
    let result = (|| {
        output
            .write_all(format!("{content}\n").as_bytes())
            .and_then(|_| output.sync_all())
            .map_err(|_| "cannot persist handoff note")?;
        drop(output);
        match fs::hard_link(&temporary, file) {
            Ok(()) => {
                Ok(json!({"status":"saved","vault":root,"path":file,"timestamp":ts,"kind":"pr"}))
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                let metadata =
                    fs::symlink_metadata(file).map_err(|_| "cannot inspect existing PR handoff")?;
                if !metadata.is_file() || metadata.file_type().is_symlink() {
                    return Err("existing PR handoff must be regular".into());
                }
                let existing: Value =
                    serde_json::from_slice(&vault::read_regular(file, MAX_BYTES)?)
                        .map_err(|_| "existing PR handoff is invalid")?;
                let graph = validate_graph(&existing)?;
                if graph.k != "pr"
                    || pr_url(&graph)? != url
                    || existing["ts"].as_str().and_then(timestamp).is_none()
                    || existing["r"] != repo
                    || !existing["b"].is_string()
                    || !existing["h"].is_string()
                {
                    return Err("existing PR handoff envelope does not match".into());
                }
                Ok(
                    json!({"status":"already-saved","vault":root,"path":file,"timestamp":existing["ts"],"kind":"pr"}),
                )
            }
            Err(_) => Err("cannot publish PR handoff".into()),
        }
    })();
    let cleanup = fs::remove_file(&temporary);
    if cleanup.is_err() && result.is_ok() {
        return Err("cannot remove handoff temporary".into());
    }
    result
}

pub fn dated_name(name: &str) -> bool {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN
        .get_or_init(|| Regex::new(r"^\d{4}-\d{2}-\d{2}[ T]\d{2}[:\-]?\d{2}.*\.md$").unwrap())
        .is_match(name)
}

pub fn graph_envelope(body: &Value) -> bool {
    body.is_object() && body.get("v").is_some() && body["ts"].is_string()
}

pub fn legacy_handoff(content: &str) -> bool {
    static FRONT: OnceLock<Regex> = OnceLock::new();
    static KIND: OnceLock<Regex> = OnceLock::new();
    static TAGS: OnceLock<Regex> = OnceLock::new();
    let Some(front) = FRONT
        .get_or_init(|| Regex::new(r"(?s)^---\r?\n(.*?)\r?\n---").unwrap())
        .captures(content)
    else {
        return false;
    };
    KIND.get_or_init(|| Regex::new(r#"(?m)^tipo:\s*["']?sessao["']?\s*$"#).unwrap())
        .is_match(&front[1])
        || TAGS
            .get_or_init(|| {
                Regex::new(r"(?m)^tags:\s*\[[^\]\r\n]*\bhandoff\b[^\]\r\n]*\]").unwrap()
            })
            .is_match(&front[1])
}

fn filename_time(name: &str) -> Option<i64> {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    let found = PATTERN
        .get_or_init(|| {
            Regex::new(r"^(\d{4}-\d{2}-\d{2})[ T](\d{2})[:\-]?(\d{2})(?:[:\-]?(\d{2}))?").unwrap()
        })
        .captures(name)?;
    timestamp(&format!(
        "{}T{}:{}:{}Z",
        &found[1],
        &found[2],
        &found[3],
        found.get(4).map_or("00", |m| m.as_str())
    ))
}

fn note(file: &Path, root: &Path) -> Result<Option<(i64, Value)>> {
    let name = file
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("invalid handoff filename")?;
    let dated = dated_name(name);
    let metadata = fs::symlink_metadata(file).map_err(|_| "cannot read handoff note")?;
    if !dated && metadata.len() > MAX_BYTES {
        return Ok(None);
    }
    let raw = String::from_utf8(vault::read_regular(file, MAX_BYTES).map_err(|error| {
        if error.contains("too large") {
            "handoff file too large (maximum 1 MiB)".into()
        } else {
            error
        }
    })?)
    .map_err(|_| "invalid handoff text encoding")?;
    let parsed = if raw.trim_start().starts_with('{') {
        serde_json::from_str::<Value>(&raw)
            .ok()
            .filter(graph_envelope)
    } else {
        None
    };
    if parsed.is_none() && !dated {
        return Ok(None);
    }
    let mut recorded = parsed
        .as_ref()
        .and_then(|data| data["ts"].as_str())
        .and_then(timestamp);
    if parsed.is_none() {
        static FRONT: OnceLock<Regex> = OnceLock::new();
        static TIME: OnceLock<Regex> = OnceLock::new();
        if let Some(front) = FRONT
            .get_or_init(|| Regex::new(r"(?s)^---\r?\n(.*?)\r?\n---").unwrap())
            .captures(&raw)
        {
            for found in TIME
                .get_or_init(|| {
                    Regex::new(r#"(?m)^(?:ts|timestamp|created|date|data):\s*["']?([^\r\n"']+)"#)
                        .unwrap()
                })
                .captures_iter(&front[1])
            {
                recorded = timestamp(found[1].trim());
                if recorded.is_some() {
                    break;
                }
            }
        }
    }
    let modified = metadata
        .modified()
        .map_err(|_| "cannot inspect handoff timestamp")?
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);
    let time = recorded.or_else(|| filename_time(name)).unwrap_or(modified);
    let content = parsed
        .as_ref()
        .map(|data| scrub(data).to_string())
        .unwrap_or_else(|| sanitize(&raw));
    if let Some(data) = &parsed {
        if data["v"].as_f64() != Some(1.0) {
            let version = data["v"]
                .as_f64()
                .filter(|value| {
                    value.is_finite()
                        && value.fract() == 0.0
                        && value.abs() <= 9_007_199_254_740_991.0
                })
                .map(|value| value as i64);
            return Ok(Some((
                time,
                json!({"status":"unsupported-version","version":version,"vault":root,"path":file,"timestamp":iso(time)?,"kind":"unknown","content":content}),
            )));
        }
        validate_graph(data)?;
    }
    let kind = parsed
        .as_ref()
        .and_then(|data| data["k"].as_str())
        .unwrap_or("legacy");
    Ok(Some((
        time,
        json!({"status":"found","vault":root,"path":file,"timestamp":iso(time)?,"kind":kind,"content":content}),
    )))
}

pub fn latest(home: &Path, cwd: &Path) -> Result<Value> {
    let Some(root) = root(home, cwd)? else {
        return Ok(json!({"status":"not-found","reason":"no-vault"}));
    };
    let (repo, _, _) = identity(cwd)?;
    let folder = root.join(&repo);
    vault::no_symlink_children(&root, &folder).map_err(|_| "cannot read handoff folder")?;
    if !folder.exists() {
        return Ok(json!({"status":"not-found","reason":"no-notes"}));
    }
    let entries = fs::read_dir(&folder).map_err(|_| "cannot read handoff folder")?;
    let mut notes = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|_| "cannot read handoff folder")?;
        if !entry
            .file_type()
            .map_err(|_| "cannot inspect handoff note")?
            .is_file()
            || !entry.file_name().to_string_lossy().ends_with(".md")
        {
            continue;
        }
        let Some((time, candidate)) = note(&entry.path(), &root)? else {
            continue;
        };
        if candidate["kind"] != "legacy" {
            let data: Value = serde_json::from_str(candidate["content"].as_str().unwrap_or(""))
                .map_err(|_| "invalid handoff content")?;
            if data["r"]
                .as_str()
                .is_some_and(|name| !name.is_empty() && name != repo)
            {
                continue;
            }
        }
        notes.push((time, candidate));
    }
    notes.sort_by(|(a_time, a), (b_time, b)| {
        b_time
            .cmp(a_time)
            .then_with(|| b["path"].as_str().cmp(&a["path"].as_str()))
    });
    Ok(notes
        .into_iter()
        .next()
        .map(|(_, value)| value)
        .unwrap_or_else(|| json!({"status":"not-found","reason":"no-notes"})))
}

pub fn command(home: &Path, cwd: &Path, args: &[String]) -> Result<String> {
    let Some(sub) = args.first().map(String::as_str) else {
        return Err(USAGE.into());
    };
    let mut body = None;
    let mut index = 1;
    while index < args.len() {
        match args[index].as_str() {
            "--json" if sub == "latest" => {}
            "--body-file"
                if sub == "save"
                    && args
                        .get(index + 1)
                        .is_some_and(|raw| !raw.starts_with("--")) =>
            {
                index += 1;
                body = Some(&args[index]);
            }
            _ => return Err(USAGE.into()),
        }
        index += 1;
    }
    let override_cwd = std::env::var_os("EXONOUS_HANDOFF_CWD").map(PathBuf::from);
    let cwd = override_cwd.as_deref().unwrap_or(cwd);
    let result = match (sub, body) {
        ("save", Some(file)) => {
            let file = if Path::new(file).is_absolute() {
                PathBuf::from(file)
            } else {
                cwd.join(file)
            };
            let raw = vault::read_regular(&file, MAX_BYTES).map_err(|error| {
                if error.contains("too large") {
                    "handoff file too large (maximum 1 MiB)".to_string()
                } else {
                    "cannot read handoff body as JSON".to_string()
                }
            })?;
            let body: Value =
                serde_json::from_slice(&raw).map_err(|_| "cannot read handoff body as JSON")?;
            save(home, cwd, &body, None)?
        }
        ("latest", None) => latest(home, cwd)?,
        _ => return Err(USAGE.into()),
    };
    Ok(format!("{result}\n"))
}
