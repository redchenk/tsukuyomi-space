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
        return originUrl.host === requestHost || originUrl.hostname === requestHost.split(':')[0];
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
    app.use('/api/auth/', createRateLimiter({ windowMs: 15 * 60 * 1000, max: 60, keyPrefix: 'auth' }));
    app.use('/api/admin/login', createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20, keyPrefix: 'admin-login' }));

    // 10MB 用于支持封面图等 base64 数据。
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ limit: '10mb', extended: true }));
    app.use(jsonParseError);

    serveStaticFiles(app);

    app.use('/api', healthRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/articles', articleRoutes);
    app.use('/api/messages', messageRoutes);
    app.use('/api/stats', statsRoutes);
    app.use('/api/chat', chatRoutes);
    app.use('/api/tts', ttsRoutes);
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
