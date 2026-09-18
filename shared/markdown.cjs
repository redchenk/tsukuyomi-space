// One parser for the editor, reader and server-rendered article. Author HTML is
// escaped; the only HTML tokens are emitted by the bounded rules below.
const MarkdownIt = require('markdown-it');
const footnote = require('markdown-it-footnote');
const container = require('markdown-it-container');
const mark = require('markdown-it-mark');
const sub = require('markdown-it-sub');
const sup = require('markdown-it-sup');
const abbr = require('markdown-it-abbr');
const katex = require('katex');
const hljs = require('highlight.js/lib/core');
const media = require('./markdown-media.cjs');
const { escapeHtml, escapeAttr } = media;
for (const [name, language] of Object.entries({
    javascript: require('highlight.js/lib/languages/javascript'),
    typescript: require('highlight.js/lib/languages/typescript'),
    python: require('highlight.js/lib/languages/python'),
    json: require('highlight.js/lib/languages/json'),
    bash: require('highlight.js/lib/languages/bash'),
    css: require('highlight.js/lib/languages/css'),
    xml: require('highlight.js/lib/languages/xml'),
    sql: require('highlight.js/lib/languages/sql'),
    java: require('highlight.js/lib/languages/java'),
    cpp: require('highlight.js/lib/languages/cpp'),
    yaml: require('highlight.js/lib/languages/yaml'),
    markdown: require('highlight.js/lib/languages/markdown'),
    diff: require('highlight.js/lib/languages/diff')
})) hljs.registerLanguage(name, language);

const md = new MarkdownIt({ html: false, breaks: true, linkify: true, maxNesting: 24 })
    .use(footnote).use(mark).use(sub).use(sup).use(abbr);
const labels = { note: 'Note', info: 'Info', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution', details: 'Details' };
for (const type of [...Object.keys(labels), 'gallery']) {
    md.use(container, type, {
        validate: info => new RegExp(`^${type}(?:\\s+[^\\n]*|\\[[^\\n]*\\])?$`).test(info.trim()),
        render(tokens, idx) {
            if (tokens[idx].nesting === -1) return type === 'details' ? '</div></details>\n' : '</div>\n';
            const raw = tokens[idx].info.trim().slice(type.length).trim();
            const title = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;
            if (type === 'gallery') return '<div class="markdown-gallery">\n';
            if (type === 'details') return `<details class="markdown-details"><summary>${escapeHtml(title || labels[type])}</summary><div>\n`;
            return `<div class="markdown-callout markdown-callout-${type}"><p class="markdown-callout-title">${escapeHtml(title || labels[type])}</p>\n`;
        }
    });
}

// Preserve existing media directives and pasted iframe snippets without enabling HTML.
md.block.ruler.before('fence', 'ts_media', (state, start, end, silent) => {
    if (state.sCount[start] - state.blkIndent >= 4) return false;
    const line = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]).trim();
    const directive = line.match(/^::(bilibili|media|iframe)\[([^\]\n]*)\]\(([^\n]*)\)$/i);
    if (!directive && !media.isRawIframe(line)) return false;
    if (silent) return true;
    let html = '';
    if (directive) {
        const { target, title } = media.splitTargetAndTitle(directive[3]);
        const label = directive[2] || title;
        const type = directive[1].toLowerCase();
        if (type === 'bilibili') html = media.renderBilibiliEmbed(target, label);
        if (type === 'media') html = media.renderMediaCard(target, label, title && directive[2] ? title : '');
        if (type === 'iframe') html = media.renderIframeEmbed(target, label, /^\d+$/.test(title) ? title : '');
    } else html = media.renderIframeEmbed(line, media.iframeAttr(line, 'title') || media.iframeAttr(line, 'aria-label') || 'Embedded content', media.iframeAttr(line, 'height'));
    const token = state.push('html_block', '', 0);
    token.content = html;
    token.map = [start, start + 1];
    state.line = start + 1;
    return true;
}, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });

function mathHtml(source, displayMode) {
    // MathML is native, accessible and needs no font downloads or browser runtime.
    if (source.length > 4000) return `<code>${escapeHtml(source)}</code>`;
    try {
        return katex.renderToString(source, { displayMode, output: 'mathml', trust: false, strict: 'ignore', throwOnError: true, maxExpand: 300, maxSize: 10, macros: {} });
    } catch (_) {
        return `<code class="markdown-math-error" title="Check formula syntax">${escapeHtml(source)}</code>`;
    }
}
md.block.ruler.before('fence', 'ts_math', (state, start, end, silent) => {
    if (state.sCount[start] - state.blkIndent >= 4) return false;
    const line = n => state.src.slice(state.bMarks[n] + state.tShift[n], state.eMarks[n]);
    const first = line(start).trim();
    if (!first.startsWith('$$')) return false;
    let stop = start, body;
    if (first.length > 4 && first.endsWith('$$')) body = first.slice(2, -2);
    else if (first === '$$') {
        for (stop = start + 1; stop < end && line(stop).trim() !== '$$'; stop++);
        if (stop === end) return false;
        body = Array.from({ length: stop - start - 1 }, (_, n) => line(start + n + 1)).join('\n');
    } else return false;
    if (silent) return true;
    const token = state.push('html_block', '', 0);
    token.content = `<div class="markdown-math">${mathHtml(body, true)}</div>\n`;
    token.map = [start, stop + 1];
    state.line = stop + 1;
    return true;
}, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
md.inline.ruler.before('escape', 'ts_math_inline', (state, silent) => {
    const start = state.pos;
    if (state.src[start] !== '$' || state.src[start + 1] === '$' || /\s/.test(state.src[start + 1] || ' ')) return false;
    let end = start + 1;
    for (; end < state.posMax; end++) {
        if (state.src[end] === '\n') return false;
        if (state.src[end] === '\\') { end++; continue; }
        if (state.src[end] === '$') break;
    }
    if (end === state.posMax || /\s/.test(state.src[end - 1]) || /\d/.test(state.src[end + 1] || '')) return false;
    if (!silent) state.push('html_inline', '', 0).content = mathHtml(state.src.slice(start + 1, end), false);
    state.pos = end + 1;
    return true;
});
md.inline.ruler.before('emphasis', 'ts_spoiler', (state, silent) => {
    const start = state.pos;
    if (!state.src.startsWith(':spoiler[', start)) return false;
    const end = state.md.helpers.parseLinkLabel(state, start + 8, false);
    if (end < 0) return false;
    if (!silent) {
        const text = state.src.slice(start + 9, end);
        // Hidden text is escaped rather than interpreted as interactive markup.
        state.push('html_inline', '', 0).content = `<button type="button" class="markdown-spoiler" aria-expanded="false" aria-label="${state.env.lang === 'en' ? 'Reveal spoiler' : '点击显示剧透内容'}"><span aria-hidden="true">${escapeHtml(text)}</span></button>`;
    }
    state.pos = end + 1;
    return true;
});

md.core.ruler.after('inline', 'ts_article_blocks', state => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type === 'blockquote_open' && tokens[i + 1]?.type === 'paragraph_open') {
            const inline = tokens[i + 2];
            const alert = inline?.content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\n|$)/);
            if (alert) {
                token.attrJoin('class', `markdown-callout markdown-callout-${alert[1].toLowerCase()}`);
                inline.content = inline.content.slice(alert[0].length);
                inline.children = [];
                state.md.inline.parse(inline.content, state.md, state.env, inline.children);
                const heading = new state.Token('html_block', '', 0);
                heading.content = `<p class="markdown-callout-title">${labels[alert[1].toLowerCase()]}</p>\n`;
                tokens.splice(i + 1, 0, heading);
            }
        }
        if (token.type === 'inline' && tokens[i - 1]?.type === 'paragraph_open' && tokens[i - 2]?.type === 'list_item_open') {
            const task = token.children?.[0]?.type === 'text' && token.children[0].content.match(/^\[([ xX])\] /);
            if (task) {
                tokens[i - 2].attrJoin('class', 'markdown-task');
                token.children[0].content = token.children[0].content.slice(4);
                const check = new state.Token('html_inline', '', 0);
                check.content = `<span class="markdown-task-check" role="img" aria-label="${task[1] === ' ' ? 'Incomplete' : 'Complete'}">${task[1] === ' ' ? '☐' : '☑'}</span> `;
                token.children.unshift(check);
            }
        }
        if (token.type === 'inline') {
            const marks = [];
            (token.children || []).forEach((child, j, children) => {
                if (child.type === 'mark_open') { marks.push(child); child.attrSet('class', 'markdown-mark markdown-mark-primary'); }
                if (child.type === 'mark_close') {
                    const opening = marks.pop(), next = children[j + 1];
                    const variant = next?.type === 'text' && next.content.match(/^\{\.(primary|secondary|tertiary|error|tip)\}/);
                    if (opening && variant) { opening.attrSet('class', `markdown-mark markdown-mark-${variant[1]}`); next.content = next.content.slice(variant[0].length); }
                }
            });
        }
    }
});
const normalLink = md.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    if (/^https?:\/\//i.test(tokens[idx].attrGet('href') || '')) {
        tokens[idx].attrSet('target', '_blank'); tokens[idx].attrSet('rel', 'noopener noreferrer');
    }
    return normalLink(tokens, idx, options, env, self);
};
const normalImage = md.renderer.rules.image;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
    tokens[idx].attrSet('loading', 'lazy'); tokens[idx].attrSet('decoding', 'async'); tokens[idx].attrSet('data-image-bloom', '');
    return normalImage(tokens, idx, options, env, self);
};
md.renderer.rules.table_open = () => '<div class="markdown-table-scroll" tabindex="0" role="region" aria-label="Table"><table>\n';
md.renderer.rules.table_close = () => '</table></div>\n';
md.renderer.rules.fence = (tokens, idx, options, env) => {
    const token = tokens[idx];
    const info = md.utils.unescapeAll(token.info).trim();
    const language = info.split(/\s+/)[0].toLowerCase();
    const title = info.match(/\btitle="([^"\n]*)"/)?.[1] || language || 'text';
    let code = escapeHtml(token.content);
    if (token.content.length <= 20000 && language && hljs.getLanguage(language)) {
        try { code = hljs.highlight(token.content, { language, ignoreIllegals: true }).value; } catch (_) { /* Keep readable source. */ }
    }
    return `<figure class="markdown-code"><figcaption><span>${escapeHtml(title)}</span><button type="button" data-md-copy aria-label="${env.lang === 'en' ? 'Copy code' : '复制代码'}">${env.lang === 'en' ? 'Copy' : '复制'}</button></figcaption><pre><code class="hljs${/^[\w+-]+$/.test(language) ? ' language-' + escapeAttr(language) : ''}">${code}</code></pre></figure>\n`;
};
// Prefix every generated footnote id to avoid collisions with site navigation.
md.renderer.rules.footnote_anchor_name = (tokens, idx) => `article-footnote-${tokens[idx].meta.id + 1}`;

function renderMarkdown(source, { lang = 'zh' } = {}) {
    return md.render(String(source || ''), { lang });
}
module.exports = { renderMarkdown };
