# Public site knowledge retrieval

Room and the floating site guide retrieve published article text, generated Wiki sections, and curated usage guides before calling the user's existing LLM. Room skips ordinary small talk and provides a saved “参考站内资料” switch under its knowledge settings. Citations are local links shown separately from speech. This release changes the website; it does not release a new Flutter binary.

## Isolation and freshness

`SITE_KNOWLEDGE_ENABLED=true` enables the API, worker and Python service. It defaults to false. The separate `knowledge.db` lives next to the existing account vectors (override with `SITE_KNOWLEDGE_DB`). It shares the existing BGE model process, never account-memory tables. It indexes published articles only, not drafts, private uploads, messages, chats, diaries or moderation records. Media-only articles have a clearly marked metadata pointer; images/video are not OCRed.

The worker compares full content SHA-256 revisions, scans incrementally, and removes disappeared documents. Every search, including cache hits, rechecks the article's publication state and full revision against the primary DB. Deleted, unpublished or edited sources become ineligible immediately; updated content becomes searchable after its next index pass. Partial document uploads remain hidden. Static Wiki/guide changes require `npm run build:knowledge`; CI checks the generated snapshot. Wiki plot sections require explicit spoiler permission. Retrieved content is labeled reference data, never tool instructions or authorization.

## Resource limits

- Existing single-thread ONNX model and existing systemd memory/CPU limits are retained.
- Public inference uses a nonblocking shared lock; private-memory inference has priority. Busy/low-resource searches use keywords or return no sources.
- Background indexing yields to private jobs, requires at least 1 GiB available memory and load below 1.2, and embeds at most one short chunk/second. Sources are paged; chunks are 240 Unicode characters with overlap, not whole articles.
- The public endpoint is POST `/api/knowledge/search`, JSON ≤4 KiB, query ≤400 characters, 30 requests/min/IP. API allows two outstanding requests; Python searches one at a time. Questions are absent from URL/access logs.
- Server timeout: 650 ms. Browser retrieval deadline: 900 ms domestically, 2500 ms for the overseas origin to accommodate its existing cross-region API round trip. Timeout never blocks the LLM call indefinitely; ordinary small talk makes no retrieval request.
- Cache: 128 entries/30 seconds; DB page cache: 2 MiB. At most five source chunks and 2000 source characters within Room's existing total context limit. Site-guide history and sources are bounded.

This is bounded additional work, not a promise of zero latency. Retrieval quality and LLM grounding are separate: a correct retrieved source does not guarantee that every external model follows it.

## Initial offline index and evaluation

Use the same pinned model manifest and Python dependencies as `backend/local-memory/requirements.txt`. Export public article fields only; pass `articleDocument(row)` and `staticDocuments()` from `backend/services/site-knowledge-corpus.js` to create the documents JSON. The prepare script validates model hashes, dimensions, token lengths, DB integrity and checkpoint completion.

```sh
python scripts/prepare-site-knowledge.py --documents documents.json --models models --output knowledge.db
python scripts/evaluate-site-knowledge.py --database knowledge.db --models models --questions questions.json --output results.json
```

Question rows contain `query`, `expected` (document ID, or null for no-answer), and optional `allowSpoilers`. The evaluator reports Recall@5, out-of-domain rejection and local timings. It does not measure remote LLM generation. English/Japanese site operations use a limited keyword vocabulary with the existing Chinese embedding model; arbitrary multilingual semantics are not guaranteed.

## Deployment and rollback

1. Run `npm test`, deployment-safety tests, desktop/mobile Playwright, and both frontend builds. Use the existing safe-release flow to preserve server edits, environment files, media and cohosted services.
2. Deploy code with the feature disabled. After release validation finishes, install the prebuilt DB under `/var/lib/tsukuyomi-space/local-memory` with owner `tsukuyomi:www-data` and mode 0600. Never replace `vectors.db` or the primary site DB. If a public index already exists, stop the two memory services and back it up with its WAL before replacement.
3. Back up the environment file privately; add only `SITE_KNOWLEDGE_ENABLED=true`. Restart `tsukuyomi-memory-vector.service` and `tsukuyomi-memory-worker.service`. Reload only the existing API using `deploy/ecosystem.config.cjs --update-env`. Python services must be restarted explicitly; frontend/API deployment alone does not reload them.
4. Check local socket `/knowledge/status`, publication/source URLs, both public origins, existing health/article routes, memory/CPU/oom counters and unchanged cohosted processes. Compare sampled pre/post latencies under a small bounded retrieval load. Verify worker incremental refresh and no pending initial embeddings.
5. Fast rollback: set the flag false, reload API, restart the memory services. Public DB can remain dormant; account memory is untouched. For code rollback use the saved safe-release state, accounting for the intentionally changed environment file separately.

Tests cover real sqlite-vec persistence, source changes/deletion, spoiler filtering, busy/failure fallback, context limits, source links after reload, and desktop/mobile integration (including saving the retrieval switch independently) with a mocked generation provider. Provider answer quality still depends on the user's chosen model.

## Initial verification, 2026-10-15

The initial snapshot contains 258 published articles, 19 Wiki entries and 18 guides: 295 documents / 1784 chunks, about 10 MiB on disk. Pinned-model offline preparation completed with no pending vectors or token truncation. The 60-case regression set in `tests/fixtures/site-knowledge-questions.json` covers 54 source questions and 6 out-of-domain questions; final Recall@5 and no-answer rejection were both 100%, with about 13 ms local p95 on the development Mac. Vocabulary/thresholds were calibrated using this set, including one correction after the additional ten cases; these are regression results, not an unbiased production accuracy estimate or a server-latency claim.

Twelve browser integration tests cover Chromium desktop, Android viewport and iPhone/WebKit. Generation responses are mocked; retrieval is separately evaluated using the real pinned model and actual public content. Validate the chosen LLM's answer quality with real users after rollout.
