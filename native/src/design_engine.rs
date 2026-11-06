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

#[cfg(any(windows, test))]
pub fn select_windows_binary(
    dir: &Path,
    home: &Path,
    override_bin: Option<&std::ffi::OsStr>,
    cache_home: Option<&std::ffi::OsStr>,
    search_path: Option<&std::ffi::OsStr>,
) -> Result<Option<PathBuf>, String> {
    use sha2::{Digest, Sha256};
    use std::{collections::HashMap, fs, io::Read};

    if let Some(binary) = override_bin {
        let binary = PathBuf::from(binary);
        return if binary.is_file() {
            Ok(Some(binary))
        } else {
            Err("IMPECCABLE_BIN is not a file".into())
        };
    }
    let version = runtime::read_limited(&dir.join("VERSION"), 1024)
        .map_err(|_| "engine VERSION missing or invalid")?;
    let version = version.replace("\r\n", "\n");
    let version = version.strip_suffix('\n').unwrap_or(&version);
    if version != "0.1.5" {
        return Err("engine VERSION does not match pinned version 0.1.5".into());
    }
    let manifest = runtime::read_limited(&dir.join("ENGINE-CHECKSUMS"), 4096)
        .map_err(|_| "engine checksum manifest missing or invalid")?;
    let manifest = manifest.replace("\r\n", "\n");
    let body = manifest
        .strip_prefix("version 0.1.5\n")
        .ok_or("engine checksum manifest version mismatch")?;
    let body = body.strip_suffix('\n').unwrap_or(body);
    let mut hashes = HashMap::new();
    for line in body.split('\n') {
        let (hash, asset) = line
            .split_once("  ")
            .ok_or("invalid engine checksum manifest")?;
        if hash.len() != 64
            || !hash
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            || ![
                "impeccable-darwin-arm64",
                "impeccable-darwin-x64",
                "impeccable-linux-arm64",
                "impeccable-linux-x64",
                "impeccable-windows-x64.exe",
            ]
            .contains(&asset)
            || hashes.insert(asset, hash).is_some()
        {
            return Err("invalid engine checksum manifest".into());
        }
    }
    let expected = hashes
        .get("impeccable-windows-x64.exe")
        .ok_or("engine checksum manifest has no Windows x64 hash")?;
    let cache = cache_home
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".impeccable"));
    let mut candidates = vec![
        dir.join("bin/windows-x64/impeccable.exe"),
        home.join(".impeccable/bin/impeccable.exe"),
        cache.join("bin").join(version).join("impeccable.exe"),
    ];
    if let Some(search_path) = search_path {
        candidates
            .extend(std::env::split_paths(search_path).map(|entry| entry.join("impeccable.exe")));
    }
    for candidate in candidates {
        match fs::symlink_metadata(&candidate) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(_) => return Err("cannot inspect engine candidate".into()),
            Ok(_) => {}
        }
        if !candidate.is_file() {
            return Err("engine candidate is not a file".into());
        }
        let mut file = fs::File::open(&candidate).map_err(|_| "cannot read engine candidate")?;
        let mut hash = Sha256::new();
        let mut buffer = [0_u8; 65536];
        loop {
            let count = file
                .read(&mut buffer)
                .map_err(|_| "cannot hash engine candidate")?;
            if count == 0 {
                break;
            }
            hash.update(&buffer[..count]);
        }
        if format!("{:x}", hash.finalize()) != *expected {
            return Err("engine checksum mismatch".into());
        }
        return Ok(Some(candidate));
    }
    Ok(None)
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
        let binary = match select_windows_binary(
            &dir,
            home,
            std::env::var_os("IMPECCABLE_BIN").as_deref(),
            std::env::var_os("IMPECCABLE_HOME").as_deref(),
            std::env::var_os("PATH").as_deref(),
        ) {
            Ok(binary) => binary,
            Err(error) => {
                return failure(
                    127,
                    &format!("{error}; reinstall exonous or set IMPECCABLE_BIN explicitly"),
                );
            }
        };
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
    fn manifest_fixture(dir: &Path, bytes: &[u8]) {
        use sha2::{Digest, Sha256};
        std::fs::write(dir.join("VERSION"), "0.1.5\n").unwrap();
        std::fs::write(
            dir.join("ENGINE-CHECKSUMS"),
            format!(
                "version 0.1.5\n{:x}  impeccable-windows-x64.exe\n",
                Sha256::digest(bytes)
            ),
        )
        .unwrap();
    }

    #[test]
    fn windows_selector_authenticates_each_automatic_location_without_execution() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("scripts");
        let home = root.path().join("home");
        let cache = home.join(".impeccable");
        let path = root.path().join("path");
        std::fs::create_dir_all(&dir).unwrap();
        manifest_fixture(&dir, b"inert verified engine");
        let candidates = [
            dir.join("bin/windows-x64/impeccable.exe"),
            home.join(".impeccable/bin/impeccable.exe"),
            cache.join("bin/0.1.5/impeccable.exe"),
            path.join("impeccable.exe"),
        ];
        for candidate in candidates {
            std::fs::create_dir_all(candidate.parent().unwrap()).unwrap();
            std::fs::write(&candidate, b"inert verified engine").unwrap();
            assert_eq!(
                select_windows_binary(&dir, &home, None, None, Some(path.as_os_str())).unwrap(),
                Some(candidate.clone())
            );
            std::fs::write(&candidate, b"tampered").unwrap();
            assert!(
                select_windows_binary(&dir, &home, None, None, Some(path.as_os_str())).is_err()
            );
            std::fs::remove_file(candidate).unwrap();
        }
        assert_eq!(
            select_windows_binary(&dir, &home, None, None, None).unwrap(),
            None
        );
    }

    #[test]
    fn windows_selector_override_is_explicit_and_never_falls_back() {
        let root = tempfile::tempdir().unwrap();
        let binary = root.path().join("override.exe");
        assert!(
            select_windows_binary(
                root.path(),
                root.path(),
                Some(binary.as_os_str()),
                None,
                None
            )
            .is_err()
        );
        assert!(
            select_windows_binary(
                root.path(),
                root.path(),
                Some(std::ffi::OsStr::new("")),
                None,
                None
            )
            .is_err()
        );
        std::fs::write(&binary, b"operator supplied").unwrap();
        assert_eq!(
            select_windows_binary(
                root.path(),
                root.path(),
                Some(binary.as_os_str()),
                None,
                None
            )
            .unwrap(),
            Some(binary)
        );
    }

    #[test]
    fn windows_selector_rejects_invalid_manifest_before_discovery() {
        let root = tempfile::tempdir().unwrap();
        manifest_fixture(root.path(), b"engine");
        let valid = std::fs::read_to_string(root.path().join("ENGINE-CHECKSUMS")).unwrap();
        for invalid in [
            valid.replace("version 0.1.5", "version 0.1.6"),
            valid.replace("version 0.1.5\n", ""),
            valid.replace("  impeccable-", " impeccable-"),
            valid.replace("windows-x64.exe", "windows-arm64.exe"),
            format!("{valid}{}", valid.lines().nth(1).unwrap()),
            valid.to_uppercase(),
            format!("{valid}\n"),
        ] {
            std::fs::write(root.path().join("ENGINE-CHECKSUMS"), invalid).unwrap();
            assert!(select_windows_binary(root.path(), root.path(), None, None, None).is_err());
        }
        std::fs::remove_file(root.path().join("ENGINE-CHECKSUMS")).unwrap();
        assert!(select_windows_binary(root.path(), root.path(), None, None, None).is_err());
    }

    #[test]
    fn windows_selector_accepts_crlf_but_rejects_duplicate_version_and_bare_cr() {
        let root = tempfile::tempdir().unwrap();
        manifest_fixture(root.path(), b"engine");
        let manifest = std::fs::read_to_string(root.path().join("ENGINE-CHECKSUMS")).unwrap();
        let binary = root.path().join("bin/windows-x64/impeccable.exe");
        std::fs::create_dir_all(binary.parent().unwrap()).unwrap();
        std::fs::write(&binary, b"engine").unwrap();
        std::fs::write(root.path().join("VERSION"), "0.1.5\r\n").unwrap();
        std::fs::write(
            root.path().join("ENGINE-CHECKSUMS"),
            manifest.replace('\n', "\r\n"),
        )
        .unwrap();
        assert_eq!(
            select_windows_binary(root.path(), root.path(), None, None, None).unwrap(),
            Some(binary.clone())
        );
        for invalid in [
            format!("version 0.1.5\n{manifest}"),
            manifest.replace('\n', "\r"),
            manifest.replace("version 0.1.5", "version 0.\r1.5"),
        ] {
            std::fs::write(root.path().join("ENGINE-CHECKSUMS"), invalid).unwrap();
            assert!(select_windows_binary(root.path(), root.path(), None, None, None).is_err());
        }
        std::fs::write(root.path().join("ENGINE-CHECKSUMS"), &manifest).unwrap();
        std::fs::write(&binary, b"tampered").unwrap();
        assert!(select_windows_binary(root.path(), root.path(), None, None, None).is_err());
    }

    #[test]
    fn windows_selector_accepts_optional_manifest_final_newline_and_rejects_blank_records() {
        let root = tempfile::tempdir().unwrap();
        manifest_fixture(root.path(), b"engine");
        let manifest = std::fs::read_to_string(root.path().join("ENGINE-CHECKSUMS")).unwrap();
        let binary = root.path().join("bin/windows-x64/impeccable.exe");
        std::fs::create_dir_all(binary.parent().unwrap()).unwrap();
        std::fs::write(&binary, b"engine").unwrap();
        std::fs::write(
            root.path().join("ENGINE-CHECKSUMS"),
            manifest.strip_suffix('\n').unwrap(),
        )
        .unwrap();
        assert_eq!(
            select_windows_binary(root.path(), root.path(), None, None, None).unwrap(),
            Some(binary)
        );
        std::fs::write(
            root.path().join("ENGINE-CHECKSUMS"),
            format!("{manifest}\n"),
        )
        .unwrap();
        assert!(select_windows_binary(root.path(), root.path(), None, None, None).is_err());
        std::fs::write(root.path().join("ENGINE-CHECKSUMS"), &manifest).unwrap();
        std::fs::write(root.path().join("VERSION"), "0.1.5\n\n").unwrap();
        assert!(select_windows_binary(root.path(), root.path(), None, None, None).is_err());
    }

    #[test]
    fn windows_selector_checks_manifest_version_and_platform_hash() {
        let root = tempfile::tempdir().unwrap();
        manifest_fixture(root.path(), b"engine");
        let manifest = std::fs::read_to_string(root.path().join("ENGINE-CHECKSUMS")).unwrap();
        std::fs::write(root.path().join("VERSION"), "0.1.6\n").unwrap();
        assert!(select_windows_binary(root.path(), root.path(), None, None, None).is_err());
        std::fs::write(root.path().join("VERSION"), "0.1.5\n").unwrap();
        std::fs::write(
            root.path().join("ENGINE-CHECKSUMS"),
            manifest.replace("windows-x64.exe", "linux-x64"),
        )
        .unwrap();
        assert!(select_windows_binary(root.path(), root.path(), None, None, None).is_err());
    }

    #[test]
    fn windows_selector_cache_override_does_not_move_unversioned_home_binary() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("scripts");
        let home = root.path().join("home");
        let cache = root.path().join("cache");
        let binary = cache.join("bin/0.1.5/impeccable.exe");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::create_dir_all(binary.parent().unwrap()).unwrap();
        manifest_fixture(&dir, b"engine");
        std::fs::write(&binary, b"engine").unwrap();
        assert_eq!(
            select_windows_binary(&dir, &home, None, Some(cache.as_os_str()), None).unwrap(),
            Some(binary)
        );
        let home_binary = home.join(".impeccable/bin/impeccable.exe");
        std::fs::create_dir_all(home_binary.parent().unwrap()).unwrap();
        std::fs::write(&home_binary, b"tampered").unwrap();
        assert!(select_windows_binary(&dir, &home, None, Some(cache.as_os_str()), None).is_err());
    }

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
