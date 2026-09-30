# User nickname migration 039

Apply this schema release separately before publishing the nickname application code. Keep the code-only release guard enabled.

1. Check the production revision, available memory, free disk space and database path using the existing application environment without printing credentials.
2. Take an online SQLite backup with the installed `better-sqlite3` backup API under `/var/backups/tsukuyomi-space/`, readable only by root. Verify the backup with `PRAGMA quick_check`.
3. In an immediate transaction, apply `039_add_user_nickname.js` and insert `039 / add_user_nickname` into `schema_migrations`. Verify the row count and a digest of user IDs, usernames and password hashes are unchanged, and no existing user has an empty nickname. The initial nickname equals the existing username; there is no uniqueness constraint on nickname.
4. Advance the production checkout to the schema-only commit containing migration 039, its compatible default-admin initialization, and this document. The previous application keeps running and is compatible with the additional column; no restart or dependency install is needed.
5. Publish the following application commit through the normal prebuilt release workflow and verify both sites, nickname payloads and memory limits. Do not change Live2D, music or other server media.

SQLite rolls back the column, backfill and migration record together if the transaction fails. If the later application deployment fails, restore its code through the ordinary release rollback and leave the unused additive nickname column in place. Never automatically restore an older database over user activity. A database restore is only for an actual database failure, after stopping writes and preserving the current database/WAL separately.
