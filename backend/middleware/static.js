const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('../config');
const articleRepository = require('../repositories/article-repository');
const assetRepository = require('../repositories/asset-repository');
const objectStorage = require('../services/object-storage');
const { articlePath, renderArticleHtml, renderGalleryHtml, renderNotFoundHtml, renderStageHtml, renderTopicLandingHtml } = require('../seo/render-article');

const SEO_ROUTES = [
    { path: '/', priority: '1.0', changefreq: 'weekly' },
    { path: '/hub', priority: '0.9', changefreq: 'weekly' },
    { path: '/stage', priority: '0.9', changefreq: 'daily' },
    { path: '/plaza', priority: '0.8', changefreq: 'daily' },
    { path: '/room', priority: '0.8', changefreq: 'weekly' },
    { path: '/gallery', priority: '0.8', changefreq: 'daily' },
    { path: '/reality', priority: '0.7', changefreq: 'weekly' },
    { path: '/arena', priority: '0.7', changefreq: 'weekly' }
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
    return `${config.publicSiteUrl}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
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

function sendRobots(req, res) {
    setNoStore(res);
    res.removeHeader('ETag');
    res.type('text/plain; charset=utf-8').send([
        'User-agent: *',
        'Allow: /',
        'Disallow: /terminal',
        'Disallow: /editor',
        'Disallow: /room/settings',
        'Disallow: /room-settings',
        'Disallow: /user-center',
        'Disallow: /notifications',
        'Disallow: /login',
        'Disallow: /register',
        'Disallow: /gallery/manage',
        `Sitemap: ${absoluteSiteUrl('/sitemap.xml')}`,
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
        ...articleUrls,
        '</urlset>',
        ''
    ].join('\n'));
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

    app.get('/robots.txt', sendRobots);
    app.get('/sitemap.xml', sendSitemap);
    app.get('/stage', (req, res, next) => {
        if (req.query?.spa === '1') return next();
        setNoStore(res);
        return res.type('html').send(renderStageHtml(articleRepository.listSeoArticles(60)));
    });
    app.get('/gallery', (req, res, next) => {
        if (req.query?.spa === '1') return next();
        setNoStore(res);
        return res.type('html').send(renderGalleryHtml(seoGalleryAssets(48)));
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
        const article = articleRepository.findArticleById(id);
        if (!article) return res.status(404).type('html').send(renderNotFoundHtml());
        return res.redirect(301, articlePath(article));
    });
    app.get('/articles/:id/:slug?', (req, res) => {
        const article = articleRepository.findArticleById(req.params.id);
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

    if (useFrontendDist) {
        app.use(express.static(frontendDistRoot, { setHeaders: setStaticCacheHeaders }));
    }

    app.use(express.static(publicRoot, { setHeaders: setStaticCacheHeaders }));
    app.use('/assets', express.static(path.join(publicRoot, 'assets'), { setHeaders: setStaticCacheHeaders }));
    app.use('/lib', express.static(path.join(publicRoot, 'lib'), { setHeaders: setStaticCacheHeaders }));
    app.use('/models', express.static(path.join(publicRoot, 'models'), { setHeaders: setStaticCacheHeaders }));

    // Serve Vue routes from the Vite build.
    app.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        if (req.path.startsWith('/api') || path.extname(req.path)) return next();

        const vueRoutes = new Set(['/', '/access', '/hub', '/login', '/register', '/stage', '/article', '/room', '/room/settings', '/room-settings', '/plaza', '/reality', '/editor', '/attachments', '/gallery', '/gallery/manage', '/user-center', '/notifications', '/terminal', '/arena', '/arena/']);
        if (vueRoutes.has(req.path)) {
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
