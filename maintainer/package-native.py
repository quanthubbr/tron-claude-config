#!/usr/bin/env python3
import argparse
import base64
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile
import tomllib

TARGETS = ("aarch64-apple-darwin", "x86_64-apple-darwin", "aarch64-unknown-linux-gnu", "x86_64-unknown-linux-gnu", "x86_64-pc-windows-msvc")


def package(root, binaries, output, git_head):
    if not re.fullmatch(r"[0-9a-f]{40}", git_head):
        raise ValueError("source commit must be 40 lowercase hexadecimal characters")
    if binaries.is_symlink():
        raise ValueError("native binaries root must not be a symlink")
    root = root.resolve()
    binaries = binaries.resolve()
    source = json.loads((root / "package.json").read_text())
    version = tomllib.loads((root / "Cargo.toml").read_text())["package"]["version"]
    if source["version"] != version:
        raise ValueError("Cargo and package versions differ")
    manifest = {"name": "exonous", "version": version, "description": source["description"], "repository": source["repository"], "gitHead": git_head, "bin": {"exonous": "bin/native.cjs"}, "engines": {"node": ">=18.0.0"}}
    files = []
    for target in TARGETS:
        name = f"native/{target}/exonous" + (".exe" if "windows" in target else "")
        files.append((binaries / target / Path(name).name, name, 0o755))
    tracked = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "assets/"], cwd=root, check=True, capture_output=True).stdout
    files += [(root / name, name, 0o755 if (root / name).stat().st_mode & 0o111 else 0o644) for name in sorted(set(tracked.decode().split("\0"))) if name]
    files += [(root / name, name, 0o755 if name.endswith(".cjs") else 0o644) for name in ("bin/native.cjs", "README.md")]
    for path, _, _ in files:
        if not path.is_file() or path.is_symlink() or any(parent.is_symlink() for parent in path.parents):
            raise ValueError(f"package input must be a regular file without symlink parents: {path}")
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f"exonous-{version}.tgz"
    with archive.open("wb") as destination, gzip.GzipFile(fileobj=destination, mode="wb", filename="", mtime=0) as compressed, tarfile.open(fileobj=compressed, mode="w", format=tarfile.USTAR_FORMAT) as bundle:
        contents = [("package.json", json.dumps(manifest, separators=(",", ":")).encode(), 0o644)]
        contents += [(name, path.read_bytes(), mode) for path, name, mode in files]
        for name, body, mode in sorted(contents):
            info = tarfile.TarInfo("package/" + name)
            info.size = len(body)
            info.mode = mode
            bundle.addfile(info, io.BytesIO(body))
    integrity = "sha512-" + base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode()
    metadata = {"name": "exonous", "version": version, "gitHead": git_head, "size": archive.stat().st_size, "dist": {"tarball": f"https://registry.npmjs.org/exonous/-/{archive.name}", "integrity": integrity}}
    (output / "publication.json").write_text(json.dumps(metadata, indent=2) + "\n")
    return archive


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--binaries", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--git-head", required=True)
    args = parser.parse_args()
    print(package(Path(__file__).resolve().parent.parent, args.binaries.resolve(), args.output, args.git_head))
