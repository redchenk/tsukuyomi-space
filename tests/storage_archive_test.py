"""A local object-store double exercises real tar, gzip, encryption and full restore."""
import hashlib
import importlib.util
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch

location = Path(__file__).resolve().parents[1] / 'deploy/storage-archive/archive.py'
spec = importlib.util.spec_from_file_location('backup_archive', location)
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)


class ArchiveTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        base = Path(temporary.name)
        self.root = base/'backups'
        self.stage = base/'stage'
        self.keys = base/'keys'
        self.objects = base/'objects'
        for folder in (self.root,self.stage,self.keys,self.objects):
            folder.mkdir()
        for k,v in [('ROOT',self.root),('KEYS',self.keys),('STAGE',self.stage)]:
            self.enter(patch.object(archive,k,v))
        self.site = self.root/'release'/'before.sqlite'
        self.site.parent.mkdir()
        self.site.write_bytes(os.urandom(65536))
        self.expected = hashlib.sha256(self.site.read_bytes()).hexdigest()

    def enter(self, operation):
        operation.start()
        self.addCleanup(operation.stop)

    def storage(self, action, obj, *files):
        remote = str(self.objects/(obj+'.cms'))
        return ['cp', files[0], remote] if action=='put' else ['cat',remote]

    def test_retention_and_wal(self):
        now = time.time()
        old = now-2*archive.WEEK
        folder = self.root/'deploy'
        folder.mkdir()
        paths = []
        for i in range(8):
            parent = folder if i<4 else self.root
            p = parent/(str(i)+'.db')
            with p.open('wb') as f:
                f.truncate(archive.MIB)
            os.utime(p,(old+i,old+i))
            paths.append(p)
        Path(str(paths[0])+'-wal').write_bytes(b'pending')
        (self.root/'link.db').symlink_to(paths[1])
        self.assertEqual(archive.candidates(self.root,now),[paths[1],paths[4]])
        os.utime(paths[1],(now,now))
        self.assertNotIn(paths[1],archive.candidates(self.root,now))

    def test_explicit_snapshot_only_accepts_old_site_database(self):
        target = self.root.parent/'historical.db'
        db = sqlite3.connect(str(target))
        try:
            db.execute('CREATE TABLE records (data BLOB)')
            db.execute('INSERT INTO records VALUES(zeroblob(?))', (archive.MIB,))
            db.commit()
            old = time.time()-2*archive.WEEK
            os.utime(target,(old,old))
            with self.assertRaises(ValueError):
                archive.explicit_snapshot(target)
            for table in ['users','articles','schema_migrations','room_chat_messages']:
                db.execute('CREATE TABLE '+table+' (id INTEGER)')
            db.commit()
        finally:
            db.close()
        with self.assertRaises(ValueError):
            archive.explicit_snapshot(target)
        os.utime(target,(old,old))
        self.assertEqual(archive.explicit_snapshot(target),target.resolve())

    @unittest.skipUnless(shutil.which('openssl'), 'OpenSSL CMS required')
    def test_verify_offload_restore_and_corruption(self):
        self.enter(patch.object(archive,'transport', self.storage))
        self.enter(patch.object(archive.pwd,'getpwnam',return_value=type('User',(),{'pw_uid':os.getuid()})()))
        subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-subj','/CN=test',
                        '-keyout',self.keys/'recovery.key','-out',self.keys/'recipient.pem'],
                       stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
        archive.archive(self.site, False)
        receipt = archive.receipt_path(self.site)
        self.assertTrue(receipt.is_file())
        self.assertTrue(self.site.exists())
        data = next(self.objects.glob('*.cms'))
        encrypted = data.read_bytes()
        data.chmod(0o600)
        data.write_bytes(encrypted[:-40])
        with self.assertRaises((RuntimeError, ValueError)):
            archive.archive(self.site, True)
        self.assertTrue(self.site.exists())
        data.write_bytes(encrypted)
        archive.archive(self.site, True)
        self.assertFalse(self.site.exists())
        out = self.root/'restored.db'
        archive.restore(receipt,out)
        self.assertEqual(hashlib.sha256(out.read_bytes()).hexdigest(),self.expected)
        with self.assertRaises(FileExistsError):
            archive.restore(receipt,out)
