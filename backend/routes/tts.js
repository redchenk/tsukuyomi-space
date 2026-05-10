const express = require('express');
const { synthesizeSpeech } = require('../services/tts');

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { text, apiKey, apiUrl, voice, model, provider, promptAudio, refAudioPath, promptText, textLang, promptLang, gptWeightPath, sovitsWeightPath } = req.body;
        if (!text) {
            return res.status(400).json({ success: false, message: '文本内容不能为空' });
        }

        const { audioBuffer, contentType } = await synthesizeSpeech({ text, apiKey, apiUrl, voice, model, provider, promptAudio, refAudioPath, promptText, textLang, promptLang, gptWeightPath, sovitsWeightPath });
        res.set('Content-Type', contentType);
        res.set('Content-Length', audioBuffer.length);
        res.send(audioBuffer);
    } catch (error) {
        console.error('TTS API error:', error);
        res.status(error.status || 500).json({ success: false, message: error.message || '操作失败' });
    }
});

module.exports = router;
