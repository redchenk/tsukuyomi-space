const express = require('express');
const statsRepository = require('../repositories/stats-repository');

const router = express.Router();

function normalizeIp(value) {
    return String(value || '')
        .split(',')[0]
        .trim()
        .replace(/^::ffff:/, '') || 'unknown';
}

function clientIp(req) {
    return normalizeIp(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '');
}

router.get('/', (req, res) => {
    try {
        const articles = statsRepository.articleCounters();
        const userCount = statsRepository.userCount();
        const messageCount = statsRepository.messageCount();
        const views = statsRepository.publicViewCounters();

        res.json({
            success: true,
            data: {
                articles: articles.count || 0,
                articleViews: articles.views || 0,
                users: userCount,
                messages: messageCount,
                todayViews: views.today || 0,
                weekViews: views.week || 0,
                totalViews: views.total || 0,
                uptime: process.uptime()
            }
        });
    } catch (error) {
        console.error('Read stats failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.post('/view', (req, res) => {
    try {
        const ip = clientIp(req);
        const duplicate = statsRepository.findViewByIp(ip);
        if (duplicate) {
            return res.json({ success: true, message: '操作成功', deduped: true });
        }
        const eventData = JSON.stringify({
            path: req.body?.path || req.headers.referer || '',
            userAgent: req.headers['user-agent'] || '',
            ip
        });
        statsRepository.recordView(eventData);
        res.json({ success: true, message: '操作成功' });
    } catch (error) {
        console.error('Record view failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

module.exports = router;
