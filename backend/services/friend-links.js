const FRIEND_LINK_LIMITS = Object.freeze({
    name: 40,
    description: 160,
    note: 300,
    url: 2048
});

function plainText(value, maxLength) {
    const text = String(value || '').trim().replace(/\s+/g, ' ');
    if (!text || text.length > maxLength || /[\u0000-\u001f\u007f<>]/.test(text)) return '';
    return text;
}

function optionalPlainText(value, maxLength) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return plainText(raw, maxLength);
}

function normalizeFriendLinkUrl(value, { optional = false } = {}) {
    const raw = String(value || '').trim();
    if (!raw) return optional ? '' : null;
    if (raw.length > FRIEND_LINK_LIMITS.url || /[\u0000-\u001f\u007f]/.test(raw)) return null;

    try {
        const url = new URL(raw);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
        url.hash = '';
        return url.toString();
    } catch (_) {
        return null;
    }
}

function validateFriendLinkApplication(body = {}) {
    const name = plainText(body.name, FRIEND_LINK_LIMITS.name);
    const description = plainText(body.description, FRIEND_LINK_LIMITS.description);
    const url = normalizeFriendLinkUrl(body.url);
    const backlinkUrl = normalizeFriendLinkUrl(body.backlink_url, { optional: true });
    const note = optionalPlainText(body.note, FRIEND_LINK_LIMITS.note);

    if (!name || name.length < 2) return { error: '站点名称需为 2-40 个字符' };
    if (!url) return { error: '请填写有效的 HTTP(S) 站点地址' };
    if (!description || description.length < 6) return { error: '站点简介需为 6-160 个字符' };
    if (backlinkUrl === null) return { error: '回链地址格式无效' };
    if (String(body.note || '').trim() && !note) return { error: '补充说明格式无效或超过 300 个字符' };

    return {
        data: {
            name,
            url,
            description,
            backlinkUrl,
            note
        }
    };
}

module.exports = {
    FRIEND_LINK_LIMITS,
    normalizeFriendLinkUrl,
    validateFriendLinkApplication
};
