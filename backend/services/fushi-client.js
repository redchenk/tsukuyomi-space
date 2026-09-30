const { fetchPinnedUrl } = require('./outbound-url-security');
const { readConfig } = require('./fushi-config');

let cached = null;
function invalid() { const error = new Error('invalid_client'); error.code = 'invalid_client'; throw error; }
async function verifyClient(params, { fetch = fetchPinnedUrl, now = Date.now() } = {}) {
    const cfg = readConfig();
    if (params.client_id !== cfg.clientId) invalid();
    if (cfg.clientMode === 'predefined') return null;
    // Only the configured OpenAI publisher may supply client metadata. Request
    // parameters cannot turn this endpoint into an arbitrary JSON fetch proxy.
    if (!/^https:\/\/chatgpt\.com\/oauth\/(?:[A-Za-z0-9_-]{1,128}\/)?client\.json$/.test(cfg.clientId)) invalid();
    if (cached?.clientId === cfg.clientId && cached.expiresAt > now) return cached.proof;
    const signal = AbortSignal.timeout(8000);
    let onAbort, response;
    try {
        response = await Promise.race([
            fetch(cfg.clientId, { redirect: 'error', signal, timeoutMs: 8000, allowedHostnames: ['chatgpt.com'],
                headers: { Accept: 'application/json' } }),
            new Promise((_, reject) => { onAbort = () => reject(signal.reason); signal.addEventListener('abort', onAbort, { once: true }); })
        ]);
        if (!response.ok || !/^application\/(?:[a-z0-9.-]+\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) invalid();
        const reader = response.body?.getReader();
        if (!reader) invalid();
        let size = 0; const chunks = [];
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.length;
                if (size > 32768) invalid();
                chunks.push(Buffer.from(value));
            }
        } finally { await reader.cancel().catch(() => {}); }
        const document = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const methods = document.token_endpoint_auth_methods_supported || [document.token_endpoint_auth_method];
        if (document.client_id !== cfg.clientId || !Array.isArray(methods) || !methods.includes('none')
            || !Array.isArray(document.redirect_uris) || document.redirect_uris.length > 32
            || !Array.isArray(document.grant_types) || !document.grant_types.includes('authorization_code') || !document.grant_types.includes('refresh_token')
            || !Array.isArray(document.response_types) || !document.response_types.includes('code')) invalid();
        const redirects = document.redirect_uris.filter(value => {
            if (typeof value !== 'string' || value.length > 2048) return false;
            try {
                const url = new URL(value);
                return url.protocol === 'https:' && url.hostname === 'chatgpt.com' && !url.username && !url.password && !url.hash;
            } catch (_) { return false; }
        });
        if (!redirects.length) invalid();
        const proof = Object.freeze({ clientId: cfg.clientId, redirectUris: Object.freeze(redirects) });
        cached = { clientId: cfg.clientId, expiresAt: now + 15 * 60000, proof };
        return proof;
    } catch (_) { invalid(); }
    finally {
        if (onAbort) signal.removeEventListener('abort', onAbort);
        if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {});
    }
}
function clearCache() { cached = null; }
module.exports = { verifyClient, clearCache };
