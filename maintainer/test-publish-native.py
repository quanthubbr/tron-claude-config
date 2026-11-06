#!/usr/bin/env python3
import base64
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location('publish_native', ROOT / 'maintainer/publish-native.py')
PUBLISH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PUBLISH)


class Publish(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.archive = Path(self.temporary.name) / 'exonous-2.10.4.tgz'
        self.body = b'validated-package-bytes'
        self.archive.write_bytes(self.body)
        self.metadata = {'name': 'exonous', 'version': '2.10.4', 'gitHead': 'a' * 40, 'size': len(self.body), 'dist': {'tarball': 'https://registry.npmjs.org/exonous/-/exonous-2.10.4.tgz', 'integrity': 'sha512-' + base64.b64encode(hashlib.sha512(self.body).digest()).decode()}}
        self.publication = self.archive.parent / 'publication.json'
        self.publication.write_text(json.dumps(self.metadata))
        self.opener = MagicMock()
        self.opener.open.side_effect = lambda *args, **kwargs: io.BytesIO(self.body)
        self.network = patch.object(PUBLISH.urllib.request, 'build_opener', return_value=self.opener)
        self.network.start()
        self.addCleanup(self.network.stop)

    def test_existing_exact_package_is_verified_without_republishing(self):
        with patch.object(PUBLISH, 'metadata', return_value=self.metadata), patch.object(PUBLISH.subprocess, 'run') as run:
            PUBLISH.publish(self.archive, self.publication, 'a' * 40)
            run.assert_not_called()

    def test_existing_different_source_or_integrity_blocks_release(self):
        for key in ('name', 'version', 'gitHead', 'integrity', 'tarball'):
            actual = copy.deepcopy(self.metadata)
            (actual['dist'] if key in ('integrity', 'tarball') else actual)[key] = 'different'
            with self.subTest(key=key), patch.object(PUBLISH, 'metadata', return_value=actual), patch.object(PUBLISH.subprocess, 'run') as run, self.assertRaises(ValueError):
                PUBLISH.publish(self.archive, self.publication, 'a' * 40)
            run.assert_not_called()

    def test_missing_package_publishes_then_verifies_before_completion(self):
        with patch.object(PUBLISH, 'metadata', side_effect=[None, self.metadata]), patch.object(PUBLISH.subprocess, 'run', return_value=MagicMock(returncode=0)) as run, patch.dict(PUBLISH.os.environ, {'ACTIONS_ID_TOKEN_REQUEST_URL': 'fixture'}):
            PUBLISH.publish(self.archive, self.publication, 'a' * 40)
            command = run.call_args.args[0]
            self.assertEqual(command[:2], ['npm', 'publish'])
            self.assertIn('--ignore-scripts', command)
            self.assertIn('--provenance', command)

    def test_missing_publish_authorization_blocks_release(self):
        with patch.object(PUBLISH, 'metadata', return_value=None), patch.object(PUBLISH.subprocess, 'run', return_value=MagicMock(returncode=1)), self.assertRaisesRegex(ValueError, 'exact validated CI'):
            PUBLISH.publish(self.archive, self.publication, 'a' * 40)

    def test_changed_local_or_published_bytes_block_release(self):
        self.archive.write_bytes(b'changed')
        with self.assertRaises(ValueError):
            PUBLISH.publish(self.archive, self.publication, 'a' * 40)
        self.archive.write_bytes(self.body)
        self.opener.open.side_effect = lambda *args, **kwargs: io.BytesIO(b'changed')
        with patch.object(PUBLISH, 'metadata', return_value=self.metadata), self.assertRaises(ValueError):
            PUBLISH.publish(self.archive, self.publication, 'a' * 40)


if __name__ == '__main__':
    unittest.main()
