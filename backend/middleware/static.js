const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('../config');
const articleRepository = require('../repositories/article-repository');
const assetRepository = require('../repositories/asset-repository');
const objectStorage = require('../services/object-storage');
const { articlePath, renderArticleHtml, renderGalleryHtml, renderNotFoundHtml, renderStageHtml } = require('../seo/render-article');

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
        ...articleUrls,
        '</urlset>',
        ''
    ].join('\n'));
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
