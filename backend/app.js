const express = require('express');
const cors = require('cors');
const config = require('./config');
const { initDatabase } = require('./db/migrations/init');
const { securityHeaders, createRateLimiter, isAllowedOrigin, requireTrustedWrite } = require('./middleware/security');
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
const pixelArtRoutes = require('./routes/pixel-art');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./user-routes');

const requestBodyLimit = process.env.REQUEST_BODY_LIMIT || '1mb';

function createApp() {
    initDatabase();

    const app = express();
    app.disable('x-powered-by');
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
    app.use('/api', requireTrustedWrite);

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
    app.use('/api/auth/email-code', createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10, keyPrefix: 'email-code' }));
    app.use('/api/admin/login', createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20, keyPrefix: 'admin-login' }));
    app.use('/api/assets', createRateLimiter({ windowMs: 10 * 60 * 1000, max: 80, keyPrefix: 'assets' }));
    app.use('/api/chat', createRateLimiter({ windowMs: 10 * 60 * 1000, max: 60, keyPrefix: 'chat' }));
    app.use('/api/tts', createRateLimiter({ windowMs: 10 * 60 * 1000, max: 60, keyPrefix: 'tts' }));
    app.use('/api/mcp', createRateLimiter({ windowMs: 10 * 60 * 1000, max: 12, keyPrefix: 'mcp' }));

    // Parse message writes with a small cap before the much larger media-aware API parser.
    const messageIpLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 30, keyPrefix: 'message-ip' });
    app.use('/api/messages', (req, res, next) => req.method === 'POST' ? messageIpLimiter(req, res, next) : next());
    app.use('/api/messages', express.json({ limit: '16kb' }));
    app.use('/api/messages', express.urlencoded({ limit: '16kb', extended: true }));

    // Data URL routes get explicit caps; ordinary JSON remains small on the 2GB host.
    app.use('/api/assets', express.json({ limit: '28mb' }));
    app.use('/api/mcp', express.json({ limit: '6mb' }));
    app.use('/api/chat', express.json({ limit: '8mb' }));
    app.use('/api/tts', express.json({ limit: '12mb' }));
    app.use('/api/articles', express.json({ limit: '12mb' }));
    app.use('/api/user/avatar', express.json({ limit: '8mb' }));
    app.use(express.json({ limit: requestBodyLimit }));
    app.use(express.urlencoded({ limit: '128kb', extended: true }));
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
    app.use('/api/pixel-art', pixelArtRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/user', userRoutes);

    app.use(errorHandler);
    return app;
}

module.exports = {
    createApp,
    isAllowedOrigin
};
