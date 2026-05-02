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

    app.use(express.static(publicRoot));
    app.use('/pages', express.static(path.join(publicRoot, 'pages')));
    app.use('/assets', express.static(path.join(publicRoot, 'assets')));
    app.use('/lib', express.static(path.join(publicRoot, 'lib')));
    app.use('/models', express.static(path.join(publicRoot, 'models')));

    // 支持 /pages/hub 这类无扩展名访问，实际返回 /pages/hub.html。
    app.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        if (req.path.startsWith('/api') || path.extname(req.path)) return next();

        const resolvedHtmlPath = path.resolve(publicRoot, `.${req.path}.html`);
        if (resolvedHtmlPath.startsWith(publicRoot + path.sep) && fs.existsSync(resolvedHtmlPath)) {
            return res.sendFile(resolvedHtmlPath);
        }

        const vueRoutes = new Set(['/', '/access', '/hub', '/login', '/register', '/stage', '/plaza', '/reality', '/editor', '/user-center']);
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
