use sha1::{Digest, Sha1};
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

pub type Result<T> = std::result::Result<T, String>;

pub fn home() -> Result<PathBuf> {
    for name in [
        "EXONOUS_HOME",
        if cfg!(windows) { "USERPROFILE" } else { "HOME" },
    ] {
        if let Some(value) = std::env::var_os(name).filter(|v| !v.is_empty()) {
            let path = PathBuf::from(value);
            if !path.is_absolute() {
                return Err(format!("{name} must be an absolute path"));
            }
            return Ok(path);
        }
    }
    Err("cannot determine target home".into())
}

pub fn state(home: &Path) -> PathBuf {
    home.join(".claude/exonous/state")
}

pub fn git(cwd: &Path, args: &[&str]) -> Result<String> {
    let mut cmd = Command::new("git");
    cmd.args(["--no-optional-locks", "-c", "core.fsmonitor=false", "-c"])
        .arg(if cfg!(windows) {
            "core.hooksPath=NUL"
        } else {
            "core.hooksPath=/dev/null"
        })
        .args(args)
        .current_dir(cwd)
        .env("GIT_TERMINAL_PROMPT", "0");
    let output = cmd.output().map_err(|_| "cannot execute git".to_string())?;
    if !output.status.success() {
        return Err("git query failed".into());
    }
    String::from_utf8(output.stdout)
        .map(|v| v.trim().to_owned())
        .map_err(|_| "invalid git output".into())
}

pub fn repo_root(cwd: &Path) -> Result<PathBuf> {
    fs::canonicalize(git(cwd, &["rev-parse", "--show-toplevel"])?)
        .map_err(|_| "cannot resolve repository root".into())
}

pub fn repo_key(cwd: &Path) -> Result<String> {
    let root = repo_root(cwd)?;
    let mut name = root.to_string_lossy().into_owned();
    if cfg!(windows) && name.starts_with(r"\\?\") {
        name = name[4..].to_owned();
    }
    Ok(format!("{:x}", Sha1::digest(name.as_bytes())))
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn nonce() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    format!(
        "{}.{}.{}",
        std::process::id(),
        now_ms(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}

pub fn ensure_private_dir(home: &Path, dir: &Path) -> Result<()> {
    let anchor = fs::symlink_metadata(home).map_err(|_| "cannot inspect target home")?;
    if !anchor.is_dir() || anchor.file_type().is_symlink() {
        return Err("target home must be a real directory".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if anchor.uid() != unsafe { libc::geteuid() } || anchor.mode() & 0o022 != 0 {
            return Err("target home owner or permissions are unsafe".into());
        }
    }
    let relative = dir
        .strip_prefix(home)
        .map_err(|_| "state path escapes home")?;
    let mut current = home.to_owned();
    for component in relative.components() {
        if !matches!(component, std::path::Component::Normal(_)) {
            return Err("invalid state path".into());
        }
        current.push(component);
        match fs::symlink_metadata(&current) {
            Ok(meta) => {
                if !meta.is_dir() || meta.file_type().is_symlink() {
                    return Err("state directory must be a real directory".into());
                }
                #[cfg(unix)]
                {
                    use std::os::unix::fs::MetadataExt;
                    if meta.uid() != unsafe { libc::geteuid() } || meta.mode() & 0o022 != 0 {
                        return Err("state directory owner or permissions are unsafe".into());
                    }
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let builder = &mut fs::DirBuilder::new();
                #[cfg(unix)]
                {
                    use std::os::unix::fs::DirBuilderExt;
                    builder.mode(0o700);
                }
                builder
                    .create(&current)
                    .or_else(|error| {
                        if error.kind() == std::io::ErrorKind::AlreadyExists {
                            Ok(())
                        } else {
                            Err(error)
                        }
                    })
                    .map_err(|_| "cannot create state directory")?;
                ensure_private_dir(home, &current)?;
            }
            Err(_) => return Err("cannot inspect state directory".into()),
        }
    }
    Ok(())
}

pub fn atomic_private(file: &Path, body: &[u8]) -> Result<()> {
    let tmp = file.with_extension(format!("{}.tmp", nonce()));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let result = (|| {
        let mut out = options.open(&tmp).map_err(|_| "cannot create state file")?;
        out.write_all(body)
            .and_then(|_| out.sync_all())
            .map_err(|_| "cannot persist state file")?;
        fs::rename(&tmp, file).map_err(|_| "cannot publish state file")
    })();
    if result.is_err() {
        let _ = fs::remove_file(tmp);
    }
    result.map_err(str::to_owned)
}

pub fn read_limited(path: &Path, limit: u64) -> Result<String> {
    let meta = fs::metadata(path).map_err(|_| "cannot read file")?;
    if !meta.is_file() || meta.len() > limit {
        return Err("file is not regular or exceeds size limit".into());
    }
    let file = fs::File::open(path).map_err(|_| "cannot read file")?;
    let mut bytes = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "cannot read file")?;
    if bytes.len() as u64 > limit {
        return Err("file exceeds size limit".into());
    }
    String::from_utf8(bytes).map_err(|_| "file is not UTF-8".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn concurrent_first_use_creates_one_private_state_tree() {
        let home = tempfile::tempdir().unwrap();
        let barrier = std::sync::Barrier::new(24);
        std::thread::scope(|scope| {
            let workers = (0..24)
                .map(|_| {
                    scope.spawn(|| {
                        barrier.wait();
                        ensure_private_dir(
                            home.path(),
                            &home.path().join(".claude/exonous/state/first"),
                        )
                    })
                })
                .collect::<Vec<_>>();
            for worker in workers {
                worker.join().unwrap().unwrap();
            }
        });
        assert!(home.path().join(".claude/exonous/state/first").is_dir());
    }
}
