const { detectMimeFromMagic, SAFE_IMAGE_MIME_TYPES } = require('../services/file-security');

const INLINE_AVATAR_LIMIT = 256 * 1024;
const INLINE_AVATAR_TEXT_LIMIT = Math.ceil(INLINE_AVATAR_LIMIT * 4 / 3) + 128;

function avatarError(message) {
    const error = new Error(message);
    error.status = 400;
    return error;
}

function validateAvatar(avatar) {
    const value = String(avatar || '').trim();
    if (!value) throw avatarError('头像内容为空');
    if (value.startsWith('data:')) {
        if (value.length > INLINE_AVATAR_TEXT_LIMIT) throw avatarError('头像不能超过 256KB');
        const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/);
        if (!match) throw avatarError('头像格式无效');
        const buffer = Buffer.from(match[2], 'base64');
        const detectedMime = detectMimeFromMagic(buffer, match[1]);
        if (!buffer.length || buffer.length > INLINE_AVATAR_LIMIT || !SAFE_IMAGE_MIME_TYPES.has(detectedMime)) {
            throw avatarError('只支持 256KB 以内的 JPEG、PNG、GIF 或 WebP 头像');
        }
        return `data:${detectedMime};base64,${match[2]}`;
    }
    if (value.length > 500) throw avatarError('头像地址过长');
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid');
        return url.toString();
    } catch (_) {
        throw avatarError('头像地址必须使用 HTTPS');
    }
}

function compactAvatar(avatar) {
    if (!avatar) return '';
    const value = String(avatar);
    if (!value.startsWith('data:')) return value;
    return value.length <= INLINE_AVATAR_TEXT_LIMIT ? value : '';
}

function publicAvatarUrl({ avatar, username, updatedAt } = {}) {
    const value = compactAvatar(avatar);
    if (!value) return '';
    if (!value.startsWith('data:')) {
        if (/^https:\/\//i.test(value)) return value;
        if (/^http:\/\/(?:thirdqq|q)\.qlogo\.cn\//i.test(value)) return `https://${value.slice(7)}`;
        return '';
    }

    const safeUsername = String(username || '').trim();
    if (!safeUsername) return '';
    const version = String(updatedAt || '').trim();
    const query = version ? `?v=${encodeURIComponent(version)}` : '';
    return `/api/user/public/${encodeURIComponent(safeUsername)}/avatar${query}`;
}

module.exports = {
    compactAvatar,
    publicAvatarUrl,
    validateAvatar
};
