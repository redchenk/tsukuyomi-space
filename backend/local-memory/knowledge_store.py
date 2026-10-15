"""Bounded public knowledge index. Never shares tables with account memories."""
import json
import re
import sqlite3
import threading
import time
import unicodedata
from pathlib import Path


def terms(text, question=False):
    text = unicodedata.normalize('NFKC', str(text)).lower()
    for old, new in [('月見ヤチヨ', '八千代'), ('ヤチヨ', '八千代'), ('yachiyo', '八千代'),
                     ('彩葉', '彩叶'), ('かぐや', '辉夜'), ('輝夜', '辉夜'), ('kaguya', '辉夜'), ('帝アキラ', '帝明')]:
        text = text.replace(old, new)
    if question:
        # Small bilingual vocabulary for site operations; no extra translation model.
        for pattern, replacement in [
            (r'chat model|llm|聊天模型', ' 聊天 模型 '),
            (r'configure|settings?|設定|设置|配置', ' 设置 配置 '),
            (r'voice|speech|音声|语音', ' 语音 '),
            (r'memor(?:y|ies)|記憶', ' 记忆 '),
            (r'upload|アップロード', ' 上传 '),
            (r'attachments?', ' 附件 '), (r'articles?', ' 文章 '),
            (r'多大(?:了|年纪)?|几岁', ' 年龄 '),
        ]:
            text = re.sub(pattern, replacement, text)
        text = re.sub(r'请问|告诉我|帮我|如何|怎么|为什么|什么|一下|能不能|可不可以|有没有|是什么|在哪里|在哪儿|属于哪个|哪个|哪些|是谁|多少|在哪|的|吗|呢|了', ' ', text)
        text = re.sub(r'\b(?:where|how|do|does|i|my|the|a|an|to|is|are|can|it|in|on)\b|はどこで|しますか|ですか|の', ' ', text)
    result = []
    for word in re.findall(r'[a-z0-9][a-z0-9_-]+|[\u3400-\u9fff\u3040-\u30ff]+', text):
        result.extend([word] if re.match('[a-z0-9]', word) else [word[i:i+2] for i in range(len(word)-1)])
    return list(dict.fromkeys(result))[:(64 if question else 800)]


def resources_available():
    try:
        available = int(re.search(r'^MemAvailable:\s+(\d+)', Path('/proc/meminfo').read_text(), re.M)[1])
        return available >= 1024 * 1024 and float(Path('/proc/loadavg').read_text().split()[0]) < 1.2
    except (OSError, TypeError):
        return True


class KnowledgeStore:
    def __init__(self, path, embed, load_vec):
        self.path, self.embed, self.load_vec = path, embed, load_vec
        self.lock = threading.RLock()
        self.queries = threading.BoundedSemaphore(1)
        self.db = None
        self.last_index = 0

    def connection(self):
        if self.db is None:
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
            self.db = sqlite3.connect(self.path, timeout=0.15, check_same_thread=False)
            self.db.row_factory = sqlite3.Row
            self.db.enable_load_extension(True)
            self.load_vec(self.db)
            self.db.enable_load_extension(False)
            self.db.executescript('''
                PRAGMA journal_mode=WAL;
                PRAGMA cache_size=-2048;
                PRAGMA mmap_size=0;
                CREATE TABLE IF NOT EXISTS documents(
                    id TEXT PRIMARY KEY, revision TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL,
                    kind TEXT NOT NULL, updated_at TEXT NOT NULL, chunk_count INTEGER NOT NULL, ready INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS chunks(
                    id TEXT UNIQUE NOT NULL, document_id TEXT NOT NULL, revision TEXT NOT NULL,
                    position INTEGER NOT NULL, section TEXT NOT NULL, text TEXT NOT NULL,
                    spoiler INTEGER NOT NULL, embedded INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS chunks_document ON chunks(document_id);
                CREATE INDEX IF NOT EXISTS chunks_pending ON chunks(embedded);
                CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(title, body);
                CREATE VIRTUAL TABLE IF NOT EXISTS vectors USING vec0(embedding FLOAT[512] distance_metric=cosine);
            ''')
        return self.db

    def remove(self, db, document_id):
        ids = [r[0] for r in db.execute('SELECT rowid FROM chunks WHERE document_id=?', (document_id,))]
        for rowid in ids:
            db.execute('DELETE FROM chunks_fts WHERE rowid=?', (rowid,))
            db.execute('DELETE FROM vectors WHERE rowid=?', (rowid,))
        db.execute('DELETE FROM chunks WHERE document_id=?', (document_id,))
        db.execute('DELETE FROM documents WHERE id=?', (document_id,))

    def put(self, body):
        doc, chunks = body['document'], body['chunks']
        if (not re.fullmatch(r'(article|wiki|guide):[\w:/.-]{1,160}', doc.get('id', ''))
                or not re.fullmatch(r'[a-f0-9]{64}', doc.get('revision', ''))
                or doc.get('kind') not in ('article', 'wiki', 'guide')
                or not isinstance(chunks, list) or not 1 <= len(chunks) <= 32
                or not isinstance(doc.get('chunkCount'), int) or not 1 <= doc['chunkCount'] <= 2048
                or not re.fullmatch(r'/(?!/)[^\s\\]{0,500}', doc.get('url', ''))):
            raise ValueError('INVALID_DOCUMENT')
        for c in chunks:
            if (not isinstance(c.get('index'), int) or not 0 <= c['index'] < doc['chunkCount']
                    or not isinstance(c.get('text'), str) or not 1 <= len(c['text']) <= 300
                    or len(c.get('section', '')) > 120):
                raise ValueError('INVALID_CHUNK')
        with self.lock:
            db = self.connection()
            with db:
                old = db.execute('SELECT revision FROM documents WHERE id=?', (doc['id'],)).fetchone()
                if old and old['revision'] != doc['revision']:
                    self.remove(db, doc['id'])
                db.execute('INSERT OR IGNORE INTO documents VALUES(?,?,?,?,?,?,?,0)',
                           (doc['id'], doc['revision'], str(doc['title'])[:180], doc['url'], doc['kind'], str(doc.get('updatedAt', ''))[:64], doc['chunkCount']))
                for c in chunks:
                    cid = doc['id'] + ':' + str(c['index'])
                    if db.execute('SELECT 1 FROM chunks WHERE id=?', (cid,)).fetchone():
                        continue
                    cursor = db.execute('INSERT INTO chunks(id,document_id,revision,position,section,text,spoiler) VALUES(?,?,?,?,?,?,?)',
                                        (cid, doc['id'], doc['revision'], c['index'], c.get('section', ''), c['text'], int(c.get('spoiler') is True)))
                    db.execute('INSERT INTO chunks_fts(rowid,title,body) VALUES(?,?,?)',
                               (cursor.lastrowid, ' '.join(terms(doc['title'] + ' ' + c.get('section', ''))), ' '.join(terms(c['text']))))
                count = db.execute('SELECT count(*) FROM chunks WHERE document_id=?', (doc['id'],)).fetchone()[0]
                db.execute('UPDATE documents SET ready=? WHERE id=?', (int(count == doc['chunkCount']), doc['id']))
        return {'saved': len(chunks), 'ready': count == doc['chunkCount']}

    def index_next(self):
        # One short passage at a time; never wait behind personal-memory inference.
        if time.monotonic() - self.last_index < 1 or not resources_available():
            return {'indexed': False, 'reason': 'resource_gate'}
        self.last_index = time.monotonic()
        with self.lock:
            row = self.connection().execute('''SELECT c.rowid,c.*,d.title FROM chunks c JOIN documents d ON d.id=c.document_id
                WHERE c.embedded=0 AND d.ready=1 ORDER BY CASE d.kind WHEN 'guide' THEN 0 WHEN 'wiki' THEN 1 ELSE 2 END,c.rowid LIMIT 1''').fetchone()
        if not row:
            return {'indexed': False, 'pending': False}
        vector = self.embed(row['title'][:60] + ' ' + row['section'][:40] + '\n' + row['text'], False)
        if vector is None:
            return {'indexed': False, 'pending': True, 'reason': 'busy'}
        with self.lock:
            db = self.connection()
            current = db.execute('SELECT revision FROM chunks WHERE rowid=? AND id=?', (row['rowid'], row['id'])).fetchone()
            if current and current['revision'] == row['revision']:
                with db:
                    db.execute('INSERT OR REPLACE INTO vectors(rowid,embedding) VALUES(?,?)', (row['rowid'], json.dumps(vector)))
                    db.execute('UPDATE chunks SET embedded=1 WHERE rowid=?', (row['rowid'],))
        return {'indexed': True, 'pending': True}

    def search(self, body):
        query = body.get('query', '')
        if not isinstance(query, str) or not 1 <= len(query) <= 400:
            raise ValueError('INVALID_QUERY')
        if not self.queries.acquire(blocking=False):
            return {'matches': [], 'mode': 'busy'}
        try:
            tokens = terms(query, True)
            if not tokens:
                return {'matches': [], 'mode': 'empty'}
            allow_spoilers = body.get('allowSpoilers') is True
            scope = body.get('scope', 'all')
            candidates, ranks = {}, {}
            with self.lock:
                db = self.connection()
                found = db.execute('''SELECT c.rowid,c.*,d.title,d.url,d.kind,d.updated_at FROM chunks_fts f
                    JOIN chunks c ON c.rowid=f.rowid JOIN documents d ON d.id=c.document_id
                    WHERE chunks_fts MATCH ? AND d.ready=1 AND (? OR c.spoiler=0) AND (? <> 'guide' OR d.kind <> 'wiki')
                    ORDER BY bm25(chunks_fts,3,1) LIMIT 40''',
                    (' OR '.join('"' + t.replace('"', '""') + '"' for t in tokens), int(allow_spoilers), scope)).fetchall()
                for n, row in enumerate(found):
                    candidates[row['rowid']] = dict(row)
                    ranks[row['rowid']] = 1.2 / (30 + n)
            vector = None
            if body.get('semantic', True) and resources_available():
                # The shared model is Chinese. Use the normalized operation vocabulary
                # for English/Japanese questions only when it supplies Chinese terms.
                translated = re.search(r'[a-zA-Z\u3040-\u30ff]', query) and any(re.search(r'[\u3400-\u9fff]', t) for t in tokens)
                vector = self.embed(' '.join(tokens) if translated else query, True)
            if vector is not None:
                with self.lock:
                    found = db.execute('''SELECT c.rowid,c.*,d.title,d.url,d.kind,d.updated_at,v.distance FROM vectors v
                        JOIN chunks c ON c.rowid=v.rowid JOIN documents d ON d.id=c.document_id
                        WHERE v.embedding MATCH ? AND k=40 AND d.ready=1 AND (? OR c.spoiler=0) AND (? <> 'guide' OR d.kind <> 'wiki')
                        ORDER BY v.distance''', (json.dumps(vector), int(allow_spoilers), scope)).fetchall()
                    for n, row in enumerate(found):
                        item = dict(row)
                        item['similarity'] = 1 - item.pop('distance')
                        candidates[row['rowid']] = item
                        ranks[row['rowid']] = ranks.get(row['rowid'], 0) + 1 / (30 + n)
            selected = []
            for rowid, row in candidates.items():
                text_tokens = set(terms(row['title'] + ' ' + row['section'] + ' ' + row['text']))
                overlap = len(set(tokens) & text_tokens)
                coverage = overlap / len(tokens)
                similarity = row.get('similarity', 0)
                # Rank scores are not calibrated probabilities. Refuse weak matches.
                # Arbitrary article prose needs stronger evidence than curated reference entries.
                min_coverage = .4 if row['kind'] == 'article' else .25
                if not ((overlap >= min(2, len(tokens)) and coverage >= min_coverage) or similarity >= .78):
                    continue
                score = ranks[rowid] + min(.025, coverage * .025)
                selected.append((score, row))
            selected.sort(key=lambda x: (-x[0], x[1]['id']))
            matches, per_document = [], {}
            for _, row in selected:
                if per_document.get(row['document_id'], 0) >= 2:
                    continue
                per_document[row['document_id']] = per_document.get(row['document_id'], 0) + 1
                matches.append({k: row[k] for k in ('id','document_id','revision','title','url','kind','updated_at','section','text','spoiler')})
                if len(matches) >= 12:
                    break
            return {'matches': matches, 'mode': 'hybrid' if vector is not None else 'keyword'}
        finally:
            self.queries.release()

    def handle(self, route, body):
        if route == '/knowledge/search':
            return self.search(body)
        if route == '/knowledge/put':
            return self.put(body)
        if route == '/knowledge/index-next':
            return self.index_next()
        with self.lock:
            db = self.connection()
            if route == '/knowledge/catalog':
                rows = db.execute('SELECT id,revision,ready FROM documents WHERE id>? ORDER BY id LIMIT 200', (str(body.get('after', ''))[:180],)).fetchall()
                return {'documents': [dict(row) for row in rows]}
            if route == '/knowledge/delete':
                ids = body.get('ids', [])
                if not isinstance(ids, list) or len(ids) > 32:
                    raise ValueError('INVALID_IDS')
                with db:
                    for document_id in ids:
                        self.remove(db, document_id)
                return {'deleted': len(ids)}
            if route == '/knowledge/status':
                return {'documents': db.execute('SELECT count(*) FROM documents WHERE ready=1').fetchone()[0],
                        'chunks': db.execute('SELECT count(*) FROM chunks').fetchone()[0],
                        'pending': db.execute('SELECT count(*) FROM chunks WHERE embedded=0').fetchone()[0]}
        raise ValueError('UNKNOWN_ROUTE')
