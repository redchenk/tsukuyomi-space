# Room Long-Term Memory

Room memory is now stored server-side for signed-in users and indexed with Milvus when the vector backend is enabled. The SQLite table remains the editable source of truth, while Milvus provides fast vector search and persona-corpus retrieval.

## User Isolation

- Every signed-in user's memories are stored with `user_id = req.user.id`.
- Milvus collection `tsukuyomi_room_memories` uses `user_id` as a partition key when the running Milvus version supports it.
- All Milvus searches and deletes also include `scope == "user"` and `user_id == "<current user>"` filters.
- Persona corpus memories use `scope == "persona"` and the reserved user id `__yachiyo_persona__`, so they are never mixed into another user's private memory records.

Guests still fall back to the browser-local Room memory behavior.

## Vector Store

Enable Milvus with:

```bash
ROOM_MEMORY_VECTOR_BACKEND=milvus
MILVUS_ADDRESS=127.0.0.1:19530
ROOM_MEMORY_MILVUS_COLLECTION=tsukuyomi_room_memories
ROOM_MEMORY_VECTOR_DIM=96
```

If Milvus is not enabled or temporarily unavailable, Room keeps working through the SQLite vector fallback. User memory writes still persist in SQLite.

Optional embedding API:

```bash
ROOM_MEMORY_EMBEDDING_API_URL=https://api.openai.com/v1/embeddings
ROOM_MEMORY_EMBEDDING_API_KEY=...
ROOM_MEMORY_EMBEDDING_MODEL=text-embedding-3-small
```

Without an embedding API, the server uses the deterministic local embedding fallback so memory remains private and does not require a third-party request.

## Persona Corpus Import

The Yachiyo persona corpus can be imported into Milvus with:

```bash
npm run import:yachiyo -- --file "E:\visualstudio\yachiyo_novel_detailed_corpus.txt" --clear
```

For Docker deployments, copy the corpus into the container data volume and run:

```bash
docker compose exec tsukuyomi-space node scripts/import-yachiyo-corpus-to-milvus.js --file /data/yachiyo_novel_detailed_corpus.txt --clear
```

The Room chat context fetches the most relevant persona chunks from `/api/room/persona-memory/live/:nonce` and injects them before private user memories.

## Runtime Behavior

- Recording, editing, deleting, and clearing memories update SQLite first, then synchronize the matching Milvus vector row.
- Search tries Milvus first and falls back to SQLite scoring if Milvus returns no usable result.
- Milvus connection errors enter a short retry cooldown (`ROOM_MEMORY_MILVUS_RETRY_COOLDOWN_MS`, default 30s), so Room chat does not wait on every message while Milvus is starting.
- `/api/room/memory/status` includes `vectorStore` status so the settings page or diagnostics can see whether Milvus is enabled, the active collection, vector dimension, and last connection error.
