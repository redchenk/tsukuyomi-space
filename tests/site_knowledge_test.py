import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import sqlite_vec

spec = importlib.util.spec_from_file_location('knowledge_store', Path(__file__).parents[1] / 'backend/local-memory/knowledge_store.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class KnowledgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = module.KnowledgeStore(str(Path(self.temp.name) / 'knowledge.db'), lambda text, query: [1.0] + [0.0] * 511, sqlite_vec.load)
        self.doc = dict(id='guide:memory', revision='a'*64, title='合并本地与云端记忆', url='/room/settings', kind='guide', updatedAt='2026-10-15', chunkCount=1)

    def tearDown(self):
        if self.store.db:
            self.store.db.close()
        self.temp.cleanup()

    def put(self, text='登录后选择合并本地与云端数据。', spoiler=False, index=0):
        return self.store.handle('/knowledge/put', dict(document=self.doc, chunks=[dict(index=index, section='记忆来源', text=text, spoiler=spoiler)]))

    def test_keyword_search_and_separate_schema(self):
        self.put()
        result = self.store.search(dict(query='怎么合并记忆', semantic=False))
        self.assertEqual(result['mode'], 'keyword')
        self.assertEqual(result['matches'][0]['document_id'], 'guide:memory')
        tables = [r[0] for r in self.store.db.execute("select name from sqlite_master where type='table'")]
        self.assertNotIn('points', tables)
        self.assertNotIn('room_memories', tables)

    def test_real_sqlite_vec_index_and_hybrid_query(self):
        self.put()
        with patch.object(module, 'resources_available', return_value=True):
            self.assertTrue(self.store.index_next()['indexed'])
            result = self.store.search(dict(query='合并记忆'))
        self.assertEqual(result['mode'], 'hybrid')
        self.assertEqual(result['matches'][0]['id'], 'guide:memory:0')
        self.assertEqual(self.store.handle('/knowledge/status', {})['pending'], 0)

    def test_update_delete_and_restart_never_revive_old_content(self):
        self.put('旧的记忆选择说明。')
        self.doc['revision'] = 'b'*64
        self.put('新的记忆合并流程。')
        result = self.store.search(dict(query='记忆合并', semantic=False))
        self.assertTrue(all('旧的' not in r['text'] for r in result['matches']))
        self.store.db.close(); self.store.db = None
        self.assertEqual(self.store.handle('/knowledge/status', {})['documents'], 1)
        self.store.handle('/knowledge/delete', dict(ids=['guide:memory']))
        self.assertEqual(self.store.search(dict(query='记忆合并', semantic=False))['matches'], [])

    def test_incomplete_batches_hidden_and_replayed_batches_idempotent(self):
        self.doc['chunkCount'] = 2
        self.assertFalse(self.put()['ready'])
        self.assertEqual(self.store.search(dict(query='合并记忆', semantic=False))['matches'], [])
        self.assertTrue(self.put(index=1)['ready'])
        self.put(index=1)
        self.assertEqual(self.store.handle('/knowledge/status', {})['chunks'], 2)

    def test_spoiler_scope_and_empty_question(self):
        self.put('八千代的身世真相涉及结局。', spoiler=True)
        self.assertEqual(self.store.search(dict(query='记忆合并', semantic=False))['matches'], [])
        self.assertEqual(len(self.store.search(dict(query='记忆合并', allowSpoilers=True, semantic=False))['matches']), 1)
        self.assertEqual(self.store.search(dict(query='???', semantic=False))['matches'], [])

    def test_gate_busy_and_invalid_documents(self):
        self.put()
        with patch.object(module, 'resources_available', return_value=False):
            self.assertFalse(self.store.index_next()['indexed'])
            self.assertEqual(self.store.search(dict(query='合并记忆'))['mode'], 'keyword')
        self.store.queries.acquire()
        self.assertEqual(self.store.search(dict(query='合并记忆'))['mode'], 'busy')
        self.store.queries.release()
        self.doc['url'] = 'https://evil.test'
        with self.assertRaises(ValueError):
            self.put()

    def test_no_match_does_not_fill_with_recent_documents(self):
        self.put()
        self.assertEqual(self.store.search(dict(query='火星养殖量子龙虾', semantic=False))['matches'], [])


if __name__ == '__main__':
    unittest.main()
