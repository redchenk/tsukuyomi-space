const db = require('../db');

function buildOwnerFilter(ownerId, { includePublic = false, includeAll = false } = {}) {
    if (includeAll) return { where: '1 = 1', params: [] };
    return {
        where: includePublic ? '(owner_id = ? OR owner_id IS NULL)' : 'owner_id = ?',
        params: [ownerId]
    };
}

function parseMetadata(row) {
    if (!row) return row;
    try {
        return { ...row, metadata: row.metadata ? JSON.parse(row.metadata) : {} };
    } catch (_) {
        return { ...row, metadata: {} };
    }
}

function parseGalleryAsset(row) {
    const asset = parseMetadata(row);
    return asset ? { ...asset, owner_has_avatar: Boolean(asset.owner_has_avatar) } : asset;
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

function listAssetsByOwner(ownerId, { limit = 60, offset = 0, type = '', search = '', includePublic = false, includeAll = false } = {}) {
    const ownerFilter = buildOwnerFilter(ownerId, { includePublic, includeAll });
    const params = [...ownerFilter.params];
    let where = ownerFilter.where;
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

function countAssetsByOwner(ownerId, { type = '', search = '', includePublic = false, includeAll = false } = {}) {
    const ownerFilter = buildOwnerFilter(ownerId, { includePublic, includeAll });
    const params = [...ownerFilter.params];
    let where = ownerFilter.where;
    where += normalizeTypeWhere(type, params);
    if (search) {
        where += ' AND (url LIKE ? OR storage_key LIKE ? OR metadata LIKE ?)';
        const keyword = `%${search}%`;
        params.push(keyword, keyword, keyword);
    }
    return db.prepare(`SELECT COUNT(*) AS count FROM article_assets WHERE ${where}`).get(...params).count;
}

function buildGalleryWhere({ search = '', ownerId = '' } = {}) {
    const params = [];
    let where = `
        (assets.mime_type LIKE 'image/%' OR assets.asset_type LIKE '%image%')
        AND (
            assets.metadata LIKE '%"collection":"gallery"%'
            OR assets.metadata LIKE '%"collection": "gallery"%'
            OR assets.metadata LIKE '%"gallery":true%'
            OR assets.metadata LIKE '%"gallery": true%'
        )
    `;
    if (ownerId) {
        where += ' AND assets.owner_id = ?';
        params.push(ownerId);
    }
    if (search) {
        where += ' AND (assets.url LIKE ? OR assets.storage_key LIKE ? OR assets.metadata LIKE ?)';
        const keyword = `%${search}%`;
        params.push(keyword, keyword, keyword);
    }
    return { where, params };
}

function listGalleryAssets({ limit = 60, offset = 0, search = '', ownerId = '' } = {}) {
    const galleryFilter = buildGalleryWhere({ search, ownerId });
    const rows = db.prepare(`
        SELECT
            assets.id, assets.article_id, assets.owner_id, assets.asset_type, assets.mime_type,
            assets.url, assets.storage_key, assets.metadata, assets.created_at, assets.updated_at,
            owner.username AS owner_username,
            CASE WHEN owner.avatar IS NOT NULL AND owner.avatar <> '' THEN 1 ELSE 0 END AS owner_has_avatar,
            CASE WHEN owner.avatar LIKE 'https://%' THEN owner.avatar ELSE '' END AS owner_avatar_url,
            COALESCE(owner.updated_at, owner.created_at) AS owner_avatar_updated_at
        FROM article_assets AS assets
        LEFT JOIN users AS owner ON owner.id = assets.owner_id
        WHERE ${galleryFilter.where}
        ORDER BY assets.created_at DESC
        LIMIT ? OFFSET ?
    `).all(...galleryFilter.params, limit, offset);
    return rows.map(parseGalleryAsset);
}

function listRandomGalleryAssets({ limit = 1, search = '', ownerId = '' } = {}) {
    const galleryFilter = buildGalleryWhere({ search, ownerId });
    const rows = db.prepare(`
        SELECT
            assets.id, assets.article_id, assets.owner_id, assets.asset_type, assets.mime_type,
            assets.url, assets.storage_key, assets.metadata, assets.created_at, assets.updated_at,
            owner.username AS owner_username,
            CASE WHEN owner.avatar IS NOT NULL AND owner.avatar <> '' THEN 1 ELSE 0 END AS owner_has_avatar,
            CASE WHEN owner.avatar LIKE 'https://%' THEN owner.avatar ELSE '' END AS owner_avatar_url,
            COALESCE(owner.updated_at, owner.created_at) AS owner_avatar_updated_at
        FROM article_assets AS assets
        LEFT JOIN users AS owner ON owner.id = assets.owner_id
        WHERE ${galleryFilter.where}
        ORDER BY RANDOM()
        LIMIT ?
    `).all(...galleryFilter.params, limit);
    return rows.map(parseGalleryAsset);
}

function countGalleryAssets({ search = '', ownerId = '' } = {}) {
    const galleryFilter = buildGalleryWhere({ search, ownerId });
    return db.prepare(`SELECT COUNT(*) AS count FROM article_assets AS assets WHERE ${galleryFilter.where}`).get(...galleryFilter.params).count;
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

function isAssetPubliclyReferenced(id) {
    const asset = findAssetForAdmin(id);
    if (!asset) return false;
    const proxyToken = `/api/assets/proxy/${id}`;
    const directUrl = String(asset.url || '');
    const row = db.prepare(`
        SELECT 1
        FROM articles
        WHERE status = 'published'
          AND (
            id = ?
            OR cover_image_asset_id = ?
            OR instr(COALESCE(cover_image, ''), ?) > 0
            OR instr(COALESCE(content, ''), ?) > 0
            OR (
                ? <> ''
                AND (
                    instr(COALESCE(cover_image, ''), ?) > 0
                    OR instr(COALESCE(content, ''), ?) > 0
                )
            )
          )
        LIMIT 1
    `).get(asset.article_id, id, proxyToken, proxyToken, directUrl, directUrl, directUrl);
    return Boolean(row);
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
    countGalleryAssets,
    createAsset,
    deleteAssetById,
    deleteAssetForOwner,
    findAssetForAdmin,
    findAssetByStorageKey,
    findAssetForOwner,
    isAssetPubliclyReferenced,
    listAssetsByOwner,
    listGalleryAssets,
    listRandomGalleryAssets
};
