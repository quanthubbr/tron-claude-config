#!/usr/bin/env python3
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("package_native", ROOT / "maintainer/package-native.py")
PACKAGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACKAGE)


class Package(unittest.TestCase):
    def test_public_package_is_complete_deterministic_and_has_no_install_hooks(self):
        import tarfile
        with tempfile.TemporaryDirectory() as temporary:
            work = Path(temporary)
            binaries = work / "native"
            for target in PACKAGE.TARGETS:
                binary = binaries / target / ("exonous.exe" if "windows" in target else "exonous")
                binary.parent.mkdir(parents=True)
                binary.write_bytes(target.encode())
            archive = PACKAGE.package(ROOT, binaries, work / "dist", "a" * 40)
            original = archive.read_bytes()
            self.assertEqual(PACKAGE.package(ROOT, binaries, work / "dist", "a" * 40).read_bytes(), original)
            with tarfile.open(archive) as bundle:
                self.assertTrue(all(member.isfile() for member in bundle.getmembers()))
                names = bundle.getnames()
                self.assertEqual(sum(name.startswith("package/native/") for name in names), 5)
                manifest = json.load(bundle.extractfile("package/package.json"))
                self.assertEqual(manifest["name"], "exonous")
                self.assertEqual(manifest["gitHead"], "a" * 40)
                self.assertEqual(manifest["bin"], {"exonous": "bin/native.cjs"})
                self.assertNotIn("private", manifest)
                self.assertNotIn("scripts", manifest)
                self.assertNotIn("dependencies", manifest)
                self.assertIn("package/assets/rules/nomos.md", names)
                self.assertNotIn("package/native/src/main.rs", names)
            metadata = json.loads((archive.parent / "publication.json").read_text())
            self.assertEqual(metadata["gitHead"], "a" * 40)
            self.assertEqual(metadata["size"], len(original))
            self.assertTrue(metadata["dist"]["integrity"].startswith("sha512-"))
            binaries.joinpath(next(iter(PACKAGE.TARGETS)), "exonous").unlink()
            with self.assertRaises(ValueError):
                PACKAGE.package(ROOT, binaries, work / "dist", "a" * 40)

    def test_source_commit_must_be_canonical(self):
        with tempfile.TemporaryDirectory() as temporary:
            for sha in ("", "A" * 40, "a" * 39, "g" * 40):
                with self.subTest(sha=sha), self.assertRaises(ValueError):
                    PACKAGE.package(ROOT, Path(temporary), Path(temporary), sha)


if __name__ == "__main__":
    unittest.main()
