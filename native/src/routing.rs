use regex::RegexBuilder;
use serde_json::{Value, json};

fn contains(values: &Value, text: &str) -> bool {
    values
        .as_array()
        .is_some_and(|values| values.iter().any(|value| value.as_str() == Some(text)))
}

fn matches(pattern: &Value, text: &str, insensitive: bool) -> bool {
    pattern
        .as_str()
        .and_then(|pattern| {
            RegexBuilder::new(pattern)
                .case_insensitive(insensitive)
                .unicode(false)
                .build()
                .ok()
        })
        .is_some_and(|regex| regex.is_match(text))
}

fn domain(roster: &Value, prompt: &str) -> Value {
    if let Some(hints) = roster["domainHints"].as_object() {
        for (agent, pattern) in hints {
            if matches(pattern, prompt, true) {
                return Value::String(agent.clone());
            }
        }
    }
    roster["defaultImplementer"].clone()
}

pub fn route(roster: &Value, runtime: &str, requested: &str, prompt: &str) -> Value {
    if requested.is_empty() {
        return json!({"action":"allow"});
    }
    let bare = requested.rsplit(':').next().unwrap_or(requested);
    if contains(&roster["agents"], bare) {
        return if bare == requested {
            json!({"action":"allow"})
        } else {
            json!({"action":"remap","target":bare})
        };
    }
    if contains(&roster["builtins"][runtime], requested) {
        return json!({"action":"allow"});
    }
    if let Some(legacy) = roster["legacy"].as_object() {
        for (target, names) in legacy {
            if contains(names, bare) {
                return json!({"action":"remap","target":target,"legacy":bare});
            }
        }
    }
    if contains(&roster["implementers"], bare) {
        return json!({"action":"remap","target":domain(roster,prompt),"legacy":bare});
    }
    if let Some(keywords) = roster["nameKeywords"].as_array() {
        for keyword in keywords {
            if matches(&keyword[1], &bare.to_lowercase(), false) {
                let target = if keyword[0] == roster["defaultImplementer"] {
                    domain(roster, prompt)
                } else {
                    keyword[0].clone()
                };
                return json!({"action":"remap","target":target,"legacy":bare});
            }
        }
    }
    json!({"action":"deny"})
}

fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::String(value) => !value.is_empty(),
        Value::Number(value) => value.as_f64().is_some_and(|value| value != 0.0),
        _ => true,
    }
}

pub fn govern_model(roster: &Value, runtime: &str, mut input: Value) -> Value {
    let Some(agent) = input["subagent_type"].as_str() else {
        return input;
    };
    let tier = &roster["tiers"][agent];
    if runtime == "claude" && truthy(tier) && truthy(&input["model"]) && input["model"] != *tier {
        input["model"] = tier.clone();
    }
    input
}

pub fn handle_spawn(roster: &Value, runtime: &str, tool_input: Value) -> Value {
    handle_spawn_with_brief(roster, runtime, tool_input, None)
}

pub fn handle_spawn_with_brief(
    roster: &Value,
    runtime: &str,
    tool_input: Value,
    brief: Option<&str>,
) -> Value {
    let requested = tool_input["subagent_type"].as_str().unwrap_or("");
    let prompt = tool_input["prompt"].as_str().unwrap_or("");
    let decision = route(roster, runtime, requested, prompt);
    match decision["action"].as_str() {
        Some("allow") => {
            let governed = govern_model(roster, runtime, tool_input.clone());
            if governed != tool_input {
                let model = governed["model"].as_str().unwrap_or("");
                return json!({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":format!("taxis: {requested} runs on {model}"),"updatedInput":governed}});
            }
            if runtime == "cursor" {
                json!({"permission":"allow"})
            } else {
                Value::Null
            }
        }
        Some("remap") => {
            let target = &decision["target"];
            let reason = format!("taxis: {requested} → {}", target.as_str().unwrap_or(""));
            let prompt = if let Some(legacy) = decision["legacy"].as_str() {
                let header = match brief {
                    Some(path) => format!(
                        "[taxis] Running the legacy `{legacy}` role. Read {path} first and follow its contract (inputs, outputs, files written); your exo-* agent guidelines still apply."
                    ),
                    None => format!("[taxis] Requested as `{legacy}`."),
                };
                Value::String(format!("{header}\n\n{prompt}"))
            } else {
                tool_input["prompt"].clone()
            };
            let mut updated = tool_input;
            updated["subagent_type"] = target.clone();
            if decision["legacy"].is_string() || updated.get("prompt").is_some() {
                updated["prompt"] = prompt;
            }
            let updated = govern_model(roster, runtime, updated);
            if runtime == "cursor" {
                json!({"permission":"allow","updated_input":updated})
            } else {
                json!({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":reason,"updatedInput":updated}})
            }
        }
        _ => {
            let agents = roster["agents"]
                .as_array()
                .map(|agents| {
                    agents
                        .iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default();
            let message = format!(
                "Agent \"{requested}\" is outside the Exonous roster. Use one of: {agents}."
            );
            if runtime == "cursor" {
                json!({"permission":"deny","user_message":message,"agent_message":message})
            } else {
                json!({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":message}})
            }
        }
    }
}
