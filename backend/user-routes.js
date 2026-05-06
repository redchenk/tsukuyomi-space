// 鐢ㄦ埛涓績璺敱
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const articleRepository = require('./repositories/article-repository');
const userRepository = require('./repositories/user-repository');

const { authenticateToken } = require('./middleware/auth');

// 鑾峰彇褰撳墠鐢ㄦ埛璧勬枡
router.get('/profile', authenticateToken, (req, res) => {
    try {
        const user = userRepository.findProfileById(req.user.id);

        if (!user) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }

        res.json({
            success: true,
            data: {
                id: user.id,
                username: user.username,
                email: user.email,
                avatar: user.avatar || '',
                bio: user.bio || '',
                role: user.role,
                created_at: user.created_at
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
        const { bio } = req.body;

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

        userRepository.updateAvatar(req.user.id, avatar);

        res.json({
            success: true,
            message: '操作失败',
            data: { avatar }
        });
    } catch (error) {
        console.error('涓婁紶澶村儚澶辫触:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 淇敼瀵嗙爜
router.put('/password', authenticateToken, (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: '请求处理失败' });
        }

        // 鑾峰彇褰撳墠鐢ㄦ埛
        const user = userRepository.findUserById(req.user.id);

        if (!user) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }

        // 楠岃瘉褰撳墠瀵嗙爜
        const validPassword = bcrypt.compareSync(currentPassword, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ success: false, message: '褰撳墠瀵嗙爜閿欒' });
        }

        // 鍔犲瘑鏂板瘑鐮?
        const passwordHash = bcrypt.hashSync(newPassword, 10);
        userRepository.updatePassword(req.user.id, passwordHash);
        res.json({ success: true, message: '操作成功' });
    } catch (error) {
        console.error('淇敼瀵嗙爜澶辫触:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鑾峰彇鐢ㄦ埛鐨勬枃绔犲垪琛?
router.get('/articles', authenticateToken, (req, res) => {
    try {
        const articles = articleRepository.listUserArticles(req.user.id);

        res.json({ success: true, data: articles });
    } catch (error) {
        console.error('鑾峰彇鐢ㄦ埛鏂囩珷澶辫触:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

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
        res.json({ success: true, message: '操作成功' });
    } catch (error) {
        console.error('鍒犻櫎鏂囩珷澶辫触:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鏇存柊鐢ㄦ埛鐨勬枃绔?
router.put('/articles/:id', authenticateToken, (req, res) => {
    try {
        const { title, excerpt, content, category, read_time, cover_image } = req.body;
        const articleId = req.params.id;

        const article = articleRepository.findArticleById(articleId);

        if (!article) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }

        // 妫€鏌ユ槸鍚︽槸鏂囩珷浣滆€呮垨绠＄悊鍛?
        if (article.author_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: '鏃犳潈闄愮紪杈戞鏂囩珷' });
        }

        const updatedArticle = articleRepository.updateUserArticle(articleId, {
            title,
            excerpt,
            content,
            category,
            readTime: read_time,
            coverImage: cover_image
        });

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
