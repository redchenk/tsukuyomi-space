function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function isEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

module.exports = {
    normalizeEmail,
    isEmail,
    parsePositiveInt,
    safeJsonParse
};
