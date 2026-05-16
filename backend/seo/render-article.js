const config = require('../config');

const DEFAULT_IMAGE = `${config.publicSiteUrl}/assets/icons/icon-512.png`;

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function stripMarkdown(value) {
    return String(value || '')
        .replace(/!\[[^\]]*]\([^)]+\)/g, '')
        .replace(/\[[^\]]+]\([^)]+\)/g, match => match.replace(/^\[|\]\([^)]+\)$/g, ''))
        .replace(/[#>*_`~|]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function absoluteUrl(pathname) {
    if (!pathname) return config.publicSiteUrl;
    if (/^https?:\/\//i.test(pathname)) return pathname;
    return `${config.publicSiteUrl}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function articlePath(article) {
    return `/articles/${encodeURIComponent(article.id)}${article.slug ? `/${encodeURIComponent(article.slug)}` : ''}`;
}

function articleUrl(article) {
    return absoluteUrl(articlePath(article));
}

function articleDescription(article) {
    return stripMarkdown(article.excerpt || article.content || '月读空间文章正文与评论。').slice(0, 160) || '月读空间文章正文与评论。';
}

function renderPlainContent(content) {
    return stripMarkdown(content)
        .split(/\n{2,}/)
        .map(line => line.trim())
        .filter(Boolean)
        .slice(0, 12)
        .map(line => `<p>${escapeHtml(line)}</p>`)
        .join('\n');
}

function articleSchema(article) {
    const url = articleUrl(article);
    return {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: article.title,
        description: articleDescription(article),
        image: [absoluteUrl(article.cover_image || DEFAULT_IMAGE)],
        datePublished: article.publish_date || article.created_at,
        dateModified: article.updated_at || article.created_at || article.publish_date,
        author: {
            '@type': 'Person',
            name: article.author_username || 'redchenk'
        },
        publisher: {
            '@type': 'Organization',
            name: '月读空间',
            logo: {
                '@type': 'ImageObject',
                url: DEFAULT_IMAGE
            }
        },
        mainEntityOfPage: url,
        inLanguage: 'zh-CN',
        keywords: Array.isArray(article.tags) ? article.tags.join(',') : '',
        articleSection: article.category || ''
    };
}

function renderArticleHtml(article) {
    const title = `${article.title} | 月读空间`;
    const description = articleDescription(article);
    const url = articleUrl(article);
    const image = absoluteUrl(article.cover_image || DEFAULT_IMAGE);
    const body = renderPlainContent(article.content || article.excerpt || '');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${escapeHtml(url)}">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/icons/icon-180.png">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="月读空间">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  <script type="application/ld+json">${JSON.stringify(articleSchema(article))}</script>
  <style>
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#24324a;background:#f7fbff;line-height:1.78}
    main{width:min(860px,calc(100% - 32px));margin:48px auto;padding:32px;border:1px solid rgba(132,167,205,.35);border-radius:24px;background:rgba(255,255,255,.84);box-shadow:0 24px 80px rgba(79,109,150,.14)}
    a{color:#4d73d9} h1{margin:0 0 12px;font-size:clamp(2rem,5vw,3.4rem);line-height:1.18} .meta{color:#5f7088;margin-bottom:24px}.cover{width:100%;border-radius:18px;margin:20px 0;object-fit:cover}.enter{display:inline-flex;margin-top:24px;padding:10px 16px;border-radius:999px;background:#7b8cf6;color:white;text-decoration:none}
  </style>
</head>
<body>
  <main>
    <article>
      <h1>${escapeHtml(article.title)}</h1>
      <div class="meta">${escapeHtml(article.category || '文章')} · ${escapeHtml(article.publish_date || article.created_at || '')} · ${escapeHtml(article.author_username || 'redchenk')}</div>
      ${article.cover_image ? `<img class="cover" src="${escapeHtml(article.cover_image)}" alt="${escapeHtml(article.title)}" loading="eager" decoding="async">` : ''}
      <p><strong>${escapeHtml(description)}</strong></p>
      ${body}
      <a class="enter" href="/article?id=${encodeURIComponent(article.id)}&spa=1">进入完整互动文章页</a>
    </article>
  </main>
</body>
</html>`;
}

function renderNotFoundHtml() {
    return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex,nofollow"><title>文章不存在 | 月读空间</title></head><body><main><h1>文章不存在</h1><p>这篇文章可能已经离开月读空间。</p><a href="/stage">返回主舞台</a></main></body></html>`;
}

module.exports = {
    articlePath,
    articleUrl,
    renderArticleHtml,
    renderNotFoundHtml
};
