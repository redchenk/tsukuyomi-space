const crypto = require('crypto');
const db = require('../db');
const storage = require('./object-storage');
const { detectMimeFromMagic } = require('./file-security');

const MAX_BYTES = 512 * 1024;
const uploads = new Set();
let cleaning = false;
let lastCleanup = 0;
const error = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

function descriptor(row) {
    return row ? { id: row.id, name: row.name, type: row.mime_type, size: row.byte_size, url: `/api/room/chat/images/${row.id}` } : null;
}

function find(userId, turnId) {
    return db.prepare('SELECT * FROM room_chat_images WHERE user_id = ? AND turn_id = ? AND deleted = 0').get(userId, turnId);
}

function validateReference(userId, turnId, imageId) {
    if (!imageId) return;
    if (find(userId, turnId)?.id !== imageId) throw error('图片尚未上传或不属于当前对话，请重新发送');
}

async function upload(userId, turnId, payload) {
    const existing = find(userId, turnId);
    if (existing) return descriptor(existing);
    if (!storage.isConfigured()) throw error('图片云同步尚未配置，请联系管理员启用 OSS 后重试', 503);
    const key = `${userId}:${turnId}`;
    if (uploads.has(key) || uploads.size >= 4) throw error('图片正在上传，请稍后重试', 429);
    if (db.prepare('SELECT COUNT(*) AS n FROM room_chat_images WHERE user_id = ?').get(userId).n >= 100) {
        throw error('图片数量达到上限，请新建对话后重试', 429);
    }
    const value = payload?.dataUrl;
    if (typeof value !== 'string' || value.length > Math.ceil(MAX_BYTES / 3) * 4 + 64) throw error('图片请压缩至 512KiB 以内', 413);
    const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match) throw error('图片格式无效，仅支持 JPEG、PNG、WebP');
    const buffer = Buffer.from(match[2], 'base64');
    const mimeType = detectMimeFromMagic(buffer);
    if (!buffer.length || buffer.length > MAX_BYTES || mimeType !== match[1]) throw error('图片内容与声明格式不一致');
    const id = crypto.randomUUID();
    const name = String(payload.name || 'image').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160);
    uploads.add(key);
    let object;
    try {
        object = await storage.putObject({ buffer, mimeType, ext: mimeType.split('/')[1], id,
            uploadPath: 'room-private/${year}/${month}', privateRead: true, cacheControl: 'private, no-store' });
        if (!object) throw new Error('Storage unavailable');
        db.prepare(`INSERT INTO room_chat_images (id, user_id, turn_id, object_key, name, mime_type, byte_size)
            VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, userId, turnId, object.key, name, mimeType, buffer.length);
        return descriptor(find(userId, turnId));
    } catch (_) {
        if (object) await storage.deleteObject(object.key).catch(() => {});
        throw error('图片云同步失败，原图仍保留在当前消息中，请重试', 502);
    } finally {
        uploads.delete(key);
        cleanup().catch(() => {});
    }
}

async function read(userId, id) {
    const row = db.prepare('SELECT * FROM room_chat_images WHERE user_id = ? AND id = ? AND deleted = 0').get(userId, id);
    if (!row) throw error('图片不存在或已被清除', 404);
    const object = await storage.getObject(row.object_key);
    if (!object) throw error('图片暂时无法读取，请重试', 502);
    return { buffer: object.buffer, type: row.mime_type };
}

function clear(userId) {
    db.prepare('UPDATE room_chat_images SET deleted = 1 WHERE user_id = ?').run(userId);
    cleanup({ force: true }).catch(() => {});
}

async function cleanup({ force = false } = {}) {
    if (cleaning || (!force && Date.now() - lastCleanup < 30 * 60_000)) return;
    cleaning = true;
    lastCleanup = Date.now();
    try {
        const rows = db.prepare(`SELECT id, object_key FROM room_chat_images i WHERE deleted = 1 OR
            (created_at < datetime('now', '-1 day') AND NOT EXISTS
                (SELECT 1 FROM room_chat_messages m WHERE m.user_id = i.user_id AND m.turn_id = i.turn_id))
            ORDER BY created_at LIMIT 20`).all();
        for (const row of rows) {
            if (await storage.deleteObject(row.object_key).catch(() => false)) {
                db.prepare('DELETE FROM room_chat_images WHERE id = ?').run(row.id);
            }
        }
    } finally { cleaning = false; }
}

module.exports = { upload, read, find, descriptor, validateReference, clear, cleanup };
