const db = require('../db');
const { compactAvatar } = require('../utils/avatar');
const { safeJsonParse } = require('../validators');

function normalizeArtwork(row) {
    if (!row) return null;
    return {
        ...row,
        width: Number(row.width || row.size),
        height: Number(row.height || row.size),
        palette: safeJsonParse(row.palette, []),
        pixels: safeJsonParse(row.pixels, []),
        avatar: compactAvatar(row.avatar),
        viewer_liked: Boolean(row.viewer_liked)
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

function listArtworks({ viewerId = '', sort = 'latest', limit = 24, offset = 0 } = {}) {
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
        items: rows.map(normalizeArtwork),
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
    findArtworkById,
    createArtwork,
    findArtworkLike,
    likeArtwork
};
