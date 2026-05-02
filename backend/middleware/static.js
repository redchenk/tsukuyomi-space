const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('../config');

function serveStaticFiles(app) {
    const publicRoot = config.projectRoot;
    const frontendDistRoot = path.join(publicRoot, 'dist', 'frontend');
    const useFrontendDist = config.enableFrontendDist && fs.existsSync(path.join(frontendDistRoot, 'index.html'));

    if (useFrontendDist) {
        app.use(express.static(frontendDistRoot));
    }

    app.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();

        const legacyVueRoutes = new Map([
            ['/index.html', '/'],
            ['/access.html', '/'],
            ['/hub.html', '/hub'],
            ['/login.html', '/login'],
            ['/register.html', '/register'],
            ['/stage.html', '/stage'],
            ['/room.html', '/room'],
            ['/plaza.html', '/plaza'],
            ['/reality.html', '/reality'],
            ['/editor.html', '/editor'],
            ['/user-center.html', '/user-center'],
            ['/arena.html', '/arena'],
            ['/pages/index', '/'],
            ['/pages/index.html', '/'],
            ['/pages/access', '/'],
            ['/pages/access.html', '/'],
            ['/pages/hub', '/hub'],
            ['/pages/hub.html', '/hub'],
            ['/pages/login', '/login'],
            ['/pages/login.html', '/login'],
            ['/pages/register', '/register'],
            ['/pages/register.html', '/register'],
            ['/pages/stage', '/stage'],
            ['/pages/stage.html', '/stage'],
            ['/pages/room', '/room'],
            ['/pages/room.html', '/room'],
            ['/pages/plaza', '/plaza'],
            ['/pages/plaza.html', '/plaza'],
            ['/pages/reality', '/reality'],
            ['/pages/reality.html', '/reality'],
            ['/pages/editor', '/editor'],
            ['/pages/editor.html', '/editor'],
            ['/pages/user-center', '/user-center'],
            ['/pages/user-center.html', '/user-center'],
            ['/pages/arena', '/arena'],
            ['/pages/arena.html', '/arena'],
            ['/pages/article', '/article'],
            ['/pages/article.html', '/article'],
            ['/article.html', '/article'],
            ['/pages/terminal', '/terminal'],
            ['/pages/terminal.html', '/terminal'],
            ['/terminal.html', '/terminal']
        ]);

        const target = legacyVueRoutes.get(req.path);
        if (target) {
            const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
            return res.redirect(301, `${target}${query}`);
        }

        next();
    });

    app.use(express.static(publicRoot));
    app.use('/assets', express.static(path.join(publicRoot, 'assets')));
    app.use('/lib', express.static(path.join(publicRoot, 'lib')));
    app.use('/models', express.static(path.join(publicRoot, 'models')));

    // Serve Vue routes from the Vite build.
    app.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        if (req.path.startsWith('/api') || path.extname(req.path)) return next();

        const vueRoutes = new Set(['/', '/access', '/hub', '/login', '/register', '/stage', '/article', '/room', '/plaza', '/reality', '/editor', '/user-center', '/terminal', '/arena']);
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
