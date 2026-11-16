import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

PROJECT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('compat_route', PROJECT / 'deploy/configure-compat-route.py')
route = importlib.util.module_from_spec(spec)
spec.loader.exec_module(route)


class CompatRouteTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.state = Path(self.temp.name)
        self.config = self.state / 'site.conf'
        self.original = 'server {\n    include operator-settings;\n    location = / {\n        proxy_pass http://existing;\n    }\n}\n'
        self.config.write_text(self.original)
        self.block = (PROJECT / 'deploy/compat-route.inc').read_text()

    def test_scoped_install_is_idempotent_and_rollback_is_verbatim(self):
        with patch.object(route, 'reload'):
            route.apply(self.state, config=self.config)
            updated = self.config.read_text()
            self.assertEqual(updated.replace(self.block + '\n', ''), self.original)
            self.assertEqual(route.candidate(updated, self.block), updated)
            route.apply(self.state, rollback=True, config=self.config)
        self.assertEqual(self.config.read_text(), self.original)

    def test_invalid_config_automatically_restores_original(self):
        with patch.object(route, 'reload', side_effect=[RuntimeError('invalid config'), None]):
            with self.assertRaisesRegex(RuntimeError, 'invalid config'):
                route.apply(self.state, config=self.config)
        self.assertEqual(self.config.read_text(), self.original)

    def test_rollback_does_not_overwrite_later_changes(self):
        with patch.object(route, 'reload'):
            route.apply(self.state, config=self.config)
            self.config.write_text(self.config.read_text() + '# operator change\n')
            with self.assertRaisesRegex(RuntimeError, 'another nginx change'):
                route.apply(self.state, rollback=True, config=self.config)

    def test_conflicting_route_and_ambiguous_target_are_rejected(self):
        for original in (self.original + '# /compat custom route', self.original * 2, 'server {}'):
            with self.subTest(original=original), self.assertRaises(RuntimeError):
                route.candidate(original, self.block)

    def test_symlink_and_backup_reuse_are_rejected(self):
        with patch.object(route, 'reload'):
            route.apply(self.state, config=self.config)
            with self.assertRaisesRegex(RuntimeError, 'already exists'):
                route.apply(self.state, config=self.config)
        link = self.state / 'link.conf'
        link.symlink_to(self.config)
        with self.assertRaisesRegex(RuntimeError, 'symlinked'):
            route.apply(self.state, config=link)


if __name__ == '__main__':
    unittest.main()
