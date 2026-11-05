use exonous::{gate, handoff, install, memory, reminder, routing, runtime, template, token, vault};
use serde_json::{Value, json};
use std::io::{Read, Write};

const USAGE: &str = "exonous — native policy runtime\n\nCommands:\n  install|setup [--tools a,b] [--dry-run] [--real-home]\n  uninstall --yes [--dry-run]\n  doctor [--json]\n  gate --selftest <tool>\n  update [--check] [--major]\n  migrate [--repo <dir>] [--dry-run] [--json]\n  workflow <commit|pr>\n  template\n  validate-pr <file>\n  draft-path\n  token <commit|push>\n  agents <list|route <name> [prompt]>\n  vault <show|detect|set|consolidate|graph>\n  handoff <save|latest>\n  project-memory <add|update|search|show|list|validate|remove>\n  doc <locate|refs>\n  issue-board <fetch|pending|classify|render>\n  ui-design [--skill-dir <dir>] <verb>\n  hook <pyle|ethos|taxis|metron|kairos> --adapter <tool>\n  hook anamnesis --event <start|prompt|tool|stop|end> --adapter <tool>\n  status --json\n";

fn usage(message: &str) -> (i32, String) {
    (2, message.into())
}
fn failure(message: String) -> (i32, String) {
    (1, message)
}

fn adapter(args: &[String]) -> Result<&str, (i32, String)> {
    if args.is_empty() {
        return Ok("claude");
    }
    if args.len() == 2 && args[0] == "--adapter" && !args[1].is_empty() {
        return Ok(&args[1]);
    }
    Err(usage("usage: hook <name> --adapter <tool>"))
}

fn stdin_json() -> Result<Value, (i32, String)> {
    let mut bytes = Vec::new();
    std::io::stdin()
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| usage("cannot read hook input"))?;
    if bytes.len() > 1024 * 1024 {
        return Err(usage("hook input exceeds size limit"));
    }
    serde_json::from_slice(&bytes).map_err(|_| usage("invalid hook input"))
}

fn emit(value: Value) {
    if !value.is_null() {
        print!("{value}");
    }
}

fn emit_decision(output: exonous::payload::Decision) -> Result<(), (i32, String)> {
    print!("{}", output.stdout);
    eprint!("{}", output.stderr);
    std::io::stdout()
        .flush()
        .map_err(|_| failure("cannot write command output".into()))?;
    if output.code != 0 {
        std::process::exit(output.code);
    }
    Ok(())
}

fn find_brief(home: &std::path::Path, name: &str) -> Option<String> {
    if name.is_empty()
        || name.contains("..")
        || !name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
    {
        return None;
    }
    let root = home.join(".claude/exonous/agent-roles");
    if std::fs::symlink_metadata(&root)
        .ok()?
        .file_type()
        .is_symlink()
    {
        return None;
    }
    let mut groups = std::fs::read_dir(root)
        .ok()?
        .filter_map(Result::ok)
        .collect::<Vec<_>>();
    groups.sort_by_key(|group| group.file_name());
    for group in groups {
        if !group.file_type().ok()?.is_dir() {
            continue;
        }
        let path = group.path().join(format!("{name}.md"));
        if std::fs::symlink_metadata(&path).is_ok_and(|m| m.is_file()) {
            return Some(path.to_string_lossy().into_owned());
        }
    }
    None
}

fn sweep_agents(home: &std::path::Path, roster: &Value) -> runtime::Result<()> {
    use std::fs::{self, OpenOptions};
    for relative in [".claude/agents", ".cursor/agents"] {
        let source = home.join(relative);
        if !source.exists() {
            continue;
        }
        runtime::ensure_private_dir(home, &source)?;
        for entry in fs::read_dir(&source).map_err(|_| "cannot inspect agent directory")? {
            let entry = entry.map_err(|_| "cannot inspect agent file")?;
            let name = entry.file_name().to_string_lossy().into_owned();
            let Some(stem) = name.strip_suffix(".md") else {
                continue;
            };
            if roster["agents"]
                .as_array()
                .is_some_and(|agents| agents.iter().any(|agent| agent == stem))
                || !entry
                    .file_type()
                    .map_err(|_| "cannot inspect agent type")?
                    .is_file()
            {
                continue;
            }
            let group = if name.starts_with("impeccable-") {
                "impeccable"
            } else {
                "quarantine"
            };
            let directory = home.join(".claude/exonous/agent-roles").join(group);
            runtime::ensure_private_dir(home, &directory)?;
            let body = std::fs::read(entry.path()).map_err(|_| "cannot read agent brief")?;
            for index in 0..10000 {
                let destination = directory.join(if index == 0 {
                    name.clone()
                } else {
                    format!("{stem}.{index}.md")
                });
                let mut options = OpenOptions::new();
                options.write(true).create_new(true);
                #[cfg(unix)]
                {
                    use std::os::unix::fs::OpenOptionsExt;
                    options.mode(0o600);
                }
                let mut file = match options.open(&destination) {
                    Ok(file) => file,
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                    Err(_) => return Err("cannot preserve agent brief".into()),
                };
                file.write_all(&body)
                    .and_then(|_| file.sync_all())
                    .map_err(|_| "cannot persist agent brief")?;
                if std::fs::symlink_metadata(entry.path()).is_ok_and(|m| m.is_file())
                    && std::fs::read(entry.path()).is_ok_and(|current| current == body)
                {
                    std::fs::remove_file(entry.path())
                        .map_err(|_| "cannot retire copied agent brief")?;
                }
                break;
            }
        }
    }
    Ok(())
}

fn taxis(host: &str, home: &std::path::Path) -> Result<(), (i32, String)> {
    let allowed = || {
        if host == "cursor" {
            json!({"permission":"allow"})
        } else {
            Value::Null
        }
    };
    let Ok(input) = stdin_json() else {
        emit(allowed());
        return Ok(());
    };
    if host == "claude"
        && input
            .get("cursor_version")
            .is_some_and(|v| !v.is_null() && v != false && v != "" && v != 0)
    {
        emit(json!({}));
        return Ok(());
    }
    let event = input["hook_event_name"]
        .as_str()
        .unwrap_or("")
        .to_ascii_lowercase();
    if event == "sessionstart" {
        if let Err(error) = sweep_agents(home, &roster()) {
            eprintln!("[taxis] guard error (failing open): {error}");
        }
        if host == "cursor" {
            emit(json!({}));
        }
        return Ok(());
    }
    let roster = roster();
    if event == "subagentstart" {
        let requested = input["subagent_type"].as_str().unwrap_or("");
        let decision = routing::route(
            &roster,
            host,
            requested,
            input["task"].as_str().unwrap_or(""),
        );
        if decision["action"] == "allow" {
            emit(json!({"permission":"allow"}));
        } else {
            let message = if decision["action"] == "remap" {
                format!(
                    "Agent \"{requested}\" is folded into {}; spawn {} instead.",
                    decision["target"].as_str().unwrap_or(""),
                    decision["target"].as_str().unwrap_or("")
                )
            } else {
                format!(
                    "Agent \"{requested}\" is outside the Exonous roster. Use one of: {}.",
                    roster["agents"]
                        .as_array()
                        .expect("roster agents")
                        .iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            };
            emit(json!({"permission":"deny","user_message":message}));
        }
    } else if event == "pretooluse"
        && input["tool_name"]
            .as_str()
            .is_some_and(|name| ["Task", "Agent"].contains(&name))
    {
        let tool = input["tool_input"]
            .as_object()
            .map(|v| Value::Object(v.clone()))
            .unwrap_or_else(|| json!({}));
        let decision = routing::route(
            &roster,
            host,
            tool["subagent_type"].as_str().unwrap_or(""),
            tool["prompt"].as_str().unwrap_or(""),
        );
        let brief = decision["legacy"]
            .as_str()
            .and_then(|name| find_brief(home, name));
        emit(routing::handle_spawn_with_brief(
            &roster,
            host,
            tool,
            brief.as_deref(),
        ));
    } else {
        emit(allowed());
    }
    Ok(())
}

fn hook(args: &[String], home: &std::path::Path) -> Result<(), (i32, String)> {
    let Some(name) = args.first().map(String::as_str) else {
        return Err(usage("hook name required"));
    };
    if name == "kairos" {
        let worker = args[1..].iter().any(|arg| arg == "--run");
        let options = args[1..]
            .iter()
            .filter(|arg| arg.as_str() != "--run")
            .cloned()
            .collect::<Vec<_>>();
        let host = adapter(&options)?;
        let cwd =
            std::env::current_dir().map_err(|_| failure("cannot read working directory".into()))?;
        print!(
            "{}",
            exonous::update::hook(home, &cwd, host, worker).unwrap_or_default()
        );
        return Ok(());
    }
    if name == "anamnesis" {
        let mut host = "claude";
        let mut event = "";
        let mut options = args[1..].chunks_exact(2);
        for pair in &mut options {
            match pair[0].as_str() {
                "--adapter" => host = &pair[1],
                "--event" => event = &pair[1],
                _ => return Err(usage("unknown memory hook option")),
            }
        }
        if !options.remainder().is_empty() {
            return Err(usage("memory hook option requires a value"));
        }
        let host = host
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || "_-".contains(*c))
            .collect::<String>();
        let input = stdin_json().unwrap_or_else(|_| json!({}));
        let cwd =
            std::env::current_dir().map_err(|_| failure("cannot read working directory".into()))?;
        let memory_vault = std::env::var_os("PROJECT_MEMORY_VAULT").map(std::path::PathBuf::from);
        let context = memory::Context {
            home,
            cwd: &cwd,
            agent: &host,
            now: runtime::now_ms() as i64,
            vault_override: memory_vault.as_deref(),
            disabled: std::env::var("EXONOUS_MEMORY").as_deref() == Ok("0"),
        };
        match memory::handle(&context, event, &input) {
            Ok(brief) if !brief.is_empty() => match host.as_str() {
                "claude" | "gemini" => println!(
                    "{}",
                    json!({"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":brief}})
                ),
                "cursor" => println!("{}", json!({"additional_context":brief})),
                "copilot" => println!("{}", json!({"additionalContext":brief})),
                "codex" => println!("{brief}"),
                _ => {}
            },
            Err(error) => eprintln!("[anamnesis] {}", exonous::sanitize::line(&error, 200)),
            _ => {}
        }
        return Ok(());
    }
    let host = adapter(&args[1..])?;
    match name {
        "pyle" => {
            let mut raw = String::new();
            let input = std::io::stdin()
                .take(1024 * 1024 + 1)
                .read_to_string(&mut raw);
            let cwd = std::env::current_dir()
                .map_err(|_| failure("cannot read working directory".into()))?;
            let decision = if input.is_err() || raw.len() > 1024 * 1024 {
                exonous::payload::deny(host, "cannot safely read gate input")
            } else {
                gate::run(home, &cwd, host, &raw)
            };
            print!("{}", decision.stdout);
            eprint!("{}", decision.stderr);
            if decision.code != 0 {
                std::process::exit(decision.code);
            }
        }
        "ethos" => {
            let config =
                runtime::read_limited(&home.join(".claude/exonous/config.json"), 1024 * 1024)
                    .ok()
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or(Value::Null);
            print!(
                "{}",
                reminder::render(
                    host,
                    std::env::var("EXONOUS_RULES_REMINDER").as_deref() == Ok("0"),
                    &config
                )
            );
        }
        "taxis" => {
            if !["claude", "cursor"].contains(&host) {
                return Err(usage("taxis supports claude or cursor"));
            }
            taxis(host, home)?;
        }
        "metron" => {
            let Ok(input) = stdin_json() else {
                return Ok(());
            };
            let args = &input["tool_input"];
            let bounded = ["limit", "offset", "pages"].iter().any(|k| match &args[k] {
                Value::Null | Value::Bool(false) => false,
                Value::Number(n) => n.as_f64() != Some(0.0),
                Value::String(s) => !s.is_empty(),
                _ => true,
            });
            if let Some(file) = args["file_path"].as_str().filter(|_| !bounded)
                && let Ok(text) =
                    runtime::read_limited(std::path::Path::new(file), 20 * 1024 * 1024)
            {
                let lines = text.bytes().filter(|b| *b == b'\n').count() + 1;
                if lines > 400 {
                    let message = format!(
                        "{file} has {lines} lines. Unless you are about to edit most of it, locate first (atlas search_graph / get_code_snippet, or grep -n) and Read only the needed range with offset/limit."
                    );
                    print!(
                        "{}",
                        json!({"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":message}})
                    );
                }
            }
        }
        _ => {
            return Err(usage(
                "unknown or unmigrated hook; keep existing runtime during migration",
            ));
        }
    }
    Ok(())
}

fn roster() -> Value {
    serde_json::from_str(include_str!("../../assets/agents/roster.json")).expect("bundled roster")
}

fn forward_newer(home: &std::path::Path, args: &[String]) -> Result<(), (i32, String)> {
    if std::env::var("EXONOUS_NO_FORWARD").as_deref() == Ok("1")
        || args
            .first()
            .is_some_and(|name| ["hook", "install", "setup"].contains(&name.as_str()))
    {
        return Ok(());
    }
    let Some(info) = runtime::read_limited(&home.join(".claude/exonous/install.json"), 1024 * 1024)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
    else {
        return Ok(());
    };
    let parts = |version: &str| {
        version
            .split('.')
            .map(str::parse::<u64>)
            .collect::<Result<Vec<_>, _>>()
            .ok()
            .filter(|parts| parts.len() == 3)
    };
    let current = parts(env!("CARGO_PKG_VERSION")).expect("package version");
    if info["version"]
        .as_str()
        .and_then(parts)
        .is_none_or(|version| version <= current)
    {
        return Ok(());
    }
    let Some(binary) = exonous::update::active_binary(home).map_err(failure)? else {
        return Ok(());
    };
    if std::env::current_exe().ok().as_ref() == Some(&binary) {
        return Ok(());
    }
    let mut command = std::process::Command::new(binary);
    command.args(args).env("EXONOUS_NO_FORWARD", "1");
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        let _ = command.exec();
        Err(failure("cannot launch active native runtime".into()))
    }
    #[cfg(not(unix))]
    {
        let status = command
            .status()
            .map_err(|_| failure("cannot launch active native runtime".into()))?;
        std::process::exit(status.code().unwrap_or(1));
    }
}

fn run(args: &[String]) -> Result<(), (i32, String)> {
    let name = args.first().map(String::as_str).unwrap_or("help");
    if ["help", "--help", "-h"].contains(&name) {
        print!("{USAGE}");
        return Ok(());
    }
    let home = runtime::home().map_err(failure)?;
    forward_newer(&home, args)?;
    if name == "--version" {
        println!("{}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }
    if name == "status" && args.get(1).map(String::as_str) == Some("--json") && args.len() == 2 {
        println!(
            "{}",
            json!({"runtime":"rust","native":["install","setup","uninstall","update","doctor","gate","migrate","workflow","template","validate-pr","draft-path","token","agents","vault","handoff","project-memory","doc","issue-board","ui-design"],"hooks":exonous::NATIVE_CAPABILITIES,"compatibility":["legacy npm CLI","legacy skill helpers"],"externalRuntimes":["host plugin bridges","design/browser engines","maintenance source-review tooling"]})
        );
        return Ok(());
    }
    let cwd =
        std::env::current_dir().map_err(|_| failure("cannot read working directory".into()))?;
    match name {
        "project-memory" => {
            emit_decision(exonous::project_memory::execute(&home, &cwd, &args[1..]))?
        }
        "doc" => emit_decision(exonous::doc::execute(&home, &cwd, &args[1..]))?,
        "ui-design" => emit_decision(exonous::design_engine::execute(&home, &args[1..]))?,
        "workflow" if args.len() == 2 => {
            print!("{}", template::workflow(&args[1]).map_err(|e| (2, e))?)
        }
        "template" if args.len() == 1 => {
            let t = template::resolve(&cwd, &home);
            println!("{}\n", t.path);
            print!("{}", t.body);
        }
        "validate-pr" if args.len() == 2 => {
            let t = template::resolve(&cwd, &home);
            let body = runtime::read_limited(std::path::Path::new(&args[1]), 1024 * 1024)
                .map_err(failure)?;
            template::validate(&body, &t).map_err(failure)?;
            println!(
                "PR body OK — all {} template titles present ({}).",
                t.sections.len(),
                t.path
            );
        }
        "draft-path" if args.len() == 1 => {
            let dir = runtime::state(&home).join("pr");
            let key = runtime::repo_key(&cwd).map_err(failure)?;
            runtime::ensure_private_dir(&home, &dir).map_err(failure)?;
            println!("{}", dir.join(format!("{key}.md")).display());
        }
        "token" if args.len() == 2 => {
            let kind = token::Kind::parse(&args[1]).map_err(|e| (2, e))?;
            let (_, token) = token::mint(&home, kind, &cwd).map_err(failure)?;
            println!(
                "{} token minted: {} ({}), expires {}.",
                args[1],
                if args[1] == "commit" {
                    "one commit of the staged tree"
                } else {
                    "one push of HEAD"
                },
                &token.sha[..12],
                token.exp
            );
        }
        "agents" if args.get(1).map(String::as_str) == Some("list") && args.len() == 2 => {
            println!("{}", roster()["agents"])
        }
        "agents"
            if args.get(1).map(String::as_str) == Some("route")
                && (3..=4).contains(&args.len()) =>
        {
            println!(
                "{}",
                routing::route(
                    &roster(),
                    "claude",
                    &args[2],
                    args.get(3).map(String::as_str).unwrap_or("")
                )
            );
        }
        "hook" => hook(&args[1..], &home)?,
        "vault" => match vault::command(&home, &cwd, &args[1..]) {
            Ok(output) => print!("{output}"),
            Err(error) => {
                let usage = error.starts_with("usage:");
                let structured = args.get(1).is_some_and(|arg| arg == "consolidate")
                    && serde_json::from_str::<Value>(&error).is_ok();
                emit_decision(exonous::payload::Decision {
                    code: if usage { 2 } else { 1 },
                    stdout: if structured {
                        format!("{error}\n")
                    } else {
                        String::new()
                    },
                    stderr: if structured {
                        String::new()
                    } else {
                        format!("{error}\n")
                    },
                })?;
            }
        },
        "handoff" => match handoff::command(&home, &cwd, &args[1..]) {
            Ok(output) => print!("{output}"),
            Err(error) => {
                let usage = error.starts_with("usage:");
                emit_decision(exonous::payload::Decision {
                    code: if usage { 2 } else { 1 },
                    stdout: if usage {
                        String::new()
                    } else {
                        format!("{}\n", json!({"status":"error","reason":error}))
                    },
                    stderr: if usage {
                        format!("{error}\n")
                    } else {
                        String::new()
                    },
                })?;
            }
        },
        "install" | "setup" => print!(
            "{}",
            install::command_with_capabilities(
                &home,
                &cwd,
                &args[1..],
                exonous::NATIVE_CAPABILITIES
            )
            .map_err(failure)?
        ),
        "uninstall" => print!(
            "{}",
            install::uninstall(&home, &cwd, &args[1..]).map_err(failure)?
        ),
        "doctor" => print!(
            "{}",
            install::doctor(&home, &cwd, &args[1..]).map_err(failure)?
        ),
        "gate" => print!(
            "{}",
            exonous::selftest::command(&home, &cwd, &args[1..]).map_err(failure)?
        ),
        "issue-board" => emit_decision(exonous::board::execute(&home, &cwd, &args[1..]))?,
        "migrate" => print!(
            "{}",
            exonous::migrate::command(&home, &cwd, &args[1..], exonous::NATIVE_CAPABILITIES)
                .map_err(failure)?
        ),
        "update" => print!(
            "{}",
            exonous::update::command(&home, &cwd, &args[1..]).map_err(failure)?
        ),
        _ => return Err(usage(USAGE)),
    }
    std::io::stdout()
        .flush()
        .map_err(|_| failure("cannot write output".into()))?;
    Ok(())
}

fn main() {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if let Err((code, message)) = run(&args) {
        eprintln!("exonous: {message}");
        std::process::exit(code);
    }
}
