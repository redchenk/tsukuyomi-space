const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('../config');
const articleRepository = require('../repositories/article-repository');
const { articlePath, renderArticleHtml, renderNotFoundHtml, renderStageHtml } = require('../seo/render-article');

const SEO_ROUTES = [
    { path: '/', priority: '1.0', changefreq: 'weekly' },
    { path: '/hub', priority: '0.9', changefreq: 'weekly' },
    { path: '/stage', priority: '0.9', changefreq: 'daily' },
    { path: '/plaza', priority: '0.8', changefreq: 'daily' },
    { path: '/room', priority: '0.8', changefreq: 'weekly' },
    { path: '/reality', priority: '0.7', changefreq: 'weekly' },
    { path: '/arena', priority: '0.7', changefreq: 'weekly' }
];

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
    res.type('text/plain').send([
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
        `Sitemap: ${absoluteSiteUrl('/sitemap.xml')}`,
        ''
    ].join('\n'));
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
    res.type('application/xml').send([
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
        return res.type('html').send(renderStageHtml(articleRepository.listSeoArticles(60)));
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
        app.use(express.static(frontendDistRoot));
    }

    app.use(express.static(publicRoot));
    app.use('/assets', express.static(path.join(publicRoot, 'assets')));
    app.use('/lib', express.static(path.join(publicRoot, 'lib')));
    app.use('/models', express.static(path.join(publicRoot, 'models')));

    // Serve Vue routes from the Vite build.
    app.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        if (req.path.startsWith('/api') || path.extname(req.path)) return next();

        const vueRoutes = new Set(['/', '/access', '/hub', '/login', '/register', '/stage', '/article', '/room', '/room/settings', '/room-settings', '/plaza', '/reality', '/editor', '/user-center', '/notifications', '/terminal', '/arena', '/arena/']);
        if (vueRoutes.has(req.path)) {
            if (!useFrontendDist) {
                return res.status(503).send('Frontend build is missing. Run npm run build:web.');
            }
            return res.sendFile(path.join(frontendDistRoot, 'index.html'));
        }

        next();
    });
}

module.exports = {
    serveStaticFiles
};
