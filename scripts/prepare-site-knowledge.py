"""Prepare an initial public index off-server with the production model's pinned weights.

Input is the JSON document/chunk export from site-knowledge-corpus.js, never account data.
The running worker reconciles revisions and incrementally updates this index after install.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import time

os.environ.update(OMP_NUM_THREADS='1', OPENBLAS_NUM_THREADS='1', MKL_NUM_THREADS='1')
import numpy as np
import onnxruntime as ort
import sqlite_vec
from tokenizers import Tokenizer

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('site_knowledge_store', root / 'backend/local-memory/knowledge_store.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def model_embed(directory):
    manifest = json.loads((root / 'backend/local-memory/models.manifest.json').read_text())
    for name, item in manifest.items():
        if hashlib.sha256((directory / name).read_bytes()).hexdigest() != item['sha256']:
            raise ValueError('MODEL_HASH_MISMATCH: ' + name)
    options = ort.SessionOptions()
    options.intra_op_num_threads = options.inter_op_num_threads = 1
    options.enable_cpu_mem_arena = False
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    session = ort.InferenceSession(str(directory / 'model_optimized.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
    tokenizer = Tokenizer.from_file(str(directory / 'tokenizer.json'))
    def embed(text, query=False):
        tokens = tokenizer.encode(('为这个句子生成表示以用于检索相关文章：' if query else '') + text)
        if len(tokens.ids) > 512:
            raise ValueError('CHUNK_TOKEN_LIMIT')
        feeds = {'input_ids': np.asarray([tokens.ids], dtype=np.int64), 'attention_mask': np.asarray([tokens.attention_mask], dtype=np.int64),
                 'token_type_ids': np.asarray([tokens.type_ids], dtype=np.int64)}
        v = session.run(None, {i.name: feeds[i.name] for i in session.get_inputs()})[0][0, 0, :].astype(np.float32)
        if v.shape != (512,) or not np.isfinite(v).all() or float(np.linalg.norm(v)) <= 0:
            raise ValueError('INVALID_EMBEDDING')
        return (v / np.linalg.norm(v)).tolist()
    return embed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--documents', required=True, type=Path)
    parser.add_argument('--models', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    store = module.KnowledgeStore(str(args.output), model_embed(args.models), sqlite_vec.load)
    documents = json.loads(args.documents.read_text())
    for doc in documents:
        chunks = doc['chunks']
        metadata = {k: v for k, v in doc.items() if k not in ('chunks', 'sections')}
        metadata['chunkCount'] = len(chunks)
        for offset in range(0, len(chunks), 32):
            store.put({'document': metadata, 'chunks': chunks[offset:offset+32]})
    start = time.monotonic(); count = 0
    while True:
        store.last_index = 0  # Offline preparation only; the live service retains its 1/s gate.
        result = store.index_next()
        if result.get('pending') is False:
            break
        if not result.get('indexed'):
            raise RuntimeError('OFFLINE_INDEX_PAUSED')
        count += 1
        if count % 200 == 0:
            print(json.dumps({'indexed': count, 'elapsed_seconds': round(time.monotonic()-start, 1)}), flush=True)
    status = store.handle('/knowledge/status', {})
    assert status['pending'] == 0 and status['documents'] == len(documents)
    store.db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    assert store.db.execute('PRAGMA quick_check').fetchone()[0] == 'ok'
    store.db.close()
    print(json.dumps({**status, 'elapsed_seconds': round(time.monotonic()-start, 1), 'sha256': hashlib.sha256(args.output.read_bytes()).hexdigest()}))


if __name__ == '__main__':
    main()
