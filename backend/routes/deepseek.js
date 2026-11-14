const express = require('express');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const router = express.Router();
const PATHS = new Set(['/chat/completions', '/files', '/v1/tools/asr', '/v1/tools/ocr', '/v1/tools/search', '/v1/tools/fetch']);

// This bridge uses only the caller's key and a fixed provider origin. It never
// falls back to site credentials or follows provider redirects.
router.post('*', async (req, res) => {
    if (!PATHS.has(req.path)) return res.sendStatus(404);
    const key = req.get('X-Deepseek-Key') || '';
    if (!/^[\x21-\x7e]{16,4096}$/.test(key) || key === 'tsukuyomi-site-session') return res.status(400).json({ error: { message: '请配置自己的 DeepSeek API Key。' } });
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 240000);
    res.once('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
        const headers = { Authorization: `Bearer ${key}` };
        let body;
        if (['/files', '/v1/tools/asr', '/v1/tools/ocr'].includes(req.path)) {
            const file = req.body?.file;
            if (!file || typeof file.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data) || !file.data.length || typeof file.name !== 'string') return res.sendStatus(400);
            const bytes = Buffer.from(file.data, 'base64');
            if (bytes.length > 8 * 1024 * 1024) return res.sendStatus(413);
            body = new FormData();
            if (req.path !== '/v1/tools/asr') {
                const purpose = req.body.purpose;
                if (!['user_data', 'text_recognition', 'rich_layout_recognition'].includes(purpose)) return res.sendStatus(400);
                body.append('purpose', purpose);
            }
            body.append('file', new Blob([bytes], { type: String(file.type || 'application/octet-stream') }), file.name.slice(0, 200));
        } else {
            headers['Content-Type'] = 'application/json';
            if (req.path === '/chat/completions') {
                if (!Array.isArray(req.body?.messages) || req.body.messages.length > 128) return res.sendStatus(400);
                req.body.safety_check = { level: 'high' };
            }
            body = JSON.stringify(req.body);
        }
        const upstream = await fetch(`https://api.deepseek.com${req.path}`, { method: 'POST', headers, body, signal: controller.signal, redirect: 'error' });
        res.status(upstream.status).set({ 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
        if (upstream.body) await pipeline(Readable.fromWeb(upstream.body), res);
        else res.end();
    } catch (error) {
        if (!res.headersSent && !res.destroyed) res.status(502).json({ error: { message: controller.signal.aborted ? 'DeepSeek 请求已停止或超时。' : 'DeepSeek 暂时无法连接，请稍后重试。' } });
        else if (!res.destroyed) res.destroy();
    } finally { clearTimeout(timer); }
});
module.exports = router;
