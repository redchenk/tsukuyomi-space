const config = require('../config');

const SITE_NAME = '月读空间';
const DEFAULT_DESCRIPTION = '月读空间是一个融合文章、留言广场、Live2D 房间与互动工具的二次元个人站。';
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

function plainArticleContent(article) {
    if (article?.content_format === 'block') {
        try {
            const blocks = JSON.parse(String(article.content || '[]'));
            if (Array.isArray(blocks)) {
                return blocks.map(block => block?.text || block?.content || block?.title || '').join('\n\n');
            }
        } catch (_) {
            return article.content || '';
        }
    }
    if (article?.content_format === 'html') {
        return String(article.content || '').replace(/<[^>]+>/g, ' ');
    }
    return article?.content || '';
}

function parseTags(value) {
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    } catch (_) {
        // Support older comma-separated tag values.
    }
    return String(value).split(/[,，]/).map(tag => tag.trim()).filter(Boolean);
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
    return stripMarkdown(article.excerpt || plainArticleContent(article) || DEFAULT_DESCRIPTION).slice(0, 160) || DEFAULT_DESCRIPTION;
}

function renderPlainContent(content, limit = 12) {
    return stripMarkdown(content)
        .split(/\n{2,}/)
        .map(line => line.trim())
        .filter(Boolean)
        .slice(0, limit)
        .map(line => `<p>${escapeHtml(line)}</p>`)
        .join('\n');
}

function articleSchema(article) {
    const url = articleUrl(article);
    const tags = parseTags(article.tags);
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
            name: SITE_NAME,
            logo: {
                '@type': 'ImageObject',
                url: DEFAULT_IMAGE
            }
        },
        mainEntityOfPage: url,
        inLanguage: 'zh-CN',
        keywords: tags.join(','),
        articleSection: article.category || ''
    };
}

function renderArticleHtml(article) {
    const title = `${article.title} | ${SITE_NAME}`;
    const description = articleDescription(article);
    const url = articleUrl(article);
    const image = absoluteUrl(article.cover_image || DEFAULT_IMAGE);
    const body = renderPlainContent(plainArticleContent(article) || article.excerpt || '');

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
  <meta property="og:site_name" content="${SITE_NAME}">
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
    a{color:#4d73d9} h1{margin:0 0 12px;font-size:clamp(2rem,5vw,3.4rem);line-height:1.18}.meta{color:#5f7088;margin-bottom:24px}.cover{width:100%;border-radius:18px;margin:20px 0;object-fit:cover}.enter{display:inline-flex;margin-top:24px;padding:10px 16px;border-radius:999px;background:#7b8cf6;color:white;text-decoration:none}
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

function renderStageHtml(articles = []) {
    const title = `主舞台 | ${SITE_NAME}`;
    const description = '浏览月读空间的文章、公告、技术记录与创作日志，内容包括 Live2D、AI 角色、个人网站开发、二次元网页设计与日常记录。';
    const url = absoluteUrl('/stage');
    const itemList = articles.slice(0, 24).map((article, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: articleUrl(article),
        name: article.title
    }));
    const listHtml = articles.slice(0, 24).map(article => `
      <a class="card" href="${escapeHtml(articlePath(article))}">
        ${article.cover_image ? `<img src="${escapeHtml(article.cover_image)}" alt="${escapeHtml(article.title)}" loading="lazy" decoding="async">` : ''}
        <span class="meta">${escapeHtml(article.category || '文章')} · ${escapeHtml(article.publish_date || article.created_at || '')}</span>
        <h2>${escapeHtml(article.title)}</h2>
        <p>${escapeHtml(articleDescription(article))}</p>
      </a>
    `).join('');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${escapeHtml(url)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(DEFAULT_IMAGE)}">
  <script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: title,
        description,
        url,
        inLanguage: 'zh-CN',
        mainEntity: {
            '@type': 'ItemList',
            itemListElement: itemList
        }
    })}</script>
  <style>
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#25314a;background:#f5f8ff;line-height:1.7}
    main{width:min(1060px,calc(100% - 32px));margin:48px auto}.hero{padding:32px;border:1px solid rgba(132,167,205,.32);border-radius:24px;background:rgba(255,255,255,.82);box-shadow:0 24px 80px rgba(79,109,150,.13)}
    h1{margin:0 0 10px;font-size:clamp(2rem,5vw,3.8rem);line-height:1.12}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin-top:24px}.card{display:grid;gap:10px;min-height:210px;padding:18px;border:1px solid rgba(132,167,205,.28);border-radius:20px;background:rgba(255,255,255,.76);color:inherit;text-decoration:none;overflow:hidden}.card img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:14px}.card h2{margin:0;font-size:1.12rem}.card p{margin:0;color:#62708a}.meta{color:#7b86a0;font-size:.82rem}.enter{display:inline-flex;margin-top:18px;padding:10px 16px;border-radius:999px;background:#7b8cf6;color:white;text-decoration:none}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <h1>主舞台</h1>
      <p>${escapeHtml(description)}</p>
      <a class="enter" href="/stage?spa=1">进入互动主舞台</a>
    </section>
    <section class="grid" aria-label="月读空间文章列表">
      ${listHtml || '<p>暂时还没有公开文章。</p>'}
    </section>
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
    renderStageHtml,
    renderNotFoundHtml
};
