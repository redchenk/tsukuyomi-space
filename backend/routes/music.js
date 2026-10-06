const express = require('express');
const config = require('../config');
const { optionalAuth } = require('../middleware/auth');
const { isAllowedOrigin, createRateLimiter } = require('../middleware/security');
const { createNeteaseMusic, musicError } = require('../services/netease-music');
const { createMusicSessions, LOGIN_TTL, QR_TTL } = require('../services/music-sessions');

const COOKIE = 'tsukuyomi_music';
function token(req) {
    return String(req.headers.cookie || '').match(/(?:^|;\s*)tsukuyomi_music=([a-f0-9]{64})(?:;|$)/)?.[1] || '';
}
function owner(req) { return req.user?.id ? `user:${req.user.id}` : 'guest'; }
function trusted(req, res, next) {
    const origin = String(req.headers.origin || '');
    const site = String(req.headers['sec-fetch-site'] || '');
    // The music cookie is browser-bound, even when an Authorization header is
    // supplied. Do not inherit the general write guard's bearer exception.
    if (site === 'cross-site' || (origin && !isAllowedOrigin(origin, req))
        || req.headers['x-requested-with'] !== 'XMLHttpRequest'
        || (!origin && site !== 'same-origin')) return res.status(403).json({ success: false, code: 'MUSIC_ORIGIN_REJECTED', message: '请求被拒绝' });
    next();
}
function id(value) {
    if (typeof value !== 'string' || !/^[1-9]\d{0,15}$/.test(value) || !Number.isSafeInteger(Number(value))) throw musicError('MUSIC_INVALID_INPUT', '曲目或歌单编号无效', 400);
    return value;
}
function offset(value) {
    if (value === undefined) return 0;
    if (typeof value !== 'string' || !/^\d{1,5}$/.test(value) || Number(value) > 10000) throw musicError('MUSIC_INVALID_INPUT', '分页参数无效', 400);
    return Number(value);
}
function createMusicRouter({ provider = createNeteaseMusic(), sessions = createMusicSessions(), authenticate = optionalAuth,
    enabled = process.env.MUSIC_NETEASE_ENABLED !== 'false' } = {}) {
    const router = express.Router();
    const locks = new Set();
    let starting = 0;
    router.use(trusted, authenticate);
    router.use(createRateLimiter({ windowMs: 60 * 1000, max: 45, keyPrefix: 'music' }));
    router.use((req, res, next) => {
        res.set('Cache-Control', 'private, no-store'); res.set('X-Robots-Tag', 'noindex, nofollow');
        if (!enabled && req.path !== '/status' && req.path !== '/logout') return res.status(503).json({ success: false, code: 'MUSIC_DISABLED', message: '网易云暂未启用，可以继续听网站曲目' });
        next();
    });
    const route = fn => async (req, res) => {
        try { await fn(req, res); }
        catch (err) {
            if (err.code === 'MUSIC_LOGIN_REQUIRED') { sessions.remove(token(req)); clear(req, res); }
            const known = String(err.code || '').startsWith('MUSIC_');
            res.status(known ? err.status || 502 : 503).json({ success: false, code: known ? err.code : 'MUSIC_SERVICE_ERROR',
                message: known ? err.message : '音乐服务暂时不可用，可以继续听网站曲目' });
        }
    };
    function set(req, res, value, ttl) {
        res.cookie(COOKIE, value, { httpOnly: true, maxAge: ttl, sameSite: 'strict', path: '/api/music', secure: config.isProduction || req.secure });
    }
    function clear(req, res) { set(req, res, '', 0); }
    function account(req) {
        const state = sessions.read(token(req), owner(req));
        if (!state?.profile || !state.cookie) throw musicError('MUSIC_LOGIN_REQUIRED', '请先使用网易云 App 扫码登录', 401);
        return state;
    }
    router.get('/status', route(async (req, res) => {
        const state = enabled ? sessions.read(token(req), owner(req)) : null;
        res.json({ success: true, enabled, profile: state?.profile || null });
    }));
    router.post('/qr', createRateLimiter({ windowMs: 10 * 60 * 1000, max: 10, keyPrefix: 'music-qr' }), route(async (req, res) => {
        if (starting >= 4 || !sessions.capacity()) throw musicError('MUSIC_BUSY', '扫码登录繁忙，请稍后再试', 503);
        starting++;
        try {
            const key = await provider.qrKey();
            const value = sessions.newToken(); const qrId = sessions.newToken();
            sessions.remove(token(req));
            const expiresAt = sessions.now() + QR_TTL;
            sessions.save(value, owner(req), { key, qrId, lastCheck: 0 }, expiresAt);
            set(req, res, value, QR_TTL);
            res.json({ success: true, qrId, url: `https://music.163.com/login?codekey=${encodeURIComponent(key)}`, expiresAt });
        } finally { starting--; }
    }));
    router.post('/qr/check', route(async (req, res) => {
        const value = token(req); const identity = owner(req);
        const state = sessions.read(value, identity);
        if (state?.profile) return res.json({ success: true, status: 'authorized', profile: state.profile });
        if (!state?.key || typeof req.body?.qrId !== 'string' || state.qrId !== req.body.qrId) return res.json({ success: true, status: 'expired' });
        if (locks.has(value) || sessions.now() - state.lastCheck < 2500) return res.json({ success: true, status: 'waiting' });
        locks.add(value);
        sessions.save(value, identity, { ...state, lastCheck: sessions.now() }, state.expiresAt);
        try {
            const reply = await provider.qrCheck(state.key);
            // Cancellation/replacement can race a provider response. It must
            // never resurrect a revoked or superseded browser session.
            if (sessions.read(value, identity)?.qrId !== state.qrId) return res.json({ success: true, status: 'expired' });
            if (reply.body.code === 803) {
                const profile = await provider.profile(reply.cookie);
                if (sessions.read(value, identity)?.qrId !== state.qrId) return res.json({ success: true, status: 'expired' });
                const next = sessions.newToken();
                sessions.save(next, identity, { cookie: reply.cookie, profile }, sessions.now() + LOGIN_TTL);
                sessions.remove(value); set(req, res, next, LOGIN_TTL);
                return res.json({ success: true, status: 'authorized', profile });
            }
            if (reply.body.code === 800) { sessions.remove(value); clear(req, res); return res.json({ success: true, status: 'expired' }); }
            if (![801, 802].includes(reply.body.code)) throw musicError('MUSIC_QR_CHECK_FAILED', '扫码状态暂时无法读取，请稍后再试');
            res.json({ success: true, status: reply.body.code === 802 ? 'scanned' : 'waiting' });
        } finally { locks.delete(value); }
    }));
    router.post('/logout', route(async (req, res) => { sessions.remove(token(req)); clear(req, res); res.json({ success: true }); }));
    router.get('/search', route(async (req, res) => {
        const state = account(req);
        if (typeof req.query.q !== 'string' || !req.query.q.trim() || req.query.q.length > 100) throw musicError('MUSIC_INVALID_INPUT', '请输入 1–100 个字的歌名或歌手', 400);
        res.json({ success: true, ...await provider.search(state.cookie, req.query.q.trim(), offset(req.query.offset)) });
    }));
    router.get('/playlists', route(async (req, res) => {
        const state = account(req);
        res.json({ success: true, ...await provider.playlists(state.cookie, state.profile.id, offset(req.query.offset)) });
    }));
    router.get('/playlists/:id', route(async (req, res) => { const state = account(req); res.json({ success: true, ...await provider.playlist(state.cookie, id(req.params.id), offset(req.query.offset)) }); }));
    router.get('/tracks/:id/playback', route(async (req, res) => { const state = account(req); res.json({ success: true, ...await provider.playback(state.cookie, id(req.params.id)) }); }));
    return router;
}
module.exports = { createMusicRouter, trusted, COOKIE };
