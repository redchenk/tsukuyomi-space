const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'official-tts-'));
Object.assign(process.env, { NODE_ENV: 'test', DATA_DIR: dir, DB_PATH: path.join(dir,'test.db'), REDIS_URL: '',
    JWT_SECRET: 'official-tts-test-at-least-32-characters', ADMIN_USERNAME: 'tts-admin', ADMIN_PASSWORD: 'fixture-password', ENABLE_FRONTEND_DIST: 'false' });
const outbound = require('../backend/services/outbound-url-security');
const original = outbound.fetchPinnedUrl;
let mode = 'ready', calls = [], releaseResponse;
const wav = Buffer.alloc(100);
wav.write('RIFF'); wav.writeUInt32LE(92,4); wav.write('WAVE',8); wav.write('fmt ',12); wav.writeUInt32LE(16,16);
wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(32000,24); wav.writeUInt32LE(64000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(56,40);
outbound.fetchPinnedUrl = async (url, options) => {
    calls.push({ url, options });
    if (new URL(url).pathname === '/health') return new Response(JSON.stringify({ ready: mode !== 'offline' }), { headers: { 'Content-Type': 'application/json' } });
    if (new URL(url).pathname.startsWith('/set_')) return new Response('{"message":"success"}');
    if (mode === 'pending') await new Promise(resolve => { releaseResponse = resolve; });
    if (mode === 'bad') return new Response('{"error":"not audio"}', { headers: { 'Content-Type': 'audio/wav' } });
    if (mode === 'error') throw new Error('private provider failure');
    return new Response(wav, { headers: { 'Content-Type': 'audio/wav' } });
};
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const wallet = require('../backend/services/site-wallet');
const service = require('../backend/services/official-tts');
const { generateToken } = require('../backend/middleware/auth');
let server, base, tokens = {};
function configure(extra = {}) {
    fs.writeFileSync(path.join(dir,'official-tts.json'), JSON.stringify({ OFFICIAL_TTS_ENABLED: true,
        OFFICIAL_TTS_URL: 'https://compute.example.test/tts', OFFICIAL_TTS_HEALTH_URL: 'https://compute.example.test/health',
        OFFICIAL_TTS_REF_AUDIO_PATH: 'reference.wav', OFFICIAL_TTS_LANGUAGE: 'ja', OFFICIAL_TTS_API_KEY: crypto.randomUUID(), ...extra }), { mode: 0o600 });
}
async function call(route, { user = 'one', body, expected = user, origin = base } = {}) {
    const response = await fetch(base + '/api/tts/official' + route, { method: body ? 'POST' : 'GET', headers: {
        'Content-Type': 'application/json', Origin: origin, 'X-Requested-With': 'XMLHttpRequest',
        'X-TTS-Account': expected, ...(tokens[user] ? { Authorization: `Bearer ${tokens[user]}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, headers: response.headers, data: await response.json() };
}
async function submit(extra = {}, user = 'one') { return call('/jobs', { user, body: { text: 'こんにちは。', requestKey: crypto.randomUUID(), ...extra } }); }
async function done(id, user = 'one') {
    for (let n=0;n<30;n++) { const result = await call(`/jobs/${id}`, { user }); if (result.data.data?.state !== 'processing') return result.data.data; await new Promise(r => setTimeout(r, 10)); }
    throw new Error('Job did not complete');
}
before(async () => {
    server = createApp().listen(0, '127.0.0.1'); await new Promise(r=>server.once('listening',r)); base = `http://127.0.0.1:${server.address().port}`;
    for (const id of ['one','two','empty','super']) {
        db.prepare('INSERT INTO users(id,username,email,password_hash,role) VALUES(?,?,?,?,?)').run(id,id,`${id}@example.test`,'fixture',id==='super'?'super_admin':'user');
        tokens[id]=generateToken({ id, username:id, role:id==='super'?'super_admin':'user' }); wallet.wallet(id);
    }
    for (const id of ['one','two']) wallet.ledger.creditVerifiedEvent({ verified:true,source_id:'fixture',event_id:id,order_id:id,user_id:id,currency:'CNY',money_atoms:'1000000000' });
});
after(async () => { outbound.fetchPinnedUrl = original; server.closeAllConnections(); await new Promise(r=>server.close(r)); db.close(); fs.rmSync(dir,{recursive:true,force:true}); });
test('unconfigured/offline compute is disabled and probes do not debit wallets', async () => {
    assert.equal((await call('/status',{user:'guest'})).data.data.online,false);
    mode='offline'; configure(); assert.equal((await call('/status')).data.data.online,false);
    assert.equal((await submit()).status,503);
    assert.equal(db.prepare('SELECT count(*) n FROM billing_requests').get().n,0);
    mode='ready';configure(); assert.equal((await call('/status')).data.data.online,true);
    assert.equal(wallet.wallet('one').balance_atoms,'1000000000');
});
test('authentication, account binding, CSRF and payload overrides fail before dispatch', async () => {
    assert.equal((await submit({},'guest')).status,401);
    assert.equal((await call('/jobs',{expected:'two',body:{text:'a',requestKey:crypto.randomUUID()}})).status,409);
    assert.equal((await call('/jobs',{origin:'https://evil.example',body:{text:'a',requestKey:crypto.randomUUID()}})).status,403);
    for (const extra of [{apiUrl:'http://127.0.0.1'},{price:0},{sponsored:true},{text:'x'.repeat(1001)},{text:''}]) assert.equal((await submit(extra)).status,400);
});
test('insufficient balance never calls synthesis, including competing holds', async () => {
    const before=calls.length; assert.equal((await submit({},'empty')).status,402); assert.equal(calls.length,before);
});
test('one successful audio costs exactly 0.05, retries and concurrent duplicates charge once', async () => {
    mode='pending'; const requestKey=crypto.randomUUID();
    const [a,b]=await Promise.all([submit({requestKey}),submit({requestKey})]);
    assert.equal(a.status,202); assert.equal(b.status,202); assert.equal(a.data.data.id,b.data.data.id);
    const id=a.data.data.id;
    assert.equal(wallet.wallet('one').held_atoms,'50000000');
    assert.equal((await submit({},'two')).status,429);
    assert.equal((await submit({requestKey,text:'different'})).status,409);
    mode='ready';releaseResponse();
    const result=await done(id); assert.equal(result.state,'ready');assert.equal(result.chargedAtoms,'50000000');
    assert.equal(wallet.wallet('one').balance_atoms,'950000000'); assert.equal(wallet.wallet('one').held_atoms,'0');
    const count=calls.length; assert.equal((await submit({requestKey})).data.data.state,'ready');assert.equal(calls.length,count);
    const audio=await fetch(base+`/api/tts/official/jobs/${id}/audio`,{headers:{Authorization:`Bearer ${tokens.one}`,'X-TTS-Account':'one'}});
    assert.equal(audio.status,200);assert.equal(audio.headers.get('content-type'),'audio/wav');assert.match(audio.headers.get('cache-control'),/no-store/);
    assert.deepEqual(Buffer.from(await audio.arrayBuffer()),wav);
    assert.equal((await call(`/jobs/${id}`,{user:'two'})).status,404);
    assert.equal((await call(`/jobs/${id}/audio`,{user:'two'})).status,404);
    assert.equal((await call('/jobs',{user:'two'})).data.data.length,0);
});
test('super admin uses zero-charge admission and still records a voice', async () => {
    const a=await submit({},'super');assert.equal(a.status,202);
    const result=await done(a.data.data.id,'super');assert.equal(result.state,'ready');assert.equal(result.chargedAtoms,'0');
    assert.deepEqual(wallet.request(a.data.data.id).usage,{voices:'1'});
});
test('invalid audio, network failure and settlement failure release funds', async () => {
    for (const failure of ['bad','error','settlement']) {
        configure(); mode='ready';await call('/status');mode=failure;
        if(failure==='settlement') db.exec("CREATE TRIGGER fail_voice_charge BEFORE INSERT ON billing_usage_records BEGIN SELECT RAISE(ABORT,'fixture'); END");
        const balance=wallet.wallet('one').balance_atoms;
        const a=await submit();assert.equal(a.status,202,JSON.stringify(a.data));
        const result=await done(a.data.data.id);assert.equal(result.state,'failed');
        assert.equal(wallet.wallet('one').balance_atoms,balance);assert.equal(wallet.wallet('one').held_atoms,'0');
        assert.equal(result.chargedAtoms,'0');
        if(failure==='settlement')db.exec('DROP TRIGGER fail_voice_charge');
    }
    mode='ready';configure();
});
test('crashed synthesis is released without resending or debiting', async () => {
    mode='pending';await call('/status');const a=await submit();const id=a.data.data.id;
    db.prepare('UPDATE official_tts_jobs SET created_at=? WHERE id=?').run(Date.now()-200000,id);
    service.sweep();assert.equal((await call(`/jobs/${id}`)).data.data.state,'failed');
    assert.equal(wallet.wallet('one').held_atoms,'0');mode='ready';releaseResponse();await new Promise(r=>setTimeout(r,20));
    assert.equal(wallet.request(id).state,'released');
});
test('native GPT-SoVITS readiness loads fixed weights and validates real audio without billing', async () => {
    configure({OFFICIAL_TTS_HEALTH_URL:'',OFFICIAL_TTS_GPT_WEIGHT_PATH:'GPT_weights/test.ckpt',OFFICIAL_TTS_SOVITS_WEIGHT_PATH:'SoVITS_weights/test.pth'});
    const before=calls.length, balance=wallet.wallet('one').balance_atoms;
    const result=await call('/status');assert.equal(result.data.data.online,true);
    assert.deepEqual(calls.slice(before).map(x=>new URL(x.url).pathname),['/set_gpt_weights','/set_sovits_weights','/tts']);
    assert.equal(wallet.wallet('one').balance_atoms,balance);
    assert.ok(!JSON.stringify(result.data).includes('compute.example'));
});
test('legacy proxy cannot bypass the official compute charge or reach loopback', async () => {
    configure({ OFFICIAL_TTS_URL: 'https://8.8.8.8/tts', OFFICIAL_TTS_HEALTH_URL: 'https://8.8.8.8/health' });
    const count = calls.length;
    for (const endpoint of ['https://8.8.8.8/tts', 'http://127.0.0.1:9880/tts']) {
        const response = await fetch(base + '/api/tts', { method: 'POST', headers: {
            'Content-Type': 'application/json', Authorization: `Bearer ${tokens.one}`, Origin: base, 'X-Requested-With': 'XMLHttpRequest'
        }, body: JSON.stringify({ provider: 'gpt-sovits', text: 'test', apiUrl: endpoint, refAudioPath: 'reference.wav' }) });
        assert.ok(response.status >= 400); assert.match((await response.json()).message, /官方直供/);
    }
    assert.equal(calls.length, count);
});
test('voice failure policy cannot release token-billed requests', () => {
    const request_id = 'req_token_fixture', request_fingerprint = 'f'.repeat(64);
    wallet.admission({ user_id: 'one', request_id, request_fingerprint, hold_atoms: '1', sponsored: false,
        pricing_snapshot: { id: 'token-fixture', currency: 'CNY', rates_per_million_money_atoms: { input_uncached:'1',input_cached:'1',output:'1' } } });
    assert.throws(() => wallet.ledger.releaseWithNoConsumptionProof({ request_id, request_fingerprint,
        verified_no_consumption:true, reason:'voice_not_deliverable',proof_ref:'test' }), /only to fixed-price voice/);
    wallet.release({ request_id, request_fingerprint, reason:'cancelled_before_dispatch',proof_ref:'test' });
});
