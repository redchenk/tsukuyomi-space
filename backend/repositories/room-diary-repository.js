const db = require('../db');

const PAGE_SIZE = 100;

function listEntries(userId, cursor = '') {
    const rows = db.prepare(`
        SELECT diary_id, entry_json, deleted_at
        FROM room_diary_entries
        WHERE user_id = ? AND diary_id > ?
        ORDER BY diary_id ASC
        LIMIT ?
    `).all(userId, cursor, PAGE_SIZE + 1);
    const page = rows.slice(0, PAGE_SIZE);
    return {
        entries: page.map((row) => ({
            diaryId: row.diary_id,
            deleted: row.deleted_at != null,
            entry: row.deleted_at == null ? JSON.parse(row.entry_json) : null
        })),
        nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1].diary_id : null
    };
}

function applyChanges(userId, entries, deletedIds) {
    const insertEntry = db.prepare(`
        INSERT OR IGNORE INTO room_diary_entries
            (user_id, diary_id, entry_json, created_at)
        VALUES (?, ?, ?, ?)
    `);
    const deleteEntry = db.prepare(`
        INSERT INTO room_diary_entries
            (user_id, diary_id, entry_json, deleted_at, created_at)
        VALUES (?, ?, NULL, ?, ?)
        ON CONFLICT(user_id, diary_id) DO UPDATE SET
            entry_json = NULL,
            deleted_at = excluded.deleted_at
    `);
    return db.transaction(() => {
        const now = Date.now();
        for (const id of deletedIds) deleteEntry.run(userId, id, now, now);
        let created = 0;
        for (const entry of entries) {
            created += insertEntry.run(userId, entry.diaryId, JSON.stringify(entry), now).changes;
        }
        return { created, deleted: deletedIds.length };
    })();
}

function clearEntries(userId) {
    const now = Date.now();
    return db.prepare(`
        UPDATE room_diary_entries
        SET entry_json = NULL, deleted_at = ?
        WHERE user_id = ? AND deleted_at IS NULL
    `).run(now, userId).changes;
}

function getMetadata(userId) {
    const row = db.prepare('SELECT metadata_json, revision FROM room_diary_metadata WHERE user_id = ?').get(userId);
    return row ? { metadata: JSON.parse(row.metadata_json), revision: row.revision } : { metadata: null, revision: 0 };
}

function putMetadata(userId, metadata, expectedRevision) {
    return db.transaction(() => {
        const current = getMetadata(userId);
        if (current.revision !== expectedRevision) return null;
        const json = JSON.stringify(metadata);
        if (!current.revision) {
            db.prepare(`
                INSERT INTO room_diary_metadata (user_id, metadata_json, revision, updated_at)
                VALUES (?, ?, 1, ?)
            `).run(userId, json, Date.now());
            return 1;
        }
        db.prepare(`
            UPDATE room_diary_metadata
            SET metadata_json = ?, revision = revision + 1, updated_at = ?
            WHERE user_id = ? AND revision = ?
        `).run(json, Date.now(), userId, expectedRevision);
        return expectedRevision + 1;
    })();
}

module.exports = { PAGE_SIZE, listEntries, applyChanges, clearEntries, getMetadata, putMetadata };
