import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch


PROJECT = Path(__file__).resolve().parents[1]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, PROJECT / 'deploy' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


release = load('safe_release', 'safe-release.py')
retention = load('prune_releases', 'prune-release-backups.py')


class DeploymentSafetyTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / 'app'
        self.root.mkdir()
        self.front = self.root / 'dist/frontend'
        self.artifact = self.base / 'artifact'
        self.write(self.front / 'index.html', '<script src="/assets/main-old12345.js"></script>')
        self.write(self.front / 'assets/main-old12345.js', 'old script')
        self.write(self.artifact / 'index.html', '<script src="/assets/main-new12345.js"></script>')
        self.write(self.artifact / 'assets/main-new12345.js', 'new script')
        self.write(self.root / 'backend/server.js', 'old code')
        self.write(self.root / 'backend/hotfix.js', 'old hotfix')
        self.write(self.root / 'package.json', json.dumps({'scripts': {'build:web': 'vite build'}, 'dependencies': {}}))
        for name in ('assets/music/song.flac', 'assets/audio/speech.wav', 'models/character.moc3', 'lib/core.js'):
            self.write(self.root / name, 'original resource\n')
        self.write(self.root / '.gitignore', 'dist/\n')
        self.git('init', '-q')
        self.git('config', 'user.email', 'test@example.invalid')
        self.git('config', 'user.name', 'Deployment Test')
        self.git('add', '.')
        self.git('commit', '-qm', 'original')
        self.before = self.git('rev-parse', 'HEAD').decode().strip()

    def write(self, path, content):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)

    def git(self, *args):
        return release.git(self.root, *args)

    def candidate(self):
        self.write(self.root / 'backend/server.js', 'new code')
        self.write(self.root / 'backend/hotfix.js', 'preserved server fix')
        self.git('commit', '-qam', 'candidate')
        target = self.git('rev-parse', 'HEAD').decode().strip()
        self.git('branch', 'codex-deploy', target)
        bundle = self.base / 'candidate.bundle'
        self.git('bundle', 'create', str(bundle), 'refs/heads/codex-deploy')
        self.git('checkout', '--detach', self.before)
        self.write(self.root / 'backend/hotfix.js', 'preserved server fix')
        # Server resources can have local line-ending differences. Keep them.
        (self.root / 'lib/core.js').write_bytes(b'original resource\r\n')
        return target, bundle

    def prepare(self, environment_release=False):
        target, bundle = self.candidate()
        args = argparse.Namespace(state=str(self.base / 'backups/1-1-domestic'), site='domestic',
                                  root=str(self.root), frontend=str(self.front), artifact=str(self.artifact),
                                  bundle=str(bundle), commit=target, extra_resource=[],
                                  base_url='https://example.invalid', resolve='', environment_release=environment_release)
        return release.prepare(args)

    def mock_fetch(self, state, path):
        if path == '/api/health':
            return b'{"status":"ok"}'
        if path.startswith('/?'):
            return (Path(state['frontend_real']) / 'index.html').read_bytes()
        return (Path(state['frontend_real']) / path.lstrip('/')).read_bytes()

    def test_release_and_rollback_preserve_resources_hotfix_and_old_assets(self):
        state = self.prepare()
        original = release.resource_manifest(self.root, 'domestic')
        old_asset = self.front / 'assets/main-old12345.js'
        old_mtime = old_asset.stat().st_mtime_ns
        with patch.object(release.subprocess, 'check_call'), patch.object(release, 'fetch', side_effect=self.mock_fetch):
            release.activate(state)
            self.assertEqual((self.root / 'backend/server.js').read_text(), 'new code')
            self.assertEqual(self.git('rev-parse', 'HEAD').decode().strip(), state['target'])
            release.rollback(state)
        self.assertEqual((self.root / 'backend/server.js').read_text(), 'old code')
        self.assertEqual((self.root / 'backend/hotfix.js').read_text(), 'preserved server fix')
        self.assertEqual(self.git('rev-parse', 'HEAD').decode().strip(), self.before)
        self.assertEqual(original, release.resource_manifest(self.root, 'domestic'))
        self.assertEqual(old_mtime, old_asset.stat().st_mtime_ns)
        self.assertTrue((self.front / 'assets/main-new12345.js').is_file())

    def test_changed_and_deleted_protected_files_are_rejected(self):
        for name in ('assets/music/song.flac', 'assets/audio/speech.wav', 'models/character.moc3', 'lib/core.js'):
            with self.subTest(name=name):
                self.git('checkout', '--detach', self.before)
                (self.root / name).unlink()
                self.git('commit', '-qam', 'remove resource')
                with self.assertRaisesRegex(RuntimeError, 'protected/unmanaged'):
                    release.check_git(self.root, self.before, 'HEAD')
        self.git('checkout', '--detach', self.before)
        self.write(self.root / 'backend/db/migrations/999_change.js', 'migration')
        self.git('add', '.')
        self.git('commit', '-qm', 'schema')
        with self.assertRaisesRegex(RuntimeError, 'migration release'):
            release.check_git(self.root, self.before, 'HEAD')

    def test_conflicting_server_edit_is_not_discarded(self):
        state = self.prepare()
        self.write(self.root / 'backend/hotfix.js', 'new operator edit')
        with self.assertRaisesRegex(RuntimeError, 'Server edit changed'):
            release.activate(state)
        self.assertEqual((self.root / 'backend/hotfix.js').read_text(), 'new operator edit')
        self.assertEqual(self.git('rev-parse', 'HEAD').decode().strip(), self.before)

    def test_dependency_updates_require_an_environment_rollback_plan(self):
        self.write(self.root / 'package-lock.json', '{"lockfileVersion":3}')
        self.git('add', '.')
        self.git('commit', '-qm', 'dependency update')
        with self.assertRaisesRegex(RuntimeError, 'separate environment release'):
            release.check_git(self.root, self.before, 'HEAD')

    def test_build_script_edit_reuses_dependencies_in_code_release(self):
        self.write(self.root / 'package.json', json.dumps({'scripts': {'build:web': 'vite build --mode overseas'}, 'dependencies': {}}))
        with patch.object(release, 'prepare_dependencies') as install:
            state = self.prepare()
        install.assert_not_called()
        self.assertEqual(state['status'], 'prepared')
        self.assertNotIn('dependencies', state)

    def test_build_script_edit_also_skips_install_in_environment_release(self):
        self.write(self.root / 'package.json', json.dumps({'scripts': {'build:web': 'vite build --mode overseas'}, 'dependencies': {}}))
        with patch.object(release, 'prepare_dependencies') as install:
            state = self.prepare(environment_release=True)
        install.assert_not_called()
        self.assertEqual(state['status'], 'prepared')

    def test_dependency_or_install_hook_change_cannot_use_code_only_release(self):
        for package in ({'dependencies': {'example': '1.0.0'}},
                        {'scripts': {'postinstall': 'node install.js'}},
                        {'workspaces': ['packages/*']}):
            with self.subTest(package=package):
                self.git('checkout', '--detach', self.before)
                self.write(self.root / 'package.json', json.dumps(package))
                self.git('commit', '-qam', 'install inputs')
                with self.assertRaisesRegex(RuntimeError, 'separate environment release'):
                    release.check_git(self.root, self.before, 'HEAD')

    def test_locked_dependency_change_is_staged_only_in_explicit_environment_release(self):
        self.write(self.root / 'package-lock.json', '{"lockfileVersion":3}')
        self.git('add', 'package-lock.json')
        with patch.object(release, 'prepare_dependencies') as install:
            state = self.prepare(environment_release=True)
        install.assert_called_once_with(state)

    def test_environment_release_restores_the_original_dependency_tree(self):
        original_resources = release.resource_manifest(self.root, 'domestic')
        self.write(self.root / 'node_modules/native/build.node', 'old native dependency')
        old_mtime = (self.root / 'node_modules/native/build.node').stat().st_mtime_ns
        stage = self.root / '.release-dependencies/fixture'
        self.write(stage / 'node_modules/native/build.node', 'new native dependency')
        self.write(self.root / 'package-lock.json', 'new locked dependencies')
        state = {'root': str(self.root), 'dependencies': {'stage': str(stage),
                 'previous': str(stage / 'previous-node_modules'), 'lock_hash': release.sha(self.root / 'package-lock.json')}}
        release.activate_dependencies(state)
        self.assertEqual((self.root / 'node_modules/native/build.node').read_text(), 'new native dependency')
        release.rollback_dependencies(state)
        self.assertEqual((self.root / 'node_modules/native/build.node').read_text(), 'old native dependency')
        self.assertEqual((self.root / 'node_modules/native/build.node').stat().st_mtime_ns, old_mtime)
        self.assertEqual(release.resource_manifest(self.root, 'domestic'), original_resources)

    def test_dependency_rollback_recovers_an_interruption_between_renames(self):
        stage = self.root / '.release-dependencies/fixture'
        self.write(stage / 'previous-node_modules/native/build.node', 'old dependency')
        self.write(stage / 'node_modules/native/build.node', 'new dependency')
        state = {'root': str(self.root), 'dependencies': {'stage': str(stage), 'previous': str(stage / 'previous-node_modules')}}
        release.rollback_dependencies(state)
        self.assertEqual((self.root / 'node_modules/native/build.node').read_text(), 'old dependency')
        self.assertEqual((stage / 'node_modules/native/build.node').read_text(), 'new dependency')

    def test_code_checkout_cannot_follow_a_server_symlink(self):
        target, _ = self.candidate()
        moved = self.base / 'operator-code'
        (self.root / 'backend').rename(moved)
        (self.root / 'backend').symlink_to(moved, target_is_directory=True)
        with self.assertRaisesRegex(RuntimeError, 'existing symlink'):
            release.check_git(self.root, self.before, target)
        self.assertEqual((moved / 'server.js').read_text(), 'old code')

    def test_asset_collisions_media_and_symlinks_are_rejected(self):
        self.write(self.front / 'assets/main-new12345.js', 'different existing bytes')
        with self.assertRaisesRegex(RuntimeError, 'different content'):
            release.frontend_files(self.artifact, self.front)
        (self.front / 'assets/main-new12345.js').unlink()
        self.write(self.artifact / 'assets/music/song.flac', 'must not upload')
        with self.assertRaisesRegex(RuntimeError, 'Unexpected artifact directory'):
            release.frontend_files(self.artifact, self.front)
        shutil.rmtree(self.artifact / 'assets/music')
        (self.front / 'assets/main-new12345.js').symlink_to(self.root / 'lib/core.js')
        with self.assertRaisesRegex(RuntimeError, 'symlink'):
            release.frontend_files(self.artifact, self.front)

    def test_overseas_symlink_and_game_resources_survive_failed_release(self):
        link = self.base / 'frontend'
        link.symlink_to(self.front, target_is_directory=True)
        self.write(self.front / 'game-assets/runtime.html.gz', 'existing game')
        args = argparse.Namespace(state=str(self.base / 'backups/1-1-overseas'), site='overseas',
                                  root=str(link), frontend=str(link), artifact=str(self.artifact),
                                  bundle=None, commit=None, extra_resource=[],
                                  base_url='https://example.invalid', resolve='')
        state = release.prepare(args)
        before = release.resource_manifest(link, 'overseas')
        with patch.object(release, 'verify', side_effect=RuntimeError('HTTP failed')):
            with self.assertRaisesRegex(RuntimeError, 'HTTP failed'):
                release.activate(state)
        with patch.object(release, 'fetch', side_effect=self.mock_fetch):
            release.rollback(state)
        self.assertTrue(link.is_symlink())
        self.assertEqual(link.resolve(), self.front.resolve())
        self.assertEqual(before, release.resource_manifest(link, 'overseas'))
        self.assertEqual(release.sha(link / 'index.html'), state['index_before'])

    def test_resource_content_and_permissions_are_verified(self):
        state = self.prepare()
        path = self.root / 'models/character.moc3'
        path.chmod(0o600)
        with self.assertRaisesRegex(RuntimeError, 'Protected resources changed'):
            release.verify_resources(state)

    def test_stale_http_entry_fails_verification(self):
        state = self.prepare()
        state['status'] = 'active'
        shutil.copy2(self.artifact / 'index.html', self.front / 'index.html')
        with patch.object(release, 'fetch', side_effect=[b'{"status":"ok"}', b'stale frontend']):
            with self.assertRaisesRegex(RuntimeError, 'stale or incorrect'):
                release.verify(state, attempts=1)

    def test_static_icons_outside_build_root_do_not_break_release_or_rollback(self):
        icon = '<link rel="icon" href="/assets/icons/icon-32.png">'
        self.write(self.root / 'assets/icons/icon-32.png', 'existing static icon')
        for directory in (self.front, self.artifact):
            index = directory / 'index.html'
            index.write_text(icon + index.read_text())
        self.write(self.artifact / 'assets/theme-new12345.css', 'new style')
        index = self.artifact / 'index.html'
        index.write_text(index.read_text() + '<link rel="stylesheet" href="/assets/theme-new12345.css">')
        state = self.prepare()
        original = release.resource_manifest(self.root, 'domestic')
        with patch.object(release.subprocess, 'check_call'), patch.object(release, 'fetch', side_effect=self.mock_fetch) as fetch:
            release.activate(state)
            self.assertIn('/assets/theme-new12345.css', [call.args[1] for call in fetch.call_args_list])
            release.rollback(state)
            self.assertNotIn('/assets/icons/icon-32.png', [call.args[1] for call in fetch.call_args_list])
        self.assertEqual(original, release.resource_manifest(self.root, 'domestic'))

    def test_incorrect_http_build_asset_still_fails_verification(self):
        state = self.prepare()
        with patch.object(release.subprocess, 'check_call'), patch.object(release, 'fetch', side_effect=self.mock_fetch):
            release.activate(state)
        def wrong_asset(state, path):
            return b'wrong script' if path.endswith('.js') else self.mock_fetch(state, path)
        with patch.object(release, 'fetch', side_effect=wrong_asset):
            with self.assertRaisesRegex(RuntimeError, 'HTTP asset mismatch'):
                release.verify(state, attempts=1)

    def test_newer_release_is_not_overwritten_by_rollback(self):
        state = self.prepare()
        state['status'] = 'active'
        self.git('add', 'backend/hotfix.js')
        self.git('commit', '-qm', 'operator commit')
        with self.assertRaisesRegex(RuntimeError, 'newer server commit'):
            release.rollback(state)

    def test_manually_updated_frontend_is_not_overwritten_by_rollback(self):
        state = self.prepare()
        state['status'] = 'active'
        self.write(self.front / 'index.html', 'newer operator frontend')
        with self.assertRaisesRegex(RuntimeError, 'newer or manually edited frontend'):
            release.rollback(state)
        self.assertEqual((self.front / 'index.html').read_text(), 'newer operator frontend')

    def test_retention_is_per_site_and_preserves_pending_states_and_other_files(self):
        root = self.base / 'backups'
        for site in ('domestic', 'overseas'):
            for n in range(4):
                path = root / 'frontend' / f'{site}-{n}.html'
                self.write(path, 'backup')
                os.utime(path, (n + 1, n + 1))
                state_path = root / 'releases' / f'{n}-1-{site}'
                self.write(state_path / 'state.json', json.dumps({'format': 'tsukuyomi-release-v1', 'state_dir': str(state_path), 'site': site, 'status': 'active'}))
                os.utime(state_path, (n + 1, n + 1))
        pending = root / 'releases/99-1-domestic/state.json'
        self.write(pending, json.dumps({'site': 'domestic', 'status': 'prepared'}))
        self.write(root / 'frontend/operator-notes.html', 'keep')
        removed = retention.prune(root, 2)
        self.assertEqual(len(removed), 8)
        self.assertTrue(pending.exists())
        self.assertTrue((root / 'frontend/operator-notes.html').exists())
        self.assertEqual(len(list((root / 'frontend').glob('domestic-*.html'))), 2)
        with self.assertRaises(ValueError):
            retention.prune(root, 0)


if __name__ == '__main__':
    unittest.main()
