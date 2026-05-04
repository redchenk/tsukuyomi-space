const express = require('express');
const { createChatCompletion } = require('../services/llm');

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { message, conversation = [], apiKey, apiUrl, model, systemPrompt, image } = req.body;
        if (!message && !image) {
            return res.status(400).json({ success: false, message: '消息内容不能为空' });
        }

        const data = await createChatCompletion({ message, conversation, apiKey, apiUrl, model, systemPrompt, image });
        res.json({ success: true, data });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        if (statusCode >= 500) {
            console.error('Chat API error:', error);
        }
        res.status(statusCode).json({
            success: false,
            message: statusCode === 500 ? '操作失败' : error.message
        });
    }
});

module.exports = router;
