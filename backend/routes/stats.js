const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
    try {
        const articles = db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(view_count), 0) AS views FROM articles').get();
        const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
        const messageCount = db.prepare('SELECT COUNT(*) AS count FROM messages').get().count;
        const views = db.prepare(`
            SELECT
                SUM(CASE WHEN date(created_at) = date('now', 'localtime') THEN 1 ELSE 0 END) AS today,
                SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS week,
                COUNT(*) AS total
            FROM stats
            WHERE event_type = 'view'
        `).get();

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
        db.prepare('INSERT INTO stats (event_type, event_data) VALUES (?, ?)').run('view', eventData);
        res.json({ success: true, message: '操作成功' });
    } catch (error) {
        console.error('Record view failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

module.exports = router;
