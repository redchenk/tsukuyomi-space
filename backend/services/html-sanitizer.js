const sanitizeHtmlLibrary = require('sanitize-html');

const ALLOWED_TAGS = [
    'p', 'br', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'ul', 'ol', 'li',
    'pre', 'code', 'strong', 'em', 'del', 'hr', 'a', 'figure', 'figcaption',
    'img', 'video', 'audio', 'source', 'iframe', 'span', 'div',
    'table', 'thead', 'tbody', 'tr', 'th', 'td'
];

function safeHttpsUrl(value) {
    try {
        const url = new URL(String(value || ''));
        return url.protocol === 'https:' ? url.toString() : '';
    } catch (_) {
        return '';
    }
}

function iframeSandbox(url) {
    const tokens = ['allow-scripts', 'allow-forms', 'allow-popups', 'allow-popups-to-escape-sandbox', 'allow-presentation'];
    try {
        if (new URL(url).hostname.toLowerCase() === 'player.bilibili.com') tokens.push('allow-same-origin');
    } catch (_) {
        // The caller removes invalid iframe URLs.
    }
    return tokens.join(' ');
}

function sanitizeRenderedHtml(html) {
    return sanitizeHtmlLibrary(String(html || ''), {
        allowedTags: ALLOWED_TAGS,
        allowedAttributes: {
            '*': ['class', 'aria-label'],
            a: ['href', 'target', 'rel', 'title'],
            img: ['src', 'alt', 'title', 'loading', 'decoding'],
            video: ['src', 'poster', 'controls', 'preload', 'playsinline'],
            audio: ['src', 'controls', 'preload'],
            source: ['src', 'type'],
            iframe: ['src', 'title', 'loading', 'height', 'sandbox', 'referrerpolicy', 'allow', 'allowfullscreen'],
            th: ['colspan', 'rowspan', 'scope'],
            td: ['colspan', 'rowspan']
        },
        allowedSchemes: ['http', 'https', 'mailto'],
        allowedSchemesByTag: {
            img: ['http', 'https', 'data'],
            iframe: ['https'],
            video: ['http', 'https'],
            audio: ['http', 'https'],
            source: ['http', 'https']
        },
        allowProtocolRelative: false,
        enforceHtmlBoundary: true,
        nonTextTags: ['script', 'style', 'textarea', 'option', 'xmp', 'noembed', 'noframes', 'noscript'],
        transformTags: {
            a(tagName, attribs) {
                const external = /^https?:\/\//i.test(attribs.href || '');
                return {
                    tagName,
                    attribs: {
                        ...attribs,
                        ...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})
                    }
                };
            },
            iframe(tagName, attribs) {
                const src = safeHttpsUrl(attribs.src);
                if (!src) return { tagName: 'span', attribs: {} };
                const height = Math.min(Math.max(Number.parseInt(attribs.height, 10) || 420, 220), 900);
                return {
                    tagName,
                    attribs: {
                        src,
                        title: String(attribs.title || 'Embedded content').slice(0, 160),
                        loading: 'lazy',
                        height: String(height),
                        sandbox: iframeSandbox(src),
                        referrerpolicy: 'strict-origin-when-cross-origin',
                        allow: 'fullscreen; picture-in-picture; encrypted-media',
                        allowfullscreen: ''
                    }
                };
            }
        }
    });
}

function safeJsonForHtml(value) {
    return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => {
        return `\\u${character.codePointAt(0).toString(16).padStart(4, '0')}`;
    });
}

module.exports = {
    sanitizeRenderedHtml,
    safeJsonForHtml
};
