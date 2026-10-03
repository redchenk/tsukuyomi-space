const http = require('node:http');
const crypto = require('node:crypto');
const enabled = process.env.ROOM_LOCAL_INTELLIGENCE === 'true';
const MODEL = 'bge-small-zh-v1.5-onnx:46fbe35:512';
const socketPath = process.env.ROOM_LOCAL_SOCKET || '/run/tsukuyomi-memory/vector.sock';

function sourceHash(row) {
    let evidence = [];
    try { evidence = JSON.parse(row.metadata || '{}').analysis?.evidence || []; } catch {}
    return crypto.createHash('sha256').update(JSON.stringify([row.summary, row.content, MODEL, evidence])).digest('hex');
}

function request(route, body = {}, timeout = 1800) {
    return new Promise((resolve, reject) => {
        const raw = Buffer.from(JSON.stringify(body));
        if (raw.length > 262144) return reject(Object.assign(new Error('Local request too large'), { code: 'LOCAL_SIZE' }));
        let settled = false;
        const done = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
        const req = http.request({ socketPath, path: route, method: 'POST', agent: false,
            headers: { 'Content-Type': 'application/json', 'Content-Length': raw.length } }, res => {
            const parts = []; let size = 0;
            res.on('data', part => { size += part.length; if (size > 262144) req.destroy(Object.assign(new Error('Local response too large'), { code: 'LOCAL_SIZE' })); else parts.push(part); });
            res.on('error', () => done(Object.assign(new Error('Local read failed'), { code: 'LOCAL_READ' })));
            res.on('end', () => {
                if (res.statusCode !== 200) return done(Object.assign(new Error('Local service unavailable'), { code: `LOCAL_HTTP_${res.statusCode}` }));
                try { done(null, JSON.parse(Buffer.concat(parts).toString('utf8'))); }
                catch { done(Object.assign(new Error('Invalid local response'), { code: 'LOCAL_JSON' })); }
            });
        });
        const timer = setTimeout(() => req.destroy(Object.assign(new Error('Local deadline'), { code: 'LOCAL_TIMEOUT' })), timeout);
        req.on('error', error => done(Object.assign(new Error('Local service failed'), { code: error.code || 'LOCAL_NETWORK' })));
        req.end(raw);
    });
}

function vector(value) {
    if (!Array.isArray(value) || value.length !== 512 || value.some(n => !Number.isFinite(n))) throw Object.assign(new Error('Invalid semantic vector'), { code: 'LOCAL_DIMENSION' });
    return value;
}

module.exports = { enabled, MODEL, sourceHash, request, vector };
