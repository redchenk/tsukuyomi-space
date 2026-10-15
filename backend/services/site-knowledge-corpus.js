const crypto = require('node:crypto');
const { Parser } = require('htmlparser2');

const MAX_SOURCE_CHARS = 2_000_000;
const MAX_CHUNKS = 2048;
function revision(value) {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function articleRevision(row) {
    return revision([row.id, row.title, row.slug, row.content_format, row.content, row.updated_at]);
}
function plainHtml(source) {
    const parts = [], hidden = [];
    const parser = new Parser({
        onopentag(name, attrs) {
            hidden.push(Boolean(hidden.at(-1) || ['script', 'style', 'iframe', 'svg', 'template', 'noscript'].includes(name)
                || 'hidden' in attrs || attrs['aria-hidden'] === 'true' || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(attrs.style || '')));
            if (!hidden.at(-1) && /^(p|div|br|li|h[1-6]|tr|pre|blockquote)$/.test(name)) parts.push('\n');
        },
        ontext(text) { if (!hidden.at(-1)) parts.push(text); },
        onclosetag(name) { if (!hidden.at(-1) && /^(p|div|li|h[1-6]|tr|pre|blockquote)$/.test(name)) parts.push('\n'); hidden.pop(); }
    }, { decodeEntities: true });
    parser.end(source);
    return parts.join('').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
}
function articleSections(row) {
    let content = String(row.content || '');
    if (content.length > MAX_SOURCE_CHARS) return [];
    if (row.content_format === 'block') {
        try {
            const blocks = JSON.parse(content);
            if (!Array.isArray(blocks)) return [];
            content = blocks.slice(0, 4000).map(block => {
                if (!block || typeof block !== 'object') return '';
                const text = [block.text, block.content, block.title, block.description].find(v => typeof v === 'string') || '';
                return /heading|header/.test(block.type || '') ? `\n## ${text}\n` : text;
            }).join('\n\n');
        } catch { return []; }
    }
    if (row.content_format === 'html') content = content.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, text) => `\n## ${plainHtml(text)}\n`);
    // Keep code/configuration text, discard media URLs and decorative Markdown.
    content = content.replace(/!\[[^\]]*\]\([^\n]*?\)/g, '').replace(/\[([^\]]+)\]\([^\n]*?\)/g, '$1')
        .replace(/^\s*```[^\n]*$/gm, '').replace(/\*\*|__/g, '');
    content = plainHtml(content);
    const sections = []; let section = '', text = '';
    const flush = () => { if (text.trim()) sections.push({ title: section, text: text.trim(), spoiler: /:spoiler\[|剧透|结局|身世|真相/.test(section + '\n' + text) }); text = ''; };
    for (const line of content.split('\n')) {
        if (/^\s*#{1,6}\s+/.test(line)) { flush(); section = line.replace(/^\s*#{1,6}\s+/, '').trim().slice(0, 120); }
        else text += line + '\n';
    }
    flush(); return sections;
}
function chunkSections(sections) {
    const result = [];
    for (const section of sections) {
        const text = String(section.text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
        const chars = Array.from(text);
        for (let start = 0; start < chars.length;) {
            let end = Math.min(chars.length, start + 240);
            if (end < chars.length) {
                for (let i = end - 1; i > start + 150; i--) {
                    if (/[。！？\n.!?]/.test(chars[i])) { end = i + 1; break; }
                }
            }
            const part = chars.slice(start, end).join('').trim();
            if (part) result.push({ index: result.length, section: String(section.title || '').slice(0, 120), text: part, spoiler: section.spoiler === true });
            if (result.length > MAX_CHUNKS) return []; // Surface as skipped, never silently index a truncated source.
            if (end >= chars.length) break;
            start = end - 30;
        }
    }
    return result;
}
function articleDocument(row) {
    const sections = articleSections(row);
    const titleSpoiler = /剧透|结局|身世|真相/.test(row.title || '');
    if (!sections.length && String(row.content || '').length <= MAX_SOURCE_CHARS) sections.push({ title: '文章信息',
        text: `${row.title}。这篇公开文章没有可提取的文字正文，可能主要由图片或视频组成。可打开原文查看，不能据此推断媒体中的具体内容。` });
    const baseUrl = `/articles/${encodeURIComponent(row.id)}`;
    const slugUrl = row.slug ? `${baseUrl}/${encodeURIComponent(row.slug)}` : baseUrl;
    return { id: `article:${row.id}`, revision: articleRevision(row), title: row.title,
        url: slugUrl.length <= 500 ? slugUrl : baseUrl, kind: 'article', updatedAt: row.updated_at || '',
        chunks: chunkSections(sections.map(section => ({ ...section, spoiler: titleSpoiler || section.spoiler }))) };
}
function staticDocuments() {
    const sources = require('../data/site-knowledge.json');
    return sources.map(source => ({ ...source, revision: revision(source), chunks: chunkSections(source.sections) }));
}
module.exports = { revision, articleRevision, plainHtml, articleSections, chunkSections, articleDocument, staticDocuments };
