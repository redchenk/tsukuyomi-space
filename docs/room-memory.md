# Room Long-Term Memory

Room memory is an optional add-on for Yachiyo's agent flow. It must not block chat, TTS, Live2D, weather, or MCP when unavailable.

## Current Design

- Logged-in users use server-side private memory through `/api/room/memory`.
- Guests use browser-local IndexedDB memory only.
- Each server memory row is scoped by `user_id`; users cannot read or delete another user's memory.
- SQLite stores summary, original content, importance, metadata, and a lightweight embedding vector.
- Search uses cosine similarity over hashed token vectors. This is intentionally dependency-light for the first version and can later be replaced by pgvector, Qdrant, LanceDB, or sqlite-vec behind the same service boundary.

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

- Add memory types: `profile`, `preference`, `event`, `task`, `conversation`.
- Add LLM-based memory extraction so not every conversation is stored as raw conversation memory.
- Add a memory management UI for reviewing, editing, pinning, exporting, and deleting individual memories.
- Add a provider interface for real vector stores.
