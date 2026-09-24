const express = require('express');
const { createChatCompletion, createChatCompletionStream, normalizeChatUrl } = require('../services/llm');

const router = express.Router();

function streamEvent(res, event, data) {
    if (res.destroyed || res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

router.post('/stream', async (req, res) => {
    const { message, conversation = [], apiKey, apiUrl, model, systemPrompt, image } = req.body || {};
    if (!message && !image) {
        return res.status(400).json({ success: false, message: '消息内容不能为空' });
    }
    try {
        // Reject unsupported destinations before opening the event stream.
        normalizeChatUrl(apiUrl, model);
    } catch (error) {
        return res.status(error.statusCode || 400).json({ success: false, message: error.message });
    }

    const controller = new AbortController();
    const onClose = () => {
        if (!res.writableEnded) controller.abort(new Error('客户端已断开连接'));
    };
    res.once('close', onClose);
    res.status(200);
    res.set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();
    try {
        const data = await createChatCompletionStream({
            message, conversation, apiKey, apiUrl, model, systemPrompt, image,
            signal: controller.signal,
            onDelta: text => streamEvent(res, 'delta', { text })
        });
        streamEvent(res, 'done', data);
    } catch (error) {
        if (!controller.signal.aborted && !res.destroyed) {
            const message = error.message === '模型响应超时'
                ? error.message
                : (error.statusCode >= 400 ? error.message : '模型响应失败，请稍后重试');
            streamEvent(res, 'error', { message });
        }
    } finally {
        res.off('close', onClose);
        if (!res.destroyed && !res.writableEnded) res.end();
    }
});

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
