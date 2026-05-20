const adminRepository = require('../repositories/admin-repository');

const DEFAULT_REVIEW_KEYWORDS = [
    '政治',
    '暴力',
    '恐怖',
    '诈骗',
    '赌博',
    '色情',
    '毒品',
    '枪',
    '违法',
    '代开发票',
    '银行卡',
    '身份证'
];

function normalizeKeywordList(value) {
    return String(value || '')
        .split(/[\n,，、;；|]+/)
        .map(item => item.trim().toLowerCase())
        .filter(Boolean);
}

function readModerationSettings() {
    const rows = adminRepository.listSettings();
    return Object.fromEntries(rows.map(row => [row.key, row.value]));
}

function moderationKeywords(settings = readModerationSettings()) {
    const configured = normalizeKeywordList(settings.messageReviewKeywords);
    return configured.length ? configured : DEFAULT_REVIEW_KEYWORDS;
}

function reviewMessageContent(content, settings = readModerationSettings()) {
    const text = String(content || '').toLowerCase();
    const matchedKeywords = moderationKeywords(settings).filter(keyword => text.includes(keyword));
    return {
        status: matchedKeywords.length ? 'pending' : 'approved',
        matchedKeywords
    };
}

module.exports = {
    DEFAULT_REVIEW_KEYWORDS,
    normalizeKeywordList,
    moderationKeywords,
    reviewMessageContent
};
