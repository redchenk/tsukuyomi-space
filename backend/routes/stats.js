const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
    try {
        const articleCount = db.prepare('SELECT COUNT(*) AS count FROM articles').get().count;
        const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
        const messageCount = db.prepare('SELECT COUNT(*) AS count FROM messages').get().count;

        res.json({
            success: true,
            data: {
                articles: articleCount,
                users: userCount,
                messages: messageCount,
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
