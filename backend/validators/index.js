function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function isEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isOAuthPlaceholderEmail(email) {
    return normalizeEmail(email).endsWith('@oauth.yachiyo.local');
}

function publicEmail(email) {
    const normalized = normalizeEmail(email);
    const privatePlaceholder = isOAuthPlaceholderEmail(normalized)
        || normalized.endsWith('@admin.yachiyo.local');
    return privatePlaceholder ? '' : normalized;
}

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeJsonParse(value, fallback) {
    if (typeof value !== 'string') return value ?? fallback;
    try {
        return JSON.parse(value);
    } catch (_) {
        return fallback;
    }
}

function validateNickname(value) {
    const nickname = typeof value === 'string' ? value.trim() : '';
    const message = !nickname ? '请输入昵称'
        : [...nickname].length > 32 ? '昵称不能超过 32 个字符'
        : /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(nickname) ? '昵称不能包含控制字符' : '';
    if (/[\ud800-\udfff]/u.test(nickname)) {
        const error = new Error('昵称包含无效字符');
        error.status = 400;
        throw error;
    }
    if (message) {
        const error = new Error(message);
        error.status = 400;
        throw error;
    }
    return nickname;
}

module.exports = {
    normalizeEmail,
    isEmail,
    isOAuthPlaceholderEmail,
    publicEmail,
    parsePositiveInt,
    safeJsonParse,
    validateNickname
};
