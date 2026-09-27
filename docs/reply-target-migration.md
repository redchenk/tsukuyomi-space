# Directed reply migration 036

Run this schema release separately before deploying the directed reply application code. The code-only release guard remains enabled.

1. Confirm the production revision, database path, free disk space, and available memory. Use the existing application environment to resolve the database path without printing credentials.
2. Take an online SQLite backup using the installed `better-sqlite3` backup API. Keep the backup root-readable only under `/var/backups/tsukuyomi-space/`. Verify its `quick_check` result before proceeding.
3. Apply `036_add_reply_targets.js` and insert `036 / add_reply_targets` into `schema_migrations` in one immediate transaction. Check that message row count is unchanged, both nullable columns exist, and `reply_to_id` references `messages.id` with `ON DELETE SET NULL`.
4. Advance the server checkout to the schema-only commit (migration file and this document only). Verify the live health endpoint. The running previous application remains compatible and does not need a restart for this step.
5. Deploy the following application commit through the normal prebuilt release workflow. Do not build, install dependencies, or change Live2D/music resources on the server.

The migration only adds nullable columns and does not rewrite existing content. On a transaction error SQLite rolls back the schema and migration record together. If the later application release fails, roll back its code normally and leave these unused nullable columns in place; this preserves replies posted after the backup. Do not automatically restore an older database over subsequent user activity. A database restore is reserved for an actual database failure and requires stopping writes and separately preserving the current database/WAL first.
