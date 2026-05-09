const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('../config');

function serveStaticFiles(app) {
    const publicRoot = config.projectRoot;
    const frontendDistRoot = path.join(publicRoot, 'dist', 'frontend');
    const useFrontendDist = config.enableFrontendDist && fs.existsSync(path.join(frontendDistRoot, 'index.html'));

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

        const vueRoutes = new Set(['/', '/access', '/hub', '/login', '/register', '/stage', '/article', '/room', '/plaza', '/reality', '/editor', '/user-center', '/notifications', '/terminal', '/arena', '/arena/']);
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
