use crate::runtime::{self, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub const TTL_MS: u64 = 15 * 60 * 1000;

#[derive(Clone, Copy)]
pub enum Kind {
    Commit,
    Push,
}

impl Kind {
    pub fn parse(text: &str) -> Result<Self> {
        match text {
            "commit" => Ok(Self::Commit),
            "push" => Ok(Self::Push),
            _ => Err("unknown token kind; use commit or push".into()),
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Commit => "commit",
            Self::Push => "push",
        }
    }
}

#[derive(Deserialize, Serialize)]
pub struct Token {
    pub sha: String,
    pub exp: u64,
}

fn binding(kind: Kind, cwd: &Path) -> Result<String> {
    match kind {
        Kind::Commit => runtime::git(cwd, &["write-tree"]),
        Kind::Push => runtime::git(cwd, &["rev-parse", "--verify", "HEAD^{commit}"]),
    }
}

pub fn path(home: &Path, kind: Kind, cwd: &Path) -> Result<PathBuf> {
    Ok(runtime::state(home)
        .join(kind.name())
        .join(format!("{}.json", runtime::repo_key(cwd)?)))
}

pub fn mint(home: &Path, kind: Kind, cwd: &Path) -> Result<(PathBuf, Token)> {
    let token = Token {
        sha: binding(kind, cwd)?,
        exp: runtime::now_ms() + TTL_MS,
    };
    let file = path(home, kind, cwd)?;
    runtime::ensure_private_dir(home, file.parent().ok_or("invalid token path")?)?;
    runtime::atomic_private(
        &file,
        &serde_json::to_vec(&token).map_err(|_| "cannot encode token")?,
    )?;
    Ok((file, token))
}

pub fn verify(
    home: &Path,
    kind: Kind,
    cwd: &Path,
    expected: &[String],
    consume: bool,
) -> Result<()> {
    let file = path(home, kind, cwd)?;
    runtime::ensure_private_dir(home, file.parent().ok_or("invalid token path")?)?;
    match fs::symlink_metadata(&file) {
        Ok(meta) if !meta.is_file() => return Err("invalid".into()),
        #[cfg(unix)]
        Ok(meta) => {
            use std::os::unix::fs::MetadataExt;
            if meta.uid() != unsafe { libc::geteuid() } || meta.mode() & 0o077 != 0 {
                return Err("invalid".into());
            }
        }
        _ => {}
    }
    let claim = if consume {
        let claim = file.with_extension(format!("{}.claim", runtime::nonce()));
        fs::rename(&file, &claim).map_err(|_| "none")?;
        claim
    } else {
        file.clone()
    };
    let raw = runtime::read_limited(&claim, 4096);
    if consume {
        let _ = fs::remove_file(&claim);
    }
    let token: Token = serde_json::from_str(&raw.map_err(|_| "none")?).map_err(|_| "invalid")?;
    if runtime::now_ms() > token.exp {
        if !consume {
            let _ = fs::remove_file(file);
        }
        return Err("expired".into());
    }
    let expected = if expected.is_empty() {
        vec![binding(kind, cwd)?]
    } else {
        expected.to_owned()
    };
    if !expected.iter().all(|sha| *sha == token.sha) {
        return Err("mismatch".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo() -> tempfile::TempDir {
        let repo = tempfile::tempdir().unwrap();
        runtime::git(repo.path(), &["init", "--quiet"]).unwrap();
        fs::write(repo.path().join("file"), "one").unwrap();
        runtime::git(repo.path(), &["add", "file"]).unwrap();
        repo
    }

    #[test]
    fn staged_tree_changes_invalidate_authorization() {
        let repo = repo();
        let home = tempfile::tempdir().unwrap();
        mint(home.path(), Kind::Commit, repo.path()).unwrap();
        assert!(verify(home.path(), Kind::Commit, repo.path(), &[], false).is_ok());
        fs::write(repo.path().join("file"), "two").unwrap();
        runtime::git(repo.path(), &["add", "file"]).unwrap();
        assert_eq!(
            verify(home.path(), Kind::Commit, repo.path(), &[], true).unwrap_err(),
            "mismatch"
        );
        assert_eq!(
            verify(home.path(), Kind::Commit, repo.path(), &[], true).unwrap_err(),
            "none"
        );
    }

    #[test]
    fn concurrent_consumption_has_exactly_one_winner() {
        let repo = repo();
        let home = tempfile::tempdir().unwrap();
        mint(home.path(), Kind::Commit, repo.path()).unwrap();
        let wins = std::thread::scope(|scope| {
            let handles = (0..8)
                .map(|_| {
                    scope
                        .spawn(|| verify(home.path(), Kind::Commit, repo.path(), &[], true).is_ok())
                })
                .collect::<Vec<_>>();
            handles
                .into_iter()
                .map(|h| usize::from(h.join().unwrap()))
                .sum::<usize>()
        });
        assert_eq!(wins, 1);
    }

    #[test]
    fn expired_and_malformed_tokens_cannot_authorize() {
        let repo = repo();
        let home = tempfile::tempdir().unwrap();
        let (file, _) = mint(home.path(), Kind::Commit, repo.path()).unwrap();
        fs::write(&file, "{\"sha\":\"x\",\"exp\":0}").unwrap();
        assert_eq!(
            verify(home.path(), Kind::Commit, repo.path(), &[], false).unwrap_err(),
            "expired"
        );
        assert!(!file.exists());
        runtime::atomic_private(&file, b"garbage").unwrap();
        assert_eq!(
            verify(home.path(), Kind::Commit, repo.path(), &[], true).unwrap_err(),
            "invalid"
        );
        assert!(!file.exists());
    }

    #[cfg(unix)]
    #[test]
    fn writable_state_directories_and_public_tokens_are_refused() {
        use std::os::unix::fs::PermissionsExt;
        let repo = repo();
        let home = tempfile::tempdir().unwrap();
        let (file, _) = mint(home.path(), Kind::Commit, repo.path()).unwrap();
        let dir = file.parent().unwrap();
        fs::set_permissions(dir, fs::Permissions::from_mode(0o777)).unwrap();
        assert!(verify(home.path(), Kind::Commit, repo.path(), &[], false).is_err());
        assert!(mint(home.path(), Kind::Commit, repo.path()).is_err());
        fs::set_permissions(dir, fs::Permissions::from_mode(0o700)).unwrap();
        fs::set_permissions(&file, fs::Permissions::from_mode(0o644)).unwrap();
        assert!(verify(home.path(), Kind::Commit, repo.path(), &[], true).is_err());
    }
}
