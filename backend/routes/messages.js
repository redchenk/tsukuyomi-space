const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
    try {
        const articleId = req.query.article_id;
        const query = articleId
            ? `
                SELECT m.*, u.avatar
                FROM messages m
                LEFT JOIN users u ON m.user_id = u.id
                WHERE m.article_id = ?
                ORDER BY m.created_at ASC
            `
            : `
                SELECT m.*, u.avatar
                FROM messages m
                LEFT JOIN users u ON m.user_id = u.id
                WHERE m.article_id IS NULL
                ORDER BY m.created_at DESC
            `;
        const messages = articleId ? db.prepare(query).all(articleId) : db.prepare(query).all();
        res.json({ success: true, data: messages });
    } catch (error) {
        console.error('Messages API error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/', authenticateToken, (req, res) => {
    try {
        const { content, article_id } = req.body;
        if (!content) {
            return res.status(400).json({ success: false, message: '留言内容不能为空' });
        }

        const result = db.prepare(`
            INSERT INTO messages (author, content, user_id, article_id)
            VALUES (?, ?, ?, ?)
        `).run(req.user.username, content, req.user.id, article_id || null);

        const newMessage = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ success: true, data: newMessage });
    } catch (error) {
        console.error('Create message failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.post('/:id/like', authenticateToken, (req, res) => {
    try {
        const messageId = req.params.id;
        const userId = req.user.id;
        const existing = db.prepare('SELECT id FROM message_likes WHERE message_id = ? AND user_id = ?').get(messageId, userId);
        if (existing) {
            return res.status(400).json({ success: false, message: '请求处理失败' });
        }

        db.prepare('INSERT INTO message_likes (message_id, user_id) VALUES (?, ?)').run(messageId, userId);
        db.prepare('UPDATE messages SET like_count = like_count + 1 WHERE id = ?').run(messageId);

        const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
        res.json({ success: true, data: message });
    } catch (error) {
        console.error('Like message failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.post('/:id/reply', authenticateToken, (req, res) => {
    try {
        const messageId = req.params.id;
        const { content } = req.body;
        if (!content) {
            return res.status(400).json({ success: false, message: '回复内容不能为空' });
        }

        const originalMessage = db.prepare('SELECT id FROM messages WHERE id = ?').get(messageId);
        if (!originalMessage) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }

        const result = db.prepare(`
            INSERT INTO messages (author, content, user_id, parent_id)
            VALUES (?, ?, ?, ?)
        `).run(req.user.username, content, req.user.id, messageId);

        const newMessage = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ success: true, data: newMessage });
    } catch (error) {
        console.error('Reply message failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

module.exports = router;
