const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('../config');
const articleRepository = require('../repositories/article-repository');
const assetRepository = require('../repositories/asset-repository');
const friendLinkRepository = require('../repositories/friend-link-repository');
const pixelArtRepository = require('../repositories/pixel-art-repository');
const roomShareRepository = require('../repositories/room-share-repository');
const objectStorage = require('../services/object-storage');
const { articlePath, renderArticleHtml, renderGalleryHtml, renderNotFoundHtml, renderStageHtml, renderTopicLandingHtml } = require('../seo/render-article');
const { renderRoomShareHtml } = require('../seo/render-room-share');
const { WIKI_ENTRIES, WIKI_VERIFIED_AT, findWikiEntry, wikiEntryPath } = require('../seo/wiki-content');
const { renderFriendLinksHtml, renderHubHtml, renderPixelArtworkHtml, renderPixelHtml, renderWikiEntryHtml, renderWikiHtml } = require('../seo/render-pages');

const CRAWLER_USER_AGENT = /(?:bot|crawler|spider|slurp|bingpreview|facebookexternalhit|twitterbot|linkedinbot|telegrambot|whatsapp|discordbot)/i;

function isCrawlerRequest(req) {
    return CRAWLER_USER_AGENT.test(String(req.get('user-agent') || ''));
}

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
    { path: '/pixel', priority: '0.7', changefreq: 'weekly' }
];

const TOPIC_ROUTES = [
    {
        path: '/topics/chou-kaguya-hime',
        title: '超时空辉夜姬资源、小说与二创',
        description: '月读空间整理超时空辉夜姬相关资源、小说翻译、电影入口、二创文章与公开图库，方便读者从一个稳定入口继续浏览。',
        keywords: ['超时空辉夜姬', '超かぐや姫', '超时空辉夜姬小说', '超时空辉夜姬二创', '月读空间'],
        match: ['超', '辉夜', '姫', '小说', '电影'],
        categories: ['传说', '二创'],
        points: ['小说、电影、二创与图库集中入口', '收录公开文章和图片，适合搜索引擎抓取', '通过主舞台继续阅读完整互动文章'],
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
        points: ['面向八千代角色互动的稳定入口', '聚合 Live2D、TTS、AI 对话与房间设置说明', '适合作为“八千代 Live2D”关键词落地页'],
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
        points: ['面向 AI 角色聊天、语音和记忆功能', '连接房间体验与技术文章', '帮助搜索引擎理解月读空间的互动工具定位'],
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
        points: ['八千代相关内容的稳定聚合页', '连接二创文章、图库和现实锚点', '强化“超时空辉夜姬 八千代”搜索入口'],
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
        title: '192×108 在线像素画与作品社区',
        description: '月读空间提供固定 192×108 画布的在线像素画工具，并支持公开发布、作品浏览、点赞和 PNG 导出。',
        keywords: ['在线像素画', '192×108 像素画', 'Pixel Art 编辑器', '像素画社区', 'PNG 导出'],
        match: ['像素', 'pixel', '画布', '绘画', '作品'],
        categories: ['技术', '二创'],
        points: ['固定 192×108 像素画布', '支持鼠标、触控笔与数位板创作', '公开作品展示、点赞与 PNG 导出'],
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
            image.title ? `      <image:title>${xmlEscape(image.title)}</image:title>` : '',
            image.caption ? `      <image:caption>${xmlEscape(image.caption)}</image:caption>` : '',
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
    const today = new Date().toISOString().slice(0, 10);
    const staticUrls = SEO_ROUTES.map(route => sitemapUrl({
        loc: absoluteSiteUrl(route.path),
        lastmod: today,
        changefreq: route.changefreq,
        priority: route.priority
    }));
    const topicUrls = TOPIC_ROUTES.map(route => sitemapUrl({
        loc: absoluteSiteUrl(route.path),
        lastmod: today,
        changefreq: 'weekly',
        priority: route.priority
    }));
    const wikiUrls = WIKI_ENTRIES.map(entry => sitemapUrl({
        loc: absoluteSiteUrl(wikiEntryPath(entry)),
        lastmod: WIKI_VERIFIED_AT,
        changefreq: 'monthly',
        priority: entry.kind === 'character' ? '0.72' : '0.68'
    }));
    const articleUrls = articleRepository.listSeoArticles().map(article => sitemapUrl({
        loc: absoluteSiteUrl(articlePath(article)),
        lastmod: String(article.updated_at || article.created_at || article.publish_date || today).slice(0, 10),
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
        '</urlset>',
        ''
    ].join('\n'));
}

function galleryImageTitle(asset, index) {
    const metadata = asset?.metadata || {};
    return metadata.alt || metadata.title || metadata.description || `月读空间公开图库图片 ${index + 1}`;
}

function sendImageSitemap(req, res) {
    const articles = articleRepository.listSeoArticles();
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
        lastmod: String(galleryAssets[0]?.updated_at || galleryAssets[0]?.created_at || '').slice(0, 10),
        images: galleryAssets.map((asset, index) => ({
            loc: asset.display_url || asset.access_url || asset.url,
            title: galleryImageTitle(asset, index),
            caption: asset.owner_username ? `${galleryImageTitle(asset, index)}，上传者：${asset.owner_username}` : galleryImageTitle(asset, index)
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
    app.get('/hub', (req, res, next) => {
        if (req.query?.spa === '1' || !isCrawlerRequest(req)) return next();
        res.vary('User-Agent');
        setNoStore(res);
        return res.type('html').send(renderHubHtml(articleRepository.listSeoArticles(12)));
    });
    app.get('/stage', (req, res, next) => {
        if (req.query?.spa === '1' || !isCrawlerRequest(req)) return next();
        res.vary('User-Agent');
        setNoStore(res);
        return res.type('html').send(renderStageHtml(articleRepository.listSeoArticles()));
    });
    app.get('/gallery', (req, res, next) => {
        if (req.query?.spa === '1' || !isCrawlerRequest(req)) return next();
        res.vary('User-Agent');
        setNoStore(res);
        return res.type('html').send(renderGalleryHtml(seoGalleryAssets(48)));
    });
    app.get('/pixel', (req, res, next) => {
        if (req.query?.spa === '1' || !isCrawlerRequest(req)) return next();
        res.vary('User-Agent');
        setNoStore(res);
        const artworkId = String(req.query?.art || '').trim();
        if (artworkId) {
            const artwork = pixelArtRepository.findArtworkById(artworkId);
            if (artwork) return res.type('html').send(renderPixelArtworkHtml(artwork));
        }
        const artworks = pixelArtRepository.listArtworks({ limit: 24, preview: 'compact' }).items;
        return res.type('html').send(renderPixelHtml(artworks));
    });
    app.get('/wiki', (req, res, next) => {
        if (req.query?.spa === '1' || !isCrawlerRequest(req)) return next();
        res.vary('User-Agent');
        setNoStore(res);
        return res.type('html').send(renderWikiHtml(WIKI_ENTRIES));
    });
    app.get('/wiki/characters/:slug', (req, res, next) => {
        if (req.query?.spa === '1' || !isCrawlerRequest(req)) return next();
        const entry = findWikiEntry('character', req.params.slug);
        if (!entry) return next();
        res.vary('User-Agent');
        setNoStore(res);
        return res.type('html').send(renderWikiEntryHtml(entry));
    });
    app.get('/wiki/terms/:slug', (req, res, next) => {
        if (req.query?.spa === '1' || !isCrawlerRequest(req)) return next();
        const entry = findWikiEntry('term', req.params.slug);
        if (!entry) return next();
        res.vary('User-Agent');
        setNoStore(res);
        return res.type('html').send(renderWikiEntryHtml(entry));
    });
    app.get('/friend-links', (req, res, next) => {
        if (req.query?.spa === '1' || !isCrawlerRequest(req)) return next();
        res.vary('User-Agent');
        setNoStore(res);
        return res.type('html').send(renderFriendLinksHtml(friendLinkRepository.listActiveLinks()));
    });
    app.get('/gallery/manage', (req, res, next) => {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        if (!useFrontendDist) return next();
        setNoStore(res);
        return res.sendFile(path.join(frontendDistRoot, 'index.html'));
    });
    for (const topic of TOPIC_ROUTES) {
        app.get(topic.path, (req, res) => {
            setNoStore(res);
            return res.type('html').send(renderTopicLandingHtml(topic, topicArticles(topic), seoGalleryAssets(12)));
        });
    }
    app.get('/article', (req, res, next) => {
        const id = req.query?.id;
        if (!id) return next();
        if (req.query?.spa === '1') return next();
        const article = articleRepository.findPublishedArticleById(id);
        if (!article) return res.status(404).type('html').send(renderNotFoundHtml());
        return res.redirect(301, articlePath(article));
    });
    app.get('/articles/:id/:slug?', (req, res) => {
        const article = articleRepository.findPublishedArticleById(req.params.id);
        if (!article) return res.status(404).type('html').send(renderNotFoundHtml());
        if (article.slug && req.params.slug !== article.slug) {
            return res.redirect(301, articlePath(article));
        }
        setNoStore(res);
        return res.type('html').send(renderArticleHtml(article));
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

        const vueRoutes = new Set(['/', '/access', '/hub', '/login', '/register', '/stage', '/article', '/wiki', '/room', '/room/settings', '/room-settings', '/plaza', '/friend-links', '/friend-links/apply', '/reality', '/editor', '/attachments', '/gallery', '/gallery/manage', '/user-center', '/notifications', '/admin', '/terminal', '/pixel', '/pixel/']);
        const wikiEntryRoute = req.path.startsWith('/wiki/characters/') || req.path.startsWith('/wiki/terms/');
        if (vueRoutes.has(req.path) || req.path.startsWith('/users/') || wikiEntryRoute) {
            if (!useFrontendDist) {
                return res.status(503).send('Frontend build is missing. Run npm run build:web.');
            }
            setNoStore(res);
            return res.sendFile(path.join(frontendDistRoot, 'index.html'));
        }

        next();
    });
}

module.exports = {
    serveStaticFiles
};
