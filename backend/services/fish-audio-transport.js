const { spawn } = require('node:child_process');
const { createSession, readEgressConfig } = require('./fushi-egress');
const { fetchPinnedUrl } = require('./outbound-url-security');

let active = 0;
async function fetchFishAudio(url, options = {}) {
    const target = new URL(url);
    if (target.origin !== 'https://api.fish.audio' || target.username || target.password || target.hash || target.search ||
        !['/v1/tts', '/wallet/self/api-credit'].includes(target.pathname) && !/^\/model\/[a-f\d]{32}$/i.test(target.pathname)) {
        throw new Error('Invalid Fish Audio endpoint');
    }
    const env = {};
    for (const name of ['MODE', 'SSH_HOST', 'SSH_PORT', 'SSH_USER', 'SSH_IDENTITY', 'SSH_KNOWN_HOSTS']) {
        env['FUSHI_EGRESS_' + name] = process.env['FISH_AUDIO_EGRESS_' + name];
    }
    const config = readEgressConfig(env);
    const opts = { ...options, allowedHostnames: ['api.fish.audio'], protocols: ['https:'], redirect: 'error' };
    if (config.mode === 'direct') return fetchPinnedUrl(url, opts);
    if (active >= 8) throw Object.assign(new Error('Fish Audio 正忙，请稍后重试'), { status: 429 });
    active++;
    let session;
    try {
        session = createSession(config, opts.signal, spawn, () => { active--; });
        return await fetchPinnedUrl(url, { ...opts, lookup: session.lookup, agentFactory: (records, endpoint) => session.agent(records, endpoint) });
    } catch (error) {
        if (session) session.close(); else active--;
        throw error;
    }
}
module.exports = { fetchFishAudio };
