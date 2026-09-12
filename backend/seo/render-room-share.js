const { safeJsonForHtml } = require('../services/html-sanitizer');

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function replaceTag(html, pattern, replacement) {
    return pattern.test(html) ? html.replace(pattern, replacement) : html.replace('</head>', `    ${replacement}\n</head>`);
}

function renderRoomShareHtml({ share, indexHtml, origin }) {
    const path = `/room/shared/${encodeURIComponent(share.shareKey)}`;
    const url = `${origin}${path}`;
    const image = share.ogImageUrl ? new URL(share.ogImageUrl, origin).toString() : `${origin}/assets/icons/icon-512.png`;
    const title = `${share.title} | 月读空间`;
    const description = `“${String(share.assistantMessage || '').replace(/\s+/g, ' ').trim().slice(0, 150)}” 来自${share.author || '访客'}与八千代的对话。`;
    const schema = safeJsonForHtml({
        '@context': 'https://schema.org',
        '@type': 'SocialMediaPosting',
        headline: share.title,
        description,
        url,
        image,
        author: { '@type': 'Person', name: share.author || '月读空间访客' },
        datePublished: share.createdAt
    });
    let html = String(indexHtml || '');
    html = replaceTag(html, /<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
    html = replaceTag(html, /<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${escapeHtml(description)}">`);
    html = replaceTag(html, /<meta\s+name="robots"[^>]*>/i, '<meta name="robots" content="noindex,nofollow,max-image-preview:large">');
    html = replaceTag(html, /<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${escapeHtml(url)}">`);
    html = replaceTag(html, /<meta\s+property="og:type"[^>]*>/i, '<meta property="og:type" content="article">');
    html = replaceTag(html, /<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${escapeHtml(title)}">`);
    html = replaceTag(html, /<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${escapeHtml(description)}">`);
    html = replaceTag(html, /<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${escapeHtml(url)}">`);
    html = replaceTag(html, /<meta\s+property="og:image"[^>]*>/i, `<meta property="og:image" content="${escapeHtml(image)}">`);
    html = replaceTag(html, /<meta\s+name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${escapeHtml(title)}">`);
    html = replaceTag(html, /<meta\s+name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${escapeHtml(description)}">`);
    html = replaceTag(html, /<meta\s+name="twitter:image"[^>]*>/i, `<meta name="twitter:image" content="${escapeHtml(image)}">`);
    html = replaceTag(html, /<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/i, `<script type="application/ld+json">${schema}</script>`);
    return html;
}

module.exports = { renderRoomShareHtml };
