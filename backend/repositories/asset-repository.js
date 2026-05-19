const db = require('../db');

function buildOwnerWhere(ownerId, includePublic = false) {
    return includePublic ? '(owner_id = ? OR owner_id IS NULL)' : 'owner_id = ?';
}

function parseMetadata(row) {
    if (!row) return row;
    try {
        return { ...row, metadata: row.metadata ? JSON.parse(row.metadata) : {} };
    } catch (_) {
        return { ...row, metadata: {} };
    }
}

function normalizeTypeWhere(type, params) {
    if (!type || type === 'all') return '';
    if (type === 'image') return " AND (mime_type LIKE 'image/%' OR asset_type LIKE '%image%')";
    if (type === 'video') return " AND (mime_type LIKE 'video/%' OR asset_type LIKE 'video%')";
    if (type === 'audio') return " AND (mime_type LIKE 'audio/%' OR asset_type LIKE 'audio%')";
    if (type === 'document') return " AND (asset_type LIKE 'document%' OR mime_type IN ('application/pdf', 'text/plain', 'text/markdown'))";
    params.push(`${type}%`);
    return ' AND asset_type LIKE ?';
}

function listAssetsByOwner(ownerId, { limit = 60, offset = 0, type = '', search = '', includePublic = false } = {}) {
    const params = [ownerId];
    let where = buildOwnerWhere(ownerId, includePublic);
    where += normalizeTypeWhere(type, params);
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

function countAssetsByOwner(ownerId, { type = '', search = '', includePublic = false } = {}) {
    const params = [ownerId];
    let where = buildOwnerWhere(ownerId, includePublic);
    where += normalizeTypeWhere(type, params);
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

function findAssetForAdmin(id) {
    return parseMetadata(db.prepare(`
        SELECT id, article_id, owner_id, asset_type, mime_type, url, storage_key, metadata, created_at, updated_at
        FROM article_assets
        WHERE id = ?
    `).get(id));
}

function findAssetByStorageKey(storageKey) {
    return parseMetadata(db.prepare(`
        SELECT id, article_id, owner_id, asset_type, mime_type, url, storage_key, metadata, created_at, updated_at
        FROM article_assets
        WHERE storage_key = ?
        LIMIT 1
    `).get(storageKey));
}

function createAsset({ id, articleId = null, ownerId = null, assetType, mimeType = '', url, storageKey, metadata = {} }) {
    db.prepare(`
        INSERT INTO article_assets (
            id, article_id, owner_id, asset_type, mime_type, url, storage_key, metadata
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            article_id = excluded.article_id,
            owner_id = excluded.owner_id,
            asset_type = excluded.asset_type,
            mime_type = excluded.mime_type,
            url = excluded.url,
            storage_key = excluded.storage_key,
            metadata = excluded.metadata,
            updated_at = CURRENT_TIMESTAMP
    `).run(id, articleId, ownerId, assetType, mimeType, url, storageKey, JSON.stringify(metadata || {}));
    return parseMetadata(db.prepare(`
        SELECT id, article_id, owner_id, asset_type, mime_type, url, storage_key, metadata, created_at, updated_at
        FROM article_assets
        WHERE id = ?
    `).get(id));
}

function deleteAssetForOwner(id, ownerId) {
    return db.prepare('DELETE FROM article_assets WHERE id = ? AND owner_id = ?').run(id, ownerId).changes;
}

function deleteAssetById(id) {
    return db.prepare('DELETE FROM article_assets WHERE id = ?').run(id).changes;
}

module.exports = {
    countAssetsByOwner,
    createAsset,
    deleteAssetById,
    deleteAssetForOwner,
    findAssetForAdmin,
    findAssetByStorageKey,
    findAssetForOwner,
    listAssetsByOwner
};
