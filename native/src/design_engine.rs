use crate::{payload::Decision, runtime};
use regex::Regex;
use serde_json::Value;
use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::LazyLock,
};

pub fn rename(text: &str) -> String {
    static TAG: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"\[impeccable@[0-9]*\]").expect("tag regex"));
    static VERB: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r#"([ `"(])/impeccable([ `"):.,]|(?m:$))"#).expect("verb regex")
    });
    VERB.replace_all(&TAG.replace_all(text, "[ui-design]"), "${1}/ui-design${2}")
        .replace("Impeccable's", "ui-design's")
        .replace("Impeccable", "ui-design")
}

fn failure(code: i32, message: &str) -> Decision {
    Decision {
        code,
        stdout: String::new(),
        stderr: format!("ui-design: {message}\n"),
    }
}

#[cfg(any(windows, test))]
fn batch_quote(value: &str) -> Result<String, String> {
    if value.contains(['%', '!', '"', '\r', '\n']) {
        return Err("cannot safely pass this argument through the Windows engine launcher".into());
    }
    let trailing = value.chars().rev().take_while(|c| *c == '\\').count();
    Ok(format!("\"{value}{}\"", "\\".repeat(trailing)))
}

pub fn execute(home: &Path, args: &[String]) -> Decision {
    let mut args = args.to_vec();
    let dir = if args.first().is_some_and(|s| s == "--skill-dir") {
        if args.len() < 2 {
            return failure(2, "--skill-dir requires a path");
        }
        let dir = PathBuf::from(args.remove(1));
        args.remove(0);
        dir.join("scripts")
    } else {
        let shared = home.join(".agents/skills/ui-design/scripts");
        if shared.is_dir() {
            shared
        } else {
            home.join(".claude/skills/ui-design/scripts")
        }
    };
    let verb = args.first().map(String::as_str).unwrap_or("");
    if ["update", "check", "install", "link", "skills"].contains(&verb) {
        return failure(
            2,
            "engine updates are managed by exonous (maintainers: source review).",
        );
    }
    let skill = std::env::var_os("IMPECCABLE_SKILL_DIR")
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| dir.parent().unwrap_or(&dir).to_owned());
    if ["help", "--help", "-h"].contains(&verb) {
        let metadata = runtime::read_limited(&dir.join("command-metadata.json"), 1024 * 1024)
            .ok()
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok());
        let Some(metadata) = metadata.and_then(|v| v.as_object().cloned()) else {
            return failure(127, "command metadata missing or invalid");
        };
        let rows = metadata
            .iter()
            .filter(|(name, _)| !name.starts_with("craft"))
            .filter_map(|(name, value)| {
                value["description"]
                    .as_str()
                    .map(|description| format!("  /{name:<12} {description}"))
            })
            .collect::<Vec<_>>()
            .join("\n");
        return Decision {
            code: 0,
            stdout: format!(
                "ui-design — design commands (/ui-design <command> [target]); full routing in {}/SKILL.md\n\n{rows}\n\nEngine verbs: context, detect, hooks, doctor, live, ... (see SKILL.md)\n",
                skill.display()
            ),
            stderr: String::new(),
        };
    }
    let mut command;
    #[cfg(windows)]
    let mut pass_args = true;
    #[cfg(not(windows))]
    let pass_args = true;
    #[cfg(not(windows))]
    {
        let launcher = dir.join("impeccable");
        if !launcher.is_file() {
            return failure(127, "engine launcher missing; reinstall exonous");
        }
        command = Command::new("sh");
        command.arg(launcher);
    }
    #[cfg(windows)]
    {
        let arch = if std::env::consts::ARCH == "aarch64" {
            "arm64"
        } else {
            "x64"
        };
        let version = runtime::read_limited(&dir.join("VERSION"), 1024)
            .unwrap_or_default()
            .lines()
            .next()
            .unwrap_or("")
            .trim()
            .to_owned();
        let cache = std::env::var_os("IMPECCABLE_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".impeccable"));
        let binary = [
            std::env::var_os("IMPECCABLE_BIN").map(PathBuf::from),
            Some(
                dir.join("bin")
                    .join(format!("windows-{arch}"))
                    .join("impeccable.exe"),
            ),
            Some(cache.join("bin").join(version).join("impeccable.exe")),
        ]
        .into_iter()
        .flatten()
        .find(|p| p.is_file());
        if let Some(binary) = binary {
            command = Command::new(binary);
        } else {
            use std::os::windows::process::CommandExt;
            let launcher = dir.join("impeccable.cmd");
            if !launcher.is_file() {
                return failure(127, "engine launcher missing; reinstall exonous");
            }
            let invocation = std::iter::once(launcher.to_string_lossy().into_owned())
                .chain(args.clone())
                .map(|value| batch_quote(&value))
                .collect::<Result<Vec<_>, _>>();
            let invocation = match invocation {
                Ok(parts) => parts.join(" "),
                Err(error) => return failure(2, &error),
            };
            command = Command::new("cmd.exe");
            command
                .args(["/d", "/s", "/c"])
                .raw_arg(format!("\"{invocation}\""));
            pass_args = false;
        }
    }
    let self_command = dir.join(if cfg!(windows) {
        "ui-design.cmd"
    } else {
        "ui-design"
    });
    command
        .args(if pass_args { &args[..] } else { &[] })
        .env("IMPECCABLE_SKILL_DIR", &skill)
        .env("IMPECCABLE_SELF", self_command)
        .env(
            "EXONOUS_BIN",
            std::env::current_exe().unwrap_or_else(|_| PathBuf::from("exonous")),
        )
        .env("IMPECCABLE_NO_UPDATE_CHECK", "1")
        .env("IMPECCABLE_NO_TELEMETRY", "1")
        .env("DO_NOT_TRACK", "1")
        .stdin(Stdio::inherit())
        .stderr(Stdio::inherit());
    let buffered = [
        "context",
        "doctor",
        "hooks",
        "hook",
        "hook-before-edit",
        "detect",
        "signals",
        "surface-brief",
        "pin",
    ]
    .contains(&verb);
    if buffered {
        match command.stdout(Stdio::piped()).output() {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stdout = if ["hook", "hook-before-edit"].contains(&verb) {
                    stdout.into_owned()
                } else {
                    stdout
                        .split('\n')
                        .filter(|line| {
                            !line.contains("npx impeccable") && !line.contains("impeccable.style")
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                };
                Decision {
                    code: status(output.status),
                    stdout: rename(&stdout),
                    stderr: String::new(),
                }
            }
            Err(_) => failure(127, "cannot run design engine"),
        }
    } else {
        match command.stdout(Stdio::inherit()).status() {
            Ok(code) => Decision {
                code: status(code),
                stdout: String::new(),
                stderr: String::new(),
            },
            Err(_) => failure(127, "cannot run design engine"),
        }
    }
}
fn status(status: std::process::ExitStatus) -> i32 {
    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt;
        if let Some(signal) = status.signal() {
            return 128 + signal;
        }
    }
    status.code().unwrap_or(1)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn design_rebranding_preserves_json_paths_and_hook_record_count() {
        assert_eq!(
            rename("[impeccable@12] Impeccable's run `/impeccable live` and (/impeccable)"),
            "[ui-design] ui-design's run `/ui-design live` and (/ui-design)"
        );
        assert_eq!(
            rename("a /impeccable\nb /impeccable\n"),
            "a /ui-design\nb /ui-design\n"
        );
        assert_eq!(
            rename(r#"{"path":"x/impeccable/y"}"#),
            r#"{"path":"x/impeccable/y"}"#
        );
    }

    #[test]
    fn windows_batch_boundary_quotes_literals_and_refuses_expansion() {
        assert_eq!(batch_quote("a & b\\").unwrap(), "\"a & b\\\\\"");
        for value in ["%PATH%", "!VAR!", "a\"b", "a\nb"] {
            assert!(batch_quote(value).is_err());
        }
    }
}
