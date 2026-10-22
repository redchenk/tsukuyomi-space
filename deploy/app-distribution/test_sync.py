import hashlib
import io
import tarfile
import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('distribution_sync', pathlib.Path(__file__).with_name('sync.py'))
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


def fixture(tag='v0.6.26-beta.1', ohos=False):
    version = '.'.join(sync.TAG.fullmatch(tag).group(1, 2, 3))
    files = {f'tsukuyomi-space-{version}-{suffix}': (tag + suffix).encode() for suffix in sync.SUFFIXES}
    files.update({'INSTALL.md': b'install guide', 'THIRD_PARTY_NOTICES.md': b'notices'})
    sha = lambda data: hashlib.sha256(data).hexdigest()
    files['SHA256SUMS.txt'] = ''.join(f'{sha(data)}  {name}\n' for name, data in files.items()).encode()
    if ohos:
        name = f'tsukuyomi-space-{version}-33-ohos-arm64-unsigned.hap'
        extra = {name: b'unsigned hap', 'OHOS-INSTALL.md': b'signing guide', 'OHOS-THIRD-PARTY-NOTICES.md': b'notices'}
        extra['OHOS-BUILD-INFO.json'] = json.dumps({'release_tag': tag, 'file': name, 'signed': False, 'sha256': sha(extra[name])}).encode()
        extra['OHOS-SHA256SUMS.txt'] = ''.join(f'{sha(data)}  {name}\n' for name, data in extra.items()).encode()
        files.update(extra)
    release = {'tag_name': tag, 'html_url': sync.UPSTREAM + '/releases/tag/' + tag,
               'draft': False, 'prerelease': True, 'published_at': '2026-10-22T12:00:00Z', 'body': 'Notes',
               'assets': [{'name': name, 'id': index + 1, 'url': f'https://api.github.com/repos/{sync.REPO}/releases/assets/{index + 1}', 'state': 'uploaded', 'size': len(data), 'digest': 'sha256:' + sha(data),
                           'browser_download_url': sync.UPSTREAM + '/releases/download/' + tag + '/' + name}
                          for index, (name, data) in enumerate(files.items())]}
    return release, files


class SyncTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.parent = pathlib.Path(self.temp.name)
        self.root = self.parent / 'distribution'
        self.other = self.parent / 'existing-project'
        self.other.mkdir()
        (self.other / 'data.db').write_bytes(b'existing production data')

    def tearDown(self):
        self.assertEqual((self.other / 'data.db').read_bytes(), b'existing production data')
        self.temp.cleanup()

    def install(self, release, files):
        return sync.install(self.root, sync.candidate(release), lambda url: iter([files[release['assets'][int(url.rsplit('/', 1)[1]) - 1]['name']]]))

    def test_publish_atomic_catalog_and_no_repeat_download(self):
        release, files = fixture()
        self.assertEqual(self.install(release, files)['status'], 'published')
        active = sync.active_generation(self.root)
        catalog = json.loads((self.root / 'current/releases.json').read_text())
        self.assertEqual(len(catalog), 1)
        self.assertEqual(len(catalog[0]['assets']), 11)
        self.assertTrue(all(a['browser_download_url'].startswith(sync.ORIGIN + '/releases/') for a in catalog[0]['assets']))
        result = sync.install(self.root, sync.candidate(release), lambda _: self.fail('Downloaded twice'))
        self.assertEqual(result['status'], 'unchanged')
        self.assertEqual(sync.active_generation(self.root), active)

    def test_new_version_removes_only_previous_owned_generation(self):
        first, files = fixture()
        self.install(first, files)
        old = sync.active_generation(self.root)
        second, files = fixture('v0.6.27-beta.1')
        self.install(second, files)
        self.assertFalse(old.exists())
        self.assertEqual(len(list((self.root / 'generations').iterdir())), 1)
        self.assertFalse((self.root / 'current/releases/v0.6.26-beta.1').exists())

    def test_failure_keeps_old_catalog_and_files(self):
        first, files = fixture()
        self.install(first, files)
        before = (self.root / 'current/releases.json').read_bytes()
        second, files = fixture('v0.6.27-beta.1')
        files[next(iter(files))] = b'tampered'
        with self.assertRaises(ValueError):
            self.install(second, files)
        self.assertEqual((self.root / 'current/releases.json').read_bytes(), before)
        self.assertEqual(len(list((self.root / 'generations').iterdir())), 1)

    def test_same_tag_ohos_supplement_reuses_base_and_stays_single_version(self):
        release, files = fixture()
        self.install(release, files)
        old = sync.active_generation(self.root)
        release, files = fixture(ohos=True)
        fetched = []
        def read(url):
            name = release['assets'][int(url.rsplit('/', 1)[1]) - 1]['name']
            fetched.append(name)
            yield files[name]
        sync.install(self.root, sync.candidate(release), read)
        self.assertEqual(len(fetched), 5)
        self.assertFalse(old.exists())
        self.assertEqual(len(json.loads((self.root / 'current/releases.json').read_text())[0]['assets']), 16)

    def test_incomplete_hap_is_not_exposed(self):
        release, _ = fixture(ohos=True)
        release['assets'] = [a for a in release['assets'] if a['name'] != 'OHOS-INSTALL.md']
        self.assertEqual(len(sync.candidate(release)['assets']), 11)

    def test_malformed_or_foreign_releases_are_rejected(self):
        for mutate in [lambda r: r.update(draft=True), lambda r: r.update(tag_name='../other'),
                       lambda r: r.update(published_at='invalid'),
                       lambda r: r['assets'][0].update(url='https://evil.invalid/asset'),
                       lambda r: r['assets'][0].update(browser_download_url='https://evil.invalid/file'),
                       lambda r: r['assets'][0].update(digest=None),
                       lambda r: r['assets'].append(r['assets'][0]),
                       lambda r: r['assets'].pop(0)]:
            release, _ = fixture()
            mutate(release)
            self.assertIsNone(sync.candidate(release))

    def test_corrupt_manifest_cannot_activate_even_with_matching_asset_digest(self):
        release, files = fixture()
        files['SHA256SUMS.txt'] = b'0' * 64 + b'  ../../existing-project/data.db\n'
        entry = next(a for a in release['assets'] if a['name'] == 'SHA256SUMS.txt')
        entry.update(size=len(files['SHA256SUMS.txt']), digest='sha256:' + hashlib.sha256(files['SHA256SUMS.txt']).hexdigest())
        with self.assertRaises(ValueError):
            self.install(release, files)
        self.assertFalse((self.root / 'current').exists())

    def test_insufficient_space_and_downgrade_preserve_current(self):
        release, files = fixture()
        self.install(release, files)
        before = sync.active_generation(self.root)
        newer, data = fixture('v0.6.27-beta.1')
        with patch.object(sync.shutil, 'disk_usage', return_value=type('Disk', (), {'free': 1})()):
            with self.assertRaises(ValueError):
                self.install(newer, data)
        older, data = fixture('v0.6.25-beta.1')
        with self.assertRaises(ValueError):
            self.install(older, data)
        self.assertEqual(sync.active_generation(self.root), before)

    def test_unowned_and_symlinked_paths_are_not_modified(self):
        with self.assertRaises(ValueError):
            sync.initialize(self.other)
        self.root.symlink_to(self.other)
        with self.assertRaises(ValueError):
            sync.initialize(self.root)
        self.root.unlink()
        sync.initialize(self.root)
        unowned = self.root / 'generations/unowned'
        unowned.mkdir()
        (unowned / 'important').write_text('keep')
        with self.assertRaises((ValueError, FileNotFoundError)):
            sync.remove_generation(self.root, unowned)
        self.assertTrue((unowned / 'important').exists())
        with self.assertRaises(ValueError):
            sync.remove_generation(self.root, self.other)

    def archive(self, release, files, extra=None):
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w') as archive:
            metadata = json.dumps(release).encode()
            first = tarfile.TarInfo('release.json'); first.size = len(metadata)
            archive.addfile(first, io.BytesIO(metadata))
            for name in sorted(files):
                member = tarfile.TarInfo(name); member.size = len(files[name])
                archive.addfile(member, io.BytesIO(files[name]))
            if extra:
                member = tarfile.TarInfo(extra); member.size = 3
                archive.addfile(member, io.BytesIO(b'bad'))
        stream.seek(0)
        return stream

    def test_receive_installs_only_current_official_files_and_cleans_staging(self):
        release, files = fixture(ohos=True)
        result = sync.receive(self.root, self.archive(release, files), sync.candidate(release))
        self.assertEqual(result['asset_count'], 16)
        self.assertFalse((self.root / 'incoming').exists())

    def test_receive_rejects_extra_paths_and_tampering_without_switching(self):
        old, old_files = fixture()
        self.install(old, old_files)
        before = sync.active_generation(self.root)
        release, files = fixture('v0.6.27-beta.1')
        with self.assertRaises(ValueError):
            sync.receive(self.root, self.archive(release, files, '../../project'), sync.candidate(release))
        files[next(iter(files))] = b'bad'
        with self.assertRaises(ValueError):
            sync.receive(self.root, self.archive(release, files), sync.candidate(release))
        with self.assertRaises(ValueError):
            sync.receive(self.root, self.archive(old, old_files), sync.candidate(release))
        self.assertEqual(sync.active_generation(self.root), before)
        self.assertFalse((self.root / 'incoming').exists())

    def test_version_order(self):
        values = ['v0.6.27-beta.2', 'v0.6.26', 'v0.6.27-beta.10', 'v0.6.27']
        self.assertEqual(sorted(values, key=sync.version_key), [values[1], values[0], values[2], values[3]])


if __name__ == '__main__':
    unittest.main()
