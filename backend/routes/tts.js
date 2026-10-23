const express = require('express');
const { synthesizeSpeech, isLocalGptSovitsUrl } = require('../services/tts');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use('/official', require('./official-tts'));

router.post('/', (req, res, next) => {
    const provider = req.body?.provider || process.env.TTS_PROVIDER || 'mimo';
    const endpoint = req.body?.apiUrl || process.env.GPT_SOVITS_API_URL || 'http://127.0.0.1:9880/tts';
    // Local one-click packages are called directly by the user's browser.
    // Never let the legacy proxy reach an operator's private compute tunnel.
    if (provider === 'gpt-sovits' && isLocalGptSovitsUrl(endpoint)) {
        return res.status(400).json({ success: false, message: '本机 GPT-SoVITS 请使用浏览器直连；官方算力请使用官方直供模式' });
    }
    if (provider === 'gpt-sovits' && !isLocalGptSovitsUrl(endpoint)) {
        return authenticateToken(req, res, next);
    }
    next();
}, async (req, res) => {
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
        if (!error.status || error.status >= 500) console.error('TTS API error:', error);
        res.status(error.status || 500).json({ success: false, message: error.message || '操作失败' });
    }
});

module.exports = router;
