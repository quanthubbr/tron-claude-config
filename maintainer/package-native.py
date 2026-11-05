#!/usr/bin/env python3
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import tomllib


def package(root, binary, target, output):
    version = tomllib.loads((root / "Cargo.toml").read_text())["package"]["version"]
    if json.loads((root / "package.json").read_text())["version"] != version:
        raise ValueError("Cargo and package versions differ")
    if not binary.is_file() or binary.is_symlink():
        raise ValueError("native executable must be a regular file")
    files = [(binary, "exonous.exe" if target.endswith("windows-msvc") else "exonous")]
    tracked = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "assets/"], cwd=root, check=True, capture_output=True).stdout
    files += [(root / name, name) for name in sorted(set(tracked.decode().split("\0"))) if name]
    files += [(root / name, name) for name in ["README.md", "Cargo.toml", "Cargo.lock", "package.json"]]
    if any(path.is_symlink() for path, _ in files):
        raise ValueError("native assets must not contain symlinks")
    for _, name in files:
        if name.startswith("assets/"):
            parts = Path(name).parts
            if any(root.joinpath(*parts[:length]).is_symlink() for length in range(1, len(parts))):
                raise ValueError("native asset parents must not contain symlinks")
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f"exonous-{target}.tar.gz"
    with tarfile.open(archive, "w:gz", format=tarfile.USTAR_FORMAT) as bundle:
        for path, name in files:
            info = bundle.gettarinfo(str(path), arcname=name)
            if not info.isfile():
                raise ValueError("bundle only supports regular files")
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            info.mtime = 0
            info.mode = 0o755 if path == binary or path.stat().st_mode & 0o111 else 0o644
            with path.open("rb") as body:
                bundle.addfile(info, body)
    with archive.open("rb") as body:
        digest = hashlib.file_digest(body, "sha256").hexdigest()
    (output / f"{archive.name}.sha256").write_text(f"{digest}  {archive.name}\n")
    return archive


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", type=Path, required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(package(Path(__file__).resolve().parent.parent, args.binary.resolve(), args.target, args.output))
