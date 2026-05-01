const express = require('express');
const { ROOM_SYSTEM_PROMPT, createChatCompletion, fallbackRoomReply } = require('../services/llm');
const { synthesizeSpeech } = require('../services/tts');

const router = express.Router();

router.post('/chat', async (req, res) => {
    try {
        const { message, conversation = [], settings = {} } = req.body || {};
        if (!message || !String(message).trim()) {
            return res.status(400).json({ success: false, message: '消息内容不能为空' });
        }

        const data = await createChatCompletion({
            message,
            conversation,
            apiKey: settings.apiKey,
            apiUrl: settings.apiUrl,
            model: settings.model,
            systemPrompt: ROOM_SYSTEM_PROMPT
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Room chat error:', error);
        res.json({ success: true, data: { reply: fallbackRoomReply(req.body?.message), model: 'local-fallback' } });
    }
});

router.post('/tts', async (req, res) => {
    try {
        const { text, settings = {} } = req.body || {};
        if (!text || !String(text).trim()) {
            return res.status(400).json({ success: false, message: '文本内容不能为空' });
        }

        const { audioBuffer, contentType } = await synthesizeSpeech({
            text,
            apiKey: settings.apiKey,
            apiUrl: settings.apiUrl,
            voice: settings.voice,
            model: settings.model,
            provider: settings.provider
        });
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'no-store');
        res.send(audioBuffer);
    } catch (error) {
        console.error('Room TTS error:', error);
        res.status(error.status || 502).json({ success: false, message: error.message || 'TTS 服务暂时不可用' });
    }
});

module.exports = router;
