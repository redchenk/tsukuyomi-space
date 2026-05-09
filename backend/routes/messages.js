const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const messageRepository = require('../repositories/message-repository');
const notificationRepository = require('../repositories/notification-repository');

const router = express.Router();

function actorName(user) {
    return user?.username || '访客';
}

function messageLink(message) {
    return message?.article_id ? `/article?id=${message.article_id}` : '/plaza';
}

function notifyMessageOwner({ targetMessage, actor, type, title, content, relatedMessageId }) {
    if (!targetMessage?.user_id || targetMessage.user_id === actor.id) return;
    notificationRepository.createNotification({
        userId: targetMessage.user_id,
        actorId: actor.id,
        type,
        title,
        content,
        link: messageLink(targetMessage),
        relatedMessageId: relatedMessageId || targetMessage.id,
        relatedArticleId: targetMessage.article_id || null,
        metadata: {
            actorName: actorName(actor),
            messageId: targetMessage.id
        }
    });
}

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
        notifyMessageOwner({
            targetMessage: message,
            actor: req.user,
            type: 'like',
            title: `${actorName(req.user)} 点赞了你的留言`,
            content: message.content,
            relatedMessageId: message.id
        });
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
        notifyMessageOwner({
            targetMessage: originalMessage,
            actor: req.user,
            type: 'reply',
            title: `${actorName(req.user)} 回复了你的留言`,
            content,
            relatedMessageId: newMessage.id
        });
        res.status(201).json({ success: true, data: newMessage });
    } catch (error) {
        console.error('Reply message failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

module.exports = router;
