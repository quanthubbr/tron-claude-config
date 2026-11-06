use crate::runtime::Result;
use crate::{gate, handoff, runtime, shell};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::hash::BuildHasher;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

const USAGE: &str = "usage: exonous pr create --body-file <file> [--base <branch>] [--head <branch>] [--title <title>] [--draft]";
const LIMIT: u64 = 16 * 1024 * 1024;

struct Snapshot(PathBuf);
impl Drop for Snapshot {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

#[cfg(unix)]
fn file_identity(file: &File) -> Result<(u64, u64)> {
    use std::os::unix::fs::MetadataExt;
    let metadata = file.metadata().map_err(|_| "cannot inspect PR draft")?;
    Ok((metadata.dev(), metadata.ino()))
}
#[cfg(windows)]
fn file_identity(file: &File) -> Result<(u64, u64)> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{
        BY_HANDLE_FILE_INFORMATION, GetFileInformationByHandle,
    };
    let mut info: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
    if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0
        || info.dwFileAttributes & 0x400 != 0
    {
        return Err("cannot inspect regular PR draft".into());
    }
    Ok((
        u64::from(info.dwVolumeSerialNumber),
        (u64::from(info.nFileIndexHigh) << 32) | u64::from(info.nFileIndexLow),
    ))
}
#[cfg(not(any(unix, windows)))]
fn file_identity(_: &File) -> Result<(u64, u64)> {
    Err("unsupported PR draft identity".into())
}

fn read_draft(path: &Path) -> Result<(Vec<u8>, (u64, u64))> {
    let metadata = fs::symlink_metadata(path).map_err(|_| "cannot inspect PR body file")?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("PR body must be a regular nonsymlink file".into());
    }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x00200000);
    }
    let file = options.open(path).map_err(|_| "cannot read PR body file")?;
    let metadata = file.metadata().map_err(|_| "cannot inspect PR body file")?;
    if !metadata.is_file() || metadata.len() > LIMIT {
        return Err("PR body must be regular and at most 16 MiB".into());
    }
    let identity = file_identity(&file)?;
    let mut bytes = Vec::new();
    file.take(LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "cannot read PR body file")?;
    if bytes.len() as u64 > LIMIT {
        return Err("PR body exceeds 16 MiB".into());
    }
    Ok((bytes, identity))
}

pub fn execute(home: &Path, cwd: &Path, args: &[String]) -> Result<i32> {
    if args.first().map(String::as_str) != Some("create") {
        return Err(USAGE.into());
    }
    let mut values = Vec::<(String, String)>::new();
    let mut draft = false;
    let mut index = 1;
    while index < args.len() {
        let flag = args[index].as_str();
        if flag == "--draft" && !draft {
            draft = true;
            index += 1;
            continue;
        }
        if !["--base", "--head", "--title", "--body-file"].contains(&flag)
            || values.iter().any(|(key, _)| key == flag)
        {
            return Err(USAGE.into());
        }
        let value = args
            .get(index + 1)
            .filter(|value| !value.is_empty() && !value.starts_with('-'))
            .ok_or(USAGE)?;
        values.push((flag.into(), value.clone()));
        index += 2;
    }
    let body = values
        .iter()
        .find(|(flag, _)| flag == "--body-file")
        .map(|(_, value)| value)
        .ok_or(USAGE)?;
    let original = cwd.join(body);
    let (bytes, identity) = read_draft(&original)?;
    let directory = runtime::state(home).join("pr");
    runtime::ensure_private_dir(home, &directory)?;
    let random = std::collections::hash_map::RandomState::new().hash_one(runtime::nonce());
    let snapshot_path = directory.join(format!("snapshot-{}-{random:x}.md", runtime::nonce()));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    }
    let mut file = options
        .open(&snapshot_path)
        .map_err(|_| "cannot create private PR snapshot")?;
    let snapshot = Snapshot(snapshot_path);
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "cannot persist private PR snapshot")?;
    drop(file);
    let opts = shell::Options {
        opts: values
            .iter()
            .map(|(flag, value)| shell::OptionValue {
                name: flag.trim_start_matches('-').into(),
                negated: false,
                value: Some(if flag == "--body-file" {
                    snapshot.0.to_string_lossy().into_owned()
                } else {
                    value.clone()
                }),
            })
            .collect(),
        positional: Vec::new(),
    };
    gate::check_pr(
        home,
        &shell::Call {
            kind: "pr",
            cwd: cwd.to_owned(),
            args: Vec::new(),
            configs: Vec::new(),
        },
        &opts,
    )?;
    let mut command = Command::new("gh");
    command
        .args(["pr", "create"])
        .current_dir(cwd)
        .stdin(Stdio::inherit());
    for (flag, value) in &values {
        command.arg(flag).arg(if flag == "--body-file" {
            snapshot.0.as_os_str()
        } else {
            value.as_ref()
        });
    }
    if draft {
        command.arg("--draft");
    }
    let output = command
        .output()
        .map_err(|_| "cannot run gh; install and authenticate GitHub CLI")?;
    std::io::stdout()
        .write_all(&output.stdout)
        .and_then(|_| std::io::stdout().flush())
        .map_err(|_| "cannot write gh stdout")?;
    std::io::stderr()
        .write_all(&output.stderr)
        .and_then(|_| std::io::stderr().flush())
        .map_err(|_| "cannot write gh stderr")?;
    let code = exit_code(output.status);
    if code != 0 {
        return Ok(code);
    }
    let url = std::str::from_utf8(&output.stdout).ok().map(|raw| {
        raw.strip_suffix("\r\n")
            .or_else(|| raw.strip_suffix('\n'))
            .unwrap_or(raw)
    });
    let Some(url) = url.filter(|url| handoff::canonical_pr_url(url)) else {
        eprintln!(
            "exonous: PR handoff not saved: gh stdout must contain exactly one canonical GitHub PR URL; inspect the created PR without retrying create"
        );
        return Ok(code);
    };
    let graph = json!({"v":1,"k":"pr","g":[["pr","url",url],["pr","proof","gh pr create exited 0"],["pr","next","review the pull request"]]});
    match handoff::save(home, cwd, &graph, None) {
        Ok(saved)
            if ["saved", "already-saved"].contains(&saved["status"].as_str().unwrap_or("")) =>
        {
            let expected = runtime::repo_key(cwd).map(|key| directory.join(format!("{key}.md")));
            if expected
                .as_ref()
                .is_ok_and(|expected| original == *expected)
                && read_draft(&original).is_ok_and(|(current, current_identity)| {
                    current_identity == identity
                        && Sha256::digest(&current) == Sha256::digest(&bytes)
                })
                && fs::remove_file(&original).is_err()
            {
                eprintln!("exonous: handoff saved; PR draft cleanup failed");
            }
        }
        Ok(_) => eprintln!(
            "exonous: PR created; handoff not saved because no vault is configured; draft preserved"
        ),
        Err(_) => eprintln!(
            "exonous: PR created; handoff could not be saved; draft preserved; do not retry create"
        ),
    }
    Ok(code)
}

fn exit_code(status: std::process::ExitStatus) -> i32 {
    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt;
        if let Some(signal) = status.signal() {
            return 128 + signal;
        }
    }
    status.code().unwrap_or(1)
}
