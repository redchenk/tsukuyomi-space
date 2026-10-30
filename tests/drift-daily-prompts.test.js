const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-daily-'));
Object.assign(process.env, { NODE_ENV:'test', DATA_DIR:directory, DB_PATH:path.join(directory,'test.db'), JWT_SECRET:'drift-daily-prompt-fixture-more-than-32-characters', ADMIN_PASSWORD:'fixture-password', ENABLE_FRONTEND_DIST:'false', REDIS_URL:'' });
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const growth = require('../backend/services/user-growth');
const { getDailyPrompt } = require('../backend/services/drift-prompts');
const { generateToken } = require('../backend/middleware/auth');
const prompts = require('../shared/drift-prompts.json');
let server, base;
function user(name) {
    db.prepare('INSERT INTO users(id,username,email,password_hash) VALUES(?,?,?,?)').run(name,name,`${name}@example.test`,'fixture');
    return name;
}
function assigned(prefix, now = new Date(), wanted = true) {
    for (let index = 0; index < 100; index++) {
        const name = user(`${prefix}-${index}`);
        if ((growth.getState(name,now).today.tasks[2].key === 'daily_drift_prompt') === wanted) return name;
    }
    throw new Error('Could not assign fixture quest');
}
async function call(url, name, method = 'GET', body) {
    const response = await fetch(base + url, { method, headers:{ Origin:base, 'X-Requested-With':'XMLHttpRequest', 'Content-Type':'application/json', ...(name ? { Authorization:`Bearer ${generateToken({ id:name, username:name, role:name === 'admin-001' ? 'admin' : 'user' })}` } : {}) }, ...(body ? { body:JSON.stringify(body) } : {}) });
    return { status:response.status, body:await response.json() };
}
const source = prompt => ({ date:prompt.date, id:prompt.id });
const payload = (prompt, content = 'A small, quiet joy.') => ({ content, language:'en', promptDate:prompt.date, promptId:prompt.id, requestId:randomUUID() });
before(async () => {
    server = createApp().listen(0,'127.0.0.1');
    await new Promise(resolve => server.once('listening',resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(directory,{ recursive:true, force:true }); });

test('30 unique prompts and every bottle UI key have Chinese, English and Japanese translations', () => {
    assert.equal(prompts.length,30);
    assert.equal(new Set(prompts.map(prompt => prompt.id)).size,30);
    for (const lang of ['zh','en','ja']) {
        assert.equal(new Set(prompts.map(prompt => prompt.text[lang])).size,30);
        for (const prompt of prompts) assert.ok(prompt.text[lang]?.trim());
    }
    const vm = require('node:vm');
    const context = {};
    vm.runInNewContext(fs.readFileSync(require.resolve('../src/frontend/data/driftCopy.js'),'utf8').replace('export const driftCopy =', 'this.copy ='), context);
    for (const lang of ['en','ja']) {
        assert.deepEqual(Object.keys(context.copy[lang]).sort(),Object.keys(context.copy.zh).sort());
        for (const value of Object.values(context.copy[lang])) assert.ok(value.trim());
    }
});

test('the global draw is durable, excludes the last question, and resets at Hong Kong midnight', async () => {
    assert.equal((await call('/api/drift/daily-prompt')).status,401);
    const a = user('global-a'), b = user('global-b');
    const [left,right] = await Promise.all([call('/api/drift/daily-prompt',a),call('/api/drift/daily-prompt',b)]);
    assert.deepEqual(left.body.data,right.body.data);
    assert.ok(prompts.some(prompt => prompt.id === left.body.data.id));
    const modulePath = require.resolve('../backend/services/drift-prompts');
    delete require.cache[modulePath];
    assert.deepEqual(require(modulePath).getDailyPrompt(left.body.data.date),left.body.data);
    const before = growth.hongKongDate(new Date('2027-01-01T15:59:59Z'));
    const after = growth.hongKongDate(new Date('2027-01-01T16:00:00Z'));
    assert.equal(before,'2027-01-01'); assert.equal(after,'2027-01-02');
    assert.notEqual(getDailyPrompt(before).id,getDailyPrompt(after).id);
    const text = prompts.find(prompt => prompt.id === left.body.data.id).text;
    const original = text.en;
    try { text.en = 'Edited pool text'; assert.equal(getDailyPrompt(left.body.data.date).text.en,original); }
    finally { text.en = original; }
});

test('a retired context-dependent prompt is replaced globally and stale writers must review the replacement', async t => {
    t.mock.timers.enable({ apis:['Date'], now:Date.parse('2028-03-01T04:00:00Z') });
    const date = growth.hongKongDate();
    const oldText = { zh:'给自己起个昵称', en:'Give yourself a nickname', ja:'ニックネームをつけて' };
    db.prepare('INSERT INTO drift_daily_prompts(date,prompt_id,prompt_json) VALUES(?,?,?)').run(date,'nickname',JSON.stringify(oldText));
    const name = user('retired-prompt-writer');
    const response = await call('/api/drift/daily',name,'POST',payload({ date,id:'nickname' }));
    assert.equal(response.status,409);
    assert.equal(response.body.code,'DRIFT_PROMPT_CHANGED');
    const replacement = response.body.data.prompt;
    assert.ok(prompts.some(prompt => prompt.id === replacement.id));
    assert.notEqual(replacement.id,'nickname');
    assert.deepEqual((await call('/api/drift/daily-prompt',name)).body.data,replacement);
    assert.deepEqual(getDailyPrompt(date),replacement);
    assert.equal(db.prepare('SELECT count(*) n FROM drift_bottles WHERE user_id=?').get(name).n,0);
    for (const id of ['yachiyo-message','love-earth','reunion-code']) assert.ok(prompts.some(prompt => prompt.id === id));
});

test('the quest entry exposes the shared prompt; only that channel completes it, once', async () => {
    const name = assigned('reward');
    const task = growth.getState(name).today.tasks[2];
    assert.equal(task.path,'/drift?daily=1');
    const prompt = (await call('/api/drift/daily-prompt',name)).body.data;
    assert.deepEqual(task.prompt,prompt);
    const ordinary = await call('/api/drift',name,'POST',{ ...payload(prompt), dailyPrompt:prompt, status:'approved', xp:99999 });
    assert.equal(ordinary.status,201);
    assert.equal((await call(`/api/drift/${ordinary.body.data.id}`,name)).body.data.bottle.dailyPrompt,null);
    assert.equal(growth.getState(name).today.tasks[2].completed,false);
    const body = payload(prompt);
    const results = await Promise.all([call('/api/drift/daily',name,'POST',body),call('/api/drift/daily',name,'POST',body)]);
    assert.equal(results[0].status,201);
    assert.deepEqual(results[0],results[1]);
    assert.equal(results[0].body.data.growth.award.xp,20);
    const second = await call('/api/drift/daily',name,'POST',payload(prompt,'Another thought.'));
    assert.equal(second.body.data.growth.award.xp,0);
    assert.equal(growth.getState(name).today.tasks[2].completed,true);
    assert.equal(growth.getState(name).level.totalXp,20);
    assert.equal(db.prepare('SELECT count(*) n FROM drift_bottles WHERE user_id=? AND daily_prompt_id IS NOT NULL').get(name).n,2);
    assert.equal((await call('/api/drift',name,'POST',body)).status,409,'a request ID cannot switch submission channels');
    assert.equal((await call('/api/drift/daily',name,'POST',{ ...body,promptId:'tampered' })).body.code,'DRIFT_SUBMISSION_CONFLICT');
    const other = assigned('not-assigned',new Date(),false);
    const sent = await call('/api/drift/daily',other,'POST',payload(prompt));
    assert.equal(sent.status,201); assert.equal(sent.body.data.growth,null);
    assert.equal(growth.getState(other).level.totalXp,0);
});

test('quest bottles share the sea without attaching prompt text to lists or letters', async () => {
    db.prepare('UPDATE drift_bottles SET closed=1').run();
    const owner = user('sea-owner'), reader = user('sea-reader'), stranger = user('sea-stranger');
    const prompt = getDailyPrompt(growth.hongKongDate());
    const sent = await call('/api/drift/daily',owner,'POST',payload(prompt));
    assert.deepEqual(sent.body.data.dailyPrompt,source(prompt));
    const id = sent.body.data.id;
    assert.deepEqual((await call('/api/drift/pick',reader,'POST')).body.data,{ id });
    assert.equal((await call(`/api/drift/${id}`,stranger)).status,404);
    assert.deepEqual((await call('/api/drift',stranger)).body.data,[]);
    for (const participant of [owner,reader]) {
        const bottle = (await call(`/api/drift/${id}`,participant)).body.data.bottle;
        assert.deepEqual(bottle.dailyPrompt,source(prompt));
        assert.equal(bottle.dailyPrompt.text,undefined);
        assert.equal(bottle.daily_prompt_json,undefined);
        assert.equal(bottle.review,undefined);
        assert.deepEqual((await call('/api/drift',participant)).body.data.find(row => row.id === id).dailyPrompt,source(prompt));
    }
    assert.deepEqual(JSON.parse(db.prepare('SELECT daily_prompt_json FROM drift_bottles WHERE id=?').get(id).daily_prompt_json),prompt.text);
    getDailyPrompt('2027-02-01');
    assert.deepEqual((await call(`/api/drift/${id}`,reader)).body.data.bottle.dailyPrompt,source(prompt));
    assert.equal((await call(`/api/drift/${id}/return`,reader,'POST')).status,200);
    assert.equal((await call('/api/drift/pick',stranger,'POST')).body.data.id,id);
    await call(`/api/drift/${id}/close`,owner,'POST');
});

test('stale and forged prompts cannot save or reward; invalid content cannot reserve a receipt', async () => {
    const name = assigned('validation');
    const prompt = getDailyPrompt(growth.hongKongDate());
    const body = payload(prompt);
    for (const change of [{ promptDate:'2000-01-01' },{ promptId:'invented' },{ promptId:undefined },{ promptDate:undefined }]) {
        const result = await call('/api/drift/daily',name,'POST',{ ...body,...change });
        assert.equal(result.status,409); assert.equal(result.body.code,'DRIFT_PROMPT_CHANGED');
        assert.deepEqual(result.body.data.prompt,prompt);
    }
    for (const content of ['', 'x'.repeat(2001), '<script>alert(1)</script>']) {
        assert.equal((await call('/api/drift/daily',name,'POST',{ ...body,content })).status,422);
    }
    assert.equal((await call('/api/drift/daily',null,'POST',body)).status,401);
    assert.equal(db.prepare('SELECT count(*) n FROM drift_bottles WHERE user_id=?').get(name).n,0);
    assert.equal(db.prepare('SELECT count(*) n FROM drift_submissions WHERE user_id=?').get(name).n,0);
    assert.equal(growth.getState(name).level.totalXp,0);
    assert.equal((await call('/api/drift/daily',name,'POST',body)).status,201);
});

test('midnight retries acknowledge the old receipt; a new stale submission needs the new prompt', async t => {
    t.mock.timers.enable({ apis:['Date'], now:Date.parse('2026-11-12T15:59:59Z') });
    const name = assigned('midnight');
    const prompt = getDailyPrompt(growth.hongKongDate());
    const body = payload(prompt);
    const sent = await call('/api/drift/daily',name,'POST',body);
    t.mock.timers.setTime(Date.parse('2026-11-12T16:00:00Z'));
    assert.deepEqual(await call('/api/drift/daily',name,'POST',body),sent);
    assert.equal((await call('/api/drift/daily',name,'POST',{ ...body,requestId:randomUUID() })).status,409);
    assert.equal(growth.getState(name).today.earnedXp,0);
    assert.equal(growth.getState(name).level.totalXp,20);
});

test('pending moderation earns no XP until approval and credits the original submission day', async t => {
    db.prepare('UPDATE drift_bottles SET closed=1').run();
    t.mock.timers.enable({ apis:['Date'], now:Date.parse('2026-11-20T04:00:00Z') });
    const name = assigned('moderation');
    const prompt = getDailyPrompt(growth.hongKongDate());
    const sent = await call('/api/drift/daily',name,'POST',payload(prompt,'看看 https://example.org'));
    const id = sent.body.data.id;
    assert.equal(sent.body.data.status,'pending');
    assert.equal(growth.getState(name).level.totalXp,0);
    assert.equal((await call('/api/drift/pick',user('moderation-reader'),'POST')).body.data,null);
    assert.equal((await call(`/api/moderation/drift/bottles/${id}`,name,'POST',{ status:'approved' })).status,403);
    t.mock.timers.setTime(Date.parse('2026-11-21T04:00:00Z'));
    const queue = await call('/api/moderation/drift','admin-001');
    assert.deepEqual(queue.body.data.bottles.find(row => row.id === id).dailyPrompt,source(prompt));
    assert.equal((await call(`/api/moderation/drift/bottles/${id}`,'admin-001','POST',{ status:'approved' })).status,200);
    assert.equal((await call(`/api/moderation/drift/bottles/${id}`,'admin-001','POST',{ status:'approved' })).status,409);
    assert.equal(growth.getState(name).level.totalXp,20);
    assert.equal(growth.getState(name).today.earnedXp,0);
    assert.equal(db.prepare("SELECT event_date FROM user_growth_events WHERE user_id=? AND event_key='daily_drift_prompt'").get(name).event_date,prompt.date);
    const rejectedName = assigned('rejected');
    const rejected = await call('/api/drift/daily',rejectedName,'POST',payload(getDailyPrompt(growth.hongKongDate()),'看看 https://example.org'));
    await call(`/api/moderation/drift/bottles/${rejected.body.data.id}`,'admin-001','POST',{ status:'rejected' });
    assert.equal(growth.getState(rejectedName).level.totalXp,0);
});

test('bottle, quest reward and receipt roll back together after a storage failure', async () => {
    const name = assigned('atomic');
    const body = payload(getDailyPrompt(growth.hongKongDate()));
    db.exec(`CREATE TRIGGER fail_daily_receipt BEFORE INSERT ON drift_submissions WHEN NEW.request_id='${body.requestId}' BEGIN SELECT RAISE(ABORT,'fixture failure'); END;`);
    try {
        assert.equal((await call('/api/drift/daily',name,'POST',body)).status,500);
        assert.equal(db.prepare('SELECT count(*) n FROM drift_bottles WHERE user_id=?').get(name).n,0);
        assert.equal(growth.getState(name).level.totalXp,0);
    } finally { db.exec('DROP TRIGGER fail_daily_receipt'); }
    assert.equal((await call('/api/drift/daily',name,'POST',body)).body.data.growth.award.xp,20);
});

test('migration preserves existing bottles and applies through the migration runner', () => {
    const legacy = new (require('better-sqlite3'))(':memory:');
    try {
        legacy.exec("CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES('legacy');");
        require('../backend/db/migrations/055_create_drift_bottles').up(legacy);
        legacy.exec("INSERT INTO drift_bottles(user_id,content,status,review) VALUES('legacy','Old letter','approved','{}');");
        require('../backend/db/migrations/058_drift_daily_prompts').up(legacy);
        assert.equal(legacy.prepare('SELECT content FROM drift_bottles').get().content,'Old letter');
        assert.equal(legacy.prepare('SELECT daily_prompt_id FROM drift_bottles').get().daily_prompt_id,null);
        assert.ok(db.prepare("SELECT 1 FROM schema_migrations WHERE version='058'").get());
    } finally { legacy.close(); }
});
