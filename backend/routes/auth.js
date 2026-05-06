const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken, generateToken } = require('../middleware/auth');
const authRepository = require('../repositories/auth-repository');
const { EMAIL_CODE_TTL_MS, EMAIL_CODE_COOLDOWN_MS, sendVerificationEmail } = require('../services/mailer');
const { normalizeEmail, isEmail } = require('../validators');

const router = express.Router();

function latestCode(email, purpose) {
    return authRepository.findLatestVerificationCode(email, purpose);
}

function consumeVerificationCode(email, purpose, code) {
    const row = latestCode(email, purpose);
    const now = Date.now();
    if (!row || row.used_at || row.expires_at < now) return false;
    if (!bcrypt.compareSync(String(code || '').trim(), row.code_hash)) return false;
    authRepository.markVerificationCodeUsed(row.id, now);
    return true;
}

function issueTokenForUser(user) {
    return generateToken({ id: user.id, username: user.username, role: user.role }, '7d');
}

router.post('/email-code', async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const purpose = req.body.purpose === 'login' ? 'login' : 'register';

        if (!isEmail(email)) {
            return res.status(400).json({ success: false, message: '请输入有效邮箱' });
        }

        const existingUser = authRepository.findUserByEmail(email);
        if (purpose === 'register' && existingUser) {
            return res.status(400).json({ success: false, message: '该邮箱已注册' });
        }
        if (purpose === 'login' && !existingUser) {
            return res.status(404).json({ success: false, message: '该邮箱尚未注册' });
        }

        const last = latestCode(email, purpose);
        const now = Date.now();
        if (last && now - last.created_at < EMAIL_CODE_COOLDOWN_MS) {
            const wait = Math.ceil((EMAIL_CODE_COOLDOWN_MS - (now - last.created_at)) / 1000);
            return res.status(429).json({ success: false, message: `请 ${wait} 秒后再发送验证码` });
        }

        const code = crypto.randomInt(100000, 999999).toString();
        authRepository.createVerificationCode({
            id: uuidv4(),
            email,
            codeHash: bcrypt.hashSync(code, 10),
            purpose,
            expiresAt: now + EMAIL_CODE_TTL_MS,
            createdAt: now
        });

        await sendVerificationEmail(email, code, purpose);
        res.json({ success: true, message: '验证码已发送' });
    } catch (error) {
        console.error('Send email code failed:', error);
        if (error.message === 'SMTP credentials are not configured') {
            return res.status(503).json({ success: false, message: '邮件服务未配置，请先设置 SMTP_USER 和 SMTP_PASS' });
        }
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.post('/register', (req, res) => {
    try {
        const { username, password, emailCode } = req.body;
        const email = normalizeEmail(req.body.email);

        if (!username || !email || !password || !emailCode) {
            return res.status(400).json({ success: false, message: '请完整填写注册信息和验证码' });
        }
        if (!isEmail(email)) {
            return res.status(400).json({ success: false, message: '请输入有效邮箱' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: '密码至少需要 6 位' });
        }

        const existingUser = authRepository.findUserByUsernameOrEmailPair(username, email);
        if (existingUser) {
            return res.status(400).json({ success: false, message: '用户名或邮箱已被注册' });
        }
        if (!consumeVerificationCode(email, 'register', emailCode)) {
            return res.status(400).json({ success: false, message: '验证码无效或已过期' });
        }

        const userId = uuidv4();
        authRepository.createUser({ id: userId, username, email, passwordHash: bcrypt.hashSync(password, 10) });

        const token = generateToken({ id: userId, username, role: 'user' }, '7d');
        res.status(201).json({
            success: true,
            message: '注册成功',
            data: {
                user: { id: userId, username, email, role: 'user' },
                token
            }
        });
    } catch (error) {
        console.error('Register failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.post('/login', (req, res) => {
    try {
        const { username, password, emailCode } = req.body;
        const loginMethod = req.body.loginMethod === 'code' ? 'code' : 'password';

        if (!username) {
            return res.status(400).json({ success: false, message: '请输入用户名或邮箱' });
        }

        const user = authRepository.findUserByUsernameOrEmail(username);
        if (!user) {
            return res.status(401).json({ success: false, message: '用户名或密码错误' });
        }

        if (loginMethod === 'code') {
            if (!emailCode) {
                return res.status(400).json({ success: false, message: '请填写邮箱验证码' });
            }
            if (!consumeVerificationCode(normalizeEmail(user.email), 'login', emailCode)) {
                return res.status(401).json({ success: false, message: '验证码无效或已过期' });
            }
        } else {
            if (!password) {
                return res.status(400).json({ success: false, message: '请输入密码' });
            }
            if (!bcrypt.compareSync(password, user.password_hash)) {
                return res.status(401).json({ success: false, message: '用户名或密码错误' });
            }
        }

        res.json({
            success: true,
            message: '登录成功',
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    avatar: user.avatar
                },
                token: issueTokenForUser(user)
            }
        });
    } catch (error) {
        console.error('Login failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

router.get('/me', authenticateToken, (req, res) => {
    try {
        const user = authRepository.findCurrentUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: '请求处理失败' });
        }
        res.json({ success: true, data: user });
    } catch (error) {
        console.error('Get current user failed:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

module.exports = router;
