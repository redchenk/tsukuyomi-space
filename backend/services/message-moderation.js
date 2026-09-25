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

function messageModerationFeedback(review) {
    const reasons = [];
    const rejection = {
        EMPTY_CONTENT: '内容不能为空，请填写后再提交。',
        INVALID_CONTENT: '内容格式无效，请使用纯文本提交。',
        CONTENT_TOO_LONG: '内容超过长度限制（2000 个字符或 8000 字节），请缩短后重试。',
        ACTIVE_MARKUP: '内容包含 HTML 标签、事件属性或可执行代码，请移除后重试。',
        DANGEROUS_LINK: '内容包含 javascript:、data:、file: 等不允许发布的链接协议，请移除后重试。'
    };
    if (!review.accepted) reasons.push({ code: review.code, message: rejection[review.code] || '内容无效，请修改后重试。' });
    if (review.matchedKeywords?.length) reasons.push({
        code: 'keyword',
        message: `包含需人工确认的关键词：${review.matchedKeywords.slice(0, 5).map(word => `“${word}”`).join('、')}${review.matchedKeywords.length > 5 ? '等' : ''}。命中关键词不代表内容违规。`
    });
    if (review.externalHosts?.length) reasons.push({
        code: 'external_link',
        message: `包含需核实的站外链接：${review.externalHosts.slice(0, 3).join('、')}${review.externalHosts.length > 3 ? '等' : ''}。确认链接安全后才能公开。`
    });
    return {
        status: review.status,
        reasons,
        nextStep: review.status === 'pending'
            ? '内容已保存，暂不公开。请等待人工审核，也可以在用户中心修改后重新提交。'
            : review.status === 'rejected' ? '本次内容未保存，请修改后重新提交。' : ''
    };
}

function messageSubmissionText(review, noun, updated = false) {
    if (review.status === 'approved') return `${noun}已${updated ? '更新' : '发布'}`;
    const feedback = messageModerationFeedback(review);
    return `${noun}已${updated ? '更新' : '提交'}，等待审核。${feedback.reasons.map(reason => reason.message).join('')}${feedback.nextStep}`;
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
    reviewMessageContent,
    messageModerationFeedback,
    messageSubmissionText
};
