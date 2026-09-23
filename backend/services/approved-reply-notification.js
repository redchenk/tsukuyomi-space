const messageRepository = require('../repositories/message-repository');
const articleRepository = require('../repositories/article-repository');
const notificationRepository = require('../repositories/notification-repository');
const { articlePath } = require('../seo/render-article');
const { queueNotificationEmail } = require('./notification-email');

function notifyApprovedMessage(messageId) {
    const message = messageRepository.findMessageById(messageId);
    if (!message?.user_id || message.status !== 'approved') return null;

    const actorName = message.author || '访客';
    let recipientId;
    let title;
    let link;
    let relatedArticleId = null;
    let metadata;

    if (message.parent_id) {
        const parent = messageRepository.findMessageById(message.parent_id);
        if (!parent?.user_id || parent.user_id === message.user_id) return null;
        const article = parent.article_id ? articleRepository.findPublishedArticleById(parent.article_id) : null;
        if (parent.article_id && !article) return null;
        const base = article ? articlePath(article) : '/plaza';
        recipientId = parent.user_id;
        title = `${actorName} 回复了你的${parent.article_id ? '评论' : '留言'}`;
        link = `${base}#${parent.article_id ? 'comment' : 'msg'}-${parent.id}`;
        relatedArticleId = parent.article_id || null;
        metadata = { actorName, messageId: parent.id };
    } else if (message.article_id) {
        const article = articleRepository.findPublishedArticleById(message.article_id);
        if (!article?.author_id || article.author_id === message.user_id) return null;
        recipientId = article.author_id;
        title = `${actorName} 评论了你的文章《${article.title}》`;
        link = `${articlePath(article)}#comment-${message.id}`;
        relatedArticleId = article.id;
        metadata = { actorName, messageId: message.id, articleId: article.id };
    } else {
        return null;
    }

    const notification = notificationRepository.createNotification({
        userId: recipientId,
        actorId: message.user_id,
        type: 'reply',
        title,
        content: message.content,
        link,
        relatedMessageId: message.id,
        relatedArticleId,
        metadata
    });
    if (notification) queueNotificationEmail({
        userId: recipientId,
        actorId: message.user_id,
        type: 'reply',
        title,
        content: message.content,
        link,
        actorName
    });
    return notification;
}

module.exports = { notifyApprovedMessage };
