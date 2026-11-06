#!/usr/bin/env python3
import argparse
import base64
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
REGISTRY = "https://registry.npmjs.org/exonous"
GIT_HEAD = "a" * 40
TARGETS = ("aarch64-apple-darwin", "x86_64-apple-darwin", "aarch64-unknown-linux-gnu", "x86_64-unknown-linux-gnu", "x86_64-pc-windows-msvc")
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
    $Path = Join-Path $env:FIXTURE_TRANSPORT ([IO.Path]::GetFileName($Uri.AbsolutePath))
    $Length = (Get-Item -LiteralPath $Path).Length
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
            header.mode = 0o755 if "/native/" in name or name.endswith(".cjs") else 0o644
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
        self.filename = f"exonous-{VERSION}.tgz"
        self.bundle = self.transport / self.filename
        candidate = f'#!/bin/sh\nif [ "$1" = --version ]; then echo "${{FIXTURE_VERSION-{VERSION}}}"; exit; fi\nprintf "%s\\n" "$@" > "$EXONOUS_HOME/arguments"\nprintf "%s\\n" "$EXONOUS_ASSETS" > "$EXONOUS_HOME/assets"\nprintf "%s" "${{EXONOUS_VERIFIED_RELEASE-unset}}" > "$EXONOUS_HOME/provenance"\nexit "${{FIXTURE_EXIT-0}}"\n'.encode()
        if POWERSHELL:
            candidate = windows_candidate()
        self.manifest = {"name": "exonous", "version": VERSION, "gitHead": GIT_HEAD, "bin": {"exonous": "bin/native.cjs"}}
        self.entries = [(f"package/native/{target}/exonous" + (".exe" if "windows" in target else ""), candidate, tarfile.REGTYPE) for target in TARGETS]
        self.entries += [("package/bin/native.cjs", (ROOT / "bin/native.cjs").read_bytes(), tarfile.REGTYPE), ("package/assets/rules/nomos.md", b"rules", tarfile.REGTYPE), ("package/package.json", json.dumps(self.manifest).encode(), tarfile.REGTYPE)]
        self.env = dict(os.environ, HOME=str(self.home), EXONOUS_HOME=str(self.home), TMPDIR=str(self.staging), EXONOUS_NO_UPDATE="1", EXONOUS_VERIFIED_RELEASE="inherited-untrusted", FIXTURE_TRANSPORT=str(self.transport), PATH=str(self.network) + os.pathsep + os.environ["PATH"])
        curl = self.network / "curl"
        curl.write_text("#!" + sys.executable + "\n" + '''import os, pathlib, shutil, sys
a=sys.argv[1:]; root=pathlib.Path(os.environ["FIXTURE_TRANSPORT"])
url=a[-1]
with (root/"requests").open("a") as f: f.write(url+"\\n")
if os.environ.get("FIXTURE_DOWNLOAD_FAIL"): sys.exit(22)
destination=pathlib.Path(a[a.index("--output")+1])
shutil.copyfile(root/url.rsplit("/",1)[-1],destination)
''')
        curl.chmod(0o755)
        if POWERSHELL:
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
        integrity = "sha512-" + base64.b64encode(hashlib.sha512(self.bundle.read_bytes()).digest()).decode()
        self.metadata = {"name": "exonous", "version": VERSION, "gitHead": self.manifest["gitHead"], "dist": {"tarball": f"{REGISTRY}/-/{self.filename}", "integrity": integrity}}
        (self.transport / "latest").write_text(json.dumps(self.metadata), encoding="utf-8")

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
        self.assertTrue((self.home / "assets").read_text(encoding="utf-8").strip().replace('\\', '/').endswith("/bundle/package/assets"))
        self.assertEqual(list(self.staging.iterdir()), [])
        requests = (self.transport / "requests").read_text(encoding="utf-8").splitlines()
        self.assertEqual(requests, [f"{REGISTRY}/latest", f"{REGISTRY}/-/{self.filename}"])

    def npm(self, *arguments):
        temporary = self.work / 'npm-temp'
        temporary.mkdir(exist_ok=True)
        env = dict(self.env, TMPDIR=str(temporary), TEMP=str(temporary), TMP=str(temporary))
        command = [shutil.which("npm"), "exec", "--yes", "--offline", "--ignore-scripts", "--cache", str(self.work / "npm-cache"), "--package", str(self.bundle), "--", "exonous", *arguments]
        if os.name == "nt":
            command = [os.environ.get("COMSPEC", "cmd.exe"), "/d", "/c", *command]
        return subprocess.run(command, cwd=self.work, env=env, text=True, encoding="utf-8", capture_output=True)

    def test_npx_dispatches_native_default_and_explicit_arguments(self):
        result = self.npm()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((self.home / "arguments").read_text().splitlines(), ["install"])
        result = self.npm("status", "--example", "one two", 'one"two', '', 'trailing\\')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((self.home / "arguments").read_text().splitlines(), ["status", "--example", "one two", 'one"two', '', 'trailing\\'])
        self.assertEqual((self.home / "provenance").read_text(), "unset")
        self.env["FIXTURE_EXIT"] = "23"
        self.assertEqual(self.npm("status").returncode, 23)

    def test_child_failure_status_is_preserved(self):
        self.env["FIXTURE_EXIT"] = "23"
        self.assertEqual(self.run_bootstrap().returncode, 23)
        self.assertEqual(list(self.staging.iterdir()), [])

    def test_download_failure(self):
        self.env["FIXTURE_DOWNLOAD_FAIL"] = "1"
        self.rejected()

    def test_metadata_identity_and_integrity_are_pinned(self):
        import copy
        cases = [("name", "other"), ("version", VERSION + "-rc1"), ("gitHead", "A" * 40), ("gitHead", "a" * 39), ("tarball", f"{REGISTRY}/-/{self.filename}?extra"), ("tarball", f"http://registry.npmjs.org/exonous/-/{self.filename}"), ("integrity", "sha256-AAAA"), ("integrity", "sha512-" + "A" * 85 + "B==")]
        for key, value in cases:
            with self.subTest(key=key, value=value):
                metadata = copy.deepcopy(self.metadata)
                (metadata["dist"] if key in ("tarball", "integrity") else metadata)[key] = value
                (self.transport / "latest").write_text(json.dumps(metadata))
                self.rejected()

    def test_metadata_json_is_strict(self):
        raw = json.dumps(self.metadata)
        cases = ['{"name":"wrong",' + raw[1:], raw.replace('"name"', '"na\\u006de"', 1), raw[:-1] + ',}', raw + ' null', raw.replace('"dist": {', '"dist": {"extra":1,"extra":2,', 1), raw.replace('"dist": {', '"dist": {"extra":[1,],', 1)]
        for text in cases:
            with self.subTest(text=text):
                (self.transport / "latest").write_text(text)
                self.rejected()

    def test_corrupt_archive_is_rejected(self):
        self.bundle.write_bytes(self.bundle.read_bytes() + b"corrupt")
        self.rejected()

    def test_json_paths_cannot_alias_nested_metadata(self):
        self.metadata['dist/tarball'] = self.metadata['dist']['tarball']
        self.metadata['dist']['tarball'] += '?untrusted'
        (self.transport / 'latest').write_text(json.dumps(self.metadata))
        self.rejected()

    def test_unknown_json_values_are_consumed(self):
        self.metadata['extra'] = {'unicode': 'ação 🏛', 'nested': [True, False, None, -1.5e20, {'message': '"name":"wrong"'}]}
        (self.transport / 'latest').write_text(json.dumps(self.metadata, ensure_ascii=False), encoding='utf-8')
        result = self.run_bootstrap()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_archived_manifest_matches_registry(self):
        for key, value in (("name", "other"), ("version", "0.0.0"), ("gitHead", "b" * 40)):
            with self.subTest(key=key):
                manifest = dict(self.manifest, **{key: value})
                self.entries[-1] = ("package/package.json", json.dumps(manifest).encode(), tarfile.REGTYPE)
                self.publish()
                self.rejected()

    def test_archived_manifest_is_bounded(self):
        body = json.dumps(self.manifest).encode() + b' ' * 1048576
        self.entries[-1] = ('package/package.json', body, tarfile.REGTYPE)
        self.publish()
        self.rejected()

    def test_archive_boundary(self):
        cases = [("../outside", tarfile.REGTYPE), ("/package/assets/outside", tarfile.REGTYPE), ("package/assets/../outside", tarfile.REGTYPE), ("package/assets/link", tarfile.SYMTYPE), ("package/assets/hardlink", tarfile.LNKTYPE), ("package/assets/pipe", tarfile.FIFOTYPE), ("package/assets/sparse", tarfile.GNUTYPE_SPARSE), ("package/assets/pax", tarfile.XHDTYPE), ("package/assets/global-pax", tarfile.XGLTYPE), ("package/assets/longname", tarfile.GNUTYPE_LONGNAME), ("package/assets/longlink", tarfile.GNUTYPE_LONGLINK), ("unexpected/file", tarfile.REGTYPE), ("package/assets/name\\escape", tarfile.REGTYPE), ("package/assets/a\n../outside", tarfile.REGTYPE), ("package/assets/C:escape", tarfile.REGTYPE), ("package/assets/CON", tarfile.REGTYPE), ("package/assets/trailing.", tarfile.REGTYPE)]
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
        self.entries += [("package/assets/Name", b"file", tarfile.REGTYPE), ("package/assets/name", b"file", tarfile.REGTYPE)]
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
        self.entries += [("package/assets/file", b"file", tarfile.REGTYPE), ("package/assets/file/child", b"child", tarfile.REGTYPE)]
        self.publish()
        self.rejected()

    def test_oversized_metadata_download(self):
        (self.transport / "latest").write_text("x" * (1048576 + 1))
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


def real_bundle(binary, target, package_path=None):
    started = time.monotonic()
    import importlib.util
    spec = importlib.util.spec_from_file_location("package_native", ROOT / "maintainer/package-native.py")
    packager = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(packager)
    case = Bootstrap()
    case.setUp()
    try:
        if package_path:
            shutil.copyfile(package_path, case.bundle)
        else:
            binaries = case.work / "fixture-binaries"
            for platform_target in TARGETS:
                destination = binaries / platform_target / ("exonous.exe" if "windows" in platform_target else "exonous")
                destination.parent.mkdir(parents=True)
                shutil.copyfile(binary.resolve(), destination)
            packager.package(ROOT, binaries, case.transport, GIT_HEAD)
        with tarfile.open(case.bundle) as package:
            case.manifest = json.load(package.extractfile("package/package.json"))
        case.checksums()
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
        result = case.npm()
        assert result.returncode == 0, result.stdout + result.stderr
        version = case.npm("--version")
        assert version.returncode == 0 and version.stdout.strip() == VERSION, version.stdout + version.stderr
        for _ in range(2):
            result = case.run_bootstrap("--tools", "claude,cursor,codex")
            assert result.returncode == 0, result.stdout + result.stderr
            for name in personal:
                assert "preserve" in (case.home / name).read_text(encoding="utf-8"), name
        info = json.loads((case.home / ".claude/exonous/install.json").read_text(encoding="utf-8"))
        assert info["runtime"] == "rust" and info["complete"] is True, info
        assert 'tagSha' not in info, 'first installation must not invent verified Git provenance'
        assert set(info["tools"]) == {"claude", "cursor", "codex"}, info
        installed = Path(info["binary"])
        assert installed.is_file()
        assert installed.is_relative_to(case.home / ".claude/exonous/bin"), installed
        installed_assets = installed.parent / "assets"
        assert installed_assets.is_dir()
        assert (installed_assets / "rules/nomos.md").read_bytes() == (ROOT / "assets/rules/nomos.md").read_bytes()
        assert (installed_assets / "machine/PR-TEMPLATE.md").read_bytes() == (ROOT / "assets/machine/PR-TEMPLATE.md").read_bytes()
        size = case.bundle.stat().st_size
        shutil.rmtree(case.transport)
        shutil.rmtree(case.work / "npm-cache")
        shutil.rmtree(case.work / "npm-temp")
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
        print(f"PASS native npm/bootstrap ({time.monotonic() - started:.2f}s, {size} package bytes): install twice, persistent launcher, doctor, uninstall; Claude/Cursor/Codex personal config and vault preserved")
    finally:
        case.doCleanups()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", type=Path)
    parser.add_argument("--package", type=Path)
    parser.add_argument("--target", default=TARGET)
    parser.add_argument("--powershell", choices=["powershell", "pwsh"])
    args = parser.parse_args()
    if args.powershell:
        POWERSHELL_COMMAND = shutil.which(args.powershell)
        if not POWERSHELL_COMMAND:
            parser.error(f"{args.powershell} is not installed")
    if args.binary or args.package:
        real_bundle(args.binary, args.target, args.package)
    else:
        unittest.main(argv=[__file__])
