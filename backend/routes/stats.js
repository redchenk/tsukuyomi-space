const express = require('express');
const config = require('../config');
const statsRepository = require('../repositories/stats-repository');
const responseCache = require('../services/response-cache');

const router = express.Router();

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
    return normalizeIp(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '');
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

function setPublicStatsCache(res) {
    res.set({
        'Cache-Control': 'public, max-age=15, stale-while-revalidate=45',
        'Vary': 'Accept-Encoding'
    });
    res.removeHeader('Pragma');
    res.removeHeader('Expires');
    res.removeHeader('Surrogate-Control');
}

function sendStats(req, res) {
    try {
        setPublicStatsCache(res);
        res.json({
            success: true,
            data: responseCache.remember('public:stats', 15000, statsPayload)
        });
    } catch (error) {
        console.error('Read stats failed:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}

router.get('/', sendStats);
router.get('/live/:nonce', sendStats);

router.post('/view', (req, res) => {
    try {
        const ip = clientIp(req);
        const duplicate = statsRepository.findViewByIp(ip);
        if (duplicate) {
            return res.json({ success: true, message: 'OK', deduped: true });
        }
        const eventData = JSON.stringify({
            path: req.body?.path || req.headers.referer || '',
            userAgent: req.headers['user-agent'] || '',
            ip
        });
        statsRepository.recordView({
            eventData,
            visitorKey: ip,
            path: req.body?.path || req.headers.referer || '',
            userAgent: req.headers['user-agent'] || ''
        });
        responseCache.delPrefix('public:stats');
        res.json({ success: true, message: 'OK' });
    } catch (error) {
        console.error('Record view failed:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
