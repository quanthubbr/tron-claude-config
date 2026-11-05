use crate::runtime::Result;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct JsonOwnership {
    pub path: Vec<String>,
    pub value: Value,
    pub array: bool,
}

pub fn parse_json(raw: Option<&str>, rewrite: bool) -> Result<Value> {
    let Some(raw) = raw else {
        return Ok(Value::Object(Map::new()));
    };
    let text = raw.trim_start_matches('\u{feff}');
    let value = serde_json::from_str(text)
        .or_else(|error| {
            if rewrite {
                serde_json::from_str(&strip_jsonc(text))
            } else {
                Err(error)
            }
        })
        .map_err(|_| "invalid JSON; file left untouched".to_owned())?;
    if !matches!(value, Value::Object(_)) {
        return Err("settings must be a JSON object".into());
    }
    Ok(value)
}

fn strip_jsonc(text: &str) -> String {
    let input = text.as_bytes();
    let mut out = Vec::new();
    let mut index = 0;
    let mut string = false;
    while index < input.len() {
        let byte = input[index];
        if string {
            out.push(byte);
            if byte == b'\\' && index + 1 < input.len() {
                index += 1;
                out.push(input[index]);
            } else if byte == b'"' {
                string = false;
            }
        } else if byte == b'"' {
            string = true;
            out.push(byte);
        } else if byte == b'/' && input.get(index + 1) == Some(&b'/') {
            while index < input.len() && input[index] != b'\n' {
                index += 1;
            }
            out.push(b'\n');
        } else if byte == b'/' && input.get(index + 1) == Some(&b'*') {
            index += 2;
            while index + 1 < input.len() && &input[index..index + 2] != b"*/" {
                index += 1;
            }
            if index + 1 >= input.len() {
                return text.to_owned();
            }
            index += 1;
            out.push(b' ');
        } else {
            out.push(byte);
        }
        index += 1;
    }
    let mut result = Vec::new();
    let mut index = 0;
    let mut string = false;
    while index < out.len() {
        let byte = out[index];
        if string {
            result.push(byte);
            if byte == b'\\' && index + 1 < out.len() {
                index += 1;
                result.push(out[index]);
            } else if byte == b'"' {
                string = false;
            }
        } else if byte == b'"' {
            string = true;
            result.push(byte);
        } else if byte == b',' {
            let next = out[index + 1..]
                .iter()
                .find(|byte| !byte.is_ascii_whitespace());
            if !matches!(next, Some(b'}' | b']')) {
                result.push(byte);
            }
        } else {
            result.push(byte);
        }
        index += 1;
    }
    String::from_utf8(result).unwrap_or_default()
}

fn parent<'a>(
    value: &'a mut Value,
    keys: &[String],
    create: bool,
) -> Result<Option<&'a mut Map<String, Value>>> {
    let mut node = value;
    for key in keys {
        let object = node
            .as_object_mut()
            .ok_or("settings path is not an object")?;
        if !object.contains_key(key) {
            if !create {
                return Ok(None);
            }
            object.insert(key.clone(), Value::Object(Map::new()));
        }
        node = object.get_mut(key).ok_or("missing settings key")?;
    }
    node.as_object_mut()
        .map(Some)
        .ok_or_else(|| "settings path is not an object".into())
}

pub fn merge_json(
    raw: Option<&str>,
    desired: &[JsonOwnership],
    previous: &[JsonOwnership],
    rewrite: bool,
) -> Result<(String, Vec<JsonOwnership>)> {
    let mut config = parse_json(raw, rewrite)?;
    let before = config.clone();
    for owned in previous {
        let (key, keys) = owned.path.split_last().ok_or("empty ownership path")?;
        let Some(object) = parent(&mut config, keys, false)? else {
            continue;
        };
        if owned.array {
            if let Some(value) = object.get_mut(key) {
                let list = value
                    .as_array_mut()
                    .ok_or("owned list is no longer an array")?;
                list.retain(|item| item != &owned.value);
                if list.is_empty() {
                    object.remove(key);
                }
            }
        } else if object.get(key) == Some(&owned.value) {
            object.remove(key);
        }
    }
    let mut ownership = Vec::new();
    for owned in desired {
        let (key, keys) = owned.path.split_last().ok_or("empty ownership path")?;
        let object = parent(&mut config, keys, true)?.ok_or("cannot create settings path")?;
        if owned.array {
            let list = object
                .entry(key.clone())
                .or_insert_with(|| Value::Array(Vec::new()))
                .as_array_mut()
                .ok_or("settings value is not an array")?;
            if !list.contains(&owned.value) {
                list.push(owned.value.clone());
                ownership.push(owned.clone());
            }
        } else if !object.contains_key(key) {
            object.insert(key.clone(), owned.value.clone());
            ownership.push(owned.clone());
        }
    }
    if config == before
        && let Some(raw) = raw
    {
        return Ok((raw.to_owned(), ownership));
    }
    let bom = if raw.is_some_and(|raw| raw.starts_with('\u{feff}')) {
        "\u{feff}"
    } else {
        ""
    };
    Ok((
        format!(
            "{bom}{}\n",
            serde_json::to_string_pretty(&config).map_err(|_| "cannot serialize settings")?
        ),
        ownership,
    ))
}

pub fn migrate_legacy_hooks(raw: &str, rewrite: bool) -> Result<String> {
    let mut config = parse_json(Some(raw), rewrite)?;
    let before = config.clone();
    if let Some(hooks) = config.get_mut("hooks") {
        for entries in hooks
            .as_object_mut()
            .ok_or("hooks must be an object")?
            .values_mut()
        {
            let Some(entries) = entries.as_array_mut() else {
                return Err("hook event must be an array".into());
            };
            entries.retain(|entry| {
                let text = entry.to_string().replace("\\\\", "/").replace('\\', "/");
                !text.contains("/.claude/exonous/hooks/")
                    && !text.contains("/.claude/exonous/taxis.js")
            });
        }
    }
    if config == before {
        return Ok(raw.into());
    }
    Ok(format!(
        "{}\n",
        serde_json::to_string_pretty(&config).map_err(|_| "cannot serialize migrated hooks")?
    ))
}

#[derive(Clone, Debug)]
pub struct Section {
    pub outside: String,
    pub body: Option<String>,
}

fn span(text: &str, style: &str) -> Result<Option<(usize, usize, usize, usize)>> {
    let prefix = if style == "hash" {
        "# exonous:start"
    } else {
        "<!-- exonous:start"
    };
    let end_marker = if style == "hash" {
        "# exonous:end"
    } else {
        "<!-- exonous:end -->"
    };
    let pattern = if style == "hash" {
        r"^# exonous:start(?: v\d+)?$"
    } else {
        r"^<!-- exonous:start(?: v\d+)? -->$"
    };
    let start_re = regex::Regex::new(pattern).map_err(|_| "invalid marker pattern")?;
    let mut start = None;
    let mut end = None;
    let mut offset = 0;
    for line in text.split_inclusive('\n') {
        let content = line.trim();
        if content.starts_with(prefix) && start_re.is_match(content) {
            if start.is_some() || end.is_some() {
                return Err("malformed Exonous marker; file left untouched".into());
            }
            start = Some((offset, offset + line.len()));
        } else if content == end_marker {
            if start.is_none() || end.is_some() {
                return Err("malformed Exonous marker; file left untouched".into());
            }
            end = Some((offset, offset + line.trim_end_matches(['\r', '\n']).len()));
        }
        offset += line.len();
    }
    match (start, end) {
        (Some((start, body)), Some((body_end, end))) => Ok(Some((start, body, body_end, end))),
        (None, None) => Ok(None),
        _ => Err("malformed Exonous marker; file left untouched".into()),
    }
}

pub fn remove_section(text: &str, style: &str) -> Result<Section> {
    let Some((start, body, body_end, end)) = span(text, style)? else {
        return Ok(Section {
            outside: text.into(),
            body: None,
        });
    };
    let mut before = text[..start].to_owned();
    let after = &text[end..];
    let eof = after.is_empty();
    let after = after
        .strip_prefix("\r\n")
        .or_else(|| after.strip_prefix('\n'))
        .unwrap_or(after);
    let eol = if text.contains("\r\n") { "\r\n" } else { "\n" };
    if after.is_empty() && before.ends_with(&format!("{eol}{eol}")) {
        before.truncate(before.len() - eol.len() * if eof { 2 } else { 1 });
    }
    before.push_str(after);
    Ok(Section {
        outside: before,
        body: Some(text[body..body_end].into()),
    })
}

pub fn upsert_section(text: &str, body: &str, style: &str) -> Result<String> {
    if span(body, style)?.is_some() {
        return Err("nested Exonous marker".into());
    }
    let eol = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let start = if style == "hash" {
        "# exonous:start"
    } else {
        "<!-- exonous:start v2 -->"
    };
    let end = if style == "hash" {
        "# exonous:end"
    } else {
        "<!-- exonous:end -->"
    };
    let body = body
        .replace("\r\n", "\n")
        .trim_end_matches('\n')
        .replace('\n', eol);
    let block = format!("{start}{eol}{body}{eol}{end}");
    if let Some((start, _, _, end)) = span(text, style)? {
        return Ok(format!("{}{block}{}", &text[..start], &text[end..]));
    }
    Ok(if text.is_empty() {
        format!("{block}{eol}")
    } else if text.ends_with('\n') {
        format!("{text}{eol}{block}{eol}")
    } else {
        format!("{text}{eol}{eol}{block}")
    })
}

pub fn split_mcp(body: &str, owned: &[String]) -> (String, String) {
    let mut ours = String::new();
    let mut foreign = String::new();
    let mut mine = false;
    for line in body.split_inclusive('\n') {
        if line.trim_start().starts_with('[') {
            let header = line.trim().split('#').next().unwrap_or("").trim();
            mine = owned.iter().any(|name| {
                [
                    format!("[mcp_servers.{name}]"),
                    format!("[mcp_servers.\"{name}\"]"),
                    format!("[mcp_servers.'{name}']"),
                ]
                .contains(&header.to_owned())
            });
        }
        if mine {
            ours.push_str(line);
        } else {
            foreign.push_str(line);
        }
    }
    (ours, foreign)
}

pub fn mcp_toml(
    raw: &str,
    entries: &Map<String, Value>,
    owned: &[String],
) -> Result<(String, String)> {
    toml::from_str::<toml::Value>(raw).map_err(|_| "invalid TOML; file left untouched")?;
    let removed = remove_section(raw, "hash")?;
    let (_, foreign) = split_mcp(removed.body.as_deref().unwrap_or(""), owned);
    let mut outside = removed.outside;
    if !foreign.trim().is_empty() {
        outside.push_str(&format!("\n{}\n", foreign.trim_end()));
    }
    let parsed =
        toml::from_str::<toml::Value>(&outside).map_err(|_| "invalid foreign TOML tables")?;
    let mut body = String::new();
    for (name, entry) in entries {
        if parsed
            .get("mcp_servers")
            .and_then(|value| value.get(name))
            .is_some()
        {
            continue;
        }
        let entry = entry.as_object().ok_or("invalid MCP entry")?;
        body.push_str(&format!("[mcp_servers.{name}]\n"));
        for (key, value) in entry {
            if value.is_string() || value.is_array() {
                body.push_str(&format!(
                    "{key} = {}\n",
                    serde_json::to_string(value).map_err(|_| "invalid MCP value")?
                ));
            } else {
                return Err("unsupported MCP value".into());
            }
        }
        body.push('\n');
    }
    let next = if body.is_empty() {
        outside
    } else {
        upsert_section(&outside, &body, "hash")?
    };
    toml::from_str::<toml::Value>(&next).map_err(|_| "MCP update would invalidate TOML")?;
    Ok((next, body))
}
