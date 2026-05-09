const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const messageRepository = require('../repositories/message-repository');

const router = express.Router();

router.get('/', (req, res) => {
    try {
        const messages = messageRepository.listMessages({ articleId: req.query.article_id });
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

        const newMessage = messageRepository.createMessage({
            author: req.user.username,
            content,
            userId: req.user.id,
            articleId: article_id || null
        });
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
        const existing = messageRepository.findMessageLike(messageId, userId);
        if (existing) {
            return res.status(400).json({ success: false, message: '请求处理失败' });
        }

        const message = messageRepository.likeMessage(messageId, userId);
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

        const originalMessage = messageRepository.findMessageById(messageId);
        if (!originalMessage) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }

        const newMessage = messageRepository.createMessage({
            author: req.user.username,
            content,
            userId: req.user.id,
            parentId: messageId,
            articleId: originalMessage.article_id || null
        });
        res.status(201).json({ success: true, data: newMessage });
    } catch (error) {
        console.error('Reply message failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

module.exports = router;
