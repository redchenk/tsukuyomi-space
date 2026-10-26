const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsukuyomi-play-'));
Object.assign(process.env, { NODE_ENV: 'test', DATA_DIR: dataDir, DB_PATH: path.join(dataDir, 'test.db'), JWT_SECRET: 'test-play-application-secret-over-32-characters', ADMIN_USERNAME: 'play-admin', ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: 'test-password-12345', REDIS_URL: '' });
// Route checks must work on a clean CI checkout before the frontend build.
const config = require('../backend/config');
config.projectRoot = dataDir;
config.enableFrontendDist = true;
fs.mkdirSync(path.join(dataDir, 'dist/frontend'), { recursive: true });
fs.writeFileSync(path.join(dataDir, 'dist/frontend/index.html'), '<!doctype html><html><head><title>Play fixture</title></head><body><div id="app">Play route fixture</div></body></html>');
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const { generateToken } = require('../backend/middleware/auth');
const policy = require('../shared/play-testing.json');
let server, base, admin, user, staff, sequence = 0;
const valid = { email: 'tester@example.test', eligible: true, consent: true, consentVersion: policy.consentVersion, device: 'Pixel 9', androidVersion: '16' };
async function call(url = '/api/play-testing', value, token, options = {}) {
    const response = await fetch(base + url, { method: options.method || (value === undefined ? 'GET' : 'POST'), headers: { 'Content-Type': 'application/json', Origin: base, 'X-Requested-With': 'XMLHttpRequest', 'X-Real-IP': `2001:db8::${++sequence}`, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
    const raw = await response.text();
    return { status: response.status, headers: response.headers, raw, ...(response.headers.get('content-type')?.includes('application/json') ? JSON.parse(raw) : {}) };
}
before(async () => {
    server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`;
    db.prepare('INSERT INTO users(id,username,email,password_hash,role) VALUES (?,?,?,?,?)').run('user','user','user@example.test','test-hash','user');
    user = generateToken({ id: 'user', role: 'user' });
    const a = db.prepare("SELECT * FROM admins WHERE role='super_admin'").get();
    admin = generateToken({ scope: 'admin', adminId: a.id, username: a.username, role: 'super_admin' });
    const result = db.prepare("INSERT INTO admins(username,password_hash,role) VALUES('staff','test-hash','admin')").run();
    staff = generateToken({ scope: 'admin', adminId: Number(result.lastInsertRowid), username: 'staff', role: 'admin' });
});
after(async () => { await new Promise(r => server.close(r)); db.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
test('anonymous signup persists once, case-insensitive repeats neither disclose nor overwrite records', async () => {
    const first = await call(undefined, valid);
    assert.equal(first.status, 202); assert.deepEqual(first.data, { received: true });
    const row = db.prepare('SELECT * FROM play_test_applications').get();
    assert.equal(row.email, valid.email); assert.equal(row.consent_version, policy.consentVersion);
    for (const result of await Promise.all(Array.from({length:3}, () => call(undefined, { ...valid, email:'TESTER@EXAMPLE.TEST', device:'changed' })))) assert.deepEqual(result.data,first.data);
    assert.deepEqual(db.prepare('SELECT * FROM play_test_applications').all(),[row]);
    const meta = await call();
    assert.deepEqual(Object.keys(meta.data).sort(), ['consentVersion','joinUrl','registrationOpen']);
    assert.equal(meta.data.joinUrl, ''); assert.match(meta.headers.get('cache-control'),/no-store/);
    assert.equal((await call(`/api/play-testing/${row.id}`)).status,404);
});
test('server enforces valid fields and current consent; honeypots do not store or send anything', async () => {
    for (const patch of [{email:'=CMD@example.test'},{email:'a\nb@example.test'},{email:'a@'},{consent:false},{eligible:false},{consentVersion:'old'},{device:'a'.repeat(81)},{androidVersion:123}]) assert.equal((await call(undefined,{...valid,...patch})).status,422);
    assert.equal((await call(undefined,{...valid,email:'bot@example.test',website:'spam'})).status,202);
    assert.equal(db.prepare("SELECT count(*) n FROM play_test_applications WHERE email='bot@example.test'").get().n,0);
    assert.equal((await call(undefined,{...valid,email:'other@outlook.com'})).status,202);
    assert.equal((await call(undefined,{...valid,email:'injection@example.test',device:'<img src=x onerror=alert(1)>'})).status,202);
    assert.equal((await call(undefined,{...valid,device:'x'.repeat(5000)})).status,413);
});
test('administration requires a separate super-admin session; cross-site writes fail', async () => {
    for (const url of ['/api/admin/play-testing','/api/admin/play-testing/export','/api/admin/play-testing/settings']) {
        assert.equal((await call(url)).status,401);
        assert.equal((await call(url,undefined,user)).status,403);
        assert.equal((await call(url,undefined,staff)).status,403);
        assert.equal((await call(url,undefined,admin)).status,200);
    }
    assert.equal((await call(undefined,valid,null,{headers:{Origin:'https://evil.test','Sec-Fetch-Site':'cross-site'}})).status,403);
});
test('queue search and CSV have no public details, header, BOM or formula cells', async () => {
    const result=await call('/api/admin/play-testing?status=all&search=TESTER',undefined,admin);
    assert.equal(result.data.total,1); assert.equal(result.data.items[0].email,valid.email);
    assert.match(result.headers.get('cache-control'),/no-store/);
    const csv=await call('/api/admin/play-testing/export?status=all&search=tester',undefined,admin);
    assert.equal(csv.raw,valid.email+'\n'); assert.match(csv.headers.get('content-disposition'),/attachment/);
    assert.equal((await call('/api/admin/play-testing?status=nope',undefined,admin)).status,422);
});
test('only verified invitations change status; Google membership is never claimed; deletion is explicit', async () => {
    const row=db.prepare('SELECT * FROM play_test_applications WHERE email=?').get(valid.email);
    const url=`/api/admin/play-testing/${row.id}`;
    assert.equal((await call(url+'/status',{status:'invited'},admin)).status,409);
    assert.equal((await call(url+'/status',{status:'joined',confirmSent:true},admin)).status,422);
    assert.equal((await call(url+'/status',{status:'invited',confirmSent:true},admin)).status,409);
    db.prepare("UPDATE play_test_applications SET status='invited' WHERE id=?").run(row.id); // Preserve a legacy manual registration.
    assert.equal((await call('/api/admin/play-testing?status=invited',undefined,admin)).data.total,1);
    assert.equal((await call(url,{},admin,{method:'DELETE'})).status,422);
    assert.equal((await call(url,{confirmation:'DELETE_APPLICATION'},admin,{method:'DELETE'})).status,200);
    assert.equal(db.prepare('SELECT count(*) n FROM play_test_applications').get().n,2);
});
test('registration can pause; published join URL must match this app and needs operator confirmation', async () => {
    const url='/api/admin/play-testing/settings';
    for (const joinUrl of ['javascript:alert(1)','https://evil.test','https://play.google.com/apps/testing/other']) assert.equal((await call(url,{registrationOpen:true,joinUrl,confirmPublished:true},admin)).status,422);
    const joinUrl=`https://play.google.com/apps/testing/${policy.packageName}`;
    assert.equal((await call(url,{registrationOpen:true,joinUrl},admin)).status,422);
    assert.equal((await call(url,{registrationOpen:false,joinUrl,confirmPublished:true},admin)).status,200);
    assert.equal((await call(undefined,valid)).status,409);
    assert.equal((await call()).data.joinUrl,joinUrl);
    assert.equal((await call(url,{registrationOpen:true,joinUrl:''},admin)).status,200);
});
test('bounded signup rate remains enforced for anonymous clients', async () => {
    let last;
    for(let i=0;i<13;i++) last=await call(undefined,valid,null,{headers:{'X-Real-IP':'2001:db8:ffff::1'}});
    assert.equal(last.status,429); assert.ok(last.headers.has('retry-after'));
});
test('email links open both SPA routes directly and keep unknown paths as 404', async () => {
    for(const url of ['/apply','/admin/play-testing']) {
        const response = await call(url);
        assert.equal(response.status,200);
        assert.match(response.raw,/Play route fixture/);
        assert.match(response.headers.get('cache-control'),/no-store/);
    }
    assert.equal((await call('/apply-does-not-exist')).status,404);
});
