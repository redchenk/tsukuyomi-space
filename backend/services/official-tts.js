const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('../db');
const config = require('../config');
const wallet = require('./site-wallet');
const { fetchPinnedUrl } = require('./outbound-url-security');

const PRICE = '50000000'; // CNY 0.05, in the site's existing 10^-9 yuan units.
const SNAPSHOT = Object.freeze({ id: 'official-voice-cny-005-v1', currency: 'CNY', unit: 'voice', unit_price_money_atoms: PRICE });
const MAX_TEXT = 1000, MAX_AUDIO = 8 * 1024 * 1024, RETENTION = 24 * 60 * 60 * 1000;
const TIMEOUT = 90000, LEASE = 150000;
const cacheDir = path.join(config.dataDir, 'private-official-tts');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }); };
let health = null, healthPending = null, lastSweep = 0;

// Operator-only environment configuration. No endpoint, key, model or reference
// path is ever accepted from a synthesis request or returned by the status API.
function settings() {
    const env = { ...process.env };
    const file = path.join(config.dataDir, 'official-tts.json');
    if (fs.existsSync(file)) {
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077 || stat.size > 16384) throw new Error('Unsafe configuration');
        const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
        for (const [key,value] of Object.entries(stored)) if (key.startsWith('OFFICIAL_TTS_')) env[key] = String(value);
    }
    if (env.OFFICIAL_TTS_ENABLED !== 'true') return null;
    const endpoint = new URL(env.OFFICIAL_TTS_URL);
    const protocol = env.OFFICIAL_TTS_PROTOCOL || 'gpt-sovits';
    const healthUrl = new URL(env.OFFICIAL_TTS_HEALTH_URL || endpoint.href);
    for (const url of [endpoint, healthUrl]) {
        if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid TTS configuration');
        // Plain HTTP is only for a deliberately provisioned local tunnel.
        if (url.protocol === 'http:' && !['127.0.0.1', '[::1]'].includes(url.hostname) && env.OFFICIAL_TTS_ALLOW_HTTP !== 'true') throw new Error('HTTPS required');
    }
    if (healthUrl.origin !== endpoint.origin || !['gpt-sovits', 'openai'].includes(protocol)) throw new Error('Invalid TTS configuration');
    const key = env.OFFICIAL_TTS_API_KEY || '';
    if (endpoint.protocol === 'http:' && key && !['127.0.0.1','[::1]'].includes(endpoint.hostname)) throw new Error('Do not send keys over public HTTP');
    const language = env.OFFICIAL_TTS_LANGUAGE || 'auto';
    if (!['auto','zh','ja','en','ko','yue'].includes(language)) throw new Error('Invalid language');
    const reference = env.OFFICIAL_TTS_REF_AUDIO_PATH || '';
    if (protocol === 'gpt-sovits' && !reference) throw new Error('Missing reference audio');
    return { endpoint: endpoint.href, healthUrl: healthUrl.href, protocol, key, language, reference,
        nativeProbe: protocol === 'gpt-sovits' && !env.OFFICIAL_TTS_HEALTH_URL,
        gptWeight: env.OFFICIAL_TTS_GPT_WEIGHT_PATH || '', sovitsWeight: env.OFFICIAL_TTS_SOVITS_WEIGHT_PATH || '',
        promptText: env.OFFICIAL_TTS_PROMPT_TEXT || '', promptLang: env.OFFICIAL_TTS_PROMPT_LANG || 'ja',
        model: env.OFFICIAL_TTS_MODEL || 'tts-1', voice: env.OFFICIAL_TTS_VOICE || 'alloy' };
}

async function request(url, options, cfg) {
    const opts = { ...options, redirect: 'error', headers: { ...options.headers, ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}) } };
    // Only the operator-configured loopback tunnel bypasses public DNS pinning.
    if (['127.0.0.1','[::1]'].includes(new URL(url).hostname)) return fetch(url, opts);
    return fetchPinnedUrl(url, { ...opts, protocols: ['https:', 'http:'], timeoutMs: options.timeoutMs || TIMEOUT });
}
async function boundedBody(response, max) {
    if (Number(response.headers.get('content-length')) > max) { await response.body?.cancel(); throw new Error('Response too large'); }
    const chunks = []; let size = 0;
    if (!response.body) throw new Error('Empty response');
    const reader = response.body.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > max) throw new Error('Response too large');
            chunks.push(Buffer.from(value));
        }
    } finally { await reader.cancel().catch(() => {}); }
    return Buffer.concat(chunks, size);
}
async function status() {
    let cfg;
    try { cfg = settings(); } catch (_) { cfg = null; }
    const base = { price: '0.05', priceAtoms: PRICE, maxCharacters: MAX_TEXT, retentionHours: 24, language: cfg?.language || 'auto' };
    if (!cfg) return { ...base, online: false, reason: 'unconfigured', checkedAt: Date.now() };
    const key = hash(JSON.stringify(cfg));
    // Native GPT-SoVITS has no readiness endpoint. A small fixed Japanese phrase
    // validates the configured model/reference, at most once per minute globally.
    // Probes never touch user wallets. Successful real jobs also refresh readiness.
    if (health?.key === key && (Date.now() - health.checkedAt < (health.value.online ? 60000 : 10000)
        || db.prepare("SELECT id FROM official_tts_jobs WHERE state='processing'").get())) return { ...base, ...health.value, checkedAt: health.checkedAt };
    if (!healthPending || healthPending.key !== key) {
        const promise = (async () => {
            let online = false;
            try {
                if (cfg.nativeProbe) {
                    await synthesize('こんにちは。', cfg, 10000);
                    online = true;
                } else {
                    const response = await request(cfg.healthUrl, { method: 'GET', signal: AbortSignal.timeout(3000), timeoutMs: 3000 }, cfg);
                    const data = JSON.parse((await boundedBody(response, 4096)).toString());
                    online = response.ok && data.ready === true;
                }
            } catch (_) { /* Fail closed; never expose credentials or upstream diagnostics. */ }
            const value = { online, reason: online ? 'ready' : 'offline' };
            health = { key, value, checkedAt: Date.now() };
            return { ...base, ...value, checkedAt: health.checkedAt };
        })();
        healthPending = { key, promise };
        promise.finally(() => { if (healthPending?.promise === promise) healthPending = null; });
    }
    return healthPending.promise;
}
function audioPath(id) { return path.join(cacheDir, `${id}.audio`); }
function releaseJob(row) {
    db.transaction(() => {
        const current = db.prepare('SELECT * FROM official_tts_jobs WHERE id=?').get(row.id);
        if (current?.state !== 'processing') return;
        wallet.ledger.releaseWithNoConsumptionProof({ request_id: row.id, request_fingerprint: row.fingerprint,
            verified_no_consumption: true, reason: 'voice_not_deliverable', proof_ref: `voice-failure:${row.id}` });
        db.prepare("UPDATE official_tts_jobs SET state='failed',updated_at=? WHERE id=?").run(Date.now(), row.id);
    }).immediate();
    fs.rmSync(audioPath(row.id), { force: true });
}
function sweep() {
    const now = Date.now();
    for (const row of db.prepare("SELECT * FROM official_tts_jobs WHERE state='processing' AND created_at<?").all(now - LEASE)) releaseJob(row);
    if (now - lastSweep < 30000) return;
    lastSweep = now;
    const rows = db.prepare("SELECT * FROM official_tts_jobs WHERE state='ready' ORDER BY created_at DESC").all();
    let bytes = 0;
    for (const row of rows) {
        bytes += row.audio_bytes;
        if (row.created_at >= now - RETENTION && bytes <= 128 * 1024 * 1024) continue;
        db.prepare("UPDATE official_tts_jobs SET state='expired',updated_at=? WHERE id=?").run(now, row.id);
        fs.rmSync(audioPath(row.id), { force: true });
    }
}
function view(row) {
    const bill = wallet.request(row.id);
    return { id: row.id, state: row.state, chargedAtoms: bill.money_atoms || '0',
        expiresAt: row.created_at + RETENTION,
        message: row.state === 'failed' ? '语音未能合成，预留金额已退回。' : row.state === 'expired' ? '这条语音的缓存已过期；重新生成将按新的一条计费。' : '' };
}
function owned(userId, id) {
    if (!/^req_voice_[a-f0-9]{64}$/.test(id)) fail(404, 'NOT_FOUND', '语音不存在');
    const row = db.prepare('SELECT * FROM official_tts_jobs WHERE id=? AND user_id=?').get(id, userId);
    if (!row) fail(404, 'NOT_FOUND', '语音不存在');
    return row;
}
function get(userId, id) { sweep(); return view(owned(userId, id)); }
function audio(userId, id) {
    sweep(); const row = owned(userId, id);
    if (row.state !== 'ready' || !fs.existsSync(audioPath(id))) fail(410, 'AUDIO_UNAVAILABLE', '语音已过期或尚未生成，请查看合成状态');
    return { buffer: fs.readFileSync(audioPath(id)), contentType: row.content_type };
}
function audioType(buffer) {
    if (buffer.length < 44) throw new Error('Empty audio');
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') return 'audio/wav';
    if (buffer.toString('ascii', 0, 3) === 'ID3' || buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return 'audio/mpeg';
    if (buffer.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg';
    throw new Error('Invalid audio');
}
async function perform(row, text, cfg) {
    try {
        const { buffer, contentType } = await synthesize(text, cfg, TIMEOUT);
        fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
        const fd = fs.openSync(audioPath(row.id), 'wx', 0o600);
        try { fs.writeFileSync(fd, buffer); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        const directory = fs.openSync(cacheDir, 'r');
        try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
        db.transaction(() => {
            const current = owned(row.user_id, row.id);
            if (current.state !== 'processing' || Date.now() - row.created_at > LEASE) throw new Error('Lease expired');
            const reservation = wallet.request(row.id);
            const result = wallet.ledger.settle({ request_id: row.id, request_fingerprint: row.fingerprint,
                money_atoms: reservation.hold_atoms, pricing_snapshot: SNAPSHOT, usage: { voices: 1 }, usage_status: 'final_usage_observed' });
            if (result.request.state !== 'settled') throw new Error('Settlement failed');
            db.prepare("UPDATE official_tts_jobs SET state='ready',content_type=?,audio_bytes=?,updated_at=? WHERE id=?")
                .run(contentType, buffer.length, Date.now(), row.id);
        }).immediate();
        health = { key: hash(JSON.stringify(cfg)), value: { online: true, reason: 'ready' }, checkedAt: Date.now() };
    } catch (_) {
        health = { key: hash(JSON.stringify(cfg)), value: { online: false, reason: 'offline' }, checkedAt: Date.now() };
        try { releaseJob(row); } catch (_) { console.error('Official TTS recovery required:', row.id); }
    }
}
async function synthesize(text, cfg, timeout) {
        const signal = AbortSignal.timeout(timeout);
        if (cfg.protocol === 'gpt-sovits') {
            for (const [route, weights] of [['set_gpt_weights', cfg.gptWeight], ['set_sovits_weights', cfg.sovitsWeight]]) {
                if (!weights) continue;
                const url = new URL(`/${route}`, cfg.endpoint); url.searchParams.set('weights_path', weights);
                const response = await request(url.href, { method: 'GET', signal, timeoutMs: timeout }, cfg);
                const body = await boundedBody(response, 4096);
                if (!response.ok || !/success/i.test(body.toString())) throw new Error('Model unavailable');
            }
        }
        const body = cfg.protocol === 'gpt-sovits'
            ? { text, text_lang: cfg.language, ref_audio_path: cfg.reference, prompt_text: cfg.promptText,
                prompt_lang: cfg.promptLang, media_type: 'wav', streaming_mode: false }
            : { input: text, model: cfg.model, voice: cfg.voice, response_format: 'mp3' };
        const response = await request(cfg.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body), signal, timeoutMs: timeout }, cfg);
        if (!response.ok) { await response.body?.cancel(); throw new Error('Provider unavailable'); }
        const buffer = await boundedBody(response, MAX_AUDIO);
        const contentType = audioType(buffer);
        return { buffer, contentType };
}
async function create(userId, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['text','requestKey'].includes(k))) fail(400, 'INVALID_REQUEST', '语音参数无效');
    if (typeof input.text !== 'string' || !input.text.trim() || [...input.text].length > MAX_TEXT || !/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestKey || '')) fail(400, 'INVALID_REQUEST', `每条语音最多 ${MAX_TEXT} 字，请提供有效请求编号`);
    sweep();
    const text = input.text.trim(), id = `req_voice_${hash(`${userId}:${input.requestKey}`)}`, fingerprint = hash(JSON.stringify({ userId, text }));
    function existing() {
        const row = db.prepare('SELECT * FROM official_tts_jobs WHERE id=? AND user_id=?').get(id, userId);
        if (row && row.fingerprint !== fingerprint) fail(409, 'IDEMPOTENCY_CONFLICT', '请求编号已用于其他语音');
        return row;
    }
    const old = existing();
    if (old) return view(old);
    if (!(await status()).online) fail(503, 'TTS_OFFLINE', '官方语音算力离线，暂不可使用，未扣费');
    const cfg = settings();
    if (!cfg) fail(503, 'TTS_OFFLINE', '官方语音暂不可使用，未扣费');
    const result = db.transaction(() => {
        const repeated = existing();
        if (repeated) return { row: repeated, fresh: false };
        if (db.prepare("SELECT count(*) n FROM official_tts_jobs WHERE state='processing'").get().n >= 1
            || db.prepare("SELECT id FROM official_tts_jobs WHERE user_id=? AND state='processing'").get(userId)) fail(429, 'TTS_BUSY', '语音算力忙碌，请稍后重试，未扣费');
        const account = wallet.wallet(userId);
        wallet.admission({ user_id: userId, request_id: id, request_fingerprint: fingerprint, sponsored: account.unlimited,
            hold_atoms: account.unlimited ? '0' : PRICE, pricing_snapshot: SNAPSHOT });
        const now = Date.now();
        db.prepare("INSERT INTO official_tts_jobs(id,user_id,fingerprint,state,created_at,updated_at) VALUES(?,?,?,'processing',?,?)").run(id,userId,fingerprint,now,now);
        return { row: owned(userId, id), fresh: true };
    }).immediate();
    if (result.fresh) void perform(result.row, text, cfg);
    return view(result.row);
}
function protectedEndpoint() { try { return settings()?.endpoint || ''; } catch (_) { return ''; } }
function list(userId) {
    sweep(); return db.prepare('SELECT * FROM official_tts_jobs WHERE user_id=? ORDER BY created_at DESC LIMIT 30').all(userId)
        .map(row => ({ ...view(row), createdAt: row.created_at }));
}
let recoveryTimer;
function start() {
    const recover = () => { try { sweep(); } catch (_) { console.error('Official TTS recovery pending'); } };
    if (!recoveryTimer) { recover(); recoveryTimer = setInterval(recover, 30000); recoveryTimer.unref(); }
}
module.exports = { status, create, get, audio, sweep, start, list, protectedEndpoint };
