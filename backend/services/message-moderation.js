const adminRepository = require('../repositories/admin-repository');
const { inspectMessageLinks } = require('./message-link-security');

const MAX_MESSAGE_LENGTH = 2000;
const MAX_MESSAGE_BYTES = 8000;

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

function decodeCodePoint(value, radix) {
    const codePoint = Number.parseInt(value, radix);
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return '\ufffd';
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) return '\ufffd';
    return String.fromCodePoint(codePoint);
}

function decodeForInspection(value) {
    let decoded = String(value || '').normalize('NFKC');
    for (let pass = 0; pass < 3; pass += 1) {
        const previous = decoded;
        try {
            decoded = decodeURIComponent(decoded);
        } catch (_) {
            // Invalid percent encoding is inspected in its original form.
        }
        decoded = decoded
            .replace(/&#x([0-9a-f]+);?/gi, (_, code) => decodeCodePoint(code, 16))
            .replace(/&#(\d+);?/g, (_, code) => decodeCodePoint(code, 10))
            .replace(/&(lt|gt|colon|tab|newline|amp|quot|apos);/gi, (_, entity) => ({
                lt: '<', gt: '>', colon: ':', tab: '\t', newline: '\n', amp: '&', quot: '"', apos: "'"
            })[entity.toLowerCase()]);
        if (decoded === previous) break;
    }
    return decoded;
}

function containsActiveMarkup(value) {
    const decoded = decodeForInspection(value);
    const compact = decoded.replace(/[\u0000-\u0020\u007f-\u009f]+/g, '');
    if (/<\s*\/?\s*[a-z][^>]*>/i.test(decoded)) return true;
    if (/\bon[a-z][\w:-]*\s*=/i.test(decoded) || /\bsrcdoc\s*=/i.test(decoded)) return true;
    if (/(?:href|src|xlink:href|formaction)\s*=\s*["']?(?:javascript|vbscript|data):/i.test(compact)) return true;
    return /(?:\{\{|\$\{)[\s\S]*(?:constructor\s*\.\s*constructor|__proto__|document\s*\.|window\s*\.|(?:eval|function)\s*\()/i.test(decoded);
}

function reviewMessageContent(content, settings = readModerationSettings()) {
    if (typeof content !== 'string') {
        return { accepted: false, code: 'INVALID_CONTENT', status: 'rejected', matchedKeywords: [] };
    }
    const normalizedContent = content.trim();
    const characterLength = [...normalizedContent].length;
    if (!normalizedContent) {
        return { accepted: false, code: 'EMPTY_CONTENT', status: 'rejected', matchedKeywords: [] };
    }
    if (characterLength > MAX_MESSAGE_LENGTH || Buffer.byteLength(normalizedContent, 'utf8') > MAX_MESSAGE_BYTES) {
        return { accepted: false, code: 'CONTENT_TOO_LONG', status: 'rejected', matchedKeywords: [] };
    }
    if (containsActiveMarkup(normalizedContent)) {
        return { accepted: false, code: 'ACTIVE_MARKUP', status: 'rejected', matchedKeywords: [] };
    }
    const linkInspection = inspectMessageLinks(decodeForInspection(normalizedContent));
    if (linkInspection.dangerousScheme) {
        return { accepted: false, code: 'DANGEROUS_LINK', status: 'rejected', matchedKeywords: [] };
    }

    const text = normalizedContent.toLowerCase();
    const matchedKeywords = moderationKeywords(settings).filter(keyword => text.includes(keyword));
    const externalHosts = [...new Set(linkInspection.externalLinks.map(link => link.hostname))];
    const reviewReasons = [];
    if (matchedKeywords.length) reviewReasons.push('keyword');
    if (externalHosts.length) reviewReasons.push('external_link');
    return {
        accepted: true,
        content: normalizedContent,
        status: reviewReasons.length ? 'pending' : 'approved',
        matchedKeywords,
        externalHosts,
        reviewReasons
    };
}

module.exports = {
    MAX_MESSAGE_LENGTH,
    MAX_MESSAGE_BYTES,
    DEFAULT_REVIEW_KEYWORDS,
    containsActiveMarkup,
    decodeForInspection,
    normalizeKeywordList,
    readModerationSettings,
    moderationKeywords,
    reviewMessageContent
};
