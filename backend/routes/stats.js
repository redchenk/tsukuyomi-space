const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const { optionalAuth } = require('../middleware/auth');
const statsRepository = require('../repositories/stats-repository');

const router = express.Router();
const VISITOR_COOKIE = 'tsukuyomi_visitor';
const VISITOR_COOKIE_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;

function siteUptimeSeconds() {
    const launchedAt = Number.isFinite(config.siteLaunchedAtMs) ? config.siteLaunchedAtMs : Date.now();
    return Math.max(0, Math.floor((Date.now() - launchedAt) / 1000));
}

function normalizeIp(value) {
    return String(value || '')
        .split(',')[0]
        .trim()
        .replace(/^::ffff:/, '') || 'unknown';
}

function clientIp(req) {
    return normalizeIp(req.ip || req.socket.remoteAddress || '');
}

function readCookie(req, name) {
    const header = String(req.headers.cookie || '');
    for (const part of header.split(';')) {
        const index = part.indexOf('=');
        if (index < 0 || part.slice(0, index).trim() !== name) continue;
        try {
            return decodeURIComponent(part.slice(index + 1).trim());
        } catch (_) {
            return part.slice(index + 1).trim();
        }
    }
    return '';
}

function opaqueKey(namespace, value) {
    return crypto
        .createHmac('sha256', config.jwtSecret)
        .update(`${namespace}\n${String(value || '')}`)
        .digest('base64url');
}

function visitorIdentity(req, res) {
    const existingVisitorId = readCookie(req, VISITOR_COOKIE);
    const hasVisitorCookie = /^[A-Za-z0-9_-]{20,128}$/.test(existingVisitorId);
    const visitorId = hasVisitorCookie ? existingVisitorId : crypto.randomUUID();
    if (!hasVisitorCookie) {
        res.cookie(VISITOR_COOKIE, visitorId, {
            httpOnly: true,
            secure: config.isProduction,
            sameSite: 'lax',
            path: '/',
            maxAge: VISITOR_COOKIE_MAX_AGE_MS,
            ...(config.authCookieDomain ? { domain: config.authCookieDomain } : {})
        });
    }

    const userAgent = String(req.headers['user-agent'] || '');
    const browserKey = `visitor:${opaqueKey('visitor-cookie', visitorId)}`;
    const fallbackKey = `fallback:${opaqueKey('visitor-fallback', `${clientIp(req)}\n${userAgent}\n${req.headers['accept-language'] || ''}`)}`;
    const authenticated = Boolean(req.user?.id);
    const accountNamespace = req.user?.scope === 'admin' ? 'admin' : 'user';

    return {
        authenticated,
        browserKey,
        userAgent,
        visitorKey: authenticated
            ? `account:${accountNamespace}:${req.user.id}`
            : (hasVisitorCookie ? browserKey : fallbackKey)
    };
}

function statsPayload() {
    const articles = statsRepository.articleCounters();
    const userCount = statsRepository.userCount();
    const messageCount = statsRepository.messageCount();
    const views = statsRepository.publicViewCounters();

    return {
        articles: articles.count || 0,
        articleViews: articles.views || 0,
        users: userCount,
        messages: messageCount,
        todayViews: views.today || 0,
        weekViews: views.week || 0,
        totalViews: views.total || 0,
        uptime: siteUptimeSeconds()
    };
}

function setLiveStatsHeaders(res) {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store',
        'Vary': 'Accept-Encoding'
    });
}

function publicViewPath(value) {
    if (typeof value !== 'string' || value.length > 4096) return '';
    try {
        const url = new URL(value, 'https://stats.invalid');
        return ['http:', 'https:'].includes(url.protocol) ? url.pathname.slice(0, 2048) : '';
    } catch (_) {
        return '';
    }
}

function sendStats(req, res) {
    try {
        setLiveStatsHeaders(res);
        res.json({
            success: true,
            data: statsPayload()
        });
    } catch (error) {
        console.error('Read stats failed:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

const measurement = require('../services/growth-measurement');
const { createRateLimiter } = require('../middleware/security');
const clientSignals = new Set(['room','chatroom','article_load_failed','login','register','room_config','room_attempt','room_login','room_quota','room_timeout','room_failed','room_local_reply','runner_100','gomoku_finish']);
router.post('/journey', optionalAuth, createRateLimiter({windowMs:60000,max:240,keyPrefix:'growth-journey'}), async (req,res,next) => {
    try {
        const {kind='',key='',moves,score} = req.body || {};
        if (typeof kind !== 'string' || (kind && !clientSignals.has(kind)) || typeof key !== 'string' || !/^[\w.-]{0,100}$/.test(key)) return res.sendStatus(400);
        let objectKey = key ? measurement.hash(key) : '';
        if (kind === 'runner_100' && (!Number.isSafeInteger(score) || score < 100)) return res.sendStatus(400);
        if (kind === 'room_local_reply' && (req.user || !key)) return res.sendStatus(400);
        if (kind === 'gomoku_finish') {
            if (!Array.isArray(moves) || moves.length < 9 || moves.length > 225) return res.sendStatus(400);
            const { restoreGame } = await import('../../shared/gomoku.mjs');
            const game = restoreGame({version:1,human:1,difficulty:'casual',moves});
            if (!game || (!game.winner && !game.draw)) return res.sendStatus(400);
            objectKey = measurement.hash(JSON.stringify(moves));
        }
        measurement.record(req,kind,objectKey);
        return res.sendStatus(204);
    } catch (error) { next(error); }
});

router.get('/', sendStats);
router.get('/live/:nonce', sendStats);

router.post('/view', optionalAuth, (req, res) => {
    try {
        const identity = visitorIdentity(req, res);
        // OAuth queries and URL credentials must never enter persistent analytics.
        const path = publicViewPath(req.body?.path || req.headers.referer || '');
        const eventData = JSON.stringify({
            path,
            userAgent: identity.userAgent,
            identity: identity.authenticated ? 'account' : 'visitor'
        });
        const outcome = statsRepository.recordDailyView({
            eventData,
            visitorKey: identity.visitorKey,
            browserKey: identity.browserKey,
            path,
            userAgent: identity.userAgent,
            authenticated: identity.authenticated
        });
        setLiveStatsHeaders(res);
        res.json({
            success: true,
            message: 'OK',
            recorded: outcome.recorded,
            deduped: outcome.deduped,
            data: statsPayload()
        });
    } catch (error) {
        console.error('Record view failed:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
