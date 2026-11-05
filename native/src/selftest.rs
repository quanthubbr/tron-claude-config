use crate::{
    runtime::{self, Result},
    vault,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::Path,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

fn commands(value: &Value, found: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            if let Some(command) = map.get("command").and_then(Value::as_str) {
                found.push(command.into());
            }
            for nested in map.values() {
                commands(nested, found);
            }
        }
        Value::Array(values) => {
            for value in values {
                commands(value, found);
            }
        }
        _ => {}
    }
}

pub fn command(home: &Path, cwd: &Path, args: &[String]) -> Result<String> {
    if args.len() != 2 || args[0] != "--selftest" {
        return Err("usage: exonous gate --selftest <tool>".into());
    }
    probe(home, cwd, &args[1])
}

pub fn probe(home: &Path, _cwd: &Path, tool: &str) -> Result<String> {
    let relative = match tool {
        "claude" => ".claude/settings.json",
        "cursor" => ".cursor/hooks.json",
        "codex" => ".codex/hooks.json",
        "gemini" => ".gemini/settings.json",
        "windsurf" => ".codeium/windsurf/hooks.json",
        "copilot" => ".copilot/hooks/exonous.json",
        _ => return Err(
            "this adapter requires a self-test inside its host; use doctor for registration checks"
                .into(),
        ),
    };
    let root = home.join(".claude/exonous");
    vault::no_symlink_children(home, &root.join("install.json"))?;
    let info: Value = serde_json::from_str(&runtime::read_limited(
        &root.join("install.json"),
        1024 * 1024,
    )?)
    .map_err(|_| "invalid native install metadata")?;
    let binary = Path::new(
        info["binary"]
            .as_str()
            .ok_or("native binary missing from install metadata")?,
    );
    if !binary.starts_with(root.join("bin")) {
        return Err("installed binary escapes native version directory".into());
    }
    vault::no_symlink_children(home, binary)?;
    let bytes = fs::read(binary).map_err(|_| "installed native binary is unavailable")?;
    let ledger: Value = serde_json::from_str(&runtime::read_limited(
        &root.join("installed.json"),
        16 * 1024 * 1024,
    )?)
    .map_err(|_| "invalid native ownership ledger")?;
    let key = binary
        .strip_prefix(home)
        .map_err(|_| "invalid binary path")?
        .to_string_lossy()
        .replace('\\', "/");
    if ledger["files"][&key]["hash"] != format!("{:x}", Sha256::digest(&bytes)) {
        return Err("native binary differs from ownership ledger; run exonous install".into());
    }
    let config = home.join(relative);
    vault::no_symlink_children(home, &config)?;
    let config: Value = serde_json::from_str(&runtime::read_limited(&config, 4 * 1024 * 1024)?)
        .map_err(|_| "invalid adapter configuration")?;
    let mut registered = Vec::new();
    commands(&config, &mut registered);
    let expected = format!(
        "{} hook pyle --adapter {tool}",
        crate::install::quote(binary)?
    );
    if !registered.contains(&expected) {
        return Err("native gate hook not registered; run exonous install".into());
    }
    let parent = runtime::state(home).join("selftest");
    runtime::ensure_private_dir(home, &parent)?;
    let repo = parent.join(runtime::nonce());
    fs::create_dir(&repo).map_err(|_| "cannot create self-test repository")?;
    let result = (|| {
        runtime::git(&repo, &["init", "--quiet"])?;
        fs::write(repo.join("proof"), "native gate probe\n")
            .map_err(|_| "cannot write self-test fixture")?;
        runtime::git(&repo, &["add", "proof"])?;
        let payload = json!({"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git commit -m exonous-selftest"},"cwd":repo});
        let mut child = Command::new(binary)
            .args(["hook", "pyle", "--adapter", tool])
            .env("EXONOUS_HOME", home)
            .env("EXONOUS_NO_UPDATE", "1")
            .current_dir(&repo)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|_| "cannot launch installed native gate")?;
        child
            .stdin
            .take()
            .ok_or("cannot pipe self-test payload")?
            .write_all(payload.to_string().as_bytes())
            .map_err(|_| "cannot send self-test payload")?;
        let start = Instant::now();
        loop {
            if child
                .try_wait()
                .map_err(|_| "cannot inspect self-test gate")?
                .is_some()
            {
                break;
            }
            if start.elapsed() > Duration::from_secs(10) {
                let _ = child.kill();
                let _ = child.wait();
                return Err("installed gate self-test timed out".into());
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        let out = child
            .wait_with_output()
            .map_err(|_| "cannot read self-test response")?;
        let stdout = String::from_utf8_lossy(&out.stdout);
        let stderr = String::from_utf8_lossy(&out.stderr);
        let review_hint = ["exonous workflow commit", "exonous token commit"]
            .iter()
            .any(|hint| stdout.contains(hint) || stderr.contains(hint));
        if !(out.status.code() == Some(2) || stdout.contains("\"permissionDecision\":\"deny\""))
            || !review_hint
        {
            return Err("registered native gate did not deny an unreviewed commit".into());
        }
        Ok(format!(
            "{tool}: registered native gate denies an unreviewed commit; host approval/load still requires host verification\n"
        ))
    })();
    let _ = fs::remove_dir_all(&repo);
    result
}
