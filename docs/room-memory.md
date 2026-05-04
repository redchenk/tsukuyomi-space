# Room Long-Term Memory

Room memory is an optional add-on for Yachiyo's agent flow. It must not block chat, TTS, Live2D, weather, or MCP when unavailable.

## Current Design

- Logged-in users use server-side private memory through `/api/room/memory`.
- Guests use browser-local IndexedDB memory only.
- Each server memory row is scoped by `user_id`; users cannot read or delete another user's memory.
- SQLite stores summary, original content, importance, metadata, and a lightweight embedding vector.
- Search uses a hybrid score: similarity, importance, recency, access signal, and memory type match.
- Writes are filtered for long-term value and obvious sensitive content. Similar memories of the same type are merged instead of always appending.
- The room settings page supports listing, searching, editing, deleting, and clearing the current user's server memories.
- Memory content is collapsed in the settings page by default; users explicitly expand an item to view the original content.
- Optional LLM extraction can be enabled with `ROOM_MEMORY_EXTRACTOR=llm` plus the existing `LLM_API_KEY`/`LLM_API_URL`/`LLM_MODEL` settings. Without it, the rule-based extractor remains active.
- The lightweight hashed vector implementation is intentionally dependency-light and can later be replaced by pgvector, Qdrant, LanceDB, or sqlite-vec behind the same service boundary.

## Agent Flow

1. User sends a message in the room.
2. The runtime searches relevant memories for the current user.
3. Retrieved summaries are injected into the system context.
4. LLM replies normally.
5. The conversation is summarized and written back as a memory.
6. If the server memory API fails, the room falls back to local IndexedDB.

## Privacy Rules

- Memory APIs require a normal user token.
- Server memory is per-user only.
- The room settings page can clear the current user's memory.
- MCP/tool calls should not receive memory unless the agent runtime explicitly decides it is needed and the user has enabled that tool.

## Next Steps

- Tune the LLM extraction prompt after observing real room conversations.
- Add a provider interface for real vector stores.
- Add pin/export support and optional TTL/decay jobs.
