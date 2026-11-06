#!/usr/bin/env python3
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request


def unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate registry metadata key")
        result[key] = value
    return result


class HttpsRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, url):
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != "https" or parsed.username or parsed.password:
            raise ValueError("registry redirects require HTTPS without credentials")
        return super().redirect_request(request, response, code, message, headers, url)


def metadata(version):
    try:
        with urllib.request.build_opener(HttpsRedirect).open(f"https://registry.npmjs.org/exonous/{version}", timeout=120) as response:
            raw = response.read(1048577)
        if len(raw) > 1048576:
            raise ValueError("registry metadata exceeds size limit")
        return json.loads(raw, object_pairs_hook=unique)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise


def verify(expected, actual):
    for key in ("name", "version", "gitHead"):
        if actual.get(key) != expected[key]:
            raise ValueError(f"published npm {key} differs from validated artifact")
    if actual.get("dist", {}).get("tarball") != expected["dist"]["tarball"] or actual["dist"].get("integrity") != expected["dist"]["integrity"]:
        raise ValueError("published npm SRI or tarball URL differs from validated artifact")
    digest = hashlib.sha512()
    total = 0
    with urllib.request.build_opener(HttpsRedirect).open(expected["dist"]["tarball"], timeout=120) as response:
        while chunk := response.read(65536):
            total += len(chunk)
            if total > 134217728:
                raise ValueError("published package exceeds size limit")
            digest.update(chunk)
    if "sha512-" + base64.b64encode(digest.digest()).decode() != expected["dist"]["integrity"]:
        raise ValueError("published npm bytes differ from validated artifact")


def publish(archive, publication, source):
    expected = json.loads(publication.read_text(), object_pairs_hook=unique)
    if expected.get("name") != "exonous" or not re.fullmatch(r"[0-9a-f]{40}", source) or expected.get("gitHead") != source:
        raise ValueError("artifact source identity differs from workflow commit")
    if not re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", expected["version"]):
        raise ValueError("artifact version must be stable")
    canonical = f"https://registry.npmjs.org/exonous/-/exonous-{expected['version']}.tgz"
    integrity = "sha512-" + base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode()
    if expected["dist"] != {"tarball": canonical, "integrity": integrity} or expected["size"] != archive.stat().st_size:
        raise ValueError("local package differs from validated publication record")
    actual = metadata(expected["version"])
    if actual is None:
        command = ["npm", "publish", str(archive.resolve()), "--ignore-scripts", "--access", "public", "--registry", "https://registry.npmjs.org"]
        if os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL"):
            command.append("--provenance")
        result = subprocess.run(command)
        if result.returncode:
            raise ValueError("npm publication needs an authorized publisher; publish the exact validated CI .tgz locally after npm login, then rerun only this failed release job")
        actual = metadata(expected["version"])
    if actual is None:
        raise ValueError("published npm version is not available; retry this release job")
    verify(expected, actual)
    print(f"Verified published exonous@{expected['version']}: exact source, SRI and bytes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--package", type=Path, required=True)
    parser.add_argument("--publication", type=Path, required=True)
    parser.add_argument("--source", required=True)
    args = parser.parse_args()
    try:
        publish(args.package, args.publication, args.source)
    except (ValueError, OSError, KeyError) as error:
        print(f"exonous release: {error}", file=sys.stderr)
        sys.exit(1)
