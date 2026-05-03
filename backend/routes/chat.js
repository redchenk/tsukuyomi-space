const express = require('express');
const { createChatCompletion } = require('../services/llm');

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { message, conversation = [], apiKey, apiUrl, model } = req.body;
        if (!message) {
            return res.status(400).json({ success: false, message: '消息内容不能为空' });
        }

        const data = await createChatCompletion({ message, conversation, apiKey, apiUrl, model });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Chat API error:', error);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
            success: false,
            message: statusCode === 500 ? '操作失败' : error.message
        });
    }
});

module.exports = router;
