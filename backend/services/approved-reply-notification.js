const messageRepository = require('../repositories/message-repository');
const articleRepository = require('../repositories/article-repository');
const notificationRepository = require('../repositories/notification-repository');
const { articlePath } = require('../seo/render-article');
const { queueNotificationEmail } = require('./notification-email');

function notifyApprovedReply(messageId) {
    const reply = messageRepository.findMessageById(messageId);
    if (!reply?.parent_id || !reply.user_id || reply.status !== 'approved') return null;
    const parent = messageRepository.findMessageById(reply.parent_id);
    if (!parent?.user_id || parent.user_id === reply.user_id) return null;
    const actorName = reply.author || '访客';
    const title = `${actorName} 回复了你的${parent.article_id ? '评论' : '留言'}`;
    const article = parent.article_id ? articleRepository.findArticleById(parent.article_id) : null;
    const base = parent.article_id ? (article ? articlePath(article) : `/articles/${parent.article_id}`) : '/plaza';
    const link = `${base}#${parent.article_id ? 'comment' : 'msg'}-${parent.id}`;
    const notification = notificationRepository.createNotification({
        userId: parent.user_id,
        actorId: reply.user_id,
        type: 'reply',
        title,
        content: reply.content,
        link,
        relatedMessageId: reply.id,
        relatedArticleId: parent.article_id || null,
        metadata: { actorName, messageId: parent.id }
    });
    if (notification) queueNotificationEmail({
        userId: parent.user_id,
        actorId: reply.user_id,
        type: 'reply',
        title,
        content: reply.content,
        link,
        actorName
    });
    return notification;
}

module.exports = { notifyApprovedReply };
