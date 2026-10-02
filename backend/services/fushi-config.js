const config = require('../config');
const SCOPES = ['fushi:read', 'fushi:reply', 'fushi:events'];
const GRANT_IDLE_MS = 180 * 86400000;
function readConfig() {
    const origin = String(process.env.FUSHI_ORIGIN || config.publicSiteUrl).replace(/\/$/, '');
    return {
        enabled: process.env.FUSHI_ENABLED === 'true',
        userId: process.env.FUSHI_USER_ID || '',
        origin, resource: `${origin}/api/fushi/mcp`,
        clientMode: process.env.FUSHI_OAUTH_CLIENT_MODE || 'predefined',
        clientId: process.env.FUSHI_OAUTH_CLIENT_ID || (process.env.FUSHI_OAUTH_CLIENT_MODE === 'cimd' ? 'https://chatgpt.com/oauth/client.json' : ''),
        redirectUri: process.env.FUSHI_OAUTH_REDIRECT_URI || '',
        encryptionKey: process.env.FUSHI_SECRET_KEY || ''
    };
}
function validateConfig(value = readConfig()) {
    if (!value.enabled) return value;
    require('./fushi-egress').readEgressConfig();
    const origin = new URL(value.origin);
    const redirect = value.clientMode === 'predefined' ? new URL(value.redirectUri) : null;
    if (origin.protocol !== 'https:' || origin.origin !== value.origin || origin.username || origin.password
        || !['predefined', 'cimd'].includes(value.clientMode)
        || (redirect && (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.hash))
        || (value.clientMode === 'cimd' && !/^https:\/\/chatgpt\.com\/oauth\/(?:[A-Za-z0-9_-]{1,128}\/)?client\.json$/.test(value.clientId))
        || !value.userId || !value.clientId || value.clientId.length > 256
        || !/^[A-Za-z0-9+/]{43}=$/.test(value.encryptionKey)
        || Buffer.from(value.encryptionKey, 'base64').length !== 32) throw new Error('Invalid Fushi MCP configuration');
    clients(value);
    return value;
}
// Additional public clients share the dedicated Fushi account, never its browser session.
// Keeping the original client allows existing ChatGPT grants to remain valid.
function clients(cfg = readConfig()) {
    let extra;
    try { extra = JSON.parse(process.env.FUSHI_OAUTH_EXTRA_CLIENTS_JSON || '[]'); }
    catch (_) { throw new Error('Invalid Fushi extra OAuth clients'); }
    if (!Array.isArray(extra) || extra.length > 8) throw new Error('Invalid Fushi extra OAuth clients');
    const result = [{ clientId: cfg.clientId, clientMode: cfg.clientMode, redirectUris: [cfg.redirectUri], scopes: [...SCOPES] }];
    for (const item of extra) {
        if (!item || Object.keys(item).some(k => !['client_id', 'redirect_uris'].includes(k))
            || typeof item.client_id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(item.client_id)
            || result.some(c => c.clientId === item.client_id) || !Array.isArray(item.redirect_uris)
            || !item.redirect_uris.length || item.redirect_uris.length > 4
            || item.redirect_uris.some(uri => {
                try { const u = new URL(uri); return typeof uri !== 'string' || uri.length > 2048 || u.protocol !== 'https:' || u.username || u.password || u.hash; }
                catch (_) { return true; }
            })) throw new Error('Invalid Fushi extra OAuth clients');
        result.push({ clientId: item.client_id, clientMode: 'predefined', redirectUris: [...new Set(item.redirect_uris)],
            scopes: ['fushi:read', 'fushi:reply'] });
    }
    return result;
}
function clientFor(id) { return clients().find(c => c.clientId && c.clientId === id) || null; }
module.exports = { SCOPES, GRANT_IDLE_MS, readConfig, validateConfig, clients, clientFor };
