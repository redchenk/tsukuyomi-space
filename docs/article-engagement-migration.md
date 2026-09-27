# Article engagement schema 037

Apply this additive schema release before the application release, keeping the code-only deployment guard enabled. Back up the production SQLite database with the installed backup API, verify `quick_check`, then apply migration 037 and its schema_migrations receipt in a single immediate transaction. Advance the server checkout only to the schema-only commit. No build, dependency installation or media changes are required.

The old application remains compatible with the new empty tables. Historical experience is deliberately backfilled by the new application's first startup, after the old process stops, rather than when this schema is installed. The backfill and completion receipt share one transaction; a retry cannot pay twice. It uses existing article view counts and saved likes/bookmarks, preserves all existing growth experience, and creates missing growth profiles. Previously removed interactions cannot be reconstructed; historical views cannot retrospectively be deduplicated. No historical counts are fabricated or erased.

If the application rollout fails, roll its code back and retain the additive tables and awarded XP. Do not restore an older database over newer user activity. Preserve the database and WAL before any separately planned disaster recovery.
