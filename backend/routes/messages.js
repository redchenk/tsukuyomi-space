const express = require('express');
const db = require('../db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/security');
const messageRepository = require('../repositories/message-repository');
const notificationRepository = require('../repositories/notification-repository');
const { queueNotificationEmail } = require('../services/notification-email');
const { notifyPendingMessage } = require('../services/pending-message-notification');
const { notifyApprovedMessage } = require('../services/approved-reply-notification');
const articleRepository = require('../repositories/article-repository');
const socialRepository = require('../repositories/social-repository');
const { reviewMessageContent, readModerationSettings, messageModerationFeedback, messageSubmissionText } = require('../services/message-moderation');
const { articlePath } = require('../seo/render-article');
const responseCache = require('../services/response-cache');
const userGrowth = require('../services/user-growth');
const { setPublicReadCache } = require('../services/public-cache');
const { commitMessage, submitReply } = require('../services/message-submission');

const router = express.Router();
const messageWriteLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 12,
    keyPrefix: 'message-account',
    keyGenerator: req => req.user?.id || 'anonymous'
});

function rejectInvalidContent(res, review) {
    const moderation = messageModerationFeedback(review);
    return res.status(422).json({
        success: false,
        message: moderation.reasons.map(reason => reason.message).join(''),
        moderation,
        code: review.code || 'INVALID_CONTENT'
    });
}

function messageId(value) {
    const id = Number.parseInt(value, 10);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function clearMessageCaches(articleId = null) {
    responseCache.delPrefix(articleId ? `public:article-messages:${articleId}` : 'public:plaza-messages');
    responseCache.delPrefix('public:message-topics');
    responseCache.delPrefix('public:stats');
    responseCache.delPrefix('public:site-feed');
}

function actorName(user) {
    return user?.nickname || user?.username || '访客';
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
    const link = messageLink(targetMessage);
    const notification = notificationRepository.createNotification({
        userId: targetMessage.user_id,
        actorId: actor.id,
        type,
        title,
        content,
        link,
        relatedMessageId: relatedMessageId || targetMessage.id,
        relatedArticleId: targetMessage.article_id || null,
        metadata: {
            actorName: actorName(actor),
            messageId: targetMessage.id
        }
    });
    if (notification) queueNotificationEmail({
        userId: targetMessage.user_id,
        actorId: actor.id,
        type,
        title,
        content,
        link,
        actorName: actorName(actor)
    });
}

function messageNoun(message) {
    return message?.article_id ? '评论' : '留言';
}

function sendMessageList(req, res, articleId) {
    try {
        if (articleId && !articleRepository.findPublishedArticleById(articleId)) {
            return res.status(404).json({ success: false, message: 'Article not found' });
        }
        const key = articleId ? `public:article-messages:${articleId}` : 'public:plaza-messages';
        setPublicReadCache(res, { maxAge: articleId ? 5 : 8, stale: 20 });
        res.json(responseCache.remember(key, articleId ? 5000 : 8000, () => ({
            success: true,
            data: messageRepository.listMessages({ articleId, includePending: false })
        })));
    } catch (error) {
        console.error('Messages API error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
}

function positiveQuery(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) throw new Error('Invalid pagination');
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number > maximum) throw new Error('Invalid pagination');
    return number;
}

router.get('/', optionalAuth, (req, res) => {
    if (!req.query.view) return sendMessageList(req, res, req.query.article_id);
    if (!['plaza', 'thread'].includes(req.query.view) || req.query.article_id !== undefined) {
        return res.status(400).json({ success: false, message: '留言参数无效' });
    }
    let options;
    try {
        const limit = Math.min(positiveQuery(req.query.limit, req.query.view === 'plaza' ? 8 : 20), 24);
        if (req.query.view === 'thread') {
            options = { rootId: positiveQuery(req.query.thread_id, null), limit, beforeId: positiveQuery(req.query.before_id, null) };
            if (!options.rootId) throw new Error('Missing thread');
        } else {
            const sort = req.query.sort || 'latest';
            if (!['latest', 'hot', 'replied', 'mine'].includes(sort) || (req.query.q !== undefined && typeof req.query.q !== 'string')) throw new Error('Invalid filters');
            if (sort === 'mine' && !req.user?.id) return res.status(401).json({ success: false, message: '请先登录' });
            options = { page: positiveQuery(req.query.page, 1, 100000), limit, sort,
                search: String(req.query.q || '').trim().slice(0, 120), userId: sort === 'mine' ? req.user.id : '',
                anchorId: positiveQuery(req.query.anchor_id, null) };
        }
    } catch (_) { return res.status(400).json({ success: false, message: '留言参数无效' }); }
    try {
        setPublicReadCache(res);
        const read = () => req.query.view === 'plaza'
            ? messageRepository.listPlazaPage(options)
            : messageRepository.listPlazaReplies(options.rootId, options);
        const data = options.sort === 'mine' ? read() : responseCache.remember(`public:plaza-messages:${req.query.view}:${JSON.stringify(options)}`, 5000, read);
        if (!data) return res.status(404).json({ success: false, message: '留言不存在或未公开' });
        return res.json({ success: true, data });
    } catch (error) {
        console.error('Plaza page API error:', error);
        return res.status(500).json({ success: false, message: '无法读取留言' });
    }
});

function recordPlazaGrowth(userId, activityKey, messageId) {
    try {
        return userGrowth.recordDailyActivity(userId, activityKey, messageId);
    } catch (error) {
        console.error('Record plaza growth failed:', error);
        return null;
    }
}

router.get('/plaza/latest', (req, res) => {
    try {
        const limit = Math.max(1, Math.min(Number.parseInt(req.query.limit, 10) || 4, 12));
        setPublicReadCache(res, { maxAge: 5, stale: 20 });
        res.json(responseCache.remember(`public:plaza-messages:latest:${limit}`, 5000, () => ({
            success: true,
            data: messageRepository.listRecentPublicMessages(limit).map(message => ({
                id: message.id,
                author: message.author,
                author_nickname: message.author_nickname,
                avatar: message.avatar,
                content: message.content,
                created_at: message.created_at
            }))
        })));
    } catch (error) {
        console.error('Latest plaza messages API error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/plaza/:nonce', (req, res) => {
    sendMessageList(req, res, null);
});

router.get('/topics', (req, res) => {
    try {
        const limit = req.query.limit;
        const days = req.query.days;
        setPublicReadCache(res, { maxAge: 30, stale: 60 });
        res.json(responseCache.remember(`public:message-topics:${limit || ''}:${days || ''}`, 30000, () => ({
            success: true,
            data: socialRepository.listTrendingTopics({
                limit,
                days
            })
        })));
    } catch (error) {
        console.error('Trending topics failed:', error);
        res.status(500).json({ success: false, message: '热门话题读取失败' });
    }
});

router.get('/liked', authenticateToken, (req, res) => {
    let ids = null;
    if (req.query.ids !== undefined) {
        if (typeof req.query.ids !== 'string' || req.query.ids.length > 1500) return res.status(400).json({ success: false, message: '留言参数无效' });
        ids = [...new Set(req.query.ids.split(','))];
        if (!ids.length || ids.length > 64 || ids.some(id => !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))) return res.status(400).json({ success: false, message: '留言参数无效' });
    }
    try {
        res.set({
            'Cache-Control': 'private, no-store',
            'Vary': 'Cookie, Authorization, Accept-Encoding'
        });
        res.json({ success: true, data: messageRepository.listMessageLikeIds(req.user.id, ids) });
    } catch (error) {
        console.error('List message likes failed:', error);
        res.status(500).json({ success: false, message: 'Unable to load liked messages' });
    }
});

router.get('/mine', authenticateToken, (req, res) => {
    try {
        res.set('Cache-Control', 'private, no-store');
        const settings = readModerationSettings();
        res.json({
            success: true,
            data: messageRepository.listUserMessages(req.user.id, {
                limit: req.query.limit,
                offset: req.query.offset
            }).map(message => ({
                ...message,
                // Existing records have no historical reason snapshot. Label
                // this as a current-rule explanation; never auto-approve them.
                moderation: message.status === 'approved' ? null : {
                    ...messageModerationFeedback(reviewMessageContent(message.content, settings)),
                    status: 'pending',
                    basis: '以下原因按当前审核规则说明',
                    nextStep: '内容已保存，正在等待人工审核。你可以修改后重新提交。'
                }
            }))
        });
    } catch (error) {
        console.error('List user messages failed:', error);
        res.status(500).json({ success: false, message: '留言列表读取失败' });
    }
});

router.post('/', authenticateToken, messageWriteLimiter, (req, res) => {
    try {
        const { content, article_id } = req.body || {};
        const review = reviewMessageContent(content);
        if (!review.accepted) return rejectInvalidContent(res, review);
        if (article_id && !articleRepository.findPublishedArticleById(article_id)) {
            return res.status(404).json({ success: false, message: '文章不存在或未公开' });
        }

        const newMessage = commitMessage({
            author: req.user.username,
            content: review.content,
            userId: req.user.id,
            articleId: article_id || null,
            status: review.status
        }, req.user);
        const growth = review.status === 'approved' && !article_id
            ? recordPlazaGrowth(req.user.id, 'plaza_message', newMessage.id)
            : null;
        res.status(201).json({
            success: true,
            data: { ...newMessage, moderation: messageModerationFeedback(review) },
            growth,
            moderation: messageModerationFeedback(review),
            message: messageSubmissionText(review, article_id ? '评论' : '留言')
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
        responseCache.delPrefix('public:message-topics');
        notifyMessageOwner({
            targetMessage: message,
            actor: req.user,
            type: 'like',
            title: `${actorName(req.user)} 点赞了你的${messageNoun(message)}`,
            content: message.content,
            relatedMessageId: message.id
        });
        const growth = !message.article_id
            ? recordPlazaGrowth(req.user.id, 'plaza_like', message.id)
            : null;
        res.json({ success: true, data: { ...message, viewer_liked: true }, growth });
    } catch (error) {
        console.error('Like message failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.post('/:id/reply', authenticateToken, messageWriteLimiter, (req, res) => {
    try {
        const { message: newMessage, review } = submitReply({ user: req.user, targetId: req.params.id, content: req.body?.content });
        const growth = review.status === 'approved' && !newMessage.article_id
            ? recordPlazaGrowth(req.user.id, 'plaza_message', newMessage.id)
            : null;
        res.status(201).json({
            success: true,
            data: { ...newMessage, moderation: messageModerationFeedback(review) },
            growth,
            moderation: messageModerationFeedback(review),
            message: messageSubmissionText(review, '回复')
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message,
            code: error.code, ...(error.moderation ? { moderation: error.moderation } : {}) });
        console.error('Reply message failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.patch('/:id', authenticateToken, messageWriteLimiter, (req, res) => {
    try {
        const id = messageId(req.params.id);
        if (!id) return res.status(400).json({ success: false, message: '留言 ID 无效' });
        const existing = messageRepository.findUserMessageById(id, req.user.id);
        if (!existing) return res.status(404).json({ success: false, message: '留言不存在' });

        const review = reviewMessageContent(req.body?.content);
        if (!review.accepted) return rejectInvalidContent(res, review);
        const updated = db.transaction(() => {
            const changed = messageRepository.updateUserMessage(id, req.user.id, { content: review.content, status: review.status });
            if (existing.status !== 'pending' && changed.status === 'pending') notifyPendingMessage(id);
            if (existing.status !== 'approved' && changed.status === 'approved') notifyApprovedMessage(id);
            return changed;
        })();
        clearMessageCaches(existing.article_id);
        res.json({
            success: true,
            data: { ...updated, moderation: messageModerationFeedback(review) },
            moderation: messageModerationFeedback(review),
            message: messageSubmissionText(review, existing.parent_id ? '回复' : messageNoun(existing), true)
        });
    } catch (error) {
        console.error('Update user message failed:', error);
        res.status(500).json({ success: false, message: '留言更新失败' });
    }
});

router.delete('/:id', authenticateToken, (req, res) => {
    try {
        const id = messageId(req.params.id);
        if (!id) return res.status(400).json({ success: false, message: '留言 ID 无效' });
        const deleted = messageRepository.deleteUserMessage(id, req.user.id);
        if (!deleted) return res.status(404).json({ success: false, message: '留言不存在' });
        clearMessageCaches(deleted.article_id);
        res.json({ success: true, message: '留言已删除' });
    } catch (error) {
        console.error('Delete user message failed:', error);
        res.status(500).json({ success: false, message: '留言删除失败' });
    }
});

module.exports = router;
