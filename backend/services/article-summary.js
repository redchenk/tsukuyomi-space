const { Parser } = require('htmlparser2');

const SUMMARY_LENGTH = 160;
const MAX_SUMMARY_INPUT = 2000000;
const BLOCK_TAGS = new Set(['p', 'div', 'br', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'tr']);
const HIDDEN_TAGS = new Set(['script', 'style', 'noscript', 'template', 'svg', 'pre', 'code', 'iframe']);

function stripSpoilers(source) {
    let result = '', cursor = 0;
    while (cursor < source.length) {
        const start = source.indexOf(':spoiler[', cursor);
        if (start < 0) return result + source.slice(cursor);
        let depth = 1, end = start + 9;
        for (; end < source.length && depth; end++) {
            if (source[end] === '\\') { end++; continue; }
            if (source[end] === '[') depth++;
            else if (source[end] === ']') depth--;
        }
        if (depth) return result + source.slice(cursor);
        result += source.slice(cursor, start);
        cursor = end;
    }
    return result;
}

function markdownText(source) {
    return stripSpoilers(source)
        .replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, '')
        .replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^\s*\1\s*$|$(?![\s\S]))/gm, '')
        .replace(/^\s*:::.*$/gm, '')
        .replace(/\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/gi, '')
        .replace(/==([^=\n]+)==(?:\{\.(?:primary|secondary|tertiary|error|tip)\})?/g, '$1')
        .replace(/^\s*\*\[[^\]]+\]:.*$/gm, '')
        .replace(/^\s*\[\^[^\]]+\]:.*$/gm, '')
        .replace(/\[\^[^\]]+\]/g, '')
        .replace(/\$\$[\s\S]*?\$\$/g, '')
        .replace(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, '')
        .replace(/^ *\|(.+)\| *$/gm, (_, row) => row.replace(/(?<!\\)\|/g, ' ').replace(/\\\|/g, '|'))
        .replace(/^(\s*[-*+]\s+)\[[ xX]\]\s+/gm, '$1')
        .replace(/!\[([^\]]*)\]\([^\n]*?\)/g, '$1')
        .replace(/!\[([^\]]*)\]\[[^\]]*\]/g, '$1')
        .replace(/^\s*::(?:bilibili|media|iframe)\[([^\]]*)\]\([^\n]*\)\s*$/gm, '$1')
        .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '')
        .replace(/\[([^\]]+)\]\([^\n]*?\)/g, '$1')
        .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
        .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
        .replace(/^\s*(?:[-*_]\s*){3,}$/gm, '')
        .replace(/(\*\*|__|~~|`)(.*?)\1/g, '$2')
        .replace(/[*_`~]/g, '');
}

function summarizeArticle(content, format = 'markdown') {
    if (typeof content !== 'string' || !content.trim()) return '';
    let source = content;
    if (format === 'block') {
        if (source.length > MAX_SUMMARY_INPUT) return '';
        try {
            const blocks = JSON.parse(source);
            if (!Array.isArray(blocks)) return '';
            source = blocks.slice(0, 2000)
                .filter(block => block && !['code', 'codeblock'].includes(block.type))
                .map(block => [block.text, block.content, block.title, block.description, block.alt]
                    .find(value => typeof value === 'string') || '').join('\n');
        } catch (_) {
            return '';
        }
    }
    source = source.slice(0, MAX_SUMMARY_INPUT);
    if (format !== 'html') source = markdownText(source);
    const chunks = [];
    const hidden = [];
    const parser = new Parser({
        onopentag(name, attributes) {
            hidden.push(Boolean(hidden.at(-1) || HIDDEN_TAGS.has(name) || 'hidden' in attributes
                || attributes['aria-hidden'] === 'true' || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(attributes.style || '')));
            if (hidden.at(-1)) return;
            if (BLOCK_TAGS.has(name)) chunks.push(' ');
            if (name === 'img' && attributes.alt) chunks.push(attributes.alt);
        },
        ontext(value) { if (!hidden.at(-1)) chunks.push(value); },
        onclosetag(name) {
            if (!hidden.at(-1) && BLOCK_TAGS.has(name)) chunks.push(' ');
            hidden.pop();
        }
    }, { decodeEntities: true });
    parser.end(source);
    const text = chunks.join('').replace(/https?:\/\/\S+|data:\S+/gi, '')
        .replace(/[\u0000-\u001f\u007f\u200b-\u200d\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();
    const characters = Array.from(text);
    if (characters.length <= SUMMARY_LENGTH) return text;
    const prefix = characters.slice(0, SUMMARY_LENGTH - 1).join('');
    // Prefer a complete sentence near the limit; otherwise trim at a word boundary.
    const sentenceEnd = [...prefix.matchAll(/[。！？.!?](?:[”’」』"])?(?=\s|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|$)/gu)].at(-1);
    if (sentenceEnd && sentenceEnd.index >= SUMMARY_LENGTH * 0.55) return prefix.slice(0, sentenceEnd.index + sentenceEnd[0].length);
    const wordEnd = prefix.lastIndexOf(' ');
    return (wordEnd >= prefix.length * 0.75 ? prefix.slice(0, wordEnd) : prefix).trimEnd() + '…';
}

function resolveArticleExcerpt(excerpt, content, format) {
    return typeof excerpt === 'string' && excerpt.trim() ? excerpt : summarizeArticle(content, format);
}

module.exports = { summarizeArticle, resolveArticleExcerpt, SUMMARY_LENGTH, MAX_SUMMARY_INPUT };
