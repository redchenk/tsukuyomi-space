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
        res.status(500).json({ success: false, message: '操作失败' });
    }
});

module.exports = router;
