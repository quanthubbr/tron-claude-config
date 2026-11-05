use serde_json::{Value, json};

pub const ADAPTERS: &[&str] = &[
    "claude", "cursor", "gemini", "codex", "windsurf", "copilot", "opencode",
];

#[derive(Debug, PartialEq, Eq)]
pub struct CommandInput {
    pub command: String,
    pub cwd: String,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Decision {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

fn shell_quote(word: &str) -> String {
    if !word.is_empty()
        && word
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_/.,:=@%+-".contains(&c))
    {
        word.into()
    } else {
        format!("'{}'", word.replace('\'', "'\"'\"'"))
    }
}

fn command(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(text.into());
    }
    let words = value.as_array()?;
    if words.is_empty() {
        return None;
    }
    words
        .iter()
        .map(|word| word.as_str().map(shell_quote))
        .collect::<Option<Vec<_>>>()
        .map(|words| words.join(" "))
}

pub fn parse(_adapter: &str, raw: &str, cwd: &str) -> Option<CommandInput> {
    let input: Value = serde_json::from_str(raw).ok()?;
    input.as_object()?;
    let tool_args = match &input["toolArgs"] {
        Value::String(raw) => serde_json::from_str(raw).unwrap_or(Value::Null),
        value => value.clone(),
    };
    let command = [
        &input["tool_input"]["command"],
        &input["tool_info"]["command_line"],
        &input["command"],
        &input["args"]["command"],
        &tool_args["command"],
    ]
    .into_iter()
    .find_map(command)?;
    let cwd = [
        &input["tool_info"]["cwd"],
        &input["cwd"],
        &input["workspace_roots"][0],
    ]
    .into_iter()
    .filter_map(Value::as_str)
    .find(|text| !text.is_empty())
    .unwrap_or(cwd)
    .into();
    Some(CommandInput { command, cwd })
}

pub fn deny(adapter: &str, reason: &str) -> Decision {
    match adapter {
        "cursor" => Decision { code: 2, stdout: json!({"permission":"deny","user_message":reason,"agent_message":reason}).to_string(), stderr: format!("{reason}\n") },
        "copilot" => Decision { code: 0, stdout: json!({"permissionDecision":"deny","permissionDecisionReason":reason,"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":reason}}).to_string(), stderr: String::new() },
        _ => Decision { code: 2, stdout: String::new(), stderr: format!("{reason}\n") },
    }
}

pub fn allow(adapter: &str, warnings: &[String]) -> Decision {
    let text = warnings.join("\n");
    if adapter == "claude" && !text.is_empty() {
        return Decision { code: 0, stdout: json!({"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":text}}).to_string(), stderr: String::new() };
    }
    Decision {
        code: 0,
        stdout: if adapter == "cursor" {
            "{\"permission\":\"allow\"}".into()
        } else {
            String::new()
        },
        stderr: if text.is_empty() {
            String::new()
        } else {
            format!("{text}\n")
        },
    }
}
