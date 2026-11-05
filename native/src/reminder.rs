use serde_json::{Value, json};

pub const REMINDER: &str = "exonous rules in force (nomos + praxis): terse; smallest change; reuse first; close scope; locate before reading; test first, fix cause, prove; commit/push only when asked.";

pub fn render(adapter: &str, env_disabled: bool, config: &Value) -> String {
    if env_disabled || config.get("rulesReminder") == Some(&Value::Bool(false)) {
        return String::new();
    }
    let adapter = if adapter.is_empty() {
        "claude"
    } else {
        adapter
    };
    let adapter: String = adapter
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .collect();
    let output = match adapter.as_str() {
        "claude" => json!({"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":REMINDER}}).to_string(),
        "gemini" => json!({"hookSpecificOutput":{"hookEventName":"BeforeAgent","additionalContext":REMINDER}}).to_string(),
        "cursor" => json!({"additional_context":REMINDER}).to_string(),
        "copilot" => json!({"additionalContext":REMINDER}).to_string(),
        "codex" => REMINDER.into(),
        _ => return String::new(),
    };
    format!("{output}\n")
}
