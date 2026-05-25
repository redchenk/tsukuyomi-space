const INLINE_AVATAR_LIMIT = 256 * 1024;

function compactAvatar(avatar) {
    if (!avatar) return '';
    const value = String(avatar);
    if (!value.startsWith('data:')) return value;
    return value.length <= INLINE_AVATAR_LIMIT ? value : '';
}

module.exports = {
    compactAvatar
};
