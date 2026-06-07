const db = require('../db');
const { compactAvatar } = require('../utils/avatar');

const MENTION_PATTERN = /@([A-Za-z0-9_\-\u4e00-\u9fff\u3040-\u30ff]{2,32})/gu;
const TOPIC_PATTERN = /#([A-Za-z0-9_\-\u4e00-\u9fff\u3040-\u30ff]{2,28})#?/gu;

function uniqueValues(values) {
    return [...new Set(values.map(item => String(item || '').trim()).filter(Boolean))];
}

function extractMentionNames(content = '') {
    return uniqueValues([...String(content || '').matchAll(MENTION_PATTERN)].map(match => match[1])).slice(0, 12);
}

function extractTopics(content = '') {
    return uniqueValues([...String(content || '').matchAll(TOPIC_PATTERN)].map(match => match[1])).slice(0, 8);
}

function placeholders(values) {
    return values.map(() => '?').join(',');
}

function findUsersByUsernames(usernames = []) {
    const names = uniqueValues(usernames).slice(0, 20);
    if (!names.length) return [];
    const lowerNames = names.map(name => name.toLowerCase());
    return db.prepare(`
        SELECT id, username, avatar, bio, role, created_at
        FROM users
        WHERE lower(username) IN (${placeholders(lowerNames)})
    `).all(...lowerNames).map(row => ({ ...row, avatar: compactAvatar(row.avatar) }));
}

function findUserByUsername(username) {
    const value = String(username || '').trim().toLowerCase();
    if (!value) return null;
    const row = db.prepare(`
        SELECT id, username, avatar, bio, role, created_at
        FROM users
        WHERE lower(username) = ?
    `).get(value);
    return row ? { ...row, avatar: compactAvatar(row.avatar) } : null;
}

function recordMessageMention({ messageId, mentionedUserId, actorId }) {
    if (!messageId || !mentionedUserId) return 0;
    return db.prepare(`
        INSERT OR IGNORE INTO message_mentions (message_id, mentioned_user_id, actor_id)
        VALUES (?, ?, ?)
    `).run(messageId, mentionedUserId, actorId || null).changes;
}

function followUser(followerId, followingId) {
    if (!followerId || !followingId || followerId === followingId) return 0;
    return db.prepare(`
        INSERT OR IGNORE INTO user_follows (follower_id, following_id)
        VALUES (?, ?)
    `).run(followerId, followingId).changes;
}

function unfollowUser(followerId, followingId) {
    return db.prepare(`
        DELETE FROM user_follows
        WHERE follower_id = ? AND following_id = ?
    `).run(followerId, followingId).changes;
}

function isFollowing(followerId, followingId) {
    if (!followerId || !followingId) return false;
    return Boolean(db.prepare(`
        SELECT 1 FROM user_follows
        WHERE follower_id = ? AND following_id = ?
    `).get(followerId, followingId));
}

function followStats(userId) {
    return {
        followers: db.prepare('SELECT COUNT(*) AS count FROM user_follows WHERE following_id = ?').get(userId).count || 0,
        following: db.prepare('SELECT COUNT(*) AS count FROM user_follows WHERE follower_id = ?').get(userId).count || 0
    };
}

function bookmarkArticle(userId, articleId) {
    if (!userId || !articleId) return 0;
    return db.prepare(`
        INSERT OR IGNORE INTO article_bookmarks (user_id, article_id)
        VALUES (?, ?)
    `).run(userId, articleId).changes;
}

function unbookmarkArticle(userId, articleId) {
    return db.prepare(`
        DELETE FROM article_bookmarks
        WHERE user_id = ? AND article_id = ?
    `).run(userId, articleId).changes;
}

function isArticleBookmarked(userId, articleId) {
    if (!userId || !articleId) return false;
    return Boolean(db.prepare(`
        SELECT 1 FROM article_bookmarks
        WHERE user_id = ? AND article_id = ?
    `).get(userId, articleId));
}

function articleBookmarkCount(articleId) {
    return db.prepare('SELECT COUNT(*) AS count FROM article_bookmarks WHERE article_id = ?').get(articleId).count || 0;
}

function listBookmarkedArticles(userId, { limit = 80, offset = 0 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 80, 120));
    const safeOffset = Math.max(0, Number(offset) || 0);
    return db.prepare(`
        SELECT a.id, a.title, a.slug, a.excerpt, a.category, a.read_time, a.view_count,
               a.cover_image, a.cover_image_asset_id, a.publish_date, a.created_at,
               u.username AS author_username,
               u.avatar AS author_avatar,
               b.created_at AS bookmarked_at
        FROM article_bookmarks b
        JOIN articles a ON a.id = b.article_id
        LEFT JOIN users u ON u.id = a.author_id
        WHERE b.user_id = ?
          AND COALESCE(a.status, 'published') = 'published'
        ORDER BY b.created_at DESC
        LIMIT ? OFFSET ?
    `).all(userId, safeLimit, safeOffset).map(row => ({
        ...row,
        author_avatar: compactAvatar(row.author_avatar)
    }));
}

function listPublicArticlesByAuthor(userId, { limit = 8 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 24));
    return db.prepare(`
        SELECT id, title, slug, excerpt, category, read_time, view_count,
               cover_image, cover_image_asset_id, publish_date, created_at
        FROM articles
        WHERE author_id = ?
          AND COALESCE(status, 'published') = 'published'
        ORDER BY pinned_at IS NULL, pinned_at DESC, publish_date DESC, created_at DESC
        LIMIT ?
    `).all(userId, safeLimit);
}

function authorArticleStats(userId) {
    return db.prepare(`
        SELECT COUNT(*) AS articles, COALESCE(SUM(view_count), 0) AS totalViews
        FROM articles
        WHERE author_id = ?
          AND COALESCE(status, 'published') = 'published'
    `).get(userId) || { articles: 0, totalViews: 0 };
}

function publicProfile(username, viewerId = '') {
    const user = findUserByUsername(username);
    if (!user) return null;
    const stats = authorArticleStats(user.id);
    return {
        user,
        stats: {
            ...followStats(user.id),
            articles: stats.articles || 0,
            totalViews: stats.totalViews || 0
        },
        viewer: {
            isSelf: viewerId === user.id,
            isFollowing: isFollowing(viewerId, user.id)
        },
        articles: listPublicArticlesByAuthor(user.id)
    };
}

function listTrendingTopics({ limit = 8, days = 30 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 24));
    const safeDays = Math.max(1, Math.min(Number(days) || 30, 180));
    const rows = db.prepare(`
        SELECT parent.id,
               parent.content,
               parent.like_count,
               parent.created_at,
               COUNT(reply.id) AS replies
        FROM messages parent
        LEFT JOIN messages reply
          ON reply.parent_id = parent.id
         AND COALESCE(reply.status, 'approved') = 'approved'
        WHERE parent.article_id IS NULL
          AND parent.parent_id IS NULL
          AND COALESCE(parent.status, 'approved') = 'approved'
          AND parent.created_at >= datetime('now', ?)
        GROUP BY parent.id
        ORDER BY parent.created_at DESC
        LIMIT 800
    `).all(`-${safeDays} days`);

    const topics = new Map();
    rows.forEach((row) => {
        extractTopics(row.content).forEach((topic) => {
            const key = topic.toLowerCase();
            const current = topics.get(key) || { topic, count: 0, likes: 0, replies: 0, latestAt: row.created_at };
            current.count += 1;
            current.likes += Number(row.like_count || 0);
            current.replies += Number(row.replies || 0);
            if (String(row.created_at || '') > String(current.latestAt || '')) current.latestAt = row.created_at;
            topics.set(key, current);
        });
    });

    return [...topics.values()]
        .map(item => ({
            ...item,
            score: Number((item.count + item.likes * 0.35 + item.replies * 0.65).toFixed(2))
        }))
        .sort((a, b) => b.score - a.score || String(b.latestAt).localeCompare(String(a.latestAt)))
        .slice(0, safeLimit);
}

module.exports = {
    extractMentionNames,
    extractTopics,
    findUsersByUsernames,
    findUserByUsername,
    recordMessageMention,
    followUser,
    unfollowUser,
    isFollowing,
    followStats,
    bookmarkArticle,
    unbookmarkArticle,
    isArticleBookmarked,
    articleBookmarkCount,
    listBookmarkedArticles,
    publicProfile,
    listTrendingTopics
};
