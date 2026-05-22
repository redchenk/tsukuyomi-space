const express = require('express');
const cors = require('cors');
const config = require('./config');
const { initDatabase } = require('./db/migrations/init');
const { securityHeaders, createRateLimiter } = require('./middleware/security');
const { serveStaticFiles } = require('./middleware/static');
const { jsonParseError, errorHandler } = require('./middleware/error');

const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const articleRoutes = require('./routes/articles');
const messageRoutes = require('./routes/messages');
const statsRoutes = require('./routes/stats');
const chatRoutes = require('./routes/chat');
const ttsRoutes = require('./routes/tts');
const assetRoutes = require('./routes/assets');
const roomRoutes = require('./routes/room');
const mcpRoutes = require('./routes/mcp');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./user-routes');

function isAllowedOrigin(origin, req) {
    if (!origin) return true;
    if (config.corsOrigins.length === 0 || config.corsOrigins.includes(origin)) return true;

    try {
        const originUrl = new URL(origin);
        const forwardedHost = req.headers['x-forwarded-host'];
        const requestHost = forwardedHost || req.headers.host;
        if (!requestHost) return false;
        const requestHostname = requestHost.split(':')[0].toLowerCase();
        const originHostname = originUrl.hostname.toLowerCase();
        const siteHostname = new URL(config.publicSiteUrl).hostname.toLowerCase();
        const isSameConfiguredSite = (hostname) => hostname === siteHostname || hostname.endsWith(`.${siteHostname}`);
        return originUrl.host === requestHost
            || originHostname === requestHostname
            || (isSameConfiguredSite(originHostname) && isSameConfiguredSite(requestHostname));
    } catch (_) {
        return false;
    }
}

function createApp() {
    initDatabase();

    const app = express();
    if (config.trustProxy) app.set('trust proxy', 1);

    app.use(securityHeaders);
    app.use((req, res, next) => {
        cors({
            origin(origin, callback) {
                callback(null, isAllowedOrigin(origin, req));
            },
            credentials: true
        })(req, res, next);
    });

    // 分层限流：API 总量、认证入口、后台登录分别控制。
    app.use('/api/', createRateLimiter({ windowMs: 15 * 60 * 1000, max: 600, keyPrefix: 'api' }));
    app.use('/api', (req, res, next) => {
        res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
        res.setHeader('Vary', 'Cookie, Authorization');
        next();
    });

    app.use('/api/auth/', createRateLimiter({ windowMs: 15 * 60 * 1000, max: 60, keyPrefix: 'auth' }));
    app.use('/api/admin/login', createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20, keyPrefix: 'admin-login' }));

    // Regular attachments can use data URLs; large media should be registered from OSS.
    app.use(express.json({ limit: '80mb' }));
    app.use(express.urlencoded({ limit: '80mb', extended: true }));
    app.use(jsonParseError);

    serveStaticFiles(app);

    app.use('/api', healthRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/articles', articleRoutes);
    app.use('/api/messages', messageRoutes);
    app.use('/api/stats', statsRoutes);
    app.use('/api/chat', chatRoutes);
    app.use('/api/tts', ttsRoutes);
    app.use('/api/assets', assetRoutes);
    app.use('/api/room', roomRoutes);
    app.use('/api/mcp', mcpRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/user', userRoutes);

    app.use(errorHandler);
    return app;
}

module.exports = {
    createApp,
    isAllowedOrigin
};
