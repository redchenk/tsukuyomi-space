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
    const origin = new URL(value.origin);
    const redirect = value.clientMode === 'predefined' ? new URL(value.redirectUri) : null;
    if (origin.protocol !== 'https:' || origin.origin !== value.origin || origin.username || origin.password
        || !['predefined', 'cimd'].includes(value.clientMode)
        || (redirect && (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.hash))
        || (value.clientMode === 'cimd' && !/^https:\/\/chatgpt\.com\/oauth\/(?:[A-Za-z0-9_-]{1,128}\/)?client\.json$/.test(value.clientId))
        || !value.userId || !value.clientId || value.clientId.length > 256
        || !/^[A-Za-z0-9+/]{43}=$/.test(value.encryptionKey)
        || Buffer.from(value.encryptionKey, 'base64').length !== 32) throw new Error('Invalid Fushi MCP configuration');
    return value;
}
module.exports = { SCOPES, GRANT_IDLE_MS, readConfig, validateConfig };
