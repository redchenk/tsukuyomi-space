const crypto = require('crypto');
const db = require('../db');
const { publicAvatarUrl } = require('../utils/avatar');

function parseScene(value) {
    try {
        const scene = JSON.parse(String(value || '{}'));
        return scene && typeof scene === 'object' && !Array.isArray(scene) ? scene : {};
    } catch (_) {
        return {};
    }
}

function normalizeShare(row) {
    if (!row) return null;
    const share = {
        id: row.id,
        shareKey: row.share_key,
        turnId: row.turn_id,
        title: row.title,
        userMessage: row.user_message,
        assistantMessage: row.assistant_message,
        scene: parseScene(row.scene_json),
        ogImageAssetId: row.og_image_asset_id || '',
        ogImageUrl: row.og_image_asset_id ? `/api/assets/proxy/${encodeURIComponent(row.og_image_asset_id)}` : '',
        author: row.username || '月读空间访客',
        avatar: publicAvatarUrl({
            avatar: row.avatar,
            username: row.username,
            updatedAt: row.avatar_updated_at
        }),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
    return share;
}

const shareSelect = `
    SELECT shares.*,
           users.username,
           users.avatar,
           COALESCE(users.updated_at, users.created_at) AS avatar_updated_at
    FROM room_conversation_shares AS shares
    LEFT JOIN users ON users.id = shares.user_id
`;

function findActiveShare(shareKey) {
    return normalizeShare(db.prepare(`
        ${shareSelect}
        WHERE shares.share_key = ? AND shares.revoked_at IS NULL
        LIMIT 1
    `).get(shareKey));
}

function findOwnedShare(shareKey, userId) {
    return normalizeShare(db.prepare(`
        ${shareSelect}
        WHERE shares.share_key = ? AND shares.user_id = ? AND shares.revoked_at IS NULL
        LIMIT 1
    `).get(shareKey, userId));
}

function createOrReplaceShare({ userId, turnId, title, userMessage, assistantMessage, scene, ogImageAssetId }) {
    const existing = db.prepare(`
        SELECT id, share_key, revoked_at
        FROM room_conversation_shares
        WHERE user_id = ? AND turn_id = ?
    `).get(userId, turnId);
    const id = existing?.id || crypto.randomUUID();
    const shareKey = existing && !existing.revoked_at
        ? existing.share_key
        : crypto.randomBytes(18).toString('base64url');

    db.prepare(`
        INSERT INTO room_conversation_shares (
            id, share_key, user_id, turn_id, title, user_message, assistant_message,
            scene_json, og_image_asset_id, revoked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(user_id, turn_id) DO UPDATE SET
            share_key = excluded.share_key,
            title = excluded.title,
            user_message = excluded.user_message,
            assistant_message = excluded.assistant_message,
            scene_json = excluded.scene_json,
            og_image_asset_id = excluded.og_image_asset_id,
            updated_at = CURRENT_TIMESTAMP,
            revoked_at = NULL
    `).run(
        id,
        shareKey,
        userId,
        turnId,
        title,
        userMessage,
        assistantMessage,
        JSON.stringify(scene || {}),
        ogImageAssetId || null
    );

    return findActiveShare(shareKey);
}

function revokeShare(shareKey, userId) {
    return db.prepare(`
        UPDATE room_conversation_shares
        SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE share_key = ? AND user_id = ? AND revoked_at IS NULL
    `).run(shareKey, userId).changes;
}

module.exports = {
    createOrReplaceShare,
    findActiveShare,
    findOwnedShare,
    revokeShare
};
