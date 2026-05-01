// 鐢ㄦ埛涓績璺敱
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const fs = require('fs');
const config = require('./config');

const { authenticateToken } = require('./middleware/auth');

// 鍒濆鍖栨暟鎹簱
const dbPath = config.dbPath;
const db = new Database(dbPath);

// bio 瀛楁杩佺Щ
try {
    db.exec("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''");
} catch (e) {
    console.log('Operation completed');
}

// 鑾峰彇褰撳墠鐢ㄦ埛璧勬枡
router.get('/profile', authenticateToken, (req, res) => {
    try {
        const user = db.prepare(`
            SELECT id, username, email, avatar, bio, role, created_at
            FROM users WHERE id = ?
        `).get(req.user.id);

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

        db.prepare(`
            UPDATE users SET bio = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(bio || '', req.user.id);
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

        db.prepare(`
            UPDATE users SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(avatar, req.user.id);

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
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

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
        db.prepare(`
            UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(passwordHash, req.user.id);
        res.json({ success: true, message: '操作成功' });
    } catch (error) {
        console.error('淇敼瀵嗙爜澶辫触:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鑾峰彇鐢ㄦ埛鐨勬枃绔犲垪琛?
router.get('/articles', authenticateToken, (req, res) => {
    try {
        const articles = db.prepare(`
            SELECT id, title, category, view_count, status, created_at, updated_at
            FROM articles WHERE author_id = ?
            ORDER BY created_at DESC
        `).all(req.user.id);

        res.json({ success: true, data: articles });
    } catch (error) {
        console.error('鑾峰彇鐢ㄦ埛鏂囩珷澶辫触:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 鑾峰彇鐢ㄦ埛鐨勫崟绡囨枃绔狅紙鐢ㄤ簬缂栬緫锛?
router.get('/articles/:id', authenticateToken, (req, res) => {
    try {
        const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);

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
        const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(req.params.id);

        if (!article) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }

        // 妫€鏌ユ槸鍚︽槸鏂囩珷浣滆€呮垨绠＄悊鍛?
        if (article.author_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: '鏃犳潈闄愬垹闄ゆ鏂囩珷' });
        }

        db.prepare('DELETE FROM articles WHERE id = ?').run(req.params.id);
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

        const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId);

        if (!article) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }

        // 妫€鏌ユ槸鍚︽槸鏂囩珷浣滆€呮垨绠＄悊鍛?
        if (article.author_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: '鏃犳潈闄愮紪杈戞鏂囩珷' });
        }

        db.prepare(`
            UPDATE articles SET
                title = ?, excerpt = ?, content = ?, category = ?,
                read_time = ?, cover_image = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(title, excerpt || '', content || '', category, read_time || '5 min', cover_image || null, articleId);

        const updatedArticle = db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId);

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
