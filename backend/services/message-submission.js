const db = require('../db');
const messages = require('../repositories/message-repository');
const articles = require('../repositories/article-repository');
const notifications = require('../repositories/notification-repository');
const social = require('../repositories/social-repository');
const cache = require('./response-cache');
const { notifyApprovedMessage } = require('./approved-reply-notification');
const { notifyPendingMessage } = require('./pending-message-notification');
const { reviewMessageContent, messageModerationFeedback } = require('./message-moderation');
const { articlePath } = require('../seo/render-article');

function submissionError(code, message, status, moderation) {
    const error = new Error(message);
    Object.assign(error, { code, status, moderation });
    return error;
}
function notifyMentions(message, actor) {
    const rootId = message.parent_id || message.id;
    const article = message.article_id ? articles.findPublishedArticleById(message.article_id) : null;
    const link = article ? `${articlePath(article)}#comment-${rootId}` : `/plaza#msg-${rootId}`;
    for (const user of social.findUsersByUsernames(social.extractMentionNames(message.content))) {
        if (!user?.id || user.id === actor.id) continue;
        social.recordMessageMention({ messageId: message.id, mentionedUserId: user.id, actorId: actor.id });
        notifications.createNotification({ userId: user.id, actorId: actor.id, type: 'mention',
            title: `${actor.nickname || actor.username} 在${message.article_id ? '评论' : '留言'}中提到了你`,
            content: message.content, link, relatedMessageId: message.id,
            relatedArticleId: message.article_id || null,
            metadata: { actorName: actor.nickname || actor.username, messageId: message.id } });
    }
}
function clearMessageCaches(articleId) {
    cache.delPrefix(articleId ? `public:article-messages:${articleId}` : 'public:plaza-messages');
    for (const prefix of ['public:message-topics', 'public:stats', 'public:site-feed']) cache.delPrefix(prefix);
}
function commitMessage(args, user) {
    const message = db.transaction(() => {
        const created = messages.createMessage(args);
        if (created.status === 'approved') {
            notifyApprovedMessage(created.id);
            notifyMentions(created, user);
        } else notifyPendingMessage(created.id);
        return created;
    })();
    clearMessageCaches(message.article_id);
    return message;
}
function submitReply({ user, targetId, content }) {
    const review = reviewMessageContent(content);
    if (!review.accepted) {
        const moderation = messageModerationFeedback(review);
        throw submissionError(review.code, moderation.reasons.map(reason => reason.message).join(''), 422, moderation);
    }
    const target = messages.findApprovedMessageById(targetId);
    if (!target || (target.article_id && !articles.findPublishedArticleById(target.article_id))) {
        throw submissionError('NOT_FOUND', '这条讨论不存在或未公开', 404);
    }
    const root = messages.findReplyThreadRoot(target);
    if (!root) throw submissionError('NOT_FOUND', '这条讨论不存在或未公开', 404);
    const message = commitMessage({ author: user.username, userId: user.id, content: review.content,
        articleId: target.article_id || null, parentId: root.id, replyToId: target.id,
        replyToAuthor: target.author, status: review.status }, user);
    return { message, review, moderation: messageModerationFeedback(review) };
}
module.exports = { commitMessage, submitReply, clearMessageCaches };
