const { parseDocument, DomUtils } = require('htmlparser2');
const { safeJsonForHtml } = require('../services/html-sanitizer');

// The first paint includes the editorial heading. Rich embeds in the reading
// fallback stay inert until Vue mounts, or are displayed when JS is disabled.
function composePage(indexHtml, renderedHtml) {
    if (!indexHtml) return renderedHtml;
    const head = renderedHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
    const body = renderedHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '';
    const heading = body.match(/<h1(?:\s[^>]*)?>[^<]*<\/h1>/i)?.[0] || '';
    const readingBody = heading ? body.replace(heading, '') : body;
    const metadata = (head.match(/<title>[\s\S]*?<\/title>|<meta\b[^>]*>|<link\b[^>]*>|<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi) || [])
        .filter(tag => !/charset=|name="viewport"|rel="icon"|rel="apple-touch-icon"/i.test(tag))
        .map(tag => tag.replace(/<script /i, '<script data-seo-json="page" ')).join('\n');
    const stripped = indexHtml
        .replace(/<title>[\s\S]*?<\/title>/gi, '')
        .replace(/<meta\b[^>]*(?:name="(?:description|keywords|robots|twitter:[^"]*)"|property="og:[^"]*")[^>]*>/gi, '')
        .replace(/<link\b[^>]*rel="(?:canonical|alternate)"[^>]*>/gi, '')
        .replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, '');
    // Fallback styles are scoped and cannot affect the interactive site.
    const styles = '<style>[data-seo-fallback]{max-width:1100px;margin:32px auto;padding:24px;line-height:1.8;color:var(--text-main,#30334d);background:var(--card-bg,#fff);border:1px solid var(--border-color,#e3dff1);border-radius:24px;font-family:system-ui,sans-serif}[data-seo-fallback] img{max-width:100%;height:auto}[data-seo-fallback] .grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}[data-seo-fallback] a{color:var(--primary,#7457ad)}[data-seo-fallback] .card{padding:16px;border:1px solid var(--border-color,#e3dff1);border-radius:20px}[data-seo-fallback] .actions{display:flex;gap:16px;flex-wrap:wrap}</style>';
    return stripped.replace('</head>', () => `${metadata}\n${styles}</head>`)
        .replace(/<div\s+id=["']app["']\s*>\s*<\/div>/i, () => `<div id="app"><div data-seo-fallback>${heading}<noscript>${readingBody}</noscript></div></div>`);
}

function addDiscovery(html) {
    const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
    if (!canonical) return html;
    const parsed = new URL(canonical.replace(/&amp;/g, '&'));
    const origin = parsed.origin;
    const pathname = parsed.pathname + parsed.search;
    const website = { '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${origin}/#website`, name: '月读空间', alternateName: 'Tsukuyomi Space', url: `${origin}/`, inLanguage: 'zh-CN' };
    const title = html.match(/<title>([^<]*)<\/title>/i)?.[1] || '';
    const pageName = DomUtils.textContent(parseDocument(title)).replace(/ \| 月读空间$/, '');
    const breadcrumb = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: '月读空间', item: `${origin}/` }, ...(pathname === '/' ? [] : [{ '@type': 'ListItem', position: 2, name: pageName || '公开内容', item: parsed.href }])] };
    const scripts = [website, breadcrumb].map((value, i) => `<script type="application/ld+json" data-seo-json="${i ? 'breadcrumb' : 'website'}">${safeJsonForHtml(value)}</script>`).join('\n');
    const alternates = ['zh-Hans', 'en'].map((lang, i) => `<link rel="alternate" hreflang="${lang}" href="${i ? 'https://tsukuyomi-space.com' : origin}${pathname.replace(/&/g, '&amp;')}">`).join('\n');
    // Article slugs are translated independently; do not claim a wrong pair.
    return html.replace('</head>', () => `${scripts}\n${pathname.startsWith('/articles/') ? '' : alternates}\n<link rel="alternate" type="application/rss+xml" title="月读空间公开动态" href="${origin}/rss.xml"></head>`);
}
module.exports = { composePage, addDiscovery };
