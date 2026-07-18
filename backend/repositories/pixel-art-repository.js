const db = require('../db');
const { publicAvatarUrl } = require('../utils/avatar');
const { safeJsonParse } = require('../validators');

const PREVIEW_MAX_WIDTH = 192;
const PREVIEW_MAX_HEIGHT = 108;
const COMPACT_PREVIEW_MAX_WIDTH = 96;
const COMPACT_PREVIEW_MAX_HEIGHT = 54;

function normalizeArtwork(row) {
    if (!row) return null;
    const { avatar_updated_at: avatarUpdatedAt, ...artwork } = row;
    return {
        ...artwork,
        width: Number(artwork.width || artwork.size),
        height: Number(artwork.height || artwork.size),
        palette: safeJsonParse(artwork.palette, []),
        pixels: safeJsonParse(artwork.pixels, []),
        avatar: publicAvatarUrl({
            avatar: artwork.avatar,
            username: artwork.author,
            updatedAt: avatarUpdatedAt
        }),
        viewer_liked: Boolean(artwork.viewer_liked)
    };
}

function previewDimensions(width, height, maxWidth = PREVIEW_MAX_WIDTH, maxHeight = PREVIEW_MAX_HEIGHT) {
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    return {
        width: Math.max(1, Math.floor(width * scale)),
        height: Math.max(1, Math.floor(height * scale))
    };
}

function encodePreviewPixels(pixels, width, height, previewWidth, previewHeight) {
    const encoded = Buffer.alloc(previewWidth * previewHeight);
    for (let y = 0; y < previewHeight; y += 1) {
        const sourceY = Math.min(height - 1, Math.floor(y * height / previewHeight));
        for (let x = 0; x < previewWidth; x += 1) {
            const sourceX = Math.min(width - 1, Math.floor(x * width / previewWidth));
            const value = Number(pixels[sourceY * width + sourceX]);
            encoded[y * previewWidth + x] = Math.max(0, Math.min(255, Number.isFinite(value) ? value + 1 : 0));
        }
    }
    return encoded.toString('base64');
}

function compactArtworkPreview(artwork, { compact = false } = {}) {
    if (!artwork) return artwork;
    const { pixels, ...summary } = artwork;
    const width = Number(artwork.width || artwork.size || 1);
    const height = Number(artwork.height || artwork.size || 1);
    const preview = compact
        ? previewDimensions(width, height, COMPACT_PREVIEW_MAX_WIDTH, COMPACT_PREVIEW_MAX_HEIGHT)
        : previewDimensions(width, height);
    return {
        ...summary,
        preview_width: preview.width,
        preview_height: preview.height,
        pixels_base64: encodePreviewPixels(pixels, width, height, preview.width, preview.height)
    };
}

function clampLimit(value, fallback = 24, max = 80) {
    return Math.max(1, Math.min(Number.parseInt(value, 10) || fallback, max));
}

function clampOffset(value) {
    return Math.max(0, Number.parseInt(value, 10) || 0);
}

function artworkSelect(viewerId = '') {
    return `
        SELECT a.id,
               a.title,
               a.description,
               a.author_id,
               a.size,
               COALESCE(a.width, a.size) AS width,
               COALESCE(a.height, a.size) AS height,
               COALESCE(a.background_color, '#0b1020') AS background_color,
               a.palette,
               a.pixels,
               a.like_count,
               a.created_at,
               a.updated_at,
               u.username AS author,
               u.avatar,
               COALESCE(u.updated_at, u.created_at) AS avatar_updated_at,
               CASE
                   WHEN ? != '' AND EXISTS (
                       SELECT 1
                       FROM pixel_art_likes l
                       WHERE l.artwork_id = a.id AND l.user_id = ?
                   )
                   THEN 1
                   ELSE 0
               END AS viewer_liked
        FROM pixel_artworks a
        LEFT JOIN users u ON u.id = a.author_id
    `;
}

function listArtworks({ viewerId = '', sort = 'latest', limit = 24, offset = 0, preview = false } = {}) {
    const safeLimit = clampLimit(limit);
    const safeOffset = clampOffset(offset);
    const orderBy = sort === 'hot'
        ? 'ORDER BY a.like_count DESC, a.created_at DESC, a.id DESC'
        : 'ORDER BY a.created_at DESC, a.id DESC';
    const rows = db.prepare(`
        ${artworkSelect(viewerId)}
        ${orderBy}
        LIMIT ? OFFSET ?
    `).all(viewerId, viewerId, safeLimit, safeOffset);
    const total = db.prepare('SELECT COUNT(*) AS count FROM pixel_artworks').get().count || 0;

    return {
        items: rows.map(normalizeArtwork).map(artwork => preview ? compactArtworkPreview(artwork, { compact: preview === 'compact' }) : artwork),
        total,
        limit: safeLimit,
        offset: safeOffset
    };
}

function listManageArtworks({ viewerId = '', admin = false, sort = 'latest', limit = 80, offset = 0, preview = false } = {}) {
    const safeLimit = clampLimit(limit, 80, 120);
    const safeOffset = clampOffset(offset);
    const orderBy = sort === 'hot'
        ? 'ORDER BY a.like_count DESC, a.created_at DESC, a.id DESC'
        : 'ORDER BY a.created_at DESC, a.id DESC';
    const where = admin ? '' : 'WHERE a.author_id = ?';
    const params = admin
        ? [viewerId, viewerId, safeLimit, safeOffset]
        : [viewerId, viewerId, viewerId, safeLimit, safeOffset];
    const rows = db.prepare(`
        ${artworkSelect(viewerId)}
        ${where}
        ${orderBy}
        LIMIT ? OFFSET ?
    `).all(...params);
    const total = admin
        ? db.prepare('SELECT COUNT(*) AS count FROM pixel_artworks').get().count || 0
        : db.prepare('SELECT COUNT(*) AS count FROM pixel_artworks WHERE author_id = ?').get(viewerId).count || 0;

    return {
        items: rows.map(normalizeArtwork).map(artwork => preview ? compactArtworkPreview(artwork, { compact: preview === 'compact' }) : artwork),
        total,
        limit: safeLimit,
        offset: safeOffset
    };
}

function findArtworkById(id, viewerId = '') {
    const row = db.prepare(`
        ${artworkSelect(viewerId)}
        WHERE a.id = ?
    `).get(viewerId, viewerId, id);
    return normalizeArtwork(row);
}

function createArtwork({ title, description = '', authorId, size, width = size, height = size, backgroundColor = '#0b1020', palette, pixels }) {
    const result = db.prepare(`
        INSERT INTO pixel_artworks (title, description, author_id, size, width, height, background_color, palette, pixels)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        title,
        description,
        authorId,
        size,
        width,
        height,
        backgroundColor,
        JSON.stringify(palette),
        JSON.stringify(pixels)
    );
    return findArtworkById(result.lastInsertRowid, authorId);
}

function updateArtwork(id, { title, description = '', size, width = size, height = size, backgroundColor = '#0b1020', palette, pixels }, viewerId = '') {
    const changes = db.prepare(`
        UPDATE pixel_artworks
        SET title = ?,
            description = ?,
            size = ?,
            width = ?,
            height = ?,
            background_color = ?,
            palette = ?,
            pixels = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        title,
        description,
        size,
        width,
        height,
        backgroundColor,
        JSON.stringify(palette),
        JSON.stringify(pixels),
        id
    ).changes;
    return changes ? findArtworkById(id, viewerId) : null;
}

function deleteArtwork(id) {
    const tx = db.transaction(() => {
        db.prepare('DELETE FROM pixel_art_likes WHERE artwork_id = ?').run(id);
        return db.prepare('DELETE FROM pixel_artworks WHERE id = ?').run(id).changes;
    });
    return tx();
}

function findArtworkLike(artworkId, userId) {
    if (!artworkId || !userId) return null;
    return db.prepare(`
        SELECT artwork_id, user_id
        FROM pixel_art_likes
        WHERE artwork_id = ? AND user_id = ?
    `).get(artworkId, userId);
}

function likeArtwork(artworkId, userId) {
    const tx = db.transaction(() => {
        db.prepare(`
            INSERT INTO pixel_art_likes (artwork_id, user_id)
            VALUES (?, ?)
        `).run(artworkId, userId);
        db.prepare(`
            UPDATE pixel_artworks
            SET like_count = like_count + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(artworkId);
    });
    tx();
    return findArtworkById(artworkId, userId);
}

module.exports = {
    listArtworks,
    listManageArtworks,
    findArtworkById,
    createArtwork,
    updateArtwork,
    deleteArtwork,
    findArtworkLike,
    likeArtwork
};
