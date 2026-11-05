use crate::{
    handoff,
    payload::Decision,
    project_memory::{self, Arguments, CliResult, Repo, fail, output},
    runtime, vault,
};
use regex::Regex;
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
    sync::OnceLock,
};
use unicode_normalization::UnicodeNormalization;

fn git(root: &Path, args: &[&str]) -> runtime::Result<String> {
    let mut full = vec!["-c", "core.quotePath=false"];
    full.extend(args);
    runtime::git(root, &full)
}
fn lines(text: &str) -> Vec<String> {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect()
}
fn posix(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}
fn skipped(name: &str) -> bool {
    matches!(
        name,
        "node_modules"
            | "dist"
            | "build"
            | "bin"
            | "obj"
            | "vendor"
            | "coverage"
            | "target"
            | "venv"
            | "__pycache__"
            | "Pods"
    )
}

fn walk_vaults(dir: &Path, depth: usize, found: &mut Vec<PathBuf>) -> runtime::Result<()> {
    if depth > 6 {
        return Ok(());
    }
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(()),
    };
    for entry in entries {
        let entry = entry.map_err(|_| "Cannot inspect documentation directory")?;
        let kind = entry
            .file_type()
            .map_err(|_| "Cannot inspect documentation entry")?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if kind.is_dir() && name == ".obsidian" {
            found.push(dir.to_path_buf());
        } else if kind.is_dir() && !name.starts_with('.') && !skipped(&name) {
            walk_vaults(&entry.path(), depth + 1, found)?;
        }
    }
    Ok(())
}
fn find_vaults(root: &Path) -> runtime::Result<Vec<PathBuf>> {
    let files = lines(&git(
        root,
        &["ls-files", "--cached", "--others", "--exclude-standard"],
    )?);
    let mut found = Vec::new();
    for file in files {
        if let Some(at) = file.find(".obsidian/")
            && (at == 0 || file.as_bytes()[at - 1] == b'/')
            && !found.contains(&root.join(&file[..at]))
        {
            let path = root.join(&file[..at]);
            vault::no_symlink_children(root, &path)?;
            found.push(path);
        }
    }
    if found.is_empty() {
        walk_vaults(root, 0, &mut found)?;
    }
    Ok(found)
}
fn markdown_files(dir: &Path, out: &mut Vec<PathBuf>) -> runtime::Result<()> {
    for entry in fs::read_dir(dir).map_err(|_| "Cannot read documentation vault")? {
        let entry = entry.map_err(|_| "Cannot read documentation entry")?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') {
            continue;
        }
        let kind = entry
            .file_type()
            .map_err(|_| "Cannot inspect documentation note")?;
        if kind.is_symlink() {
            return Err("Documentation symlinks are not allowed".into());
        }
        if kind.is_dir() {
            markdown_files(&entry.path(), out)?;
        } else if kind.is_file() && name.ends_with(".md") {
            out.push(entry.path());
        }
    }
    Ok(())
}
fn entry_note(root: &Path, notes: &[PathBuf]) -> Option<String> {
    static CONTEXT: OnceLock<Regex> = OnceLock::new();
    static INDEX: OnceLock<Regex> = OnceLock::new();
    let context = CONTEXT.get_or_init(|| Regex::new(r"^_?(contexto|context)\b").unwrap());
    let index = INDEX.get_or_init(|| Regex::new(r"^_?(índice|indice|index)\b").unwrap());
    let score = |path: &Path| {
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .nfc()
            .collect::<String>()
            .to_lowercase();
        if context.is_match(&name) {
            0
        } else if index.is_match(&name) {
            1
        } else if name == "readme.md" {
            2
        } else {
            9
        }
    };
    let mut ranked = notes
        .iter()
        .filter(|path| score(path) < 9)
        .collect::<Vec<_>>();
    ranked.sort_by_key(|path| (score(path), path.components().count()));
    ranked
        .first()
        .and_then(|path| path.strip_prefix(root).ok())
        .map(posix)
}
fn describe(root: &Path) -> runtime::Result<Vec<Value>> {
    find_vaults(root)?.into_iter().map(|path|{let mut notes=Vec::new();markdown_files(&path,&mut notes)?;let relative=path.strip_prefix(root).map_err(|_|"Documentation vault escapes repo")?;Ok(json!({"path":if relative.as_os_str().is_empty(){".".into()}else{posix(relative)},"notes":notes.len(),"entry":entry_note(&path,&notes)}))}).collect()
}
fn session(home: &Path, repo: &Path) -> Value {
    match handoff::latest(home, repo) {
        Ok(value) => {
            if value["status"] == "found" {
                json!({"sessionsVault":value["vault"],"note":value["path"],"reason":null})
            } else {
                let reason = if value["status"] == "unsupported-version" {
                    format!("handoff versão {} não suportada", value["version"])
                } else {
                    "nenhuma nota: rode `exonous vault detect`".into()
                };
                json!({"sessionsVault":value["vault"],"note":null,"reason":reason})
            }
        }
        Err(error) => json!({"sessionsVault":null,"note":null,"reason":error}),
    }
}

fn changed_files(root: &Path, since: &str) -> CliResult<BTreeSet<String>> {
    if since.starts_with('-') {
        return Err(fail(
            1,
            format!(
                "--since inválido (\"{since}\"): use uma data AAAA-MM-DD ou um git ref existente."
            ),
        ));
    }
    let mut files = lines(&git(root, &["ls-files", "--others", "--exclude-standard"])?)
        .into_iter()
        .collect::<BTreeSet<_>>();
    if git(root, &["rev-parse", "--verify", "HEAD"]).is_err() {
        files.extend(lines(&git(root, &["ls-files", "--cached"])?));
        return Ok(files);
    }
    files.extend(lines(&git(root, &["diff", "--name-only", "HEAD"])?));
    static DATE: OnceLock<Regex> = OnceLock::new();
    let committed = if DATE
        .get_or_init(|| Regex::new(r"^\d{4}-\d{2}-\d{2}$").unwrap())
        .is_match(since)
    {
        git(
            root,
            &[
                "log",
                &format!("--since={since} 00:00:00"),
                "--name-only",
                "--format=",
            ],
        )
    } else {
        git(root, &["diff", "--name-only", &format!("{since}...HEAD")])
    }
    .map_err(|_| {
        fail(
            1,
            format!(
                "--since inválido (\"{since}\"): use uma data AAAA-MM-DD ou um git ref existente."
            ),
        )
    })?;
    files.extend(lines(&committed));
    Ok(files)
}
fn line_count(path: &Path) -> Option<usize> {
    let bytes = vault::read_regular(path, 5 * 1024 * 1024).ok()?;
    if bytes.is_empty() {
        return Some(0);
    }
    Some(
        bytes.iter().filter(|byte| **byte == b'\n').count()
            + usize::from(bytes.last() != Some(&b'\n')),
    )
}
fn resolve_ref(known: &[String], raw: &str) -> Vec<String> {
    let target = raw.replace('\\', "/");
    let target = target.strip_prefix("./").unwrap_or(&target);
    if known.iter().any(|file| file == target) {
        return vec![target.into()];
    }
    known
        .iter()
        .filter(|file| file.ends_with(&format!("/{target}")))
        .cloned()
        .collect()
}

fn run(home: &Path, cwd: &Path, raw: &[String]) -> CliResult<Decision> {
    let args = Arguments::parse(raw);
    let command = args.positional.first().map(String::as_str).unwrap_or("");
    if !matches!(command, "locate" | "refs") {
        return Err(fail(
            1,
            "Uso: exonous doc <locate | refs \"<vault>\"> [--repo caminho] [--since git-ref|AAAA-MM-DD]",
        ));
    }
    let start = args
        .one("repo")
        .map(PathBuf::from)
        .unwrap_or_else(|| cwd.to_path_buf());
    let start = if start.is_absolute() {
        start
    } else {
        cwd.join(start)
    };
    let repo = project_memory::repo(&start)
        .map_err(|_| fail(2, format!("Não é um repositório git: {}", start.display())))?;
    if command == "locate" {
        let found = describe(&repo.root)?;
        let in_main = if found.is_empty() && repo.main != repo.root {
            describe(&repo.main)?
        } else {
            Vec::new()
        };
        let value = json!({"repo":{"root":posix(&repo.root),"name":repo.name,"mainCheckout":posix(&repo.main)},"vaults":found,"vaultsInMainCheckout":in_main,"session":session(home,&repo.root)});
        return Ok(output(
            if value["vaults"].as_array().unwrap().is_empty() {
                3
            } else {
                0
            },
            format!(
                "{}\n",
                serde_json::to_string_pretty(&value)
                    .map_err(|_| "Cannot encode documentation report")?
            ),
        ));
    }
    refs(&repo, &args)
}

fn refs(repo: &Repo, args: &Arguments) -> CliResult<Decision> {
    let raw = args.positional.get(1).ok_or_else(|| {
        fail(
            3,
            "Uso: refs \"<caminho do vault>\" [--since <git-ref|AAAA-MM-DD>]",
        )
    })?;
    let root = vault::local_path(&repo.root, &repo.root, raw)?;
    if !root.join(".obsidian").is_dir() {
        return Err(fail(
            3,
            "Uso: refs \"<caminho do vault>\" [--since <git-ref|AAAA-MM-DD>]",
        ));
    }
    vault::no_symlink_children(&root, &root)?;
    let changed = args
        .one("since")
        .map(|since| changed_files(&repo.root, since))
        .transpose()?;
    let known = lines(&git(
        &repo.root,
        &["ls-files", "--cached", "--others", "--exclude-standard"],
    )?);
    let mut notes = Vec::new();
    markdown_files(&root, &mut notes)?;
    let mut sizes = BTreeMap::<String, Option<usize>>::new();
    let mut broken = Vec::new();
    let mut ambiguous = Vec::new();
    let mut hosts = Vec::<String>::new();
    let mut touched = BTreeMap::<String, Vec<String>>::new();
    let mut total = 0;
    static REF: OnceLock<Regex> = OnceLock::new();
    static HOST: OnceLock<Regex> = OnceLock::new();
    let refs = REF.get_or_init(|| Regex::new(r"`([^`\s:]+):(\d+)(?:-(\d+))?`").unwrap());
    let host=HOST.get_or_init(||Regex::new(r"(?i)^(\d{1,3}(\.\d{1,3}){3}|localhost|[\w.-]+\.(com|net|org|io|uk|br|dev|app|cloud|internal|local))$").unwrap());
    for note in notes {
        let text = String::from_utf8(vault::read_regular(&note, 16 * 1024 * 1024)?)
            .map_err(|_| "Documentation note is not UTF-8")?;
        let relative = note
            .strip_prefix(&repo.root)
            .map(posix)
            .unwrap_or_else(|_| posix(&note));
        for found in refs.captures_iter(&text) {
            let target = &found[1];
            let reference = found.get(0).unwrap().as_str();
            if host.is_match(target) {
                if !hosts.iter().any(|host| host == reference) {
                    hosts.push(reference.into());
                }
                continue;
            }
            let candidates = resolve_ref(&known, target);
            if candidates.is_empty() && !target.contains(['.', '/']) {
                continue;
            }
            total += 1;
            if changed
                .as_ref()
                .is_some_and(|changed| candidates.iter().any(|file| changed.contains(file)))
            {
                let found = touched.entry(relative.clone()).or_default();
                if !found.iter().any(|item| item == reference) {
                    found.push(reference.into());
                }
            }
            if candidates.len() > 1 {
                ambiguous.push(json!({"note":relative,"ref":reference,"candidatos":candidates.into_iter().take(5).collect::<Vec<_>>()}));
                continue;
            }
            let Some(file) = candidates.first() else {
                broken.push(json!({"note":relative,"ref":reference,"problem":"arquivo não existe neste repo"}));
                continue;
            };
            let count = *sizes
                .entry(file.clone())
                .or_insert_with(|| line_count(&repo.root.join(file)));
            let line = found
                .get(3)
                .or_else(|| found.get(2))
                .and_then(|value| value.as_str().parse::<usize>().ok())
                .unwrap_or(0);
            if count.is_some_and(|count| line > count) {
                broken.push(json!({"note":relative,"ref":reference,"problem":format!("{file} tem {} linhas",count.unwrap())}));
            }
        }
    }
    let touched = if changed.is_some() {
        json!(
            touched
                .into_iter()
                .map(|(note, refs)| json!({"note":note,"refs":refs}))
                .collect::<Vec<_>>()
        )
    } else {
        json!("passe --since para cruzar com arquivos alterados")
    };
    let relative = root
        .strip_prefix(&repo.root)
        .map(posix)
        .unwrap_or_else(|_| posix(&root));
    let value = json!({"vault":relative,"referencias":total,"quebradas":broken,"ambiguas":ambiguous,"ignoradasPorParecerHost":hosts,"notasQueCitamArquivosAlterados":touched});
    Ok(output(
        0,
        format!(
            "{}\n",
            serde_json::to_string_pretty(&value).map_err(|_| "Cannot encode refs report")?
        ),
    ))
}

pub fn execute(home: &Path, cwd: &Path, args: &[String]) -> Decision {
    project_memory::result(run(home, cwd, args))
}
pub fn command(home: &Path, cwd: &Path, args: &[String]) -> runtime::Result<String> {
    let result = execute(home, cwd, args);
    if result.code == 0 {
        Ok(result.stdout)
    } else {
        Err(if result.stderr.is_empty() {
            result.stdout
        } else {
            result.stderr
        })
    }
}
