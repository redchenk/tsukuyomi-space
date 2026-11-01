const { spawn } = require('node:child_process');
const { createSession, readEgressConfig } = require('./fushi-egress');
const { fetchPinnedUrl } = require('./outbound-url-security');

let active = 0;
async function fetchGoogleOAuthUrl(url, options) {
    if (!['https://oauth2.googleapis.com/token', 'https://www.googleapis.com/oauth2/v3/certs'].includes(url)) throw new Error('Invalid Google identity endpoint');
    const env = {};
    for (const suffix of ['MODE', 'SSH_HOST', 'SSH_PORT', 'SSH_USER', 'SSH_IDENTITY', 'SSH_KNOWN_HOSTS']) {
        env[`FUSHI_EGRESS_${suffix}`] = process.env[`GOOGLE_OAUTH_EGRESS_${suffix}`];
    }
    const config = readEgressConfig(env);
    if (config.mode === 'direct') return fetch(url, options);
    if (active >= 2) throw new Error('Google 登录繁忙，请稍后重试');
    active++;
    let session;
    try {
        // Reuse the restricted SSH tunnel transport with a separate concurrency
        // budget. TLS to Google, certificate checks and secrets stay at the API.
        session = createSession(config, options.signal, spawn, () => { active--; });
        return await fetchPinnedUrl(url, { ...options, protocols: ['https:'], timeoutMs: 10000,
            lookup: session.lookup, agentFactory: (records, target) => session.agent(records, target) });
    } catch (error) { if (session) session.close(); else active--; throw error; }
}
module.exports = { fetchGoogleOAuthUrl };
