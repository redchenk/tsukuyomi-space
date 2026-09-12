const config = require('../config');
const { safeJsonForHtml } = require('../services/html-sanitizer');
const { articlePath } = require('./render-article');
const { wikiEntryPath } = require('./wiki-content');

const SITE_NAME = '月读空间';
const DEFAULT_IMAGE = `${config.publicSiteUrl}/assets/icons/icon-512.png`;

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function absoluteUrl(value = '/') {
    try {
        const url = new URL(String(value || '/'), config.publicSiteUrl);
        return ['http:', 'https:'].includes(url.protocol) ? url.toString() : config.publicSiteUrl;
    } catch (_) {
        return config.publicSiteUrl;
    }
}

function externalLinkAttrs(href) {
    try {
        return new URL(href, config.publicSiteUrl).origin === new URL(config.publicSiteUrl).origin
            ? ''
            : ' target="_blank" rel="noopener noreferrer"';
    } catch (_) {
        return '';
    }
}

function renderSeoCollectionPage({
    path,
    title,
    description,
    keywords = [],
    heading = title,
    image = DEFAULT_IMAGE,
    items = [],
    actions = []
}) {
    const url = absoluteUrl(path);
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
    const primaryImage = absoluteUrl(image || items.find(item => item.image)?.image || DEFAULT_IMAGE);
    const normalizedItems = items.filter(item => item?.title && item?.href);
    const itemList = normalizedItems.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: absoluteUrl(item.href),
        name: item.title,
        description: item.description || undefined,
        image: item.image ? absoluteUrl(item.image) : undefined
    }));
    const cards = normalizedItems.map((item) => {
        const href = absoluteUrl(item.href);
        return `
      <a class="card" href="${escapeHtml(href)}"${externalLinkAttrs(href)}>
        ${item.image ? `<img${item.imageKind === 'avatar' ? ' class="avatar"' : ''} src="${escapeHtml(absoluteUrl(item.image))}" alt="${escapeHtml(item.imageAlt || item.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}
        ${item.meta ? `<span>${escapeHtml(item.meta)}</span>` : ''}
        <h2>${escapeHtml(item.title)}</h2>
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
      </a>
    `;
    }).join('');
    const actionLinks = actions.map((action) => {
        const href = absoluteUrl(action.href);
        return `<a href="${escapeHtml(href)}"${externalLinkAttrs(href)}>${escapeHtml(action.label)}</a>`;
    }).join('');
    const schema = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: fullTitle,
        description,
        url,
        inLanguage: 'zh-CN',
        keywords: keywords.join(', '),
        primaryImageOfPage: primaryImage,
        mainEntity: {
            '@type': 'ItemList',
            numberOfItems: itemList.length,
            itemListElement: itemList
        }
    };

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="keywords" content="${escapeHtml(keywords.join(', '))}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="${escapeHtml(url)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${escapeHtml(fullTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(primaryImage)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(fullTitle)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(primaryImage)}">
  <script type="application/ld+json">${safeJsonForHtml(schema)}</script>
  <style>
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#24324a;background:#f6f9ff;line-height:1.7}main{width:min(1120px,calc(100% - 32px));margin:48px auto}.hero{padding:32px;border:1px solid #bfd1e6;border-radius:20px;background:#fff;box-shadow:0 20px 64px rgba(69,94,132,.12)}h1{margin:0 0 12px;font-size:clamp(2rem,5vw,3.6rem);line-height:1.14}.hero p{max-width:760px;color:#53647d}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}.actions a{padding:9px 14px;border-radius:999px;background:#6578dd;color:#fff;text-decoration:none}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-top:24px}.card{display:grid;align-content:start;gap:9px;min-height:150px;padding:16px;border:1px solid #cbd9ea;border-radius:18px;background:#fff;color:inherit;text-decoration:none;overflow:hidden}.card img{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:12px}.card img.avatar{width:56px;aspect-ratio:1;object-fit:contain}.card h2{margin:0;font-size:1.08rem;line-height:1.35}.card p{margin:0;color:#5d6d84}.card span{color:#7b879a;font-size:.82rem}@media(max-width:600px){main{margin:24px auto}.hero{padding:22px}.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main>
    <header class="hero">
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(description)}</p>
      <nav class="actions" aria-label="页面入口">${actionLinks}</nav>
    </header>
    <section class="grid" aria-label="${escapeHtml(heading)}内容">
      ${cards || '<p>公开内容正在整理中。</p>'}
    </section>
  </main>
</body>
</html>`;
}

function renderHubHtml(articles = []) {
    const destinations = [
        { href: '/stage', title: '主舞台文章', description: '公告、技术记录、二创与创作日志。' },
        { href: '/wiki', title: '超时空辉夜姬 Wiki', description: '角色、世界观、音乐和发行资料。' },
        { href: '/room', title: '月见八千代 Live2D 房间', description: '高清 Live2D、AI 对话、语音与长期记忆。' },
        { href: '/gallery', title: '公开图库', description: '用户公开上传的插画与站点影像。' },
        { href: '/pixel', title: '192×108 像素画工坊', description: '在线创作、分享与浏览像素作品。' },
        { href: '/game', title: '辉夜快跑', description: '辉夜姬主题节奏跑酷游戏。' },
        { href: '/friend-links', title: '友链导航', description: '月读空间审核收录的友好站点。' }
    ];
    const latestArticles = articles.slice(0, 12).map(article => ({
        href: articlePath(article),
        title: article.title,
        description: article.excerpt || '',
        meta: article.category || '文章',
        image: article.cover_image || ''
    }));
    return renderSeoCollectionPage({
        path: '/hub',
        title: '月读空间中枢大厅',
        heading: '月读空间中枢大厅',
        description: '从中枢大厅浏览主舞台文章、超时空辉夜姬 Wiki、公开图库、像素画、友链和月见八千代 Live2D 房间。',
        keywords: ['月读空间首页', '月读空间中枢大厅', '超时空辉夜姬 Wiki', '月见八千代 Live2D', '像素画社区'],
        items: [...destinations, ...latestArticles],
        actions: [{ href: '/hub?spa=1', label: '进入互动中枢大厅' }]
    });
}

function renderPixelHtml(artworks = []) {
    const items = artworks.map(artwork => ({
        href: `/pixel?art=${encodeURIComponent(artwork.id)}`,
        title: artwork.title || `像素作品 ${artwork.id}`,
        description: artwork.description || '月读空间用户公开分享的 192×108 像素作品。',
        meta: `${artwork.author || '匿名创作者'} · ${Number(artwork.width || 192)}×${Number(artwork.height || 108)}`
    }));
    return renderSeoCollectionPage({
        path: '/pixel',
        title: '192×108 月光像素画工坊',
        heading: '192×108 月光像素画工坊',
        description: '使用月读空间在线像素画工具创作固定 192×108 画布，公开分享、浏览、点赞并导出像素作品。',
        keywords: ['在线像素画', '192×108 像素画', '月光像素工坊', 'Pixel Art 编辑器', '像素画社区'],
        items,
        actions: [{ href: '/pixel?spa=1', label: '打开像素画工具' }]
    });
}

function renderGameHtml() {
    return renderSeoCollectionPage({
        path: '/game',
        title: '辉夜快跑在线音游',
        heading: '辉夜快跑',
        description: '在月读空间游玩辉夜快跑，体验为桌面键盘与移动端触控优化的辉夜姬主题节奏跑酷游戏。',
        keywords: ['辉夜快跑', '辉夜姬音游', '在线节奏游戏', '月读空间游戏', 'Kaguya Run'],
        actions: [{ href: '/game?spa=1', label: '开始游戏' }]
    });
}

function renderPixelArtworkHtml(artwork) {
    const id = encodeURIComponent(artwork.id);
    const path = `/pixel?art=${id}`;
    const dimensions = `${Number(artwork.width || artwork.size || 192)}×${Number(artwork.height || artwork.size || 108)}`;
    const description = artwork.description || `${artwork.author || '月读空间用户'}创作的 ${dimensions} 像素作品。`;
    const version = encodeURIComponent(String(artwork.updated_at || artwork.created_at || artwork.id));
    return renderSeoCollectionPage({
        path,
        title: `${artwork.title || '像素作品'} - 月读空间像素画`,
        heading: artwork.title || '月读空间像素作品',
        description,
        keywords: [artwork.title || '像素画', '在线像素画', dimensions, '月读空间像素画', 'Pixel Art'],
        image: `/api/pixel-art/${id}/image.png?v=${version}`,
        items: [{
            href: `${path}&spa=1`,
            title: artwork.title || '像素作品',
            description,
            meta: `${artwork.author || '匿名创作者'} · ${dimensions}`,
            image: `/api/pixel-art/${id}/image.png?v=${version}`
        }],
        actions: [{ href: `${path}&spa=1`, label: '查看并继续创作' }]
    });
}

function renderWikiHtml(entries = []) {
    return renderSeoCollectionPage({
        path: '/wiki',
        title: '超时空辉夜姬角色与世界观 Wiki',
        heading: '超时空辉夜姬角色与世界观 Wiki',
        description: '非官方粉丝资料库，完整整理超时空辉夜姬作品概览、角色、月读世界观、音乐、发行与衍生词条。',
        keywords: ['超时空辉夜姬 Wiki', '超かぐや姫', 'Cosmic Princess Kaguya', '超时空辉夜姬角色', '月读世界观'],
        image: '/assets/images/wiki/wiki-hero-original.webp',
        items: entries.map(entry => ({
            href: wikiEntryPath(entry),
            title: entry.title,
            description: entry.description,
            meta: entry.kind === 'character' ? '角色词条' : '世界观／音乐词条',
            image: entry.image
        })),
        actions: [{ href: '/wiki?spa=1', label: '进入互动 Wiki' }]
    });
}

function renderWikiEntryHtml(entry) {
    const kindLabel = entry.kind === 'character' ? '角色词条' : '世界观／音乐词条';
    return renderSeoCollectionPage({
        path: wikiEntryPath(entry),
        title: `${entry.title} - ${kindLabel} - 超时空辉夜姬 Wiki`,
        heading: entry.title,
        description: entry.description,
        keywords: [...entry.keywords, '超时空辉夜姬 Wiki'],
        image: entry.image,
        items: [
            { href: '/wiki', title: '超时空辉夜姬 Wiki', description: '返回角色与世界观词条总览。' },
            { href: '/topics/cosmic-princess-kaguya-wiki', title: '角色与世界观专题', description: '浏览 Wiki 角色、设定、音乐与相关公开文章。' }
        ],
        actions: [{ href: `${wikiEntryPath(entry)}?spa=1`, label: '阅读完整互动词条' }]
    });
}

function renderFriendLinksHtml(links = []) {
    const statusLabels = {
        online: '在线',
        slow: '响应较慢',
        restricted: '访问受限',
        offline: '暂时离线',
        unchecked: '等待检测'
    };
    return renderSeoCollectionPage({
        path: '/friend-links',
        title: '月读空间友链导航',
        heading: '月读空间友链导航',
        description: '浏览月读空间审核收录的公开友好站点、独立博客和创作伙伴，发现更多值得访问的网站。',
        keywords: ['月读空间友链', '独立博客友链', '二次元个人站', '友好网站', '网站导航'],
        items: links.map(link => ({
            href: link.url,
            title: link.name,
            description: link.description || '月读空间收录的友好站点。',
            image: link.screenshot_url || link.avatar_url || '',
            imageKind: link.screenshot_url ? 'preview' : 'avatar',
            imageAlt: link.screenshot_url ? `${link.name} 站点预览` : `${link.name} 站点头像`,
            meta: `${statusLabels[link.monitor_status] || statusLabels.unchecked}${link.response_time_ms ? ` · ${link.response_time_ms}ms` : ''}`
        })),
        actions: [
            { href: '/friend-links?spa=1', label: '进入互动友链页' },
            { href: '/friend-links/apply', label: '申请友链' }
        ]
    });
}

function renderFriendLinksSpaHtml(indexHtml = '', links = []) {
    const anchors = links.map((link) => {
        try {
            const href = new URL(String(link?.url || ''));
            if (!['http:', 'https:'].includes(href.protocol) || !link?.name) return '';
            return `<li><a href="${escapeHtml(href.toString())}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.name)}</a></li>`;
        } catch (_) {
            return '';
        }
    }).filter(Boolean).join('');
    const fallback = `
    <main data-server-friend-links aria-label="公开友链">
      <h1>月读空间友链</h1>
      <ul>${anchors}</ul>
      <a href="/friend-links/apply">申请友链</a>
    </main>`;
    return String(indexHtml || '').replace(
        /<div\s+id=["']app["']\s*><\/div>/i,
        `<div id="app">${fallback}</div>`
    );
}

module.exports = {
    renderSeoCollectionPage,
    renderGameHtml,
    renderHubHtml,
    renderPixelArtworkHtml,
    renderPixelHtml,
    renderWikiHtml,
    renderWikiEntryHtml,
    renderFriendLinksHtml,
    renderFriendLinksSpaHtml
};
