const express = require('express');
const statsRepository = require('../repositories/stats-repository');

const router = express.Router();

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
                totalViews: Math.max(views.total || 0, articles.views || 0),
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
        const eventData = JSON.stringify({
            path: req.body?.path || req.headers.referer || '',
            userAgent: req.headers['user-agent'] || '',
            ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
        });
        const duplicate = statsRepository.findRecentView(eventData, 5);
        if (duplicate) {
            return res.json({ success: true, message: '操作成功', deduped: true });
        }
        statsRepository.recordView(eventData);
        res.json({ success: true, message: '操作成功' });
    } catch (error) {
        console.error('Record view failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

module.exports = router;
