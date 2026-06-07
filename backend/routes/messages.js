const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const messageRepository = require('../repositories/message-repository');
const notificationRepository = require('../repositories/notification-repository');
const articleRepository = require('../repositories/article-repository');
const socialRepository = require('../repositories/social-repository');
const { reviewMessageContent } = require('../services/message-moderation');
const { articlePath } = require('../seo/render-article');
const responseCache = require('../services/response-cache');

const router = express.Router();

function actorName(user) {
    return user?.username || '访客';
}

function messageLink(message) {
    const anchorId = message?.parent_id || message?.id;
    if (!message?.article_id) return anchorId ? `/plaza#msg-${anchorId}` : '/plaza';
    const article = articleRepository.findArticleById(message.article_id);
    const base = article ? articlePath(article) : `/articles/${message.article_id}`;
    return anchorId ? `${base}#comment-${anchorId}` : base;
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

function messageNoun(message) {
    return message?.article_id ? '评论' : '留言';
}

function notifyMentions({ message, actor }) {
    const mentionedUsers = socialRepository.findUsersByUsernames(
        socialRepository.extractMentionNames(message?.content || '')
    );
    mentionedUsers.forEach((user) => {
        if (!user?.id || user.id === actor.id) return;
        socialRepository.recordMessageMention({
            messageId: message.id,
            mentionedUserId: user.id,
            actorId: actor.id
        });
        notificationRepository.createNotification({
            userId: user.id,
            actorId: actor.id,
            type: 'mention',
            title: `${actorName(actor)} 在${messageNoun(message)}中提到了你`,
            content: message.content,
            link: messageLink(message),
            relatedMessageId: message.id,
            relatedArticleId: message.article_id || null,
            metadata: {
                actorName: actorName(actor),
                messageId: message.id
            }
        });
    });
}

function sendMessageList(req, res, articleId) {
    try {
        if (articleId && !articleRepository.findPublishedArticleById(articleId)) {
            return res.status(404).json({ success: false, message: 'Article not found' });
        }
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

router.get('/topics', (req, res) => {
    try {
        res.json({
            success: true,
            data: socialRepository.listTrendingTopics({
                limit: req.query.limit,
                days: req.query.days
            })
        });
    } catch (error) {
        console.error('Trending topics failed:', error);
        res.status(500).json({ success: false, message: '热门话题读取失败' });
    }
});

router.post('/', authenticateToken, (req, res) => {
    try {
        const { content, article_id } = req.body;
        if (!content) {
            return res.status(400).json({ success: false, message: '留言内容不能为空' });
        }
        if (article_id && !articleRepository.findPublishedArticleById(article_id)) {
            return res.status(404).json({ success: false, message: '文章不存在或未公开' });
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
            notifyMentions({ message: newMessage, actor: req.user });
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
        if (visibleMessage.article_id && !articleRepository.findPublishedArticleById(visibleMessage.article_id)) {
            return res.status(404).json({ success: false, message: '文章不存在或未公开' });
        }

        const message = messageRepository.likeMessage(messageId, userId);
        responseCache.delPrefix(message.article_id ? `public:article-messages:${message.article_id}` : 'public:plaza-messages');
        notifyMessageOwner({
            targetMessage: message,
            actor: req.user,
            type: 'like',
            title: `${actorName(req.user)} 点赞了你的${messageNoun(message)}`,
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
        if (originalMessage.article_id && !articleRepository.findPublishedArticleById(originalMessage.article_id)) {
            return res.status(404).json({ success: false, message: '文章不存在或未公开' });
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
                title: `${actorName(req.user)} 回复了你的${messageNoun(originalMessage)}`,
                content,
                relatedMessageId: newMessage.id
            });
            notifyMentions({ message: newMessage, actor: req.user });
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
