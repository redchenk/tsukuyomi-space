const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('../config');
const articleRepository = require('../repositories/article-repository');
const assetRepository = require('../repositories/asset-repository');
const friendLinkRepository = require('../repositories/friend-link-repository');
const roomShareRepository = require('../repositories/room-share-repository');
const objectStorage = require('../services/object-storage');
const { articlePath, renderArticleHtml, renderGalleryHtml, renderNotFoundHtml, renderTopicLandingHtml } = require('../seo/render-article');
const { renderRoomShareHtml } = require('../seo/render-room-share');
const { WIKI_ENTRIES, WIKI_VERIFIED_AT, findWikiEntry, wikiEntryPath } = require('../seo/wiki-content');
const {
    renderFriendLinksHtml,
    renderGameHtml,
    renderPixelArtworkHtml,
    renderPixelHtml,
    renderWikiEntryHtml,
    renderWikiHtml
} = require('../seo/render-pages');

const { composePage, addDiscovery } = require('../seo/compose-page');
const { renderPublicPage, renderStagePage, renderProfilePage } = require('../seo/render-public');
const seoRepository = require('../repositories/seo-repository');
const indexNow = require('../services/indexnow');

function sharePageOrigin(req) {
    const allowedHosts = new Set(['yachiyo.hk', 'www.yachiyo.hk', 'tsukuyomi-space.com', 'www.tsukuyomi-space.com']);
    const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
    const requestHost = String(req.hostname || '').trim().toLowerCase();
    const host = allowedHosts.has(forwardedHost) ? forwardedHost : (allowedHosts.has(requestHost) ? requestHost : '');
    if (host) return `https://${host}`;
    try {
        return new URL(config.publicSiteUrl).origin;
    } catch (_) {
        return 'https://yachiyo.hk';
    }
}

const SEO_ROUTES = [
    { path: '/', priority: '1.0', changefreq: 'weekly' },
    { path: '/hub', priority: '0.9', changefreq: 'weekly' },
    { path: '/stage', priority: '0.9', changefreq: 'daily' },
    { path: '/plaza', priority: '0.8', changefreq: 'daily' },
    { path: '/room', priority: '0.8', changefreq: 'weekly' },
    { path: '/gallery', priority: '0.8', changefreq: 'daily' },
    { path: '/wiki', priority: '0.8', changefreq: 'monthly' },
    { path: '/friend-links', priority: '0.6', changefreq: 'weekly' },
    { path: '/reality', priority: '0.7', changefreq: 'weekly' },
    { path: '/download', priority: '0.7', changefreq: 'weekly' },
    { path: '/pixel', priority: '0.7', changefreq: 'weekly' },
    { path: '/game', priority: '0.7', changefreq: 'monthly' }
];

const TOPIC_ROUTES = [
    {
        path: '/topics/chou-kaguya-hime',
        title: '超时空辉夜姬资源、小说与二创',
        description: '月读空间整理超时空辉夜姬相关资源、小说翻译、电影入口、二创文章与公开图库，方便读者从一个稳定入口继续浏览。',
        keywords: ['超时空辉夜姬', '超かぐや姫', '超时空辉夜姬小说', '超时空辉夜姬二创', '月读空间'],
        match: ['超', '辉夜', '姫', '小说', '电影'],
        categories: ['传说', '二创'],
        points: ['小说、电影、二创与图库集中入口', '按主题阅读公开创作，了解作者与作品来源', '通过主舞台继续阅读完整互动文章'],
        actions: [
            { label: '浏览主舞台文章', href: '/stage' },
            { label: '查看公开图库', href: '/gallery' },
            { label: '进入月读广场', href: '/plaza' }
        ],
        priority: '0.8'
    },
    {
        path: '/topics/yachiyo-live2d',
        title: '八千代 Live2D 房间',
        description: '八千代 Live2D 房间是月读空间的角色互动入口，包含模型展示、语音播放、AI 对话、天气与移动端交互体验。',
        keywords: ['八千代 Live2D', 'Live2D 房间', '八千代房间', '月读空间 room', 'AI 角色互动'],
        match: ['八千代', 'Live2D', '房间', '模型', '语音'],
        categories: ['技术', '公告', '二创'],
        points: ['面向八千代角色互动的稳定入口', '聚合 Live2D、TTS、AI 对话与房间设置说明', '在房间设置中连接聊天模型和语音服务'],
        actions: [
            { label: '进入八千代房间', href: '/room' },
            { label: '阅读相关文章', href: '/stage' },
            { label: '查看现实锚点', href: '/reality' }
        ],
        priority: '0.8'
    },
    {
        path: '/topics/ai-character-room',
        title: '月读空间 AI 角色互动',
        description: '月读空间 AI 角色互动页介绍八千代房间中的 LLM、TTS、长期记忆、角色知识库和 MCP 工具接入等体验。',
        keywords: ['月读空间 AI', 'AI 角色互动', '八千代 AI 聊天', 'TTS 语音', 'MCP 工具'],
        match: ['AI', 'LLM', 'TTS', 'MCP', '记忆', '语音', '角色'],
        categories: ['技术', '公告'],
        points: ['面向 AI 角色聊天、语音和记忆功能', '连接房间体验与技术文章', '私人聊天、日记与记忆按用户隔离'],
        actions: [
            { label: '进入 AI 房间', href: '/room' },
            { label: '查看房间设置', href: '/room/settings' },
            { label: '阅读技术文章', href: '/stage' }
        ],
        priority: '0.75'
    },
    {
        path: '/topics/kaguya-yachiyo',
        title: '超时空辉夜姬 八千代',
        description: '围绕超时空辉夜姬与八千代整理角色相关内容、二创图片、现实锚点、Live2D 来源说明和月读空间中的互动入口。',
        keywords: ['超时空辉夜姬 八千代', '八千代', '超かぐや姫 八千代', '月读空间八千代', '八千代二创'],
        match: ['八千代', '辉夜', '二创', '现实', 'Live2D'],
        categories: ['二创', '传说'],
        points: ['八千代相关内容的稳定聚合页', '连接二创文章、图库和现实锚点', '原作资料与粉丝创作分别注明来源'],
        actions: [
            { label: '查看八千代房间', href: '/room' },
            { label: '浏览图库', href: '/gallery' },
            { label: '阅读现实锚点', href: '/reality' }
        ],
        priority: '0.75'
    },
    {
        path: '/topics/cosmic-princess-kaguya-wiki',
        title: '超时空辉夜姬角色与世界观 Wiki 专题',
        description: '集中浏览超时空辉夜姬角色、月读世界观、八千代杯、KASSEN、音乐词条、公开文章与资料来源。',
        keywords: ['超时空辉夜姬 Wiki', '超时空辉夜姬角色', '月读世界观', '八千代杯', 'KASSEN'],
        match: ['辉夜', '彩叶', '八千代', '月读', 'KASSEN', '八千代杯'],
        categories: ['传说', '二创'],
        points: ['收录 12 个角色独立词条', '收录全部世界观与音乐词条', '连接公开文章、图库和完整互动 Wiki'],
        actions: [
            { label: '浏览完整 Wiki', href: '/wiki' },
            { label: '阅读相关文章', href: '/stage' },
            { label: '查看公开图库', href: '/gallery' }
        ],
        priority: '0.85'
    },
    {
        path: '/topics/pixel-art-community',
        title: '在线像素画工坊与作品社区',
        description: '月读空间提供多种尺寸画布的在线像素画工具，并支持公开发布、作品浏览、点赞和 PNG 导出。',
        keywords: ['在线像素画', '192×108 像素画', 'Pixel Art 编辑器', '像素画社区', 'PNG 导出'],
        match: ['像素', 'pixel', '画布', '绘画', '作品'],
        categories: ['技术', '二创'],
        points: ['可选画布尺寸与缩放、撤销重做', '支持鼠标、触控笔与数位板创作', '公开作品展示、点赞与 PNG 导出'],
        actions: [
            { label: '打开像素画工具', href: '/pixel' },
            { label: '浏览创作文章', href: '/stage' },
            { label: '查看公开图库', href: '/gallery' }
        ],
        priority: '0.75'
    }
];

function setNoStore(res) {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
    });
}

function setStaticCacheHeaders(res, filePath) {
    if (String(filePath || '').replace(/\\/g, '/').includes('/assets/uploads/')) {
        res.setHeader('Content-Disposition', 'attachment');
        res.setHeader('X-Content-Type-Options', 'nosniff');
    }

    if (filePath.endsWith('.html')) {
        setNoStore(res);
        return;
    }

    if (/[.-][A-Za-z0-9_-]{8,}\.(?:js|css|png|jpe?g|gif|webp|svg|woff2?)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
}

function xmlEscape(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function absoluteSiteUrl(pathname) {
    try {
        const url = new URL(String(pathname || '/'), config.publicSiteUrl);
        return ['http:', 'https:'].includes(url.protocol) ? url.toString() : config.publicSiteUrl;
    } catch (_) {
        return config.publicSiteUrl;
    }
}

function sitemapUrl({ loc, lastmod, changefreq, priority }) {
    return [
        '  <url>',
        `    <loc>${xmlEscape(loc)}</loc>`,
        lastmod ? `    <lastmod>${xmlEscape(lastmod)}</lastmod>` : '',
        changefreq ? `    <changefreq>${xmlEscape(changefreq)}</changefreq>` : '',
        priority ? `    <priority>${xmlEscape(priority)}</priority>` : '',
        '  </url>'
    ].filter(Boolean).join('\n');
}

function sitemapImageUrl({ loc, lastmod, images = [] }) {
    const imageXml = images
        .filter(image => image?.loc && !String(image.loc).startsWith('data:'))
        .map(image => [
            '    <image:image>',
            `      <image:loc>${xmlEscape(absoluteSiteUrl(image.loc))}</image:loc>`,
            '    </image:image>'
        ].filter(Boolean).join('\n'))
        .join('\n');
    if (!imageXml) return '';
    return [
        '  <url>',
        `    <loc>${xmlEscape(loc)}</loc>`,
        lastmod ? `    <lastmod>${xmlEscape(lastmod)}</lastmod>` : '',
        imageXml,
        '  </url>'
    ].filter(Boolean).join('\n');
}

function sendRobots(req, res) {
    setNoStore(res);
    res.removeHeader('ETag');
    res.type('text/plain; charset=utf-8').send([
        'User-agent: *',
        'Allow: /',
        'Disallow: /terminal',
        'Disallow: /admin',
        'Disallow: /editor',
        'Disallow: /room/settings',
        'Disallow: /room-settings',
        'Disallow: /user-center',
        'Disallow: /notifications',
        'Disallow: /login',
        'Disallow: /register',
        'Disallow: /gallery/manage',
        'Disallow: /attachments',
        'Disallow: /fushi/',
        'Disallow: /room/shared/',
        'Disallow: /friend-links/apply',
        'Disallow: /api/',
        'Allow: /api/pixel-art/*/image.png',
        'Allow: /api/assets/proxy/',
        `Sitemap: ${absoluteSiteUrl('/sitemap.xml')}`,
        `Sitemap: ${absoluteSiteUrl('/sitemap-images.xml')}`,
        ''
    ].join('\n'));
}

function galleryAssetUrl(asset) {
    if (asset?.metadata?.storage === 'oss') {
        return objectStorage.publicUrlForKey(asset.storage_key) || asset.url || '';
    }
    return asset?.url || '';
}

function seoGalleryAssets(limit = 48) {
    return assetRepository.listGalleryAssets({ limit, offset: 0 }).map(asset => ({
        ...asset,
        display_url: galleryAssetUrl(asset),
        access_url: galleryAssetUrl(asset)
    }));
}

function sendSitemap(req, res) {
    const staticUrls = SEO_ROUTES.map(route => sitemapUrl({
        loc: absoluteSiteUrl(route.path),
        changefreq: route.changefreq,
        priority: route.priority
    }));
    const topicUrls = TOPIC_ROUTES.map(route => sitemapUrl({
        loc: absoluteSiteUrl(route.path),
        changefreq: 'weekly',
        priority: route.priority
    }));
    const wikiUrls = WIKI_ENTRIES.map(entry => sitemapUrl({
        loc: absoluteSiteUrl(wikiEntryPath(entry)),
        lastmod: WIKI_VERIFIED_AT,
        changefreq: 'monthly',
        priority: entry.kind === 'character' ? '0.72' : '0.68'
    }));
    const articleUrls = seoRepository.sitemapArticles().map(article => sitemapUrl({
        loc: absoluteSiteUrl(articlePath(article)),
        lastmod: String(article.updated_at || article.published_at || article.created_at || article.publish_date || '').slice(0, 10),
        changefreq: 'monthly',
        priority: '0.7'
    }));
    setNoStore(res);
    res.removeHeader('ETag');
    res.type('application/xml; charset=utf-8').send([
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...staticUrls,
        ...topicUrls,
        ...wikiUrls,
        ...articleUrls,
        ...seoRepository.pixelSummaries(10000).map(art => sitemapUrl({ loc: absoluteSiteUrl(`/pixel?art=${art.id}`), lastmod: String(art.updated_at || art.created_at || "").slice(0, 10) })),
        '</urlset>',
        ''
    ].join('\n'));
}

function galleryImageTitle(asset, index) {
    const metadata = asset?.metadata || {};
    return metadata.alt || metadata.title || metadata.description || `月读空间公开图库图片 ${index + 1}`;
}

function sendImageSitemap(req, res) {
    const articles = seoRepository.sitemapArticles();
    const articleImages = articles.map(article => sitemapImageUrl({
        loc: absoluteSiteUrl(articlePath(article)),
        lastmod: String(article.updated_at || article.created_at || article.publish_date || '').slice(0, 10),
        images: article.cover_image ? [{
            loc: article.cover_image,
            title: article.title,
            caption: article.excerpt || `${article.title}文章封面`
        }] : []
    })).filter(Boolean);
    const galleryAssets = seoGalleryAssets(1000);
    const galleryImages = sitemapImageUrl({
        loc: absoluteSiteUrl('/gallery'),
        images: galleryAssets.map((asset, index) => ({
            loc: asset.display_url || asset.access_url || asset.url,
            title: galleryImageTitle(asset, index),
            caption: asset.owner_username ? `${galleryImageTitle(asset, index)}，上传者：${asset.owner_nickname || asset.owner_username}` : galleryImageTitle(asset, index)
        }))
    });
    setNoStore(res);
    res.removeHeader('ETag');
    res.type('application/xml; charset=utf-8').send([
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
        ...articleImages,
        galleryImages,
        '</urlset>',
        ''
    ].filter(Boolean).join('\n'));
}

function matchTopicArticle(topic, article) {
    const category = String(article.category || '');
    const haystack = `${article.title || ''} ${article.excerpt || ''} ${article.content || ''} ${category}`.toLowerCase();
    const categoryMatched = (topic.categories || []).includes(category);
    const keywordMatched = (topic.match || []).some(keyword => haystack.includes(String(keyword).toLowerCase()));
    return categoryMatched || keywordMatched;
}

function topicArticles(topic, limit = 18) {
    return articleRepository.listSeoArticles(120)
        .filter(article => matchTopicArticle(topic, article))
        .slice(0, limit);
}

function serveStaticFiles(app) {
    const publicRoot = config.projectRoot;
    const frontendDistRoot = path.join(publicRoot, 'dist', 'frontend');
    const useFrontendDist = config.enableFrontendDist && fs.existsSync(path.join(frontendDistRoot, 'index.html'));
    const frontendIndexHtml = useFrontendDist ? fs.readFileSync(path.join(frontendDistRoot, 'index.html'), 'utf8') : '';

    app.get('/robots.txt', sendRobots);
    app.get('/sitemap.xml', sendSitemap);
    app.get('/sitemap-images.xml', sendImageSitemap);
    app.get('/room/shared/:shareKey', (req, res) => {
        const shareKey = String(req.params.shareKey || '');
        if (!/^[A-Za-z0-9_-]{20,80}$/.test(shareKey)) return res.status(404).send('Not found');
        const share = roomShareRepository.findActiveShare(shareKey);
        if (!share) return res.status(404).send('Not found');
        if (!frontendIndexHtml) return res.status(503).send('Frontend build is missing. Run npm run build:web.');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        setNoStore(res);
        return res.type('html').send(renderRoomShareHtml({
            share,
            indexHtml: frontendIndexHtml,
            origin: sharePageOrigin(req)
        }));
    });
    const sendPublic = (req, res, html) => {
        setNoStore(res);
        res.set('Content-Language', 'zh-CN');
        return res.type('html').send(addDiscovery(composePage(frontendIndexHtml, html), req.path));
    };
    app.get('/indexnow-:key.txt', (req, res, next) => indexNow.serveKey(req, res, next));
    for (const pathname of ['/', '/hub', '/plaza', '/room', '/reality']) {
        app.get(pathname, (req, res) => sendPublic(req, res, renderPublicPage(pathname)));
    }
    app.get('/download', async (req, res) => {
        const result = await require('../services/native-app-release').getAppReleaseService().get();
        const release = require('../../shared/native-app-release.cjs').selectAppReleases(result.releases).latest;
        return sendPublic(req, res, renderPublicPage('/download', release));
    });
    app.get('/stage', (req, res) => {
        const result = renderStagePage(req.query);
        if (result.noindex) res.set('X-Robots-Tag', 'noindex, follow');
        return sendPublic(req, res, result.html);
    });
    app.get('/gallery', (req, res) => sendPublic(req, res, renderGalleryHtml(seoGalleryAssets(48))));
    app.get('/pixel', (req, res) => {
        const artworkId = String(req.query?.art || '').trim();
        if (artworkId) {
            const artwork = /^[1-9]\d{0,18}$/.test(artworkId) && seoRepository.pixelById(artworkId);
            if (!artwork) return res.status(404).set('X-Robots-Tag', 'noindex, follow').type('html').send(renderNotFoundHtml());
            return sendPublic(req, res, renderPixelArtworkHtml(artwork));
        }
        return sendPublic(req, res, renderPixelHtml(seoRepository.pixelSummaries(24)));
    });
    app.get('/game', (req, res) => sendPublic(req, res, renderGameHtml()));
    app.get('/wiki', (req, res) => sendPublic(req, res, renderWikiHtml(WIKI_ENTRIES)));
    for (const [segment, kind] of [['characters', 'character'], ['terms', 'term']]) {
        app.get(`/wiki/${segment}/:slug`, (req, res) => {
            const entry = findWikiEntry(kind, req.params.slug);
            if (!entry) return res.status(404).set('X-Robots-Tag', 'noindex, follow').type('html').send(renderNotFoundHtml());
            return sendPublic(req, res, renderWikiEntryHtml(entry));
        });
    }
    app.get('/friend-links', (req, res) => sendPublic(req, res, renderFriendLinksHtml(friendLinkRepository.listActiveLinks())));
    app.get('/users/:username', (req, res) => {
        const html = renderProfilePage(req.params.username);
        if (!html) return res.status(404).set('X-Robots-Tag', 'noindex, follow').type('html').send(renderNotFoundHtml());
        return sendPublic(req, res, html);
    });
    for (const topic of TOPIC_ROUTES) {
        app.get(topic.path, (req, res) => {
            setNoStore(res);
            // Topic landings are standalone documents, not Vue routes.
            return res.type('html').send(addDiscovery(renderTopicLandingHtml(topic, topicArticles(topic), seoGalleryAssets(12)), req.path));
        });
    }
    app.get('/article', (req, res, next) => {
        const id = req.query?.id;
        if (!id) return res.status(404).set('X-Robots-Tag', 'noindex, follow').type('html').send(renderNotFoundHtml());
        const article = articleRepository.findPublishedArticleById(id);
        if (!article) return res.status(404).type('html').send(renderNotFoundHtml());
        const from = typeof req.query.from === 'string' ? req.query.from.slice(0, 512) : '';
        return res.redirect(301, articlePath(article) + (from ? `?${new URLSearchParams({ from })}` : ''));
    });
    app.get('/articles/:id/:slug?', (req, res) => {
        const article = articleRepository.findPublishedArticleById(req.params.id);
        if (!article) return res.status(404).type('html').send(renderNotFoundHtml());
        if (article.slug && req.params.slug !== article.slug) {
            const from = typeof req.query.from === 'string' ? req.query.from.slice(0, 512) : '';
            return res.redirect(301, articlePath(article) + (from ? `?${new URLSearchParams({ from })}` : ''));
        }
        setNoStore(res);
        return sendPublic(req, res, renderArticleHtml(article));
    });

    app.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        if (req.path === '/pages' || req.path.startsWith('/pages/') || path.extname(req.path) === '.html') {
            return res.status(404).send('Not found');
        }
        next();
    });

    app.get('/arena', (req, res) => {
        const queryIndex = req.originalUrl.indexOf('?');
        const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Expires', '0');
        return res.redirect(301, `/pixel${query}`);
    });

    if (useFrontendDist) {
        app.use(express.static(frontendDistRoot, { setHeaders: setStaticCacheHeaders }));
    }

    for (const fileName of ['favicon.ico', 'site.webmanifest', 'live2d-core.js']) {
        app.get(`/${fileName}`, (req, res) => {
            setStaticCacheHeaders(res, path.join(publicRoot, fileName));
            return res.sendFile(path.join(publicRoot, fileName));
        });
    }

    app.use('/assets/uploads', (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const suffix = String(req.url || '/').replace(/^\/+/, '');
        return res.redirect(307, `/api/assets/local/${suffix}`);
    });
    app.use('/assets', express.static(path.join(publicRoot, 'assets'), { setHeaders: setStaticCacheHeaders }));
    app.use('/lib', express.static(path.join(publicRoot, 'lib'), { setHeaders: setStaticCacheHeaders }));
    app.use('/models', express.static(path.join(publicRoot, 'models'), { setHeaders: setStaticCacheHeaders }));
    app.use('/models-v3', express.static(path.join(publicRoot, 'models'), { setHeaders: setStaticCacheHeaders }));
    app.use('/models-v4', express.static(path.join(publicRoot, 'models'), { setHeaders: setStaticCacheHeaders }));

    // Serve Vue routes from the Vite build.
    app.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        if (req.path.startsWith('/api') || path.extname(req.path)) return next();

        const vueRoutes = new Set(['/', '/access', '/hub', '/login', '/register', '/stage', '/article', '/wiki', '/room', '/room/settings', '/room-settings', '/plaza', '/friend-links', '/friend-links/apply', '/reality', '/download', '/editor', '/attachments', '/gallery', '/gallery/manage', '/user-center', '/growth', '/notifications', '/admin', '/terminal', '/pixel', '/pixel/', '/game']);
        const wikiEntryRoute = req.path.startsWith('/wiki/characters/') || req.path.startsWith('/wiki/terms/');
        if (vueRoutes.has(req.path) || ['/fushi/connect', '/fushi/astrbot/callback'].includes(req.path) || req.path.startsWith('/users/') || wikiEntryRoute) {
            if (!useFrontendDist) {
                return res.status(503).send('Frontend build is missing. Run npm run build:web.');
            }
            res.set('X-Robots-Tag', 'noindex, follow');
            setNoStore(res);
            return res.type('html').send(frontendIndexHtml.replace(/<meta name="robots"[^>]*>/i, '<meta name="robots" content="noindex,follow">'));
        }

        next();
    });
}

module.exports = {
    serveStaticFiles
};
