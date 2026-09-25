const SENSITIVE = /(password|api[_-]?key|secret|bearer\s+[a-z0-9._-]+|\btoken\b|sk-[a-z0-9._-]+|密码|密钥|令牌|身份证|银行卡)/i;

function searchTerms(query) {
    const text = String(query || '').toLowerCase();
    const cleaned = text.replace(/还记得|记不记得|之前|以前|请问|什么|那个|一下|告诉|我们|我的|你的/g, ' ');
    const terms = cleaned.match(/[a-z0-9_]{2,}|[\u4e00-\u9fff]{2,}/g) || [];
    const words = terms.flatMap(word => /[\u4e00-\u9fff]/.test(word)
        ? [word, ...Array.from({ length: Math.max(0, word.length - 1) }, (_, i) => word.slice(i, i + 2))] : [word]);
    const related = [
        [/名字|称呼|叫[啥什]|我是谁|name|call me/, ['我叫', '叫我', '名字', '称呼', 'name']],
        [/喜欢|口味|偏好|爱喝|讨厌|favorite|prefer|like/, ['喜欢', '偏好', '讨厌', '爱喝', 'favorite', 'prefer']],
        [/宠物|猫|狗|pet|cat|dog/, ['宠物', '猫', '狗', 'pet', 'cat', 'dog']],
        [/约定|计划|安排|答应|plan|promise/, ['约定', '计划', '安排', '答应', 'plan', 'promise']],
        [/生日|纪念日|birthday|anniversary/, ['生日', '纪念日', 'birthday', 'anniversary']]
    ];
    for (const [pattern, additions] of related) if (pattern.test(text)) words.push(...additions);
    return [...new Set(words)].filter(word => !['the', 'you', 'was', 'are', 'and', 'what', 'remember', '之前', '记得'].includes(word));
}

function lexicalScore(query, content) {
    const terms = searchTerms(query);
    if (!terms.length) return 0;
    const text = String(content || '').toLowerCase();
    return terms.reduce((score, term) => score + (text.includes(term) ? Math.min(4, term.length) : 0), 0)
        / terms.reduce((score, term) => score + Math.min(4, term.length), 0);
}

function memoryExcerpt(content, query, limit = 760) {
    const text = String(content || '').trim();
    if (text.length <= limit) return text;
    const terms = searchTerms(query);
    const lower = text.toLowerCase();
    const anchors = [0, ...terms.flatMap(term => {
        const positions = [];
        let at = lower.indexOf(term);
        while (at >= 0 && positions.length < 40) { positions.push(at); at = lower.indexOf(term, at + term.length); }
        return positions;
    })];
    let best = { start: 0, score: -1 };
    for (const anchor of anchors) {
        const start = Math.max(0, Math.min(text.length - limit, anchor - Math.floor(limit / 4)));
        const score = lexicalScore(query, text.slice(start, start + limit));
        if (score > best.score) best = { start, score };
    }
    const end = best.start + limit;
    return `${best.start ? '…' : ''}${text.slice(best.start, end)}${end < text.length ? '…' : ''}`;
}

module.exports = { SENSITIVE, searchTerms, lexicalScore, memoryExcerpt };
