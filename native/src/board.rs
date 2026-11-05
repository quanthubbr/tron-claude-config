use crate::{
    runtime::{self, Result},
    vault,
};
use serde_json::{Map, Value, json};
use std::io::IsTerminal;
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
};
use unicode_normalization::{UnicodeNormalization, char::is_combining_mark};

const PRIORITIES: [&str; 4] = ["P0", "P1", "P2", "P3"];
const TYPES: [(&str, &str, &str); 8] = [
    (
        "bug",
        "Bug",
        "algo que funcionava ou deveria funcionar e não funciona",
    ),
    ("feature", "Feature", "comportamento novo pedido"),
    ("front", "Interface", "telas, layout, mensagens, UX"),
    (
        "dados",
        "Dados",
        "dado errado, perdido, migração, consistência",
    ),
    (
        "performance",
        "Performance",
        "lentidão, dado atrasado, consumo de recurso",
    ),
    (
        "seguranca",
        "Segurança",
        "auth, permissão, vazamento, segredo",
    ),
    (
        "infra",
        "Infra",
        "deploy, CI, cloud, banco, observabilidade",
    ),
    ("outros", "Outros", "docs, ferramentas de dev, decisões"),
];
type Flags = BTreeMap<String, String>;
fn text<'a>(v: &'a Value, key: &str) -> &'a str {
    v[key].as_str().unwrap_or("")
}
fn fold(s: &str) -> String {
    s.nfd()
        .filter(|c| !is_combining_mark(*c))
        .collect::<String>()
        .to_lowercase()
}
fn read(path: &Path, fallback: Value) -> Result<Value> {
    if !path.exists() {
        return Ok(fallback);
    }
    if fs::symlink_metadata(path)
        .map_err(|_| "cannot inspect board data")?
        .file_type()
        .is_symlink()
    {
        return Err("board data must not be a symlink".into());
    }
    serde_json::from_str(&runtime::read_limited(path, 64 * 1024 * 1024)?)
        .map_err(|_| "invalid board JSON".into())
}
fn write(root: &Path, path: &Path, value: &Value) -> Result<()> {
    vault::no_symlink_children(root, path)?;
    fs::create_dir_all(path.parent().ok_or("invalid board path")?)
        .map_err(|_| "cannot create board data directory")?;
    runtime::atomic_private(
        path,
        format!(
            "{}\n",
            serde_json::to_string_pretty(value).map_err(|_| "cannot encode board data")?
        )
        .as_bytes(),
    )
}
fn parse(args: &[String]) -> Result<(Flags, Vec<String>)> {
    let mut flags = Flags::new();
    let mut positional = Vec::new();
    let mut index = 0;
    while index < args.len() {
        let arg = &args[index];
        if let Some(flag) = arg.strip_prefix("--") {
            if let Some((key, value)) = flag.split_once('=') {
                flags.insert(key.into(), value.into());
            } else if ["all", "color", "no-color", "json"].contains(&flag) {
                flags.insert(flag.into(), "true".into());
            } else {
                index += 1;
                let value = args
                    .get(index)
                    .filter(|v| !v.starts_with("--"))
                    .ok_or_else(|| format!("--{flag} precisa de um valor"))?;
                flags.insert(flag.into(), value.clone());
            }
        } else {
            positional.push(arg.clone());
        }
        index += 1;
    }
    Ok((flags, positional))
}
struct Config {
    root: PathBuf,
    data: PathBuf,
    owner: String,
    number: u64,
    fields: Value,
    done: Vec<String>,
    types: Vec<Value>,
    priority: BTreeMap<String, String>,
    size: BTreeMap<String, u64>,
}
fn config(home: &Path, cwd: &Path, flags: &Flags) -> Result<Config> {
    let root = flags
        .get("skill-dir")
        .map(|s| cwd.join(s))
        .unwrap_or_else(|| {
            let shared = home.join(".agents/skills/issue-board");
            if shared.is_dir() {
                shared
            } else {
                home.join(".claude/skills/issue-board")
            }
        });
    let file = read(&root.join("config.json"), json!({}))?;
    let owner = flags
        .get("owner")
        .map(String::as_str)
        .unwrap_or(text(&file, "owner"))
        .to_owned();
    let number = flags
        .get("project-number")
        .and_then(|s| s.parse().ok())
        .or_else(|| file["projectNumber"].as_u64())
        .unwrap_or(0);
    if owner.is_empty()
        || number == 0
        || !owner
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err("Board não definido ou inválido. Preencha owner e projectNumber em config.json ou passe --owner e --project-number.".into());
    }
    let mut fields = json!({"status":"Status","priority":"Priority","size":"Size","group":""});
    if let Some(values) = file["fields"].as_object() {
        for (key, value) in values {
            fields[key] = value.clone();
        }
    }
    let types = file["types"]
        .as_array()
        .filter(|v| !v.is_empty())
        .cloned()
        .unwrap_or_else(|| {
            TYPES
                .iter()
                .map(|(id, name, hint)| json!({"id":id,"name":name,"hint":hint}))
                .collect()
        });
    let done = file["doneStatuses"]
        .as_array()
        .map(|v| {
            v.iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_else(|| vec!["Done".into()]);
    let mut priority = BTreeMap::new();
    for (key, value) in [
        ("p0", "P0"),
        ("urgent", "P0"),
        ("critical", "P0"),
        ("p1", "P1"),
        ("high", "P1"),
        ("p2", "P2"),
        ("medium", "P2"),
        ("p3", "P3"),
        ("low", "P3"),
    ] {
        priority.insert(key.into(), value.into());
    }
    if let Some(map) = file["priorityMap"].as_object() {
        for (key, value) in map {
            let value = value
                .as_str()
                .filter(|s| PRIORITIES.contains(s))
                .ok_or("priorityMap deve apontar para P0..P3")?;
            priority.insert(key.to_lowercase(), value.into());
        }
    }
    let mut size = BTreeMap::new();
    for (key, value) in [
        ("xs", 1),
        ("s", 1),
        ("small", 1),
        ("m", 2),
        ("medium", 2),
        ("l", 3),
        ("large", 3),
        ("xl", 3),
    ] {
        size.insert(key.into(), value);
    }
    if let Some(map) = file["sizeMap"].as_object() {
        for (key, value) in map {
            let value = value
                .as_u64()
                .filter(|n| (1..=3).contains(n))
                .ok_or("sizeMap deve apontar para 1, 2 ou 3")?;
            size.insert(key.to_lowercase(), value);
        }
    }
    Ok(Config {
        data: root.join("data").join(format!("{owner}-{number}")),
        root,
        owner,
        number,
        fields,
        done,
        types,
        priority,
        size,
    })
}
fn gh(args: &[String]) -> Result<String> {
    let out = Command::new("gh")
        .args(args)
        .output()
        .map_err(|_| "gh CLI não encontrado. Instale: https://cli.github.com")?;
    if !out.status.success() {
        let error = crate::sanitize::line(&String::from_utf8_lossy(&out.stderr), 500);
        return Err(error);
    }
    if out.stdout.len() > 64 * 1024 * 1024 {
        return Err("GitHub response exceeds size limit".into());
    }
    String::from_utf8(out.stdout).map_err(|_| "invalid GitHub response encoding".into())
}
fn fetch_page(config: &Config, kind: &str, cursor: Option<&str>) -> Result<Option<Value>> {
    let query = format!(
        "query($owner:String!,$num:Int!,$cursor:String){{{kind}(login:$owner){{projectV2(number:$num){{items(first:100,after:$cursor){{pageInfo{{hasNextPage endCursor}} nodes{{fieldValues(first:30){{nodes{{... on ProjectV2ItemFieldSingleSelectValue{{name field{{... on ProjectV2FieldCommon{{name}}}}}}}}}} content{{... on Issue{{number title state url body updatedAt repository{{nameWithOwner}} assignees(first:10){{nodes{{login}}}} labels(first:20){{nodes{{name}}}}}}}}}}}}}}}}}}"
    );
    let mut args = vec![
        "api".into(),
        "graphql".into(),
        "-f".into(),
        format!("query={query}"),
        "-f".into(),
        format!("owner={}", config.owner),
        "-F".into(),
        format!("num={}", config.number),
    ];
    if let Some(cursor) = cursor {
        args.extend(["-f".into(), format!("cursor={cursor}")]);
    }
    match gh(&args) {
        Ok(raw) => {
            let response: Value = serde_json::from_str(&raw).map_err(|_| "invalid GraphQL JSON")?;
            let items = &response["data"][kind]["projectV2"]["items"];
            Ok((!items.is_null()).then(|| items.clone()))
        }
        Err(error) if error.contains("NOT_FOUND") || error.contains("Could not resolve") => {
            Ok(None)
        }
        Err(error) => Err(error),
    }
}
fn normalize(node: &Value, config: &Config) -> Option<Value> {
    let c = &node["content"];
    if c["state"] != "OPEN" || c["number"].as_u64().unwrap_or(0) == 0 {
        return None;
    }
    let mut values = BTreeMap::new();
    if let Some(fields) = node["fieldValues"]["nodes"].as_array() {
        for v in fields {
            values.insert(text(&v["field"], "name"), text(v, "name"));
        }
    }
    let get = |field: &str| {
        values
            .get(text(&config.fields, field))
            .copied()
            .unwrap_or("")
    };
    let repo = text(&c["repository"], "nameWithOwner");
    let labels = |field: &str, key: &str| {
        c[field]["nodes"]
            .as_array()
            .map(|a| a.iter().filter_map(|v| v[key].as_str()).collect::<Vec<_>>())
            .unwrap_or_default()
    };
    let body = regex::Regex::new(r"<img[^>]*>")
        .expect("static image pattern")
        .replace_all(text(c, "body"), "[imagem]")
        .chars()
        .take(1500)
        .collect::<String>();
    Some(
        json!({"key":format!("{repo}#{}",c["number"]),"repo":repo.split('/').nth(1).unwrap_or(repo),"number":c["number"],"title":c["title"],"url":c["url"],"updatedAt":c["updatedAt"],"assignees":labels("assignees","login"),"labels":labels("labels","name"),"body":body,"status":get("status"),"group":get("group"),"boardPriority":get("priority"),"boardSize":get("size")}),
    )
}
fn scope(config: &Config, flags: &Flags) -> Result<(Value, Vec<Value>)> {
    let data = read(&config.data.join("items.json"), Value::Null)?;
    let items = data["items"]
        .as_array()
        .ok_or("Nada em cache para esse board. Rode fetch antes.")?;
    let wanted = flags
        .get("user")
        .map(String::as_str)
        .unwrap_or(text(&data, "me"));
    Ok((
        data.clone(),
        items
            .iter()
            .filter(|item| {
                flags.contains_key("all")
                    || item["assignees"]
                        .as_array()
                        .is_some_and(|a| a.iter().any(|v| v == wanted))
            })
            .cloned()
            .collect(),
    ))
}
fn resolve(item: &Value, classes: &Value, config: &Config) -> Value {
    let class = &classes[text(item, "key")];
    let raw = text(item, "boardPriority");
    let board = config
        .priority
        .get(&raw.to_lowercase())
        .map(String::as_str)
        .unwrap_or(raw);
    let size = config
        .size
        .get(&text(item, "boardSize").to_lowercase())
        .copied()
        .unwrap_or(0);
    let mut row = item.clone();
    row["typeId"] = class["type"].as_str().unwrap_or("").into();
    row["type"] = config
        .types
        .iter()
        .find(|t| t["id"] == class["type"])
        .map(|t| t["name"].clone())
        .unwrap_or_else(|| "Sem tipo".into());
    row["priority"] = if board.is_empty() {
        class["priority"].as_str().unwrap_or("—")
    } else {
        board
    }
    .into();
    row["prioritySuggested"] = json!(board.is_empty() && !text(class, "priority").is_empty());
    row["difficulty"] = json!(if size > 0 {
        size
    } else {
        class["difficulty"].as_u64().unwrap_or(0)
    });
    row["difficultySuggested"] = json!(size == 0 && class["difficulty"].as_u64().unwrap_or(0) > 0);
    row["note"] = class["note"].as_str().unwrap_or("").into();
    row
}
fn difficulty(row: &Value) -> &str {
    match row["difficulty"].as_u64() {
        Some(1) => "Fácil",
        Some(2) => "Média",
        Some(3) => "Difícil",
        _ => "Sem dificuldade",
    }
}
fn rank(row: &Value) -> usize {
    PRIORITIES
        .iter()
        .position(|p| row["priority"] == *p)
        .unwrap_or(9)
}
fn view(config: &Config, flags: &Flags) -> Result<Value> {
    let classes = read(&config.data.join("classification.json"), json!({}))?;
    let (data, items) = scope(config, flags)?;
    let mut rows = Vec::new();
    for item in items {
        let row = resolve(&item, &classes, config);
        let mut keep = true;
        for (flag, value) in [
            ("prioridade", text(&row, "priority").into()),
            ("dificuldade", difficulty(&row).into()),
            (
                "tipo",
                format!("{} {}", text(&row, "typeId"), text(&row, "type")),
            ),
            ("campo", text(&row, "group").into()),
            ("repo", text(&row, "repo").into()),
            ("status", text(&row, "status").into()),
        ] {
            if let Some(wanted) = flags.get(flag)
                && !wanted
                    .split(',')
                    .any(|s| fold(&value).contains(&fold(s.trim())))
            {
                keep = false;
            }
        }
        if keep {
            rows.push(row);
        }
    }
    let group = flags
        .get("por")
        .map(String::as_str)
        .filter(|s| {
            [
                "tipo",
                "prioridade",
                "dificuldade",
                "campo",
                "status",
                "repo",
            ]
            .contains(s)
        })
        .unwrap_or("tipo");
    let mut groups: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    for row in &rows {
        let name = match group {
            "tipo" => text(row, "type"),
            "prioridade" => text(row, "priority"),
            "dificuldade" => difficulty(row),
            "campo" => {
                if text(row, "group").is_empty() {
                    "(vazio)"
                } else {
                    text(row, "group")
                }
            }
            "status" => {
                if text(row, "status").is_empty() {
                    "Sem status"
                } else {
                    text(row, "status")
                }
            }
            _ => text(row, "repo"),
        };
        groups.entry(name.into()).or_default().push(row.clone());
    }
    let mut groups = groups.into_iter().collect::<Vec<_>>();
    if group == "tipo" {
        groups.sort_by_key(|(name, _)| {
            config
                .types
                .iter()
                .position(|t| t["name"] == *name)
                .unwrap_or(config.types.len())
        });
    }
    let counts: Map<String, Value> = PRIORITIES
        .iter()
        .map(|p| {
            (
                (*p).into(),
                json!(rows.iter().filter(|r| r["priority"] == *p).count()),
            )
        })
        .collect();
    let columns = [
        "key",
        "repo",
        "number",
        "title",
        "url",
        "status",
        "group",
        "type",
        "priority",
        "prioritySuggested",
        "difficulty",
        "difficultySuggested",
        "note",
    ];
    let groups=groups.into_iter().map(|(name,mut rows)|{rows.sort_by_key(|r|(rank(r),r["difficulty"].as_u64().filter(|n|*n>0).unwrap_or(9)));json!({"name":name,"rows":rows.into_iter().map(|r|columns.iter().map(|k|((*k).to_owned(),r[*k].clone())).collect::<Map<_,_>>()).collect::<Vec<_>>()})}).collect::<Vec<_>>();
    Ok(
        json!({"board":format!("{}#{}",config.owner,config.number),"user":if flags.contains_key("all"){Value::Null}else{flags.get("user").cloned().map(Value::String).unwrap_or_else(||data["me"].clone())},"groupBy":group,"groupField":if text(&config.fields,"group").is_empty(){Value::Null}else{config.fields["group"].clone()},"total":rows.len(),"counts":counts,"groups":groups}),
    )
}
fn pad(value: &str, width: usize) -> String {
    let chars = value.chars().collect::<Vec<_>>();
    if chars.len() > width {
        format!(
            "{}…",
            chars
                .into_iter()
                .take(width.saturating_sub(1))
                .collect::<String>()
        )
    } else {
        format!("{value}{}", " ".repeat(width - chars.len()))
    }
}
fn render(view: &Value, flags: &Flags) -> String {
    if view["total"] == 0 {
        return "Nenhuma issue nesse escopo. Tente --all para ver o board inteiro.\n".into();
    }
    let counts = PRIORITIES
        .iter()
        .map(|p| format!("{p} {}", view["counts"][p]))
        .collect::<Vec<_>>()
        .join("  ·  ");
    let color = flags.get("color").is_some_and(|value| value == "true")
        || (!flags.contains_key("no-color") && std::io::stdout().is_terminal());
    let paint = |code: &str, value: String| {
        if color {
            format!("\u{1b}[{code}m{value}\u{1b}[0m")
        } else {
            value
        }
    };
    let mut out = format!("{}\n{}\n",paint("1",format!("{} issues  |  {counts}",view["total"])),paint("2","Dificuldade ■□□ fácil  ■■□ média  ■■■ difícil   ~ = sugestão do agente (campo vazio no board)\n".into()));
    let width = flags
        .get("width")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(140)
        .clamp(60, 180);
    let mut columns = vec![
        ("Pri".to_owned(), 4),
        ("Dif".into(), 5),
        ("ID".into(), 5),
        ("Repo".into(), 19),
        ("Título".into(), 0),
        ("Status".into(), 12),
    ];
    let spare = |columns: &[(String, usize)]| {
        width.saturating_sub(columns.iter().map(|(_, w)| w + 3).sum::<usize>() + 1)
    };
    for (name, column_width) in [
        (view["groupField"].as_str().unwrap_or(""), 10),
        (
            if view["groupBy"] != "tipo" {
                "Tipo"
            } else {
                ""
            },
            18,
        ),
    ] {
        if !name.is_empty() {
            let mut proposed = columns.clone();
            proposed.push((name.into(), column_width));
            if spare(&proposed) >= 20 {
                columns = proposed;
            }
        }
    }
    columns[4].1 = spare(&columns).max(20);
    let border = |left: &str, middle: &str, right: &str| {
        format!(
            "{left}{}{right}\n",
            columns
                .iter()
                .map(|(_, w)| "─".repeat(w + 2))
                .collect::<Vec<_>>()
                .join(middle)
        )
    };
    if let Some(groups) = view["groups"].as_array() {
        for group in groups {
            let rows = group["rows"].as_array().expect("view rows");
            out.push_str(&format!(
                "{}\n",
                paint(
                    "1",
                    format!(
                        "▌ {}  ({})",
                        crate::sanitize::line(text(group, "name"), 200),
                        rows.len()
                    )
                )
            ));
            out.push_str(&border("┌", "┬", "┐"));
            out.push('│');
            for (label, w) in &columns {
                out.push_str(&format!(
                    " {} │",
                    paint("1", pad(&crate::sanitize::line(label, 100), *w))
                ));
            }
            out.push('\n');
            out.push_str(&border("├", "┼", "┤"));
            for row in rows {
                let suggested = |key: &str| if row[key] == true { "~" } else { "" };
                let d = row["difficulty"].as_u64().unwrap_or(0).min(3) as usize;
                let mut values = vec![
                    format!(
                        "{}{}",
                        text(row, "priority"),
                        suggested("prioritySuggested")
                    ),
                    format!(
                        "{}{}",
                        if d == 0 {
                            "—".into()
                        } else {
                            format!("{}{}", "■".repeat(d), "□".repeat(3 - d))
                        },
                        suggested("difficultySuggested")
                    ),
                    format!("#{}", row["number"]),
                    text(row, "repo").into(),
                    if text(row, "note").is_empty() {
                        text(row, "title").into()
                    } else {
                        format!("{} [{}]", text(row, "title"), text(row, "note"))
                    },
                    if text(row, "status").is_empty() {
                        "—".into()
                    } else {
                        text(row, "status").into()
                    },
                ];
                for (name, _) in columns.iter().skip(6) {
                    values.push(if name == "Tipo" {
                        text(row, "type").into()
                    } else if text(row, "group").is_empty() {
                        "—".into()
                    } else {
                        text(row, "group").into()
                    });
                }
                out.push('│');
                for (index, ((_, w), value)) in columns.iter().zip(values).enumerate() {
                    let padded = pad(&crate::sanitize::line(&value, 1000), *w);
                    let padded = if index == 0 {
                        match text(row, "priority") {
                            "P0" => paint("31;1", padded),
                            "P1" => paint("33;1", padded),
                            "P2" => paint("36", padded),
                            "P3" => paint("90", padded),
                            _ => padded,
                        }
                    } else {
                        padded
                    };
                    out.push_str(&format!(" {} │", padded));
                }
                out.push('\n');
            }
            out.push_str(&border("└", "┴", "┘"));
            out.push('\n');
        }
    }
    out
}

fn run(
    cwd: &Path,
    config: Config,
    flags: Flags,
    positional: Vec<String>,
    me: Option<String>,
) -> Result<String> {
    let verb = positional.first().map(String::as_str).unwrap_or("");
    if !["fetch", "pending", "classify", "render"].contains(&verb) {
        return Err("Uso: exonous issue-board <fetch|pending|classify|render> [flags]".into());
    }
    match verb {
        "render" => {
            let view = view(&config, &flags)?;
            Ok(if flags.contains_key("json") {
                format!("{view}\n")
            } else {
                render(&view, &flags)
            })
        }
        "pending" => {
            let classes = read(&config.data.join("classification.json"), json!({}))?;
            let (_, items) = scope(&config, &flags)?;
            let keys = [
                "key",
                "title",
                "labels",
                "status",
                "group",
                "boardPriority",
                "boardSize",
                "body",
            ];
            let items = items
                .into_iter()
                .filter(|i| classes[text(i, "key")].is_null())
                .map(|i| {
                    keys.iter()
                        .map(|k| ((*k).to_owned(), i[*k].clone()))
                        .collect::<Map<_, _>>()
                })
                .collect::<Vec<_>>();
            Ok(format!(
                "{}\n",
                json!({"types":config.types,"issues":items})
            ))
        }
        "classify" => {
            let file = positional.get(1).ok_or("Uso: classify <arquivo.json>")?;
            let entries = read(&cwd.join(file), Value::Null)?;
            let entries = entries
                .as_array()
                .ok_or("O arquivo precisa ser um array de {key,type,priority,difficulty,note?}.")?;
            let path = config.data.join("classification.json");
            let mut classes = read(&path, json!({}))?;
            if !classes.is_object() {
                return Err("invalid classification cache".into());
            }
            for e in entries {
                let key = text(e, "key");
                let difficulty = e["difficulty"]
                    .as_u64()
                    .or_else(|| e["difficulty"].as_str().and_then(|s| s.parse().ok()))
                    .unwrap_or(0);
                if !key.contains('#')
                    || !config.types.iter().any(|t| t["id"] == e["type"])
                    || !PRIORITIES.contains(&text(e, "priority"))
                    || !(1..=3).contains(&difficulty)
                {
                    return Err(format!("Nada gravado. Corrija a classificação: {key}"));
                }
                classes[key] = json!({"type":e["type"],"priority":e["priority"],"difficulty":difficulty,"note":e["note"].as_str().unwrap_or("")});
            }
            write(&config.root, &path, &classes)?;
            Ok(format!("{} classificações gravadas.\n", entries.len()))
        }
        "fetch" => {
            let me = me.ok_or("GitHub authentication missing")?;
            let org = fetch_page(&config, "organization", None)?;
            let kind = if org.is_some() {
                "organization"
            } else {
                "user"
            };
            let mut page = match org {
                Some(page) => Some(page),
                None => fetch_page(&config, kind, None)?,
            };
            let mut items = Vec::new();
            let mut seen = std::collections::BTreeSet::new();
            loop {
                let connection = page.ok_or("Project não encontrado ou sem acesso")?;
                if let Some(nodes) = connection["nodes"].as_array() {
                    items.extend(
                        nodes
                            .iter()
                            .filter_map(|node| normalize(node, &config))
                            .filter(|i| !config.done.iter().any(|s| i["status"] == *s)),
                    );
                }
                if connection["pageInfo"]["hasNextPage"] != true {
                    break;
                }
                let cursor = connection["pageInfo"]["endCursor"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .ok_or("missing pagination cursor")?;
                if !seen.insert(cursor.to_owned()) || seen.len() > 1000 {
                    return Err("invalid pagination sequence".into());
                }
                page = fetch_page(&config, kind, Some(cursor))?;
            }
            let mine = items
                .iter()
                .filter(|i| {
                    i["assignees"]
                        .as_array()
                        .is_some_and(|a| a.iter().any(|v| v == &me))
                })
                .count();
            let classes = read(&config.data.join("classification.json"), json!({}))?;
            let pending = items
                .iter()
                .filter(|i| {
                    flags.contains_key("all")
                        || i["assignees"]
                            .as_array()
                            .is_some_and(|a| a.iter().any(|v| v == &me))
                })
                .filter(|i| classes[text(i, "key")].is_null())
                .count();
            write(
                &config.root,
                &config.data.join("items.json"),
                &json!({"fetchedAt":chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis,true),"me":me,"items":items}),
            )?;
            Ok(format!(
                "Board {}#{}: {} issues abertas, {mine} atribuídas a {me}. Sem classificação no escopo: {pending}.\n",
                config.owner,
                config.number,
                items.len()
            ))
        }
        _ => unreachable!(),
    }
}

pub fn execute(home: &Path, cwd: &Path, args: &[String]) -> crate::payload::Decision {
    let fail = |code, error: String| crate::payload::Decision {
        code,
        stdout: String::new(),
        stderr: format!("{error}\n"),
    };
    let (flags, positional) = match parse(args) {
        Ok(value) => value,
        Err(error) => return fail(1, error),
    };
    let verb = positional.first().map(String::as_str).unwrap_or("");
    if !["fetch", "pending", "classify", "render"].contains(&verb) {
        return fail(
            1,
            "Uso: exonous issue-board <fetch|pending|classify|render> [flags]".into(),
        );
    }
    let me = if verb == "fetch" {
        let output = match Command::new("gh")
            .args(["api", "user", "-q", ".login"])
            .output()
        {
            Ok(output) => output,
            Err(_) => {
                return fail(
                    4,
                    "gh CLI não encontrado. Instale: https://cli.github.com".into(),
                );
            }
        };
        if !output.status.success() {
            return fail(
                2,
                format!(
                    "gh não está autenticado. Rode gh auth login -s read:project. {}",
                    crate::sanitize::line(&String::from_utf8_lossy(&output.stderr), 300)
                ),
            );
        }
        Some(String::from_utf8_lossy(&output.stdout).trim().to_owned())
    } else {
        None
    };
    let config = match config(home, cwd, &flags) {
        Ok(config) => config,
        Err(error) => return fail(3, error),
    };
    match run(cwd, config, flags, positional, me) {
        Ok(stdout) => crate::payload::Decision {
            code: 0,
            stdout,
            stderr: String::new(),
        },
        Err(error) => fail(
            if error.contains("read:project") || error.contains("INSUFFICIENT_SCOPES") {
                2
            } else {
                1
            },
            error,
        ),
    }
}

pub fn command(home: &Path, cwd: &Path, args: &[String]) -> Result<String> {
    let output = execute(home, cwd, args);
    if output.code == 0 {
        Ok(output.stdout)
    } else {
        Err(output.stderr.trim_end().into())
    }
}
