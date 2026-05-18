const db = require('../db');

function parseMetadata(row) {
    if (!row) return row;
    try {
        return { ...row, metadata: row.metadata ? JSON.parse(row.metadata) : {} };
    } catch (_) {
        return { ...row, metadata: {} };
    }
}

function listAssetsByOwner(ownerId, { limit = 60, offset = 0, type = '', search = '' } = {}) {
    const params = [ownerId];
    let where = 'owner_id = ?';
    if (type) {
        if (type === 'image') {
            where += " AND (mime_type LIKE 'image/%' OR asset_type LIKE '%image%')";
        } else {
            where += ' AND asset_type LIKE ?';
            params.push(`${type}%`);
        }
    }
    if (search) {
        where += ' AND (url LIKE ? OR storage_key LIKE ? OR metadata LIKE ?)';
        const keyword = `%${search}%`;
        params.push(keyword, keyword, keyword);
    }
    const rows = db.prepare(`
        SELECT id, article_id, owner_id, asset_type, mime_type, url, storage_key, metadata, created_at, updated_at
        FROM article_assets
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    return rows.map(parseMetadata);
}

function countAssetsByOwner(ownerId, { type = '', search = '' } = {}) {
    const params = [ownerId];
    let where = 'owner_id = ?';
    if (type) {
        if (type === 'image') {
            where += " AND (mime_type LIKE 'image/%' OR asset_type LIKE '%image%')";
        } else {
            where += ' AND asset_type LIKE ?';
            params.push(`${type}%`);
        }
    }
    if (search) {
        where += ' AND (url LIKE ? OR storage_key LIKE ? OR metadata LIKE ?)';
        const keyword = `%${search}%`;
        params.push(keyword, keyword, keyword);
    }
    return db.prepare(`SELECT COUNT(*) AS count FROM article_assets WHERE ${where}`).get(...params).count;
}

function findAssetForOwner(id, ownerId) {
    return parseMetadata(db.prepare(`
        SELECT id, article_id, owner_id, asset_type, mime_type, url, storage_key, metadata, created_at, updated_at
        FROM article_assets
        WHERE id = ? AND owner_id = ?
    `).get(id, ownerId));
}

function deleteAssetForOwner(id, ownerId) {
    return db.prepare('DELETE FROM article_assets WHERE id = ? AND owner_id = ?').run(id, ownerId).changes;
}

module.exports = {
    countAssetsByOwner,
    deleteAssetForOwner,
    findAssetForOwner,
    listAssetsByOwner
};
