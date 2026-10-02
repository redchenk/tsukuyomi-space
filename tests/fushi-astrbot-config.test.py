import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('config', Path(__file__).resolve().parents[1] / 'deploy/fushi-astrbot-config.py')
config = importlib.util.module_from_spec(spec)
spec.loader.exec_module(config)


class ConfigTests(unittest.TestCase):
    def test_merge_preserves_primary_credentials_and_other_clients(self):
        other = {'client_id': 'existing', 'redirect_uris': ['https://existing.test/callback']}
        before = 'FUSHI_SECRET_KEY=fixture-only\nFUSHI_OAUTH_CLIENT_ID=primary\n' + config.ENV_KEY + '=' + json.dumps([other])
        after = config.merge_client(before)
        self.assertTrue(after.startswith('FUSHI_SECRET_KEY=fixture-only\nFUSHI_OAUTH_CLIENT_ID=primary\n'))
        extra = json.loads(after.split(config.ENV_KEY + '=')[1])
        self.assertEqual(extra[0], other)
        self.assertEqual(extra[1], {'client_id': config.CLIENT_ID, 'redirect_uris': [config.REDIRECT]})
        self.assertEqual(config.merge_client(after), after)

    def test_refuses_existing_wider_registration(self):
        before = config.ENV_KEY + '=' + json.dumps([{'client_id': config.CLIENT_ID, 'redirect_uris': ['https://other.test/callback']}])
        with self.assertRaisesRegex(RuntimeError, 'differs'):
            config.merge_client(before)

    def test_rejects_duplicate_environment_and_invalid_json(self):
        with self.assertRaises(RuntimeError):
            config.merge_client(config.ENV_KEY + '=[]\n' + config.ENV_KEY + '=[]\n')
        with self.assertRaises(ValueError):
            config.merge_client(config.ENV_KEY + "='[]'\n")

    def test_header_derivation_keeps_all_other_protections(self):
        original = (Path(__file__).resolve().parents[1] / 'deploy/security-headers.inc').read_text()
        expected = original.replace('Referrer-Policy strict-origin-when-cross-origin', 'Referrer-Policy no-referrer')
        self.assertEqual(config.callback_headers(original), expected)
        with self.assertRaises(RuntimeError):
            config.callback_headers('add_header Content-Security-Policy "default-src none";')

    def test_exact_callback_only_and_proxy_header_inheritance(self):
        proxy = config.callback_location('/headers.inc')
        self.assertIn('location = /fushi/astrbot/callback', proxy)
        self.assertIn('proxy_hide_header Content-Security-Policy;', proxy)
        self.assertIn('proxy_hide_header Referrer-Policy;', proxy)
        self.assertIn('proxy_cache off;', proxy)
        self.assertIn('access_log off;', proxy)
        self.assertIn('error_log /dev/null crit;', proxy)
        self.assertIn('try_files /dist/frontend/index.html =404;', config.callback_location('/headers.inc', '/dist/frontend/index.html'))

    def configured(self, root):
        old = root / 'site.conf'
        old.write_text('original\n')
        old.chmod(0o640)
        new = root / 'callback.conf'
        folder = root / 'backup'
        with patch.object(config, 'plans', return_value=[(old, 'updated\n'), (new, 'callback\n')]):
            state = config.prepare(folder, 'overseas')
        return old, new, folder, state

    def test_cdn_origin_reloads_only_the_domestic_public_proxy(self):
        with patch.object(config.subprocess, 'run') as run:
            run.return_value.returncode = 0
            config.validate_and_reload('domestic-cdn-origin')
            self.assertEqual([call.args[0] for call in run.call_args_list], [
                ['docker', 'exec', '1Panel-openresty-h9Tv', config.OPENRESTY, '-t'],
                ['docker', 'exec', '1Panel-openresty-h9Tv', config.OPENRESTY, '-s', 'reload']])

    def test_activation_and_exact_rollback(self):
        with tempfile.TemporaryDirectory() as temporary, patch.object(config.os, 'fchown'), patch.object(config, 'validate_and_reload'):
            old, new, folder, state = self.configured(Path(temporary))
            # Tests run without privileged ownership changes; real CLI requires root.
            for item in state['files']:
                if item['before'] is None:
                    item.update(uid=os.getuid(), gid=os.getgid())
            config.change(folder, state)
            self.assertEqual(state['status'], 'active')
            self.assertEqual(old.read_text(), 'updated\n')
            self.assertEqual(new.read_text(), 'callback\n')
            self.assertEqual((folder / 'old-0').stat().st_mode & 0o777, 0o600)
            config.change(folder, state, rollback=True)
            self.assertEqual(old.read_text(), 'original\n')
            self.assertEqual(old.stat().st_mode & 0o777, 0o640)
            self.assertFalse(new.exists())

    def test_refuses_rollback_over_newer_configuration(self):
        with tempfile.TemporaryDirectory() as temporary, patch.object(config.os, 'fchown'), patch.object(config, 'validate_and_reload'):
            old, new, folder, state = self.configured(Path(temporary))
            config.change(folder, state)
            old.write_text('newer operator edit\n')
            with self.assertRaisesRegex(RuntimeError, 'refusing overwrite'):
                config.change(folder, state, rollback=True)
            self.assertEqual(old.read_text(), 'newer operator edit\n')

    def test_refuses_symlink_target_before_writes(self):
        with tempfile.TemporaryDirectory() as temporary, patch.object(config.os, 'fchown'):
            old, new, folder, state = self.configured(Path(temporary))
            new.symlink_to(old)
            with self.assertRaisesRegex(RuntimeError, 'symlink'):
                config.change(folder, state)
            self.assertEqual(old.read_text(), 'original\n')


if __name__ == '__main__':
    unittest.main()
