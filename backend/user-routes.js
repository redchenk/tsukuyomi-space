// 鐢ㄦ埛涓績璺敱
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const articleRepository = require('./repositories/article-repository');
const userRepository = require('./repositories/user-repository');
const adminRepository = require('./repositories/admin-repository');
const authRepository = require('./repositories/auth-repository');
const notificationRepository = require('./repositories/notification-repository');
const socialRepository = require('./repositories/social-repository');
const articleMedia = require('./services/article-media');
const responseCache = require('./services/response-cache');
const { articlePath } = require('./seo/render-article');
const { publicEmail } = require('./validators');
const { validateAvatar } = require('./utils/avatar');

const { authenticateToken, optionalAuth } = require('./middleware/auth');

router.get('/notifications', authenticateToken, (req, res) => {
    try {
        const limit = Math.min(Number.parseInt(req.query.limit, 10) || 50, 100);
        const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
        const notifications = notificationRepository.listNotifications(req.user.id, { limit, offset });
        res.json({
            success: true,
            data: notifications,
            unread: notificationRepository.unreadCount(req.user.id)
        });
    } catch (error) {
        console.error('List notifications failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.get('/notifications/unread-count', authenticateToken, (req, res) => {
    try {
        res.json({ success: true, data: { count: notificationRepository.unreadCount(req.user.id) } });
    } catch (error) {
        console.error('Unread notifications failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.post('/notifications/read-all', authenticateToken, (req, res) => {
    try {
        const changed = notificationRepository.markAllRead(req.user.id);
        res.json({ success: true, data: { changed, count: notificationRepository.unreadCount(req.user.id) } });
    } catch (error) {
        console.error('Mark notifications read failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.post('/notifications/:id/read', authenticateToken, (req, res) => {
    try {
        const notification = notificationRepository.markNotificationRead(req.params.id, req.user.id);
        if (!notification) {
            return res.status(404).json({ success: false, message: '通知不存在' });
        }
        res.json({ success: true, data: notification, unread: notificationRepository.unreadCount(req.user.id) });
    } catch (error) {
        console.error('Mark notification read failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.get('/public/:username/avatar', (req, res) => {
    try {
        const user = userRepository.findPublicAvatarByUsername(req.params.username);
        const avatar = String(user?.avatar || '');
        if (!avatar.startsWith('data:')) {
            res.set('Cache-Control', 'private, no-store');
            return res.status(404).end();
        }

        let safeAvatar;
        try {
            safeAvatar = validateAvatar(avatar);
        } catch (_) {
            res.set('Cache-Control', 'private, no-store');
            return res.status(404).end();
        }

        const match = safeAvatar.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/);
        if (!match) {
            res.set('Cache-Control', 'private, no-store');
            return res.status(404).end();
        }

        const avatarVersion = String(user.updated_at || user.created_at || '');
        const requestedVersion = String(req.query.v || '');
        res.set('Cache-Control', requestedVersion && requestedVersion === avatarVersion
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=0, must-revalidate');
        res.type(match[1]);
        return res.send(Buffer.from(match[2], 'base64'));
    } catch (error) {
        console.error('Public avatar failed:', error);
        res.set('Cache-Control', 'private, no-store');
        return res.status(500).end();
    }
});

router.get('/public/:username', optionalAuth, (req, res) => {
    try {
        const profile = socialRepository.publicProfile(req.params.username, req.user?.id || '');
        if (!profile) return res.status(404).json({ success: false, message: '用户不存在' });
        res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate, proxy-revalidate');
        res.json({ success: true, data: profile });
    } catch (error) {
        console.error('Public profile failed:', error);
        res.status(500).json({ success: false, message: '用户主页读取失败' });
    }
});

router.post('/follow/:id', authenticateToken, (req, res) => {
    try {
        const target = userRepository.findProfileById(req.params.id);
        if (!target) return res.status(404).json({ success: false, message: '用户不存在' });
        if (target.id === req.user.id) return res.status(400).json({ success: false, message: '不能关注自己' });
        const created = socialRepository.followUser(req.user.id, target.id);
        if (created) {
            notificationRepository.createNotification({
                userId: target.id,
                actorId: req.user.id,
                type: 'follow',
                title: `${req.user.username || '访客'} 关注了你`,
                content: '新的访客正在关注你的创作动态。',
                link: `/users/${encodeURIComponent(req.user.username || '')}`,
                metadata: { actorName: req.user.username || '' }
            });
        }
        res.json({
            success: true,
            data: {
                isFollowing: true,
                ...socialRepository.followStats(target.id)
            },
            message: '已关注'
        });
    } catch (error) {
        console.error('Follow user failed:', error);
        res.status(500).json({ success: false, message: '关注失败' });
    }
});

router.delete('/follow/:id', authenticateToken, (req, res) => {
    try {
        const target = userRepository.findProfileById(req.params.id);
        if (!target) return res.status(404).json({ success: false, message: '用户不存在' });
        socialRepository.unfollowUser(req.user.id, target.id);
        res.json({
            success: true,
            data: {
                isFollowing: false,
                ...socialRepository.followStats(target.id)
            },
            message: '已取消关注'
        });
    } catch (error) {
        console.error('Unfollow user failed:', error);
        res.status(500).json({ success: false, message: '取消关注失败' });
    }
});

router.get('/bookmarks', authenticateToken, (req, res) => {
    try {
        res.json({
            success: true,
            data: socialRepository.listBookmarkedArticles(req.user.id, {
                limit: req.query.limit,
                offset: req.query.offset
            })
        });
    } catch (error) {
        console.error('List bookmarks failed:', error);
        res.status(500).json({ success: false, message: '收藏列表读取失败' });
    }
});

router.get('/bookmarks/:articleId/status', authenticateToken, (req, res) => {
    try {
        const article = articleRepository.findPublishedArticleById(req.params.articleId);
        if (!article) return res.status(404).json({ success: false, message: '文章不存在或未公开' });
        res.json({
            success: true,
            data: {
                bookmarked: socialRepository.isArticleBookmarked(req.user.id, article.id),
                count: socialRepository.articleBookmarkCount(article.id)
            }
        });
    } catch (error) {
        console.error('Bookmark status failed:', error);
        res.status(500).json({ success: false, message: '收藏状态读取失败' });
    }
});

router.post('/bookmarks/:articleId', authenticateToken, (req, res) => {
    try {
        const article = articleRepository.findPublishedArticleById(req.params.articleId);
        if (!article) return res.status(404).json({ success: false, message: '文章不存在或未公开' });
        const created = socialRepository.bookmarkArticle(req.user.id, article.id);
        if (created && article.author_id && article.author_id !== req.user.id) {
            notificationRepository.createNotification({
                userId: article.author_id,
                actorId: req.user.id,
                type: 'bookmark',
                title: `${req.user.username || '访客'} 收藏了你的文章`,
                content: article.title,
                link: articlePath(article),
                relatedArticleId: article.id,
                metadata: { actorName: req.user.username || '', articleId: article.id }
            });
        }
        res.json({
            success: true,
            data: {
                bookmarked: true,
                count: socialRepository.articleBookmarkCount(article.id)
            },
            message: '已收藏'
        });
    } catch (error) {
        console.error('Bookmark article failed:', error);
        res.status(500).json({ success: false, message: '收藏失败' });
    }
});

router.delete('/bookmarks/:articleId', authenticateToken, (req, res) => {
    try {
        const article = articleRepository.findPublishedArticleById(req.params.articleId);
        if (!article) return res.status(404).json({ success: false, message: '文章不存在或未公开' });
        socialRepository.unbookmarkArticle(req.user.id, article.id);
        res.json({
            success: true,
            data: {
                bookmarked: false,
                count: socialRepository.articleBookmarkCount(article.id)
            },
            message: '已取消收藏'
        });
    } catch (error) {
        console.error('Unbookmark article failed:', error);
        res.status(500).json({ success: false, message: '取消收藏失败' });
    }
});

// 鑾峰彇褰撳墠鐢ㄦ埛璧勬枡
router.get('/profile', authenticateToken, (req, res) => {
    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        const user = userRepository.findProfileById(req.user.id);

        if (!user) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }

        const email = publicEmail(user.email);
        const oauthAccounts = authRepository.listOAuthAccountsByUser(user.id).map(account => ({
            provider: account.provider,
            provider_email: publicEmail(account.provider_email),
            nickname: account.nickname || '',
            avatar: account.avatar || '',
            created_at: account.created_at,
            updated_at: account.updated_at
        }));
        res.json({
            success: true,
            data: {
                id: user.id,
                username: user.username,
                email,
                has_real_email: Boolean(email),
                avatar: user.avatar || '',
                bio: user.bio || '',
                role: user.role,
                created_at: user.created_at,
                oauth_accounts: oauthAccounts
            }
        });
    } catch (error) {
        console.error('鑾峰彇鐢ㄦ埛璧勬枡澶辫触:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鏇存柊鐢ㄦ埛璧勬枡
router.put('/profile', authenticateToken, (req, res) => {
    try {
        const bio = String(req.body?.bio || '').trim().slice(0, 500);

        userRepository.updateBio(req.user.id, bio);
        res.json({ success: true, message: '操作成功' });
    } catch (error) {
        console.error('鏇存柊鐢ㄦ埛璧勬枡澶辫触:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 涓婁紶澶村儚
router.post('/avatar', authenticateToken, (req, res) => {
    try {
        const { avatar } = req.body;

        if (!avatar) {
            return res.status(400).json({ success: false, message: '请求处理失败' });
        }

        const safeAvatar = validateAvatar(avatar);
        userRepository.updateAvatar(req.user.id, safeAvatar);
        responseCache.delPrefix('public:gallery');

        res.json({
            success: true,
            message: '操作成功',
            data: { avatar: safeAvatar }
        });
    } catch (error) {
        if (!error.status || error.status >= 500) console.error('涓婁紶澶村儚澶辫触:', error);
        res.status(error.status || 500).json({ success: false, message: error.status ? error.message : '服务器错误' });
    }
});

// 修改密码
router.put('/password', authenticateToken, (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: '请求处理失败' });
        }

        // 获取当前用户
        const user = userRepository.findUserById(req.user.id);

        if (!user) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }

        // 验证当前密码
        const validPassword = bcrypt.compareSync(currentPassword, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ success: false, message: '当前密码错误' });
        }

        // 加密新密码
        if (String(newPassword).length < 8) {
            return res.status(400).json({ success: false, message: '新密码至少 8 位' });
        }
        const passwordHash = bcrypt.hashSync(newPassword, 10);
        adminRepository.resetUserPassword(req.user.id, passwordHash);
        res.json({ success: true, message: '操作成功' });
    } catch (error) {
        console.error('修改密码失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

function sendUserArticles(req, res) {
    try {
        const articles = articleRepository.listUserArticles(req.user.id);

        res.json({ success: true, data: articles });
    } catch (error) {
        console.error('鑾峰彇鐢ㄦ埛鏂囩珷澶辫触:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
}

// 鑾峰彇鐢ㄦ埛鐨勬枃绔犲垪琛?
router.get('/articles', authenticateToken, sendUserArticles);
router.get('/articles/live/:nonce', authenticateToken, sendUserArticles);

// 鑾峰彇鐢ㄦ埛鐨勫崟绡囨枃绔狅紙鐢ㄤ簬缂栬緫锛?
router.get('/articles/:id', authenticateToken, (req, res) => {
    try {
        const article = articleRepository.findArticleById(req.params.id);

        if (!article) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }

        // 妫€鏌ユ槸鍚︽槸鏂囩珷浣滆€呮垨绠＄悊鍛?
        if (article.author_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: '鏃犳潈闄愭煡鐪嬫鏂囩珷' });
        }

        res.json({ success: true, data: article });
    } catch (error) {
        console.error('鑾峰彇鏂囩珷澶辫触:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鍒犻櫎鐢ㄦ埛鐨勬枃绔?
router.delete('/articles/:id', authenticateToken, (req, res) => {
    try {
        const article = articleRepository.findArticleById(req.params.id);

        if (!article) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }

        // 妫€鏌ユ槸鍚︽槸鏂囩珷浣滆€呮垨绠＄悊鍛?
        if (article.author_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: '鏃犳潈闄愬垹闄ゆ鏂囩珷' });
        }

        articleRepository.deleteArticle(req.params.id);
        responseCache.delPrefix('public:articles:');
        responseCache.delPrefix('public:article-messages:');
        responseCache.delPrefix('public:stats');
        responseCache.delPrefix('public:site-feed');
        res.json({ success: true, message: '操作成功' });
    } catch (error) {
        console.error('鍒犻櫎鏂囩珷澶辫触:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鏇存柊鐢ㄦ埛鐨勬枃绔?
router.put('/articles/:id', authenticateToken, async (req, res) => {
    try {
        const { title, excerpt, content, content_format, category, read_time, cover_image, cover_image_asset_id } = req.body;
        const articleId = req.params.id;

        const article = articleRepository.findArticleById(articleId);

        if (!article) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }

        // 妫€鏌ユ槸鍚︽槸鏂囩珷浣滆€呮垨绠＄悊鍛?
        if (article.author_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: '鏃犳潈闄愮紪杈戞鏂囩珷' });
        }

        const mediaPayload = await articleMedia.normalizeArticleMediaPayload({
            title,
            excerpt,
            content,
            contentFormat: content_format,
            category,
            readTime: read_time,
            coverImage: cover_image,
            coverImageAssetId: cover_image_asset_id
        }, { articleId, ownerId: req.user.id });
        const updatedArticle = articleRepository.updateUserArticle(articleId, mediaPayload);
        articleMedia.attachAssetsToArticle(mediaPayload.mediaAssetIds, updatedArticle.id);
        responseCache.delPrefix('public:articles:');
        responseCache.delPrefix('public:site-feed');

        res.json({
            success: true,
            message: '操作失败',
            data: updatedArticle
        });
    } catch (error) {
        console.error('鏇存柊鏂囩珷澶辫触:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

module.exports = router;
