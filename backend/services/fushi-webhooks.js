const crypto = require('node:crypto');
const { fetchPinnedUrl, timeoutError, classifyError } = require('./outbound-url-security');
const diagnostics = require('./fushi-diagnostics');
const { readConfig } = require('./fushi-config');
function signingKey(secret) {
    if (typeof secret !== 'string' || !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret)) throw new Error('Invalid signing secret');
    const key = Buffer.from(secret.slice(6), 'base64');
    if (key.length < 24 || key.length > 64 || key.toString('base64').replace(/=+$/, '') !== secret.slice(6).replace(/=+$/, '')) throw new Error('Invalid signing secret');
    return key;
}
function signature(secret, id, timestamp, body) {
    return `v1,${crypto.createHmac('sha256', signingKey(secret)).update(`${id}.${timestamp}.${body}`).digest('base64')}`;
}
function seal(secret, subscriptionId) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(readConfig().encryptionKey, 'base64'), iv);
    cipher.setAAD(Buffer.from(`fushi-webhook-v1:${subscriptionId}`));
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return ['v1', iv, cipher.getAuthTag(), encrypted].map((part, index) => index ? part.toString('base64url') : part).join('.');
}
function unseal(box, subscriptionId) {
    const [version, iv, tag, encrypted] = String(box).split('.');
    if (version !== 'v1') throw new Error('Invalid secret envelope');
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(readConfig().encryptionKey, 'base64'), Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(`fushi-webhook-v1:${subscriptionId}`));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}
function validateCallback(value) {
    if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid callback URL');
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Invalid callback URL');
    // Address resolution is intentionally repeated inside fetchPinnedUrl on every connection.
    return url.toString();
}
async function postSigned({ id, url, secret, previousSecret }, eventId, payload, {
    fetch = fetchPinnedUrl, now = Date.now(), verification = false, timeoutMs = 10000
} = {}) {
    const body = JSON.stringify(payload);
    if (Buffer.byteLength(body) > 262144) throw new Error('Payload too large');
    const timestamp = String(Math.floor(now / 1000));
    const signatures = [signature(secret, eventId, timestamp, body)];
    if (previousSecret) signatures.push(signature(previousSecret, eventId, timestamp, body));
    const started = performance.now();
    const controller = new AbortController();
    const signal = controller.signal;
    let stage = 'request', response, reader, callbackTarget;
    const timer = setTimeout(() => controller.abort(timeoutError(stage)), timeoutMs);
    let onAbort;
    const deadline = new Promise((_, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
    });
    const bounded = operation => Promise.race([operation, deadline]);
    const invalid = code => { const error = new Error('Invalid verification response'); error.code = code; return error; };
    try {
        const callbackUrl = validateCallback(url);
        const endpoint = new URL(callbackUrl);
        callbackTarget = { callback_host: endpoint.hostname.toLowerCase().replace(/\.$/, ''), callback_port: Number(endpoint.port || 443) };
        // DNS resolution itself is not cancellable in Node's lookup API. Bound
        // the wait as well as the socket; a late connection still sees the aborted signal.
        response = await bounded(fetch(callbackUrl, {
                method: 'POST', redirect: 'error', signal, timeoutMs, connectStrategy: 'race-pinned',
                onTrace: trace => { stage = trace.stage; diagnostics.emit('network_stage', { ...trace, subscription_id: id, event_id: eventId }); },
                headers: { 'Content-Type': 'application/json', 'webhook-id': eventId,
                    'webhook-timestamp': timestamp, 'webhook-signature': signatures.join(' '), 'X-MCP-Subscription-Id': id }, body
            }));
        if (!verification || !response.ok) {
            diagnostics.emit('webhook_completed', { subscription_id: id, event_id: eventId, http_status: response.status,
                outcome: response.ok ? 'success' : 'failed', ...(response.ok ? {} : { reason: 'http_status' }), duration_ms: Math.round(performance.now() - started) });
            return { status: response.status, accepted: response.ok };
        }
        stage = 'body';
        reader = response.body?.getReader();
        if (!reader) throw invalid('INVALID_RESPONSE');
        const chunks = []; let size = 0;
        for (;;) {
            const { done, value } = await bounded(reader.read());
            if (done) break;
            size += value.length;
            if (size > 4096) throw invalid('RESPONSE_TOO_LARGE');
            chunks.push(Buffer.from(value));
        }
        let data;
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) { throw invalid('INVALID_JSON'); }
        if (!data || Array.isArray(data) || typeof data !== 'object' || typeof data.challenge !== 'string') throw invalid('INVALID_RESPONSE');
        diagnostics.emit('webhook_completed', { subscription_id: id, http_status: response.status, outcome: 'success', bytes: size, duration_ms: Math.round(performance.now() - started) });
        return { status: response.status, accepted: true, data };
    } catch (error) {
        diagnostics.emit('webhook_completed', { subscription_id: id, stage, http_status: response?.status,
            outcome: 'failed', ...classifyError(error), ...callbackTarget, duration_ms: Math.round(performance.now() - started) });
        throw error;
    } finally {
        clearTimeout(timer); signal.removeEventListener('abort', onAbort);
        // Cancellation must not hold up a success/error response if a broken peer stalls.
        if (reader) reader.cancel().catch(() => {});
        else response?.body?.cancel().catch(() => {});
    }
}
module.exports = { signingKey, signature, seal, unseal, validateCallback, postSigned };
