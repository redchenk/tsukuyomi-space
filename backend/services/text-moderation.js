const { Parser } = require('htmlparser2');

// Custom terms extend this baseline; they cannot turn the baseline off.
const DEFAULT_REVIEW_KEYWORDS = [
    '政治', '暴力', '恐怖', '诈骗', '詐騙', '赌博', '賭博', '色情', '毒品',
    '枪', '槍', '违法', '違法', '代开发票', '代開發票', '银行卡', '銀行卡', '身份证', '身份證',
    '裸聊', '约炮', '約炮', '援交', '裸照', '裸体', '裸體', '性交', '强奸', '強姦', '轮奸', '輪姦', '儿童色情', '兒童色情',
    '杀了你', '殺了你', '杀死你', '殺死你', '去死', '弄死你', '砍死你', '炸死你', '黑鬼', '白皮猪', '白皮豬', '自杀方法', '自殺方法',
    'sex', 'sexual', 'fuck', 'fucking', 'blowjob', 'hentai', 'porn', 'pornography', 'suicide', 'nude', 'nudes', 'naked', 'rape', 'raping', 'cocaine', 'heroin', 'nigger', 'niggers', 'faggot', 'faggots',
    '児童ポルノ', 'ポルノ', '殺してやる', 'ヌード', 'レイプ'
];

function decodeText(value) {
    let text = String(value || '');
    // Bound decoding work, including nested HTML entities and percent encoding.
    for (let pass = 0; pass < 3; pass += 1) {
        const previous = text;
        text = text.replace(/(?:%[a-f0-9]{2})+/gi, encoded => {
            try { return decodeURIComponent(encoded); } catch (_) { return encoded; }
        });
        let decoded = '';
        const parser = new Parser({
            ontext(chunk) { decoded += chunk; },
            onopentag() { decoded += ' '; },
            onclosetag() { decoded += ' '; }
        }, { decodeEntities: true });
        parser.write(text);
        parser.end();
        text = decoded;
        if (text === previous) break;
    }
    return text;
}

function canonicalText(value) {
    return String(value || '').normalize('NFKC').normalize('NFD').toLowerCase()
        .replace(/[\p{Cf}\p{M}]/gu, '')
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
}

function normalizeText(value) {
    return canonicalText(decodeText(value));
}

function normalizeKeywordList(value) {
    return String(value || '').split(/[\n,，、;；|]+/)
        .map(item => normalizeText(item).trim()).filter(Boolean);
}

function readSettings() {
    // Lazy loading keeps the policy usable from repositories without a cycle.
    return Object.fromEntries(require('../repositories/admin-repository').listSettings().map(row => [row.key, row.value]));
}

function moderationKeywords(settings = readSettings()) {
    return [...new Set([...DEFAULT_REVIEW_KEYWORDS, ...normalizeKeywordList(settings.messageReviewKeywords)])];
}

function inspectText(value, settings) {
    const variants = [...new Set([canonicalText(value), normalizeText(value)])];
    const compact = variants.map(text => text.replace(/[\p{P}\p{Z}\p{S}\s]/gu, ''));
    const matchedKeywords = moderationKeywords(settings).filter(keyword => {
        const term = normalizeText(keyword);
        if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(term)) {
            return compact.some(text => text.includes(term.replace(/[\p{P}\p{Z}\p{S}\s]/gu, '')));
        }
        if (!DEFAULT_REVIEW_KEYWORDS.includes(keyword)) return variants.some(text => text.includes(term));
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match separated spellings of baseline English terms (n.u.d.e), while
        // retaining word boundaries so innocent words like 'grape' stay clear.
        const pattern = /^[a-z]+$/.test(term) && DEFAULT_REVIEW_KEYWORDS.includes(keyword)
            ? [...term].map(character => ({ a: '[a4@]', e: '[e3]', i: '[i1!]', o: '[o0]', s: '[s5$]', t: '[t7]' })[character] || character).join('[\\p{P}\\p{Z}\\s]*') : escaped;
        const matcher = new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, 'u');
        return variants.some(text => matcher.test(text));
    });
    const threats = [
        /\b(?:i|we)\s+(?:will|shall|am going to|are going to|gonna)\s+(?:kill|murder|rape|shoot|stab|hurt|attack|beat|torture)\s+(?:you|them|him|her)\b/u,
        /\b(?:kill|murder|shoot)\s+(?:you|them|him|her|everyone|yourself|yourselves)\b/u,
        /\b(?:you (?:should|must)|go (?:and|ahead and))\s+die\b/u,
        /\b(?:how to|instructions (?:for|to))\s+(?:make|build)\s+(?:a\s+)?(?:bomb|explosive)\b/u
    ];
    if (variants.some(text => threats.some(pattern => pattern.test(text.replace(/\b(i|we)['’]ll\b/gu, '$1 will').replace(/\bi['’]m\b/gu, 'i am').replace(/[\p{P}]/gu, ' '))))) matchedKeywords.push('威胁或伤害指令');
    return { matchedKeywords: [...new Set(matchedKeywords)], status: matchedKeywords.length ? 'pending' : 'approved' };
}

function assertPublicText(values, settings = readSettings()) {
    // Inspect each field and their combination so splitting a term across fields
    // does not skip inspection. Private room conversations never call this gate.
    const fields = Object.values(values).flat().filter(value => value != null).map(String);
    const matched = [...new Set([...fields, fields.join(' ')].flatMap(value => inspectText(value, settings).matchedKeywords))];
    if (!matched.length) return;
    const error = new Error('文字内容包含需审核的内容，请修改后再发布。原有内容保持不变。');
    Object.assign(error, { status: 422, statusCode: 422, code: 'TEXT_REVIEW_REQUIRED' });
    throw error;
}

module.exports = { DEFAULT_REVIEW_KEYWORDS, normalizeText, normalizeKeywordList, moderationKeywords, inspectText, assertPublicText };
