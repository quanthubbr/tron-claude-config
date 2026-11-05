use exonous::{payload, reminder, routing};
use serde_json::{Value, json};

fn parsed(adapter: &str, input: Value) -> payload::CommandInput {
    payload::parse(adapter, &input.to_string(), "/fallback").unwrap()
}

fn output(raw: &str) -> Value {
    serde_json::from_str(raw).unwrap()
}

#[test]
fn every_adapter_normalizes_command_and_cwd() {
    let command = "git commit -m \"x\"";
    for (adapter, input) in [
        (
            "claude",
            json!({"tool_input":{"command":command},"cwd":"/r"}),
        ),
        (
            "cursor",
            json!({"command":command,"cwd":"/r","workspace_roots":["/w"]}),
        ),
        (
            "gemini",
            json!({"tool_input":{"command":command},"cwd":"/r"}),
        ),
        (
            "codex",
            json!({"tool_input":{"command":command},"cwd":"/r"}),
        ),
        (
            "windsurf",
            json!({"tool_info":{"command_line":command,"cwd":"/r"}}),
        ),
        (
            "copilot",
            json!({"tool_input":{"command":command},"cwd":"/r"}),
        ),
        ("opencode", json!({"args":{"command":command},"cwd":"/r"})),
        ("vim", json!({"tool_input":{"command":command},"cwd":"/r"})),
    ] {
        assert_eq!(
            parsed(adapter, input),
            payload::CommandInput {
                command: command.into(),
                cwd: "/r".into()
            }
        );
    }
}

#[test]
fn serialized_tool_args_argv_and_extraction_precedence() {
    assert_eq!(
        parsed("copilot", json!({"toolArgs":"{\"command\":\"ls\"}"})).command,
        "ls"
    );
    let command = parsed(
        "codex",
        json!({"tool_input":{"command":["bash","-lc","git commit -m 'it''s'"]}}),
    )
    .command;
    assert_eq!(
        command,
        "bash -lc 'git commit -m '\"'\"'it'\"'\"''\"'\"'s'\"'\"''"
    );
    assert_eq!(
        parsed(
            "claude",
            json!({"tool_input":{"command":""},"command":"ignored"})
        )
        .command,
        ""
    );
    assert_eq!(parsed("claude", json!({"tool_input":{"command":42},"tool_info":{"command_line":"second"},"command":"third"})).command, "second");
    assert_eq!(
        parsed(
            "codex",
            json!({"command":["", "a b", "a'b", "$x", "safe/@%:+=,.-"]})
        )
        .command,
        "'' 'a b' 'a'\"'\"'b' '$x' safe/@%:+=,.-"
    );
    assert_eq!(
        parsed("claude", json!({"toolArgs":{"command":"object"}})).command,
        "object"
    );
}

#[test]
fn cwd_uses_tool_info_then_cwd_then_workspace_then_fallback() {
    for (input, expected) in [
        (
            json!({"command":"ls","tool_info":{"cwd":"/tool"},"cwd":"/r"}),
            "/tool",
        ),
        (
            json!({"command":"ls","tool_info":{"cwd":""},"cwd":"/r"}),
            "/r",
        ),
        (json!({"command":"ls","workspace_roots":["/w"]}), "/w"),
        (
            json!({"command":"ls","workspace_roots":["", "/ignored"]}),
            "/fallback",
        ),
        (json!({"command":"ls"}), "/fallback"),
    ] {
        assert_eq!(parsed("cursor", input).cwd, expected);
    }
}

#[test]
fn unreadable_and_commandless_inputs_fail_open() {
    for raw in [
        "",
        "not json",
        "[]",
        "null",
        "true",
        "42",
        "{\"tool_input\":{\"file_path\":\"/x\"}}",
        "{\"tool_input\":{\"command\":42}}",
        "{\"command\":[]}",
        "{\"command\":[\"ls\",42]}",
        "{\"toolArgs\":\"[]\"}",
        "{\"toolArgs\":\"broken\"}",
    ] {
        assert!(payload::parse("claude", raw, "/r").is_none(), "{raw}");
    }
}

#[test]
fn deny_and_allow_follow_each_host_protocol() {
    for adapter in ["claude", "gemini", "codex", "windsurf", "opencode", "vim"] {
        assert_eq!(
            payload::deny(adapter, "no"),
            payload::Decision {
                code: 2,
                stdout: String::new(),
                stderr: "no\n".into()
            }
        );
    }
    let cursor = payload::deny("cursor", "no");
    assert_eq!(cursor.code, 2);
    assert_eq!(cursor.stderr, "no\n");
    assert_eq!(
        output(&cursor.stdout),
        json!({"permission":"deny","user_message":"no","agent_message":"no"})
    );
    assert_eq!(
        payload::allow("cursor", &[]).stdout,
        "{\"permission\":\"allow\"}"
    );
    let copilot = payload::deny("copilot", "no");
    assert_eq!(copilot.code, 0);
    assert_eq!(copilot.stderr, "");
    assert_eq!(
        output(&copilot.stdout),
        json!({"permissionDecision":"deny","permissionDecisionReason":"no","hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"no"}})
    );
    for adapter in ["claude", "copilot", "codex"] {
        assert_eq!(
            payload::allow(adapter, &[]),
            payload::Decision {
                code: 0,
                stdout: String::new(),
                stderr: String::new()
            }
        );
    }
    let warnings = vec!["careful".into(), "again".into()];
    assert_eq!(
        output(&payload::allow("claude", &warnings).stdout),
        json!({"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"careful\nagain"}})
    );
    assert_eq!(payload::allow("claude", &warnings).stderr, "");
    assert_eq!(
        payload::allow("codex", &warnings).stderr,
        "careful\nagain\n"
    );
    assert_eq!(
        payload::allow("cursor", &warnings).stderr,
        "careful\nagain\n"
    );
}

#[test]
fn reminder_preserves_channels_newlines_and_opt_outs() {
    for (adapter, event) in [("claude", "UserPromptSubmit"), ("gemini", "BeforeAgent")] {
        let raw = reminder::render(adapter, false, &Value::Null);
        assert!(raw.ends_with('\n'));
        assert_eq!(
            output(&raw),
            json!({"hookSpecificOutput":{"hookEventName":event,"additionalContext":reminder::REMINDER}})
        );
    }
    assert_eq!(
        output(&reminder::render("cursor", false, &json!({}))),
        json!({"additional_context":reminder::REMINDER})
    );
    assert_eq!(
        output(&reminder::render("copilot", false, &json!({}))),
        json!({"additionalContext":reminder::REMINDER})
    );
    assert_eq!(
        reminder::render("codex", false, &json!({})),
        format!("{}\n", reminder::REMINDER)
    );
    assert!(!reminder::render("claude", false, &json!({"rulesReminder":0})).is_empty());
    assert_eq!(reminder::render("claude", true, &json!({})), "");
    assert_eq!(
        reminder::render("claude", false, &json!({"rulesReminder":false})),
        ""
    );
    assert!(
        !reminder::render(
            "claude",
            false,
            &json!({"rulesReminder":true,"memory":false})
        )
        .is_empty()
    );
    for adapter in [
        "windsurf",
        "opencode",
        "kiro",
        "../evil",
        "toString",
        "constructor",
        "hasOwnProperty",
    ] {
        assert_eq!(reminder::render(adapter, false, &json!({})), "");
    }
    assert_eq!(
        reminder::render("clau/de", false, &Value::Null),
        reminder::render("claude", false, &Value::Null)
    );
    assert_eq!(
        reminder::render("", false, &Value::Null),
        reminder::render("claude", false, &Value::Null)
    );
    assert!(reminder::REMINDER.len() <= 200);
    for phrase in [
        "terse",
        "smallest change",
        "locate before reading",
        "test first",
        "only when asked",
    ] {
        assert!(reminder::REMINDER.contains(phrase));
    }
}

fn roster() -> Value {
    serde_json::from_str(include_str!("../../assets/agents/roster.json")).unwrap()
}

#[test]
fn routing_preserves_roster_builtins_aliases_and_denials() {
    let roster = roster();
    for runtime in ["claude", "cursor"] {
        for requested in ["", "exo-backend", "exo-security"] {
            assert_eq!(
                routing::route(&roster, runtime, requested, ""),
                json!({"action":"allow"})
            );
        }
        assert_eq!(
            routing::route(&roster, runtime, "plugin:exo-frontend", ""),
            json!({"action":"remap","target":"exo-frontend"})
        );
        for (name, target) in [
            ("rust-build-resolver", "exo-backend"),
            ("planner", "exo-pm"),
            ("architect", "exo-cto"),
            ("security-reviewer", "exo-security"),
        ] {
            assert_eq!(
                routing::route(&roster, runtime, name, ""),
                json!({"action":"remap","target":target,"legacy":name})
            );
        }
        assert_eq!(
            routing::route(&roster, runtime, "zzzz", ""),
            json!({"action":"deny"})
        );
    }
    assert_eq!(
        routing::route(&roster, "claude", "Explore", ""),
        json!({"action":"allow"})
    );
    assert_eq!(
        routing::route(&roster, "cursor", "browser-use", ""),
        json!({"action":"allow"})
    );
    assert_eq!(
        routing::route(&roster, "claude", "browser-use", ""),
        json!({"action":"deny"})
    );
}

#[test]
fn implementers_route_by_domain_in_declared_order() {
    let roster = roster();
    for (prompt, target) in [
        ("Swift React mobile", "exo-mobile"),
        ("React SQL schema", "exo-frontend"),
        ("Terraform Docker", "exo-infra"),
        ("Docker Postgres", "exo-devops"),
        ("Postgres schema", "exo-data-ai"),
        ("fix server", "exo-backend"),
    ] {
        assert_eq!(
            routing::route(&roster, "claude", "build-error-resolver", prompt),
            json!({"action":"remap","target":target,"legacy":"build-error-resolver"})
        );
    }
    assert_eq!(
        routing::route(&roster, "claude", "plugin:custom-developer", "Expo"),
        json!({"action":"remap","target":"exo-mobile","legacy":"custom-developer"})
    );
    assert_eq!(
        routing::route(&roster, "claude", "custom-security-reviewer", ""),
        json!({"action":"remap","target":"exo-security","legacy":"custom-security-reviewer"})
    );
}

#[test]
fn model_governance_changes_only_explicit_wrong_claude_tiers() {
    let roster = roster();
    let input = json!({"subagent_type":"exo-backend","model":"sonnet","prompt":"implement"});
    assert_eq!(
        routing::govern_model(&roster, "claude", input.clone()),
        json!({"subagent_type":"exo-backend","model":"opus","prompt":"implement"})
    );
    assert_eq!(
        routing::govern_model(&roster, "cursor", input.clone()),
        input
    );
    for input in [
        json!({"subagent_type":"exo-backend"}),
        json!({"subagent_type":"exo-backend","model":"opus"}),
        json!({"subagent_type":"unknown","model":"sonnet"}),
        json!({"subagent_type":"exo-backend","model":""}),
        json!({"subagent_type":"exo-backend","model":false}),
    ] {
        assert_eq!(
            routing::govern_model(&roster, "claude", input.clone()),
            input
        );
    }
}

#[test]
fn spawn_output_preserves_host_decisions_and_governed_inputs() {
    let roster = roster();
    assert_eq!(
        routing::handle_spawn(&roster, "claude", json!({"subagent_type":"exo-cto"})),
        Value::Null
    );
    assert_eq!(
        routing::handle_spawn(&roster, "cursor", json!({"subagent_type":"exo-cto"})),
        json!({"permission":"allow"})
    );
    assert_eq!(
        routing::handle_spawn(
            &roster,
            "claude",
            json!({"subagent_type":"exo-backend","model":"sonnet"})
        ),
        json!({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"taxis: exo-backend runs on opus","updatedInput":{"subagent_type":"exo-backend","model":"opus"}}})
    );
    let remapped = routing::handle_spawn(
        &roster,
        "claude",
        json!({"subagent_type":"rust-build-resolver","model":"sonnet","prompt":"fix"}),
    );
    assert_eq!(
        remapped,
        json!({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"taxis: rust-build-resolver → exo-backend","updatedInput":{"subagent_type":"exo-backend","model":"opus","prompt":"[taxis] Requested as `rust-build-resolver`.\n\nfix"}}})
    );
    assert_eq!(
        routing::handle_spawn(
            &roster,
            "cursor",
            json!({"subagent_type":"pkg:exo-qa","prompt":"test"})
        ),
        json!({"permission":"allow","updated_input":{"subagent_type":"exo-qa","prompt":"test"}})
    );
    for runtime in ["claude", "cursor"] {
        let denied = routing::handle_spawn(&roster, runtime, json!({"subagent_type":"zzzz"}));
        let reason = format!(
            "Agent \"zzzz\" is outside the Exonous roster. Use one of: {}.",
            roster["agents"]
                .as_array()
                .unwrap()
                .iter()
                .map(|value| value.as_str().unwrap())
                .collect::<Vec<_>>()
                .join(", ")
        );
        if runtime == "cursor" {
            assert_eq!(
                denied,
                json!({"permission":"deny","user_message":reason,"agent_message":reason})
            );
        } else {
            assert_eq!(
                denied,
                json!({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":reason}})
            );
        }
    }
}
