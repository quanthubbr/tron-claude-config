use crate::runtime::Result;
use crate::{install, runtime};
use serde_json::{Value, json};
use sha2::{Digest, Sha256, Sha512};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant},
};

const DAY: u64 = 86_400_000;
const MAX_BUNDLE: u64 = 128 * 1024 * 1024;
const MAX_EXPANDED: u64 = 512 * 1024 * 1024;
const SOURCE: &str = "https://github.com/zaqueu-1/exonous.git";
const RELEASES: &str = "https://github.com/zaqueu-1/exonous/releases/download";
const REGISTRY: &str = "https://registry.npmjs.org/exonous";

#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd)]
struct Version(u64, u64, u64);
impl Version {
    fn parse(value: &str) -> Option<Self> {
        let parts: Vec<_> = value.split('.').collect();
        if parts.len() != 3
            || parts.iter().any(|part| {
                part.is_empty()
                    || part.len() > 1 && part.starts_with('0')
                    || !part.bytes().all(|byte| byte.is_ascii_digit())
            })
        {
            return None;
        }
        Some(Self(
            parts[0].parse().ok()?,
            parts[1].parse().ok()?,
            parts[2].parse().ok()?,
        ))
    }
    fn text(self) -> String {
        format!("{}.{}.{}", self.0, self.1, self.2)
    }
}

#[derive(Clone, Debug)]
struct Release {
    version: Version,
    sha: String,
}

fn parse_tags(raw: &str) -> Vec<Release> {
    let mut tags = BTreeMap::new();
    for line in raw.lines() {
        let Some((sha, reference)) = line.split_once('\t') else {
            continue;
        };
        if sha.len() != 40 || !sha.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            continue;
        }
        let Some(tag) = reference.strip_prefix("refs/tags/v") else {
            continue;
        };
        let peeled = tag.ends_with("^{}");
        let Some(version) = Version::parse(tag.trim_end_matches("^{}")) else {
            continue;
        };
        if peeled || !tags.contains_key(&version) {
            tags.insert(version, sha.to_ascii_lowercase());
        }
    }
    tags.into_iter()
        .map(|(version, sha)| Release { version, sha })
        .collect()
}

fn target() -> Result<&'static str> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => Ok("aarch64-apple-darwin"),
        ("macos", "x86_64") => Ok("x86_64-apple-darwin"),
        ("linux", "x86_64") => Ok("x86_64-unknown-linux-gnu"),
        ("linux", "aarch64") => Ok("aarch64-unknown-linux-gnu"),
        ("windows", "x86_64") => Ok("x86_64-pc-windows-msvc"),
        _ => Err("no native release bundle for this platform".into()),
    }
}

fn digest(path: &Path) -> Result<String> {
    let mut file = fs::File::open(path).map_err(|_| "cannot read release bundle")?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|_| "cannot hash release bundle")?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hash.finalize()))
}

fn verify_checksum(raw: &str, filename: &str, file: &Path) -> Result<()> {
    let matches: Vec<_> = raw
        .lines()
        .filter_map(|line| {
            let (hash, name) = line.split_once(char::is_whitespace)?;
            if name.trim().trim_start_matches('*') != filename {
                return None;
            }
            Some(hash)
        })
        .collect();
    if matches.len() != 1
        || matches[0].len() != 64
        || !matches[0].bytes().all(|byte| byte.is_ascii_hexdigit())
        || digest(file)? != matches[0].to_ascii_lowercase()
    {
        return Err("native bundle checksum verification failed".into());
    }
    Ok(())
}

fn sha512_sri(value: &str) -> Result<[u8; 64]> {
    let encoded = value
        .strip_prefix("sha512-")
        .ok_or("npm integrity must be one canonical SHA512 SRI")?;
    if encoded.len() != 88 || !encoded.ends_with("==") {
        return Err("npm integrity must be one canonical SHA512 SRI".into());
    }
    let mut bytes = [0u8; 64];
    let mut accumulator = 0u32;
    let mut bits = 0;
    let mut offset = 0;
    for byte in encoded.bytes().take(86) {
        let value = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return Err("npm integrity must be one canonical SHA512 SRI".into()),
        };
        accumulator = (accumulator << 6) | value as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            bytes[offset] = (accumulator >> bits) as u8;
            offset += 1;
        }
    }
    if accumulator & 15 != 0 {
        return Err("npm integrity must be one canonical SHA512 SRI".into());
    }
    Ok(bytes)
}

struct NpmMetadata {
    tarball: String,
    integrity: [u8; 64],
}

fn npm_metadata(raw: &str, release: &Release) -> Result<NpmMetadata> {
    let value: Value = serde_json::from_str(raw).map_err(|_| "invalid npm release metadata")?;
    let version = release.version.text();
    let sha = value["gitHead"]
        .as_str()
        .ok_or("npm release has no source commit")?;
    if value["name"] != "exonous"
        || value["version"] != version
        || sha.len() != 40
        || !sha.bytes().all(|byte| byte.is_ascii_hexdigit())
        || sha != release.sha
    {
        return Err("npm release identity or source commit mismatch".into());
    }
    let tarball = format!("{REGISTRY}/-/exonous-{version}.tgz");
    if value["dist"]["tarball"].as_str() != Some(&tarball) {
        return Err("npm release tarball URL is not canonical".into());
    }
    let integrity = sha512_sri(
        value["dist"]["integrity"]
            .as_str()
            .ok_or("npm release has no integrity")?,
    )?;
    Ok(NpmMetadata { tarball, integrity })
}

fn verify_npm_integrity(file: &Path, expected: &[u8; 64]) -> Result<()> {
    let mut file = fs::File::open(file).map_err(|_| "cannot read npm tarball")?;
    let mut hash = Sha512::new();
    let mut buffer = [0u8; 65536];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|_| "cannot hash npm tarball")?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
    }
    if hash.finalize().as_slice() != expected {
        return Err("npm tarball SHA512 integrity verification failed".into());
    }
    Ok(())
}

fn archive_path(path: &Path) -> Result<PathBuf> {
    let text = path.to_str().ok_or("archive path is not UTF-8")?;
    if text.len() > 512 || text.contains(['\\', ':', '\0']) {
        return Err("unsafe archive path".into());
    }
    let mut result = PathBuf::new();
    for part in path.components() {
        match part {
            Component::Normal(part) => {
                let name = part.to_str().ok_or("invalid archive filename")?;
                let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
                if name.ends_with(['.', ' '])
                    || name.chars().any(char::is_control)
                    || [
                        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6",
                        "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6",
                        "LPT7", "LPT8", "LPT9",
                    ]
                    .contains(&stem.as_str())
                {
                    return Err("unsafe archive filename".into());
                }
                result.push(part)
            }
            Component::CurDir if result.as_os_str().is_empty() => {}
            _ => return Err("archive path escapes bundle".into()),
        }
    }
    Ok(result)
}

fn unpack(file: &Path, destination: &Path, npm: bool) -> Result<()> {
    let mut seen = BTreeSet::new();
    let mut total = 0u64;
    for pass in 0..2 {
        let input = fs::File::open(file).map_err(|_| "cannot open release archive")?;
        let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(input));
        for entry in archive.entries().map_err(|_| "invalid release archive")? {
            let mut entry = entry.map_err(|_| "invalid release archive entry")?;
            let path = archive_path(&entry.path().map_err(|_| "invalid archive path")?)?;
            let kind = entry.header().entry_type();
            if !kind.is_file() && !kind.is_dir() {
                return Err("release archive contains a link or special file".into());
            }
            if path.as_os_str().is_empty() {
                if kind.is_dir() {
                    continue;
                }
                return Err("empty archive file path".into());
            }
            let root = path
                .components()
                .next()
                .and_then(|part| part.as_os_str().to_str())
                .ok_or("invalid archive root")?;
            if if npm {
                root != "package"
            } else {
                ![
                    "assets",
                    "exonous",
                    "exonous.exe",
                    "Cargo.toml",
                    "Cargo.lock",
                    "package.json",
                    "LICENSE",
                    "LICENSE.md",
                    "THIRD-PARTY-NOTICES.md",
                    "README.md",
                ]
                .contains(&root)
            } {
                return Err("unexpected release archive root".into());
            }
            if pass == 0 {
                if !seen.insert(path.clone()) || seen.len() > 20000 {
                    return Err("duplicate or excessive archive entries".into());
                }
                let size = entry.size();
                total = total
                    .checked_add(size)
                    .ok_or("release archive exceeds limits")?;
                if size > MAX_BUNDLE || total > MAX_EXPANDED {
                    return Err("release archive exceeds limits".into());
                }
            } else {
                let output = destination.join(&path);
                if kind.is_dir() {
                    private_dir(&output)?;
                } else {
                    private_dir(output.parent().ok_or("invalid output path")?)?;
                    let mut options = fs::OpenOptions::new();
                    options.write(true).create_new(true);
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::OpenOptionsExt;
                        options.mode(if entry.header().mode().unwrap_or(0) & 0o111 != 0 {
                            0o700
                        } else {
                            0o600
                        });
                    }
                    let mut file = options
                        .open(output)
                        .map_err(|_| "cannot create release file")?;
                    std::io::copy(&mut entry, &mut file)
                        .map_err(|_| "cannot extract release file")?;
                    file.sync_all().map_err(|_| "cannot persist release file")?;
                }
            }
        }
    }
    Ok(())
}

fn private_dir(path: &Path) -> Result<()> {
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder
        .create(path)
        .map_err(|_| "cannot create private release directory".into())
}

fn bounded(mut command: Command, timeout: u64, limit: u64) -> Result<std::process::Output> {
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| "native update process unavailable")?;
    let stdout = child.stdout.take().ok_or("cannot capture update output")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("cannot capture update diagnostics")?;
    let out = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout
            .take(limit + 1)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    let err = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stderr.take(65537).read_to_end(&mut bytes).map(|_| bytes)
    });
    let deadline = Instant::now() + Duration::from_secs(timeout);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(25)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("native update process timed out or failed".into());
            }
        }
    };
    let stdout = out
        .join()
        .map_err(|_| "cannot collect update output")?
        .map_err(|_| "cannot read update output")?;
    let stderr = err
        .join()
        .map_err(|_| "cannot collect update diagnostics")?
        .map_err(|_| "cannot read update diagnostics")?;
    if stdout.len() as u64 > limit || stderr.len() > 65536 {
        return Err("native update process exceeded output limit".into());
    }
    Ok(std::process::Output {
        status,
        stdout,
        stderr,
    })
}

fn network_command(name: &str) -> Command {
    let mut command = Command::new(name);
    command.env_clear();
    for name in ["PATH", "SystemRoot", "TEMP", "TMPDIR"] {
        if let Some(value) = std::env::var_os(name) {
            command.env(name, value);
        }
    }
    command
}

trait Source {
    fn releases(&self, cwd: &Path) -> Result<Vec<Release>>;
    fn download(&self, url: &str, destination: &Path, limit: u64) -> Result<()>;
    fn activate(
        &self,
        bundle: &Path,
        home: &Path,
        cwd: &Path,
        version: &str,
        sha: &str,
        tools: &[String],
    ) -> Result<()>;
}

struct Remote;
impl Source for Remote {
    fn releases(&self, _cwd: &Path) -> Result<Vec<Release>> {
        let temporary = Temporary::new(&std::env::temp_dir())?;
        let mut command = network_command("git");
        command
            .current_dir(&temporary.path)
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_TERMINAL_PROMPT", "0")
            .args([
                "-c",
                "credential.helper=",
                "-c",
                "http.followRedirects=false",
                "ls-remote",
                "--tags",
                SOURCE,
            ]);
        let output = bounded(command, 60, 4 * 1024 * 1024)?;
        if !output.status.success() {
            return Err("release catalog unavailable".into());
        }
        Ok(parse_tags(
            std::str::from_utf8(&output.stdout).map_err(|_| "invalid release catalog encoding")?,
        ))
    }
    fn download(&self, url: &str, destination: &Path, limit: u64) -> Result<()> {
        let mut command = network_command("curl");
        command
            .args([
                "--disable",
                "--fail",
                "--silent",
                "--show-error",
                "--location",
                "--max-redirs",
                "3",
                "--proto",
                "=https",
                "--proto-redir",
                "=https",
                "--connect-timeout",
                "10",
                "--max-time",
                "180",
                "--max-filesize",
            ])
            .arg(limit.to_string())
            .arg("--output")
            .arg(destination)
            .arg(url);
        let output = bounded(command, 190, 1024)?;
        if !output.status.success() {
            return Err("native release download failed".into());
        }
        let meta =
            fs::symlink_metadata(destination).map_err(|_| "native release download missing")?;
        if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > limit {
            return Err("native release download exceeds limits".into());
        }
        Ok(())
    }
    fn activate(
        &self,
        bundle: &Path,
        home: &Path,
        cwd: &Path,
        version: &str,
        sha: &str,
        tools: &[String],
    ) -> Result<()> {
        let binary = bundle.join(if cfg!(windows) {
            "exonous.exe"
        } else {
            "exonous"
        });
        let mut command = Command::new(&binary);
        command
            .arg("--version")
            .current_dir(bundle)
            .env("EXONOUS_HOME", home)
            .env("EXONOUS_NO_UPDATE", "1")
            .env("EXONOUS_NO_FORWARD", "1");
        let output = bounded(command, 15, 4096)?;
        if !output.status.success()
            || std::str::from_utf8(&output.stdout).map(str::trim).ok() != Some(version)
        {
            return Err("native release executable version mismatch".into());
        }
        let mut command = Command::new(&binary);
        command
            .arg("install")
            .args(if tools.is_empty() {
                vec!["--quiet".to_owned()]
            } else {
                vec!["--quiet".into(), "--tools".into(), tools.join(",")]
            })
            .current_dir(cwd)
            .env("EXONOUS_HOME", home)
            .env("EXONOUS_ASSETS", bundle.join("assets"))
            .env("EXONOUS_VERIFIED_RELEASE", format!("{version}:{sha}"))
            .env("EXONOUS_NO_UPDATE", "1")
            .env("EXONOUS_NO_FORWARD", "1");
        let output = bounded(command, 600, 1024 * 1024)?;
        if !output.status.success() {
            return Err(
                "native release activation failed; inspect recoverable install ledger".into(),
            );
        }
        let info = read_info(home)?.ok_or("native activation did not write install metadata")?;
        if info["runtime"] != "rust" || info["complete"] != true || info["version"] != version {
            return Err("native activation did not establish a complete install".into());
        }
        active_binary(home)?.ok_or("native activation binary verification failed")?;
        if info["tagSha"].as_str() != Some(sha) {
            return Err("native activation did not retain selected release provenance".into());
        }
        Ok(())
    }
}

struct Temporary {
    path: PathBuf,
}
impl Temporary {
    fn new(parent: &Path) -> Result<Self> {
        let path = parent.join(format!("exonous-update-{}", runtime::nonce()));
        let builder = &mut fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder
            .create(&path)
            .map_err(|_| "cannot create private update staging directory")?;
        Ok(Self { path })
    }
}
impl Drop for Temporary {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn read_info(home: &Path) -> Result<Option<Value>> {
    let file = home.join(".claude/exonous/install.json");
    install::check(home, &file)?;
    if !file.exists() {
        return Ok(None);
    }
    let value: Value = serde_json::from_str(&runtime::read_limited(&file, 1024 * 1024)?)
        .map_err(|_| "invalid install metadata")?;
    if !value.is_object() {
        return Err("invalid install metadata shape".into());
    }
    Ok(Some(value))
}

pub fn active_binary(home: &Path) -> Result<Option<PathBuf>> {
    let Some(info) = read_info(home)? else {
        return Ok(None);
    };
    let Some(binary) = info["binary"].as_str() else {
        return Ok(None);
    };
    let path = PathBuf::from(binary);
    if !path.starts_with(home.join(".claude/exonous/bin")) || !path.is_absolute() {
        return Err("installed native binary path is unsafe".into());
    }
    install::check(home, &path)?;
    install::check(home, &home.join(".claude/exonous/installed.json"))?;
    let ledger: Value = serde_json::from_str(&runtime::read_limited(
        &home.join(".claude/exonous/installed.json"),
        16 * 1024 * 1024,
    )?)
    .map_err(|_| "invalid native ownership ledger")?;
    let relative = path
        .strip_prefix(home)
        .map_err(|_| "invalid installed binary root")?
        .to_string_lossy()
        .replace('\\', "/");
    if ledger["files"][&relative]["hash"].as_str() != Some(digest(&path)?.as_str()) {
        return Err("installed native binary differs from ownership ledger".into());
    }
    Ok(Some(path))
}

#[derive(Default)]
struct Options {
    check: bool,
    major: bool,
}

fn pinned(info: &Value, cwd: &Path) -> bool {
    if info["ref"]
        .as_str()
        .is_some_and(|value| Version::parse(value.strip_prefix('v').unwrap_or("")).is_none())
    {
        return true;
    }
    if info["packageRoot"]
        .as_str()
        .is_some_and(|root| Path::new(root).join(".git").exists())
    {
        return true;
    }
    for directory in cwd.ancestors() {
        let path = directory.join("package.json");
        if let Ok(raw) = runtime::read_limited(&path, 1024 * 1024)
            && let Ok(package) = serde_json::from_str::<Value>(&raw)
            && ["dependencies", "devDependencies", "optionalDependencies"]
                .iter()
                .any(|field| package[*field]["exonous"].is_string())
        {
            return true;
        }
    }
    false
}

fn validate_bundle(bundle: &Path, version: &str, npm_sha: Option<&str>) -> Result<()> {
    let package: Value = serde_json::from_str(&runtime::read_limited(
        &bundle.join("package.json"),
        1024 * 1024,
    )?)
    .map_err(|_| "invalid release package metadata")?;
    if package["name"] != "exonous"
        || package["version"] != version
        || npm_sha.is_some_and(|sha| package["gitHead"].as_str() != Some(sha))
    {
        return Err("release package identity mismatch".into());
    }
    let binary = if cfg!(windows) {
        "exonous.exe"
    } else {
        "exonous"
    };
    let binary = if npm_sha.is_some() {
        format!("native/{}/{binary}", target()?)
    } else {
        binary.into()
    };
    for name in [binary.as_str(), "assets/THIRD-PARTY-NOTICES.md"] {
        if !bundle.join(name).is_file() {
            return Err("native release is missing required files".into());
        }
    }
    if !bundle.join("assets").is_dir() {
        return Err("native release is missing assets".into());
    }
    Ok(())
}

fn run_with(
    home: &Path,
    cwd: &Path,
    options: &Options,
    source: &dyn Source,
    allow_apply: bool,
) -> Result<String> {
    let info = read_info(home)?.ok_or("native update requires an existing install")?;
    if pinned(&info, cwd) {
        return Ok("exonous update: pinned; no changes\n".into());
    }
    let current = Version::parse(
        info["version"]
            .as_str()
            .ok_or("install metadata has no version")?,
    )
    .ok_or("installed version is not a release")?;
    let releases = source.releases(cwd)?;
    let installed = releases.iter().find(|release| release.version == current);
    if let (Some(recorded), Some(installed)) = (info["tagSha"].as_str(), installed)
        && recorded != installed.sha
    {
        return Err("installed release tag moved; automatic update refused".into());
    }
    let Some(latest) = releases
        .iter()
        .filter(|release| options.major || release.version.0 == current.0)
        .max_by_key(|release| release.version)
    else {
        return Err("release catalog contains no compatible stable release".into());
    };
    if latest.version <= current {
        return Ok(format!("exonous v{} is current\n", current.text()));
    }
    if options.check {
        return Ok(format!(
            "exonous v{} available (installed v{})\n",
            latest.version.text(),
            current.text()
        ));
    }
    if !allow_apply {
        return Err("native update apply is disabled for an isolated home".into());
    }
    if info["runtime"] != "rust" || info["complete"] != true {
        return Err("native update requires a complete Rust install; run install first".into());
    }
    let _lock = install::InstallLock::named(home, "update.lock")?;
    let fresh = read_info(home)?.ok_or("install metadata disappeared")?;
    if fresh != info {
        return Err("install changed during update; retry".into());
    }
    let staging = Temporary::new(&runtime::state(home))?;
    let npm = latest.version >= Version(2, 10, 4);
    let archive = staging.path.join("archive.tgz");
    if npm {
        let metadata = staging.path.join("npm.json");
        source.download(
            &format!("{REGISTRY}/{}", latest.version.text()),
            &metadata,
            1024 * 1024,
        )?;
        let metadata = npm_metadata(&runtime::read_limited(&metadata, 1024 * 1024)?, latest)?;
        source.download(&metadata.tarball, &archive, MAX_BUNDLE)?;
        verify_npm_integrity(&archive, &metadata.integrity)?;
    } else {
        let filename = format!("exonous-{}.tar.gz", target()?);
        let checksums = staging.path.join("SHA256SUMS");
        let base = format!("{RELEASES}/v{}", latest.version.text());
        source.download(&format!("{base}/SHA256SUMS"), &checksums, 64 * 1024)?;
        source.download(&format!("{base}/{filename}"), &archive, MAX_BUNDLE)?;
        verify_checksum(
            &runtime::read_limited(&checksums, 64 * 1024)?,
            &filename,
            &archive,
        )?;
    }
    let bundle = staging.path.join("bundle");
    unpack(&archive, &bundle, npm)?;
    let bundle = if npm { bundle.join("package") } else { bundle };
    validate_bundle(
        &bundle,
        &latest.version.text(),
        npm.then_some(latest.sha.as_str()),
    )?;
    if npm {
        let binary = if cfg!(windows) {
            "exonous.exe"
        } else {
            "exonous"
        };
        let normalized = bundle.join(binary);
        if normalized.exists() {
            return Err("npm package contains an unexpected root executable".into());
        }
        fs::rename(
            bundle.join("native").join(target()?).join(binary),
            normalized,
        )
        .map_err(|_| "cannot normalize verified npm executable")?;
    }
    let tools: Vec<String> = info["tools"]
        .as_array()
        .ok_or("install metadata has no tools")?
        .iter()
        .map(|tool| {
            tool.as_str()
                .map(str::to_owned)
                .ok_or_else(|| "invalid installed tool name".to_owned())
        })
        .collect::<Result<_>>()?;
    if tools.iter().any(|tool| {
        ![
            "claude", "cursor", "codex", "gemini", "copilot", "opencode", "windsurf", "cline",
            "qwen", "kiro", "aider",
        ]
        .contains(&tool.as_str())
    }) {
        return Err("unknown installed tool name".into());
    }
    source.activate(
        &bundle,
        home,
        cwd,
        &latest.version.text(),
        &latest.sha,
        &tools,
    )?;
    Ok(format!(
        "exonous updated v{} → v{}\n",
        current.text(),
        latest.version.text()
    ))
}

fn real_home(home: &Path) -> bool {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .is_some_and(|actual| fs::canonicalize(actual).ok() == fs::canonicalize(home).ok())
}

pub fn command(home: &Path, cwd: &Path, args: &[String]) -> Result<String> {
    let mut options = Options::default();
    for arg in args {
        match arg.as_str() {
            "--check" => options.check = true,
            "--major" => options.major = true,
            _ => return Err(format!("unknown update option: {arg}")),
        }
    }
    run_with(home, cwd, &options, &Remote, real_home(home))
}

fn opted_out(home: &Path) -> Result<bool> {
    if ["CI", "CONTINUOUS_INTEGRATION", "EXONOUS_NO_UPDATE"]
        .iter()
        .any(|name| std::env::var(name).is_ok_and(|value| !value.is_empty() && value != "0"))
    {
        return Ok(true);
    }
    let config = home.join(".claude/exonous/config.json");
    install::check(home, &config)?;
    if !config.exists() {
        return Ok(false);
    }
    let config: Value = serde_json::from_str(&runtime::read_limited(&config, 1024 * 1024)?)
        .map_err(|_| "invalid update configuration")?;
    Ok(config["autoUpdate"] == false)
}

fn due(home: &Path, now: u64) -> Result<bool> {
    let file = runtime::state(home).join("last-check");
    install::check(home, &file)?;
    if !file.exists() {
        return Ok(true);
    }
    let last = runtime::read_limited(&file, 128)?
        .trim()
        .parse::<u64>()
        .unwrap_or(0);
    Ok(last > now || now.saturating_sub(last) >= DAY)
}

fn clean_note(note: &str) -> String {
    note.chars()
        .filter(|character| !character.is_control())
        .take(200)
        .collect::<String>()
        .trim()
        .to_owned()
}

fn hook_inner(home: &Path, cwd: &Path, adapter: &str, run: bool) -> Result<String> {
    if !real_home(home) {
        return Ok(String::new());
    }
    if run {
        if opted_out(home)? {
            return Ok(String::new());
        }
        let note = match run_with(home, cwd, &Options::default(), &Remote, true) {
            Ok(note) => note,
            Err(_) => "exonous update failed; run exonous update --check for diagnostics".into(),
        };
        let directory = runtime::state(home);
        runtime::ensure_private_dir(home, &directory)?;
        let path = directory.join("note");
        install::check(home, &path)?;
        runtime::atomic_private(&path, clean_note(&note).as_bytes())?;
        return Ok(String::new());
    }
    let mut output = String::new();
    let note = runtime::state(home).join("note");
    install::check(home, &note)?;
    if !["windsurf", "opencode"].contains(&adapter) && note.exists() {
        let text = clean_note(&runtime::read_limited(&note, 4096)?);
        fs::remove_file(&note).map_err(|_| "cannot consume update note")?;
        if !text.is_empty() {
            output = match adapter { "cursor" => json!({"additional_context":text}).to_string(), "gemini" => json!({"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":text}}).to_string(), "copilot" => json!({"additionalContext":text}).to_string(), _ => text };
            output.push('\n');
        }
    }
    if !opted_out(home)? && due(home, runtime::now_ms())? {
        let directory = runtime::state(home);
        runtime::ensure_private_dir(home, &directory)?;
        let path = directory.join("last-check");
        install::check(home, &path)?;
        runtime::atomic_private(&path, runtime::now_ms().to_string().as_bytes())?;
        let mut command =
            Command::new(std::env::current_exe().map_err(|_| "cannot locate native runtime")?);
        command
            .args(["hook", "kairos", "--run", "--adapter", adapter])
            .current_dir(cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x00000008 | 0x08000000);
        }
        let mut child = command
            .spawn()
            .map_err(|_| "cannot start native update worker")?;
        std::thread::spawn(move || {
            let _ = child.wait();
        });
    }
    Ok(output)
}

pub fn hook(home: &Path, cwd: &Path, adapter: &str, run: bool) -> Result<String> {
    Ok(hook_inner(home, cwd, adapter, run).unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::{Cell, RefCell};

    struct NpmFixture {
        archive: PathBuf,
        metadata: Value,
        downloads: RefCell<Vec<String>>,
        activates: Cell<usize>,
    }
    impl Source for NpmFixture {
        fn releases(&self, _: &Path) -> Result<Vec<Release>> {
            Ok(vec![Release {
                version: Version(2, 10, 4),
                sha: "b".repeat(40),
            }])
        }
        fn download(&self, url: &str, destination: &Path, limit: u64) -> Result<()> {
            self.downloads.borrow_mut().push(url.into());
            match url {
                "https://registry.npmjs.org/exonous/2.10.4" => {
                    assert_eq!(limit, 1024 * 1024);
                    fs::write(destination, serde_json::to_vec(&self.metadata).unwrap()).unwrap();
                }
                "https://registry.npmjs.org/exonous/-/exonous-2.10.4.tgz" => {
                    assert_eq!(limit, MAX_BUNDLE);
                    fs::copy(&self.archive, destination).unwrap();
                }
                _ => return Err(format!("unexpected download: {url}")),
            }
            Ok(())
        }
        fn activate(
            &self,
            bundle: &Path,
            _: &Path,
            _: &Path,
            version: &str,
            sha: &str,
            tools: &[String],
        ) -> Result<()> {
            assert_eq!(version, "2.10.4");
            assert_eq!(sha, "b".repeat(40));
            assert_eq!(tools, ["claude"]);
            assert_eq!(
                fs::read(bundle.join(if cfg!(windows) {
                    "exonous.exe"
                } else {
                    "exonous"
                }))
                .unwrap(),
                b"native binary"
            );
            assert_eq!(
                fs::read(bundle.join("assets/rules/nomos.md")).unwrap(),
                b"rules"
            );
            self.activates.set(self.activates.get() + 1);
            Ok(())
        }
    }
    fn sri(bytes: &[u8]) -> String {
        let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut result = "sha512-".to_owned();
        for chunk in sha2::Sha512::digest(bytes).chunks(3) {
            let bits = ((chunk[0] as u32) << 16)
                | ((chunk.get(1).copied().unwrap_or(0) as u32) << 8)
                | chunk.get(2).copied().unwrap_or(0) as u32;
            for (index, shift) in [18, 12, 6, 0].into_iter().enumerate() {
                result.push(if index > chunk.len() {
                    '='
                } else {
                    alphabet[((bits >> shift) & 63) as usize] as char
                });
            }
        }
        result
    }
    fn npm_fixture(directory: &Path, package: Value, extra: Option<&str>) -> NpmFixture {
        let archive = directory.join("npm.tgz");
        let out = fs::File::create(&archive).unwrap();
        let mut tar = tar::Builder::new(flate2::write::GzEncoder::new(
            out,
            flate2::Compression::fast(),
        ));
        let binary = format!(
            "package/native/{}/exonous{}",
            target().unwrap(),
            if cfg!(windows) { ".exe" } else { "" }
        );
        let mut files = vec![
            (
                "package/package.json".to_owned(),
                serde_json::to_vec(&package).unwrap(),
            ),
            (binary, b"native binary".to_vec()),
            (
                "package/assets/THIRD-PARTY-NOTICES.md".into(),
                b"notices".to_vec(),
            ),
            ("package/assets/rules/nomos.md".into(), b"rules".to_vec()),
        ];
        if let Some(extra) = extra {
            files.push((extra.into(), b"unexpected".to_vec()));
        }
        for (name, bytes) in files {
            let mut header = tar::Header::new_gnu();
            header.set_size(bytes.len() as u64);
            header.set_mode(0o700);
            header.set_cksum();
            tar.append_data(&mut header, name, bytes.as_slice())
                .unwrap();
        }
        tar.into_inner().unwrap().finish().unwrap();
        let metadata = json!({"name":"exonous","version":"2.10.4","gitHead":"b".repeat(40),"dist":{"tarball":"https://registry.npmjs.org/exonous/-/exonous-2.10.4.tgz","integrity":sri(&fs::read(&archive).unwrap())}});
        NpmFixture {
            archive,
            metadata,
            downloads: RefCell::new(Vec::new()),
            activates: Cell::new(0),
        }
    }
    fn npm_package() -> Value {
        json!({"name":"exonous","version":"2.10.4","gitHead":"b".repeat(40)})
    }
    #[test]
    fn npm_update_verifies_metadata_integrity_and_source_commit_before_activation() {
        let temp = tempfile::tempdir().unwrap();
        fixture_info(temp.path(), json!({}));
        let source = npm_fixture(temp.path(), npm_package(), None);
        assert!(
            run_with(temp.path(), temp.path(), &Options::default(), &source, true)
                .unwrap()
                .contains("2.10.4")
        );
        assert_eq!(source.activates.get(), 1);
        assert_eq!(source.downloads.borrow().len(), 2);
    }
    #[test]
    fn npm_integrity_matches_a_known_sha512_vector_and_detects_changed_bytes() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("tarball");
        fs::write(&file, b"verified bytes").unwrap();
        let expected = sha512_sri("sha512-TlyPO1NzT32/5OA15ndIOYzkWMVsy4LemDplZpN3+9TqPNIYAFpZZrJcTsra2tmiV5sHJ2q4hD/fUhxu6P7jew==").unwrap();
        verify_npm_integrity(&file, &expected).unwrap();
        fs::write(&file, b"changed bytes").unwrap();
        assert!(verify_npm_integrity(&file, &expected).is_err());
    }
    #[test]
    fn npm_invalid_metadata_never_downloads_an_archive_or_falls_back() {
        for (pointer, bad) in [
            ("/name", json!("foreign")),
            ("/version", json!("2.10.04")),
            ("/version", json!("2.10.5")),
            ("/gitHead", json!("a".repeat(40))),
            ("/gitHead", json!("b".repeat(39))),
            ("/gitHead", json!("z".repeat(40))),
            (
                "/dist/tarball",
                json!("https://foreign.example/exonous.tgz"),
            ),
            (
                "/dist/tarball",
                json!("https://registry.npmjs.org/exonous/-/exonous-2.10.4.tgz?extra"),
            ),
            ("/dist/integrity", json!("sha256-AAAA")),
            (
                "/dist/integrity",
                json!(format!("sha512-{}", "A".repeat(88))),
            ),
            (
                "/dist/integrity",
                json!(format!("sha512-{}B==", "A".repeat(85))),
            ),
            (
                "/dist/integrity",
                json!(format!("sha512-{}== extra", "A".repeat(86))),
            ),
        ] {
            let temp = tempfile::tempdir().unwrap();
            fixture_info(temp.path(), json!({}));
            let mut source = npm_fixture(temp.path(), npm_package(), None);
            *source.metadata.pointer_mut(pointer).unwrap() = bad;
            let before = read_info(temp.path()).unwrap();
            assert!(
                run_with(temp.path(), temp.path(), &Options::default(), &source, true).is_err(),
                "{pointer}"
            );
            assert_eq!(source.activates.get(), 0);
            assert_eq!(
                source.downloads.borrow().as_slice(),
                ["https://registry.npmjs.org/exonous/2.10.4"],
                "{pointer}"
            );
            assert_eq!(read_info(temp.path()).unwrap(), before);
        }
    }
    #[test]
    fn npm_corruption_archive_identity_and_unexpected_roots_block_activation() {
        for (pointer, bad, extra, corrupt) in [
            ("/name", json!("foreign"), None, false),
            ("/version", json!("2.10.5"), None, false),
            ("/gitHead", json!("c".repeat(40)), None, false),
            (
                "/gitHead",
                json!("b".repeat(40)),
                Some("outside/escape"),
                false,
            ),
            (
                "/gitHead",
                json!("b".repeat(40)),
                Some("package/package.json"),
                false,
            ),
            ("/gitHead", json!("b".repeat(40)), None, true),
        ] {
            let temp = tempfile::tempdir().unwrap();
            fixture_info(temp.path(), json!({}));
            let mut package = npm_package();
            *package.pointer_mut(pointer).unwrap() = bad;
            let source = npm_fixture(temp.path(), package, extra);
            if corrupt {
                fs::write(&source.archive, b"corrupted tarball").unwrap();
            }
            let before = read_info(temp.path()).unwrap();
            assert!(
                run_with(temp.path(), temp.path(), &Options::default(), &source, true).is_err()
            );
            assert_eq!(source.activates.get(), 0);
            assert_eq!(source.downloads.borrow().len(), 2);
            assert_eq!(read_info(temp.path()).unwrap(), before);
        }
    }

    struct Fixture {
        archive: PathBuf,
        corrupt: bool,
        activates: Cell<usize>,
    }
    impl Source for Fixture {
        fn releases(&self, _: &Path) -> Result<Vec<Release>> {
            Ok(vec![
                Release {
                    version: Version(2, 10, 0),
                    sha: "a".repeat(40),
                },
                Release {
                    version: Version(2, 10, 3),
                    sha: "b".repeat(40),
                },
                Release {
                    version: Version(3, 0, 0),
                    sha: "c".repeat(40),
                },
            ])
        }
        fn download(&self, url: &str, destination: &Path, _: u64) -> Result<()> {
            assert!(url.starts_with(&format!("{RELEASES}/v2.10.3/")));
            if url.ends_with("SHA256SUMS") {
                fs::write(
                    destination,
                    format!(
                        "{}  exonous-{}.tar.gz\n",
                        if self.corrupt {
                            "0".repeat(64)
                        } else {
                            digest(&self.archive)?
                        },
                        target()?
                    ),
                )
                .unwrap();
            } else {
                fs::copy(&self.archive, destination).unwrap();
            }
            Ok(())
        }
        fn activate(
            &self,
            bundle: &Path,
            _: &Path,
            _: &Path,
            version: &str,
            sha: &str,
            tools: &[String],
        ) -> Result<()> {
            assert_eq!(version, "2.10.3");
            assert_eq!(sha, "b".repeat(40));
            assert_eq!(tools, ["claude"]);
            assert!(bundle.join("assets/rules/nomos.md").is_file());
            self.activates.set(self.activates.get() + 1);
            Ok(())
        }
    }
    fn fixture_archive(directory: &Path) -> PathBuf {
        let archive = directory.join("good.tar.gz");
        let out = fs::File::create(&archive).unwrap();
        let mut builder = tar::Builder::new(flate2::write::GzEncoder::new(
            out,
            flate2::Compression::default(),
        ));
        for (name, bytes) in [
            (
                "package.json",
                "{\"name\":\"exonous\",\"version\":\"2.10.3\"}",
            ),
            (
                if cfg!(windows) {
                    "exonous.exe"
                } else {
                    "exonous"
                },
                "binary",
            ),
            ("LICENSE", "license"),
            ("assets/THIRD-PARTY-NOTICES.md", "notices"),
            ("assets/rules/nomos.md", "rules"),
        ] {
            let mut header = tar::Header::new_gnu();
            header.set_size(bytes.len() as u64);
            header.set_mode(0o700);
            header.set_cksum();
            builder
                .append_data(&mut header, name, bytes.as_bytes())
                .unwrap();
        }
        builder.into_inner().unwrap().finish().unwrap();
        archive
    }
    fn fixture_info(home: &Path, extra: Value) {
        runtime::ensure_private_dir(home, &home.join(".claude/exonous")).unwrap();
        let mut info = json!({"version":"2.10.0","runtime":"rust","complete":true,"ref":"v2.10.0","tools":["claude"]});
        info.as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        runtime::atomic_private(
            &home.join(".claude/exonous/install.json"),
            &serde_json::to_vec(&info).unwrap(),
        )
        .unwrap();
    }
    #[test]
    fn check_is_read_only_and_apply_verifies_bundle_before_activation() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        fs::create_dir(&home).unwrap();
        fixture_info(&home, json!({}));
        let source = Fixture {
            archive: fixture_archive(temp.path()),
            corrupt: false,
            activates: Cell::new(0),
        };
        assert!(
            run_with(
                &home,
                temp.path(),
                &Options {
                    check: true,
                    major: false
                },
                &source,
                false
            )
            .unwrap()
            .contains("2.10.3")
        );
        assert!(!runtime::state(&home).exists());
        assert_eq!(source.activates.get(), 0);
        assert!(
            run_with(
                &home,
                temp.path(),
                &Options {
                    check: true,
                    major: true
                },
                &source,
                false
            )
            .unwrap()
            .contains("3.0.0")
        );
        assert!(
            run_with(&home, temp.path(), &Options::default(), &source, false)
                .unwrap_err()
                .contains("isolated")
        );
        let corrupt = Fixture {
            archive: source.archive.clone(),
            corrupt: true,
            activates: Cell::new(0),
        };
        assert!(
            run_with(&home, temp.path(), &Options::default(), &corrupt, true)
                .unwrap_err()
                .contains("checksum")
        );
        assert_eq!(corrupt.activates.get(), 0);
        assert!(
            run_with(&home, temp.path(), &Options::default(), &source, true)
                .unwrap()
                .contains("updated")
        );
        assert_eq!(source.activates.get(), 1);
        assert!(!runtime::state(&home).join("update.lock").exists());
        assert!(
            fs::read_dir(runtime::state(&home))
                .unwrap()
                .all(|entry| entry.unwrap().file_name() == "update.lock.guard")
        );
    }
    #[test]
    fn pin_and_moved_tag_block_activation_and_daily_clock_handles_future() {
        let temp = tempfile::tempdir().unwrap();
        fixture_info(temp.path(), json!({"ref":"private-branch"}));
        let source = Fixture {
            archive: fixture_archive(temp.path()),
            corrupt: false,
            activates: Cell::new(0),
        };
        assert!(
            run_with(temp.path(), temp.path(), &Options::default(), &source, true)
                .unwrap()
                .contains("pinned")
        );
        fixture_info(temp.path(), json!({"tagSha":"f".repeat(40)}));
        assert!(
            run_with(temp.path(), temp.path(), &Options::default(), &source, true)
                .unwrap_err()
                .contains("tag moved")
        );
        assert_eq!(source.activates.get(), 0);
        runtime::ensure_private_dir(temp.path(), &runtime::state(temp.path())).unwrap();
        let last = runtime::state(temp.path()).join("last-check");
        runtime::atomic_private(&last, b"100").unwrap();
        assert!(!due(temp.path(), 101).unwrap());
        assert!(due(temp.path(), 99).unwrap());
        assert!(due(temp.path(), DAY + 100).unwrap());
        assert_eq!(clean_note("hello\nworld\u{1b}[31m"), "helloworld[31m");
        assert_eq!(clean_note(&"x".repeat(250)).len(), 200);
    }
    #[test]
    fn release_catalog_peels_tags_and_rejects_non_release_names() {
        let raw = format!(
            "{}\trefs/tags/v2.9.0\n{}\trefs/tags/v2.10.0\n{}\trefs/tags/v2.10.0^{{}}\n{}\trefs/tags/v3.0.0-beta\n",
            "a".repeat(40),
            "b".repeat(40),
            "c".repeat(40),
            "d".repeat(40)
        );
        let tags = parse_tags(&raw);
        assert_eq!(tags.len(), 2);
        assert_eq!(tags[1].version.text(), "2.10.0");
        assert_eq!(tags[1].sha, "c".repeat(40));
        assert!(Version::parse("2.01.0").is_none());
    }
    #[test]
    fn archive_boundary_rejects_parent_paths_and_links_before_writing() {
        assert!(archive_path(Path::new("../escape")).is_err());
        assert!(archive_path(Path::new("C:\\escape")).is_err());
        for npm in [false, true] {
            let temp = tempfile::tempdir().unwrap();
            let archive = temp.path().join("bad.tar.gz");
            let out = fs::File::create(&archive).unwrap();
            let mut builder = tar::Builder::new(flate2::write::GzEncoder::new(
                out,
                flate2::Compression::default(),
            ));
            let prefix = if npm { "package/assets" } else { "assets" };
            let mut regular = tar::Header::new_gnu();
            regular.set_size(1);
            regular.set_mode(0o600);
            regular.set_cksum();
            builder
                .append_data(&mut regular, format!("{prefix}/before"), b"x".as_slice())
                .unwrap();
            let mut header = tar::Header::new_gnu();
            header.set_entry_type(tar::EntryType::Symlink);
            header.set_size(0);
            header.set_mode(0o777);
            header.set_link_name("../../escape").unwrap();
            header.set_cksum();
            builder
                .append_data(&mut header, format!("{prefix}/link"), std::io::empty())
                .unwrap();
            builder.into_inner().unwrap().finish().unwrap();
            let dest = temp.path().join("extracted");
            assert!(unpack(&archive, &dest, npm).is_err());
            assert!(!dest.exists());
        }
    }
    #[test]
    fn checksum_requires_one_exact_bundle_entry() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("bundle");
        fs::write(&file, "verified bytes").unwrap();
        let sum = digest(&file).unwrap();
        verify_checksum(
            &format!("{sum}  exonous-target.tar.gz\n"),
            "exonous-target.tar.gz",
            &file,
        )
        .unwrap();
        assert!(
            verify_checksum(
                &format!("{sum}  other.tar.gz\n"),
                "exonous-target.tar.gz",
                &file
            )
            .is_err()
        );
        assert!(
            verify_checksum(
                &format!("{sum}  exonous-target.tar.gz\n{sum}  exonous-target.tar.gz\n"),
                "exonous-target.tar.gz",
                &file
            )
            .is_err()
        );
    }
}
