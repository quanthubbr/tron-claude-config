#!/usr/bin/env python3
import argparse
import functools
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest


ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
RELEASE = f"https://github.com/zaqueu-1/exonous/releases/tag/v{VERSION}"
TARGET = {("Darwin", "arm64"): "aarch64-apple-darwin", ("Darwin", "x86_64"): "x86_64-apple-darwin", ("Linux", "aarch64"): "aarch64-unknown-linux-gnu", ("Linux", "x86_64"): "x86_64-unknown-linux-gnu", ("Windows", "AMD64"): "x86_64-pc-windows-msvc"}.get((platform.system(), platform.machine()))
POWERSHELL = os.name == "nt"
POWERSHELL_COMMAND = shutil.which("powershell") or shutil.which("pwsh")

POWERSHELL_TRANSPORT = r'''
$ErrorActionPreference = 'Stop'
$Source = [IO.File]::ReadAllText($env:FIXTURE_BOOTSTRAP)
$Tokens = $null
$Errors = $null
$Ast = [Management.Automation.Language.Parser]::ParseInput($Source, [ref] $Tokens, [ref] $Errors)
if ($Errors.Count) { throw 'cannot parse bootstrap fixture' }
$Transport = $Ast.Find({ param($Node) $Node -is [Management.Automation.Language.FunctionDefinitionAst] -and $Node.Name -eq 'Get-ReleaseResponse' }, $false)
if (-not $Transport) { throw 'bootstrap transport seam unavailable' }
$Mock = @'
function Get-ReleaseResponse([string] $Url, [string] $Method) {
    [IO.File]::AppendAllText((Join-Path $env:FIXTURE_TRANSPORT 'requests'), $Url + "`n")
    if ($env:FIXTURE_DOWNLOAD_FAIL -eq '1') { throw 'fixture download failure' }
    $Uri = [Uri] $Url
    $Path = $null
    $Length = 0
    if ($Url.EndsWith('/latest')) { $Uri = [Uri] $env:FIXTURE_RELEASE }
    else {
        $Path = Join-Path $env:FIXTURE_TRANSPORT ([IO.Path]::GetFileName($Uri.AbsolutePath))
        $Length = (Get-Item -LiteralPath $Path).Length
    }
    $Response = [pscustomobject] @{ ResponseUri = $Uri; ContentLength = $Length; FixturePath = $Path }
    $Response | Add-Member -MemberType ScriptMethod -Name GetResponseStream -Value { [IO.File]::OpenRead($this.FixturePath) }
    $Response | Add-Member -MemberType ScriptMethod -Name Close -Value {}
    return $Response
}
'@
$Source = $Source.Remove($Transport.Extent.StartOffset, $Transport.Extent.EndOffset - $Transport.Extent.StartOffset).Insert($Transport.Extent.StartOffset, $Mock)
[string[]] $Forwarded = [IO.File]::ReadAllText($env:FIXTURE_ARGUMENTS) | ConvertFrom-Json
if ($null -eq $Forwarded) { $Forwarded = @() }
'''



@functools.lru_cache(maxsize=1)
def windows_candidate():
    with tempfile.TemporaryDirectory(prefix="exonous-bootstrap-spy-") as temp:
        source = Path(temp) / "candidate.rs"
        binary = Path(temp) / "candidate.exe"
        source.write_text('''use std::{env,fs,path::Path};
fn main() {
 let args:Vec<String> = env::args().skip(1).collect();
 if args.first().map(String::as_str)==Some("--version") { println!("{}",env::var("FIXTURE_VERSION").unwrap_or_else(|_| "'''+VERSION+'''".into())); return; }
 let home=env::var("EXONOUS_HOME").unwrap();
 fs::write(Path::new(&home).join("arguments"),args.join("\\n")+"\\n").unwrap();
 fs::write(Path::new(&home).join("assets"),env::var("EXONOUS_ASSETS").unwrap()).unwrap();
 fs::write(Path::new(&home).join("provenance"),env::var("EXONOUS_VERIFIED_RELEASE").unwrap_or_else(|_| "unset".into())).unwrap();
 std::process::exit(env::var("FIXTURE_EXIT").unwrap_or_else(|_| "0".into()).parse().unwrap());
}
''')
        subprocess.run(["rustc", "--edition=2024", str(source), "-o", str(binary)], check=True)
        return binary.read_bytes()


def archive(path, entries):
    with tarfile.open(path, "w:gz", format=tarfile.USTAR_FORMAT) as output:
        for name, body, kind in entries:
            header = tarfile.TarInfo(name)
            header.type = kind
            header.mode = 0o755 if name.startswith("exonous") else 0o644
            header.size = len(body) if kind == tarfile.REGTYPE else 0
            if kind in (tarfile.SYMTYPE, tarfile.LNKTYPE):
                header.linkname = "../outside"
            output.addfile(header, io.BytesIO(body) if header.size else None)


class Bootstrap(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="exonous-bootstrap-")
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.home = self.work / "home with spaces"
        self.home.mkdir()
        self.transport = self.work / "transport"
        self.transport.mkdir()
        self.staging = self.work / "staging"
        self.staging.mkdir()
        self.network = self.work / "network"
        self.network.mkdir()
        self.filename = f"exonous-{TARGET}.tar.gz"
        self.bundle = self.transport / self.filename
        candidate = f'#!/bin/sh\nif [ "$1" = --version ]; then echo "${{FIXTURE_VERSION-{VERSION}}}"; exit; fi\nprintf "%s\\n" "$@" > "$EXONOUS_HOME/arguments"\nprintf "%s\\n" "$EXONOUS_ASSETS" > "$EXONOUS_HOME/assets"\nprintf "%s" "${{EXONOUS_VERIFIED_RELEASE-unset}}" > "$EXONOUS_HOME/provenance"\nexit "${{FIXTURE_EXIT-0}}"\n'.encode()
        if POWERSHELL:
            candidate = windows_candidate()
        self.entries = [("exonous.exe" if POWERSHELL else "exonous", candidate, tarfile.REGTYPE), ("assets/rules/nomos.md", b"rules", tarfile.REGTYPE), ("package.json", json.dumps({"version": VERSION}).encode(), tarfile.REGTYPE)]
        self.env = dict(os.environ, HOME=str(self.home), EXONOUS_HOME=str(self.home), TMPDIR=str(self.staging), EXONOUS_NO_UPDATE="1", EXONOUS_VERIFIED_RELEASE="inherited-untrusted", FIXTURE_TRANSPORT=str(self.transport), PATH=str(self.network) + os.pathsep + os.environ["PATH"])
        curl = self.network / "curl"
        curl.write_text("#!" + sys.executable + "\n" + '''import os, pathlib, shutil, sys
a=sys.argv[1:]; root=pathlib.Path(os.environ["FIXTURE_TRANSPORT"])
url=a[-1]
with (root/"requests").open("a") as f: f.write(url+"\\n")
if os.environ.get("FIXTURE_DOWNLOAD_FAIL"): sys.exit(22)
if url.endswith("/latest"):
 print(os.environ.get("FIXTURE_RELEASE", "'''+RELEASE+'''"),end=""); sys.exit()
destination=pathlib.Path(a[a.index("--output")+1])
shutil.copyfile(root/url.rsplit("/",1)[-1],destination)
''')
        curl.chmod(0o755)
        if POWERSHELL:
            self.env["FIXTURE_RELEASE"] = RELEASE
            self.env["FIXTURE_BOOTSTRAP"] = str(ROOT / "install.ps1")
            self.env["TEMP"] = self.env["TMP"] = str(self.staging)
            (self.network / "tar.exe").write_bytes(candidate)
            self.driver = self.work / "transport.ps1"
            self.driver.write_text(POWERSHELL_TRANSPORT + "\n$Patched = Join-Path ([IO.Path]::GetDirectoryName($env:FIXTURE_ARGUMENTS)) 'fixture-bootstrap.ps1'\n[IO.File]::WriteAllText($Patched, $Source)\n& $Patched @Forwarded\nexit $LASTEXITCODE\n", encoding="utf-8")
        self.publish()

    def publish(self):
        archive(self.bundle, self.entries)
        self.checksums()

    def checksums(self):
        digest = hashlib.sha256(self.bundle.read_bytes()).hexdigest()
        (self.transport / "SHA256SUMS").write_text(f"{digest}  {self.filename}\n")

    def run_bootstrap(self, *arguments):
        if POWERSHELL:
            argument_file = self.work / "arguments.json"
            argument_file.write_text(json.dumps(arguments))
            self.env["FIXTURE_ARGUMENTS"] = str(argument_file)
            return subprocess.run([POWERSHELL_COMMAND, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", str(self.driver)], cwd=self.work, env=self.env, text=True, encoding="utf-8", capture_output=True)
        return subprocess.run(["sh", str(ROOT / "install.sh"), *arguments], cwd=self.work, env=self.env, text=True, encoding="utf-8", capture_output=True)

    def rejected(self):
        result = self.run_bootstrap("--tools", "claude,cursor,codex")
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(list(self.home.iterdir()), [], result.stdout + result.stderr)
        self.assertEqual(list(self.staging.iterdir()), [], result.stdout + result.stderr)
        return result

    def test_verified_bundle_forwards_arguments_and_cleans_staging(self):
        values = ["--tools", "claude,cursor,codex", "--example", 'one two;$cash', 'one"two', '', 'path with spaces\\']
        result = self.run_bootstrap(*values)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((self.home / "arguments").read_text(encoding="utf-8").splitlines(), ["install", *values])
        self.assertEqual((self.home / "provenance").read_text(encoding="utf-8"), "unset")
        self.assertTrue((self.home / "assets").read_text(encoding="utf-8").strip().replace('\\', '/').endswith("/bundle/assets"))
        self.assertEqual(list(self.staging.iterdir()), [])
        requests = (self.transport / "requests").read_text(encoding="utf-8").splitlines()
        latest = ["https://github.com/zaqueu-1/exonous/releases/latest"]
        self.assertEqual(requests, [*latest, RELEASE.replace("/tag/", "/download/") + "/SHA256SUMS", RELEASE.replace("/tag/", "/download/") + "/" + self.filename])

    def test_child_failure_status_is_preserved(self):
        self.env["FIXTURE_EXIT"] = "23"
        self.assertEqual(self.run_bootstrap().returncode, 23)
        self.assertEqual(list(self.staging.iterdir()), [])

    def test_download_failure(self):
        self.env["FIXTURE_DOWNLOAD_FAIL"] = "1"
        self.rejected()

    def test_untrusted_release_redirects(self):
        for release in ["http://github.com/zaqueu-1/exonous/releases/tag/v1.2.3", "https://github.com/else/exonous/releases/tag/v1.2.3", RELEASE + "-rc1", RELEASE + "/more", RELEASE.replace("/v", "/v0", 1)]:
            with self.subTest(release=release):
                self.env["FIXTURE_RELEASE"] = release
                self.rejected()

    def test_checksum_is_unique_exact_and_well_formed(self):
        digest = hashlib.sha256(self.bundle.read_bytes()).hexdigest()
        for manifest in [f'{"0" * 64}  {self.filename}\n', f"{digest}  {self.filename}.other\n", f"{digest}  {self.filename}\n{digest}  {self.filename}\n", f"xyz  {self.filename}\n"]:
            with self.subTest(manifest=manifest):
                (self.transport / "SHA256SUMS").write_text(manifest)
                self.rejected()

    def test_archive_boundary(self):
        cases = [("../outside", tarfile.REGTYPE), ("/assets/outside", tarfile.REGTYPE), ("assets/../outside", tarfile.REGTYPE), ("assets/link", tarfile.SYMTYPE), ("assets/hardlink", tarfile.LNKTYPE), ("assets/pipe", tarfile.FIFOTYPE), ("assets/sparse", tarfile.GNUTYPE_SPARSE), ("assets/pax", tarfile.XHDTYPE), ("assets/global-pax", tarfile.XGLTYPE), ("assets/longname", tarfile.GNUTYPE_LONGNAME), ("assets/longlink", tarfile.GNUTYPE_LONGLINK), ("unexpected/file", tarfile.REGTYPE), ("assets/name\\escape", tarfile.REGTYPE), ("assets/a\n../outside", tarfile.REGTYPE), ("assets/C:escape", tarfile.REGTYPE), ("assets/CON", tarfile.REGTYPE), ("assets/trailing.", tarfile.REGTYPE)]
        original = list(self.entries)
        for name, kind in cases:
            with self.subTest(name=name, kind=kind):
                self.entries = original + [(name, b"bad", kind)]
                self.publish()
                self.rejected()
                self.assertFalse((self.work / "outside").exists())

    def test_duplicate_archive_path(self):
        self.entries.append(self.entries[0])
        self.publish()
        self.rejected()

    def test_case_alias_archive_paths(self):
        self.entries += [("assets/Name", b"file", tarfile.REGTYPE), ("assets/name", b"file", tarfile.REGTYPE)]
        self.publish()
        self.rejected()

    def test_archive_header_and_termination(self):
        original = gzip.decompress(self.bundle.read_bytes())
        for raw in [b"x" + original[1:], original[:512], original + b"not padding"]:
            with self.subTest(length=len(raw)):
                self.bundle.write_bytes(gzip.compress(raw))
                self.checksums()
                self.rejected()

    def test_parent_file_collision(self):
        self.entries += [("assets/file", b"file", tarfile.REGTYPE), ("assets/file/child", b"child", tarfile.REGTYPE)]
        self.publish()
        self.rejected()

    def test_oversized_checksum_download(self):
        (self.transport / "SHA256SUMS").write_text("x" * 65537)
        self.rejected()

    def test_mismatched_candidate_version(self):
        self.env["FIXTURE_VERSION"] = "0.0.0"
        self.rejected()

    def test_unsupported_platform(self):
        if POWERSHELL:
            self.env["PROCESSOR_ARCHITECTURE"] = "ARM64"
            self.env.pop("PROCESSOR_ARCHITEW6432", None)
        else:
            uname = self.network / "uname"
            uname.write_text("#!/bin/sh\necho unsupported\n")
            uname.chmod(0o755)
        self.rejected()
        self.assertFalse((self.transport / "requests").exists())

    def test_piped_shell_entrypoint(self):
        if POWERSHELL:
            self.driver.write_text(POWERSHELL_TRANSPORT + "\n& ([scriptblock]::Create($Source)) @Forwarded\nexit $LASTEXITCODE\n", encoding="utf-8")
            result = self.run_bootstrap("--tools", "claude,cursor,codex")
        else:
            result = subprocess.run(["sh", "-s", "--", "--tools", "claude,cursor,codex"], input=(ROOT / "install.sh").read_text(encoding="utf-8"), cwd=self.work, env=self.env, text=True, encoding="utf-8", capture_output=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((self.home / "arguments").read_text(encoding="utf-8").splitlines(), ["install", "--tools", "claude,cursor,codex"])


def real_bundle(binary, target):
    started = time.monotonic()
    import importlib.util
    spec = importlib.util.spec_from_file_location("package_native", ROOT / "maintainer/package-native.py")
    packager = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(packager)
    case = Bootstrap()
    case.setUp()
    try:
        bundle = packager.package(ROOT, binary.resolve(), target, case.transport)
        (case.transport / "SHA256SUMS").write_bytes((case.transport / (bundle.name + ".sha256")).read_bytes())
        for directory in (".claude", ".cursor", ".codex"):
            (case.home / directory).mkdir()
        personal = {".claude/settings.json": '{"personal":"preserve"}', ".cursor/hooks.json": '{"version":1,"hooks":{},"personal":"preserve"}', ".codex/config.toml": 'personal = "preserve"\n'}
        for name, body in personal.items():
            (case.home / name).write_text(body)
        vault = case.home / "notes"
        vault.mkdir()
        (vault / "personal.md").write_text("Keep this note.\n")
        config = case.home / ".claude/exonous/config.json"
        config.parent.mkdir()
        config.write_text(json.dumps({"vault": str(vault), "autoUpdate": False}))
        for _ in range(2):
            result = case.run_bootstrap("--tools", "claude,cursor,codex")
            assert result.returncode == 0, result.stdout + result.stderr
            for name in personal:
                assert "preserve" in (case.home / name).read_text(encoding="utf-8"), name
        info = json.loads((case.home / ".claude/exonous/install.json").read_text(encoding="utf-8"))
        assert info["runtime"] == "rust" and info["complete"] is True, info
        assert set(info["tools"]) == {"claude", "cursor", "codex"}, info
        installed = Path(info["binary"])
        assert installed.is_file()
        assert installed.is_relative_to(case.home / ".claude/exonous/bin"), installed
        installed_assets = installed.parent / "assets"
        assert installed_assets.is_dir()
        assert (installed_assets / "rules/nomos.md").read_bytes() == (ROOT / "assets/rules/nomos.md").read_bytes()
        assert (installed_assets / "machine/PR-TEMPLATE.md").read_bytes() == (ROOT / "assets/machine/PR-TEMPLATE.md").read_bytes()
        shutil.rmtree(case.transport)
        assert list(case.staging.iterdir()) == []
        case.env.pop("EXONOUS_ASSETS", None)
        case.env.pop("EXONOUS_VERIFIED_RELEASE", None)
        launcher = case.home / ".local/bin" / ("exonous.cmd" if os.name == "nt" else "exonous")
        for args in (["--version"], ["template"], ["install", "--tools", "claude,cursor,codex"], ["doctor", "--json"], ["uninstall", "--yes"]):
            command = [str(launcher), *args]
            if os.name == "nt":
                command = [os.environ.get("COMSPEC", "cmd.exe"), "/d", "/c", *command]
            result = subprocess.run(command, cwd=case.work, env=case.env, text=True, encoding="utf-8", capture_output=True)
            assert result.returncode == 0, f"launcher args={args!r}\n{result.stdout}{result.stderr}"
            if args[0] == "doctor":
                report = json.loads(result.stdout)
                assert report["runtime"] == "rust" and report["complete"] is True, report
            if args[0] == "template":
                assert result.stdout.strip().endswith((installed_assets / "machine/PR-TEMPLATE.md").read_text(encoding="utf-8").strip())
        for name in personal:
            content = (case.home / name).read_text(encoding="utf-8")
            assert "preserve" in content, name
            assert str(installed).replace('\\', '/') not in content.replace('\\\\', '\\').replace('\\', '/'), name
        assert (vault / "personal.md").read_text(encoding="utf-8") == "Keep this note.\n"
        assert json.loads(config.read_text(encoding="utf-8"))["vault"] == str(vault)
        print(f"PASS native bootstrap ({time.monotonic() - started:.2f}s): install twice, persistent launcher, doctor, uninstall; Claude/Cursor/Codex personal config and vault preserved")
    finally:
        case.doCleanups()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", type=Path)
    parser.add_argument("--target", default=TARGET)
    parser.add_argument("--powershell", choices=["powershell", "pwsh"])
    args = parser.parse_args()
    if args.powershell:
        POWERSHELL_COMMAND = shutil.which(args.powershell)
        if not POWERSHELL_COMMAND:
            parser.error(f"{args.powershell} is not installed")
    if args.binary:
        real_bundle(args.binary, args.target)
    else:
        unittest.main(argv=[__file__])
