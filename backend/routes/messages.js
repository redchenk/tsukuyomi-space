const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const messageRepository = require('../repositories/message-repository');
const notificationRepository = require('../repositories/notification-repository');
const articleRepository = require('../repositories/article-repository');
const { reviewMessageContent } = require('../services/message-moderation');
const { articlePath } = require('../seo/render-article');
const responseCache = require('../services/response-cache');

const router = express.Router();

function actorName(user) {
    return user?.username || '访客';
}

function messageLink(message) {
    if (!message?.article_id) return '/plaza';
    const article = articleRepository.findArticleById(message.article_id);
    return article ? articlePath(article) : `/articles/${message.article_id}`;
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

function sendMessageList(req, res, articleId) {
    try {
        const key = articleId ? `public:article-messages:${articleId}` : 'public:plaza-messages';
        res.json(responseCache.remember(key, 4000, () => ({
            success: true,
            data: messageRepository.listMessages({ articleId, includePending: false })
        })));
    } catch (error) {
        console.error('Messages API error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

router.get('/', (req, res) => {
    sendMessageList(req, res, req.query.article_id);
});

router.get('/plaza/:nonce', (req, res) => {
    sendMessageList(req, res, null);
});

router.post('/', authenticateToken, (req, res) => {
    try {
        const { content, article_id } = req.body;
        if (!content) {
            return res.status(400).json({ success: false, message: '留言内容不能为空' });
        }

        const review = reviewMessageContent(content);
        const newMessage = messageRepository.createMessage({
            author: req.user.username,
            content,
            userId: req.user.id,
            articleId: article_id || null,
            status: review.status
        });
        if (review.status === 'approved') {
            responseCache.delPrefix(article_id ? `public:article-messages:${article_id}` : 'public:plaza-messages');
            responseCache.delPrefix('public:stats');
        }
        res.status(201).json({
            success: true,
            data: newMessage,
            message: review.status === 'approved' ? '留言已发布' : '留言已提交，审核通过后会公开显示'
        });
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

        const visibleMessage = messageRepository.findApprovedMessageById(messageId);
        if (!visibleMessage) {
            return res.status(404).json({ success: false, message: '留言不存在或仍在审核中' });
        }

        const message = messageRepository.likeMessage(messageId, userId);
        responseCache.delPrefix(message.article_id ? `public:article-messages:${message.article_id}` : 'public:plaza-messages');
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

        const originalMessage = messageRepository.findApprovedMessageById(messageId);
        if (!originalMessage) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }

        const review = reviewMessageContent(content);
        const newMessage = messageRepository.createMessage({
            author: req.user.username,
            content,
            userId: req.user.id,
            parentId: messageId,
            articleId: originalMessage.article_id || null,
            status: review.status
        });
        if (review.status === 'approved') {
            responseCache.delPrefix(originalMessage.article_id ? `public:article-messages:${originalMessage.article_id}` : 'public:plaza-messages');
            responseCache.delPrefix('public:stats');
            notifyMessageOwner({
                targetMessage: originalMessage,
                actor: req.user,
                type: 'reply',
                title: `${actorName(req.user)} 回复了你的留言`,
                content,
                relatedMessageId: newMessage.id
            });
        }
        res.status(201).json({
            success: true,
            data: newMessage,
            message: review.status === 'approved' ? '回复已发布' : '回复已提交，审核通过后会公开显示'
        });
    } catch (error) {
        console.error('Reply message failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

module.exports = router;
