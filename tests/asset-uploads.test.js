const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { pipeline } = require('node:stream/promises');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-upload-test-'));
Object.assign(process.env, { NODE_ENV: 'test', DATA_DIR: temp, DB_PATH: path.join(temp, 'test.db'), REDIS_URL: '',
  JWT_SECRET: 'upload-tests-secret-long-enough-for-production', ADMIN_PASSWORD: 'test-password', ROOM_WEATHER_OFFLINE: 'true', ENABLE_FRONTEND_DIST: 'false' });
const config = require('../backend/config');
config.projectRoot = path.join(temp, 'public');
fs.mkdirSync(config.projectRoot);
const { createApp } = require('../backend/app');
const db = require('../backend/db');
const uploads = require('../backend/services/asset-uploads');
const storage = require('../backend/services/object-storage');
const { generateToken } = require('../backend/middleware/auth');
const { CHUNK_BYTES: CHUNK, MAX_USER_UPLOAD_BYTES: MAX } = uploads;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
let api, mock, base, settings, token, otherToken, failOss = false, delayOss = false;
let releaseOss;
const roleTokens = {};
const stored = new Map();
const originalSettings = storage.getSettings;
async function listen(server) { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${server.address().port}`; }
async function request(method, suffix = '', body, auth = token, extra = {}) {
  const response = await fetch(base + '/api/assets' + suffix, { method,
    headers: { 'X-Requested-With': 'XMLHttpRequest', Origin: base, ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json' }), ...extra },
    body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) });
  return { status: response.status, ...(await response.json()) };
}
async function create(size, extra = {}, auth = token) {
  const response = await request('POST', '/uploads', { size, fileName: 'test.pdf', mimeType: 'application/pdf', ...extra }, auth);
  assert.equal(response.status, 200, JSON.stringify(response)); return response.data;
}
async function chunk(s, n, buffer, checksum = hash(buffer), auth = token) { return request('PUT', `/uploads/${s.id}/${n}`, buffer, auth, { 'X-Upload-SHA256': checksum }); }
async function poll(s, auth = token) {
  for (let n = 0; n < 400; n++) {
    const response = await request('GET', `/uploads/${s.id}`, undefined, auth);
    if (response.data.completed || response.data.error) return response.data;
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  throw new Error('Finalize did not finish');
}
async function remove(s, auth = token) { await request('DELETE', `/uploads/${s.id}`, undefined, auth); if (stored.has(s.id)) stored.delete(s.id); }
before(async () => {
  api = http.createServer(createApp()); base = await listen(api);
  for (const id of ['upload-user', 'upload-other']) db.prepare('INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(id, id, id + '@example.test', 'unused-hash', 'user');
  for (const role of ['admin', 'super_admin']) {
    const id = 'upload-' + role;
    db.prepare('INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(id, id, id + '@example.test', 'unused-hash', role);
    roleTokens[role] = generateToken({ id });
  }
  token = generateToken({ id: 'upload-user' }); otherToken = generateToken({ id: 'upload-other' });
  mock = http.createServer(async (req, res) => {
    const key = new URL(req.url, 'http://mock').pathname;
    if (req.method === 'PUT') {
      const target = path.join(temp, hash(key));
      await pipeline(req, fs.createWriteStream(target));
      if (delayOss) await new Promise(resolve => { releaseOss = resolve; });
      if (failOss) { res.writeHead(503); res.end('retry'); return; }
      const digest = crypto.createHash('sha256');
      for await (const data of fs.createReadStream(target)) digest.update(data);
      assert.equal(req.headers['x-amz-content-sha256'], digest.digest('hex'));
      assert.equal(req.headers['x-amz-acl'], 'private');
      assert.equal(Number(req.headers['content-length']), fs.statSync(target).size);
      stored.set(key, target); res.writeHead(200); res.end(); return;
    }
    const target = stored.get(key);
    if (!target) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Length': fs.statSync(target).size, 'Content-Type': 'application/pdf' });
    await pipeline(fs.createReadStream(target), res);
  });
  const endpoint = await listen(mock);
  settings = { ossEnabled: true, ossDefaultStorage: 'oss', ossEndpoint: endpoint, ossProvider: 's3', ossBucket: 'test', ossRegion: 'auto', ossForcePathStyle: true, ossAccessKeyId: 'test-key', ossAccessKeySecret: 'test-secret' };
  storage.getSettings = () => settings;
  require('../backend/repositories/admin-repository').saveSettings(settings, Object.keys(settings));
});
after(async () => {
  storage.getSettings = originalSettings;
  for (const server of [api, mock]) { server?.closeAllConnections(); await new Promise(resolve => server?.close(resolve)); }
  db.close(); fs.rmSync(temp, { recursive: true, force: true });
});

test('requires authentication, rejects >100 MiB, and keeps init idempotent after lost acknowledgement', async () => {
  assert.equal((await request('POST', '/uploads', { size: 2 }, '')).status, 401);
  assert.equal((await request('POST', '/uploads', { size: MAX + 1 })).status, 413);
  const requestId = crypto.randomUUID();
  const a = await create(CHUNK, { requestId }); const b = await create(CHUNK, { requestId });
  assert.equal(a.id, b.id);
  assert.equal((await request('GET', `/uploads/${a.id}`, undefined, otherToken)).status, 404);
  assert.equal((await request('DELETE', `/uploads/${a.id}`, undefined, otherToken)).status, 404);
  await remove(a);
});

test('rejects wrong hashes, unsafe file types, oversized chunks, and out-of-order parts', async () => {
  const s = await create(CHUNK * 2); const data = Buffer.alloc(CHUNK, 65); data.write('%PDF-1.7');
  assert.equal((await chunk(s, 0, data, '0'.repeat(64))).status, 422);
  assert.equal((await chunk(s, 1, data)).status, 409);
  assert.equal((await chunk(s, 0, Buffer.alloc(CHUNK + 1))).status, 413);
  assert.equal((await request('POST', `/uploads/${s.id}/complete`)).status, 409);
  assert.equal((await chunk(s, 0, data, hash(data), otherToken)).status, 404);
  assert.equal((await chunk(s, 0, data)).status, 200);
  assert.equal((await chunk(s, 0, data)).data.received, CHUNK);
  data[500] = 66; assert.equal((await chunk(s, 0, data)).status, 409);
  await remove(s);
  const unsafe = await create(20, { fileName: 'evil.svg', mimeType: 'image/svg+xml' });
  assert.equal((await chunk(unsafe, 0, Buffer.from('<svg>not safe!</svg> '))).status, 400);
  await remove(unsafe);
});

for (const [megabytes, role, mode] of [[40, 'user', 'oss'], [100, 'user', 'oss'], [104, 'admin', 'local'], [108, 'super_admin', 'local']]) test(`${role}: ${megabytes} MiB ${mode} uploads, resumes, finalizes and downloads with matching SHA-256`, async () => {
  const auth = roleTokens[role] || token;
  const ownerId = 'upload-' + role;
  const s = await create(megabytes * 1024 * 1024, { storage: mode }, auth);
  const data = Buffer.alloc(CHUNK, 65); data.write('%PDF-1.7');
  const expected = crypto.createHash('sha256');
  for (let n = 0; n < s.size / CHUNK; n++) {
    assert.equal((await chunk(s, n, data, hash(data), auth)).status, 200); expected.update(data);
    if (n === 1) {
      // Reload module as after a process restart: acknowledged bytes live on disk.
      delete require.cache[require.resolve('../backend/services/asset-uploads')];
      const reopened = require('../backend/services/asset-uploads');
      assert.equal(reopened.status(s.id, ownerId).received, 2 * CHUNK);
    }
  }
  assert.equal((await request('POST', `/uploads/${s.id}/complete`, undefined, auth)).status, 202);
  const complete = await poll(s, auth); assert.equal(complete.completed, true, complete.error);
  assert.equal(complete.asset.metadata.size, s.size);
  assert.equal(complete.asset.metadata.storage, 'oss');
  assert.equal(fs.existsSync(path.join(temp, 'asset-upload-sessions', s.id, 'upload.bin')), false);
  assert.equal((await request('POST', `/uploads/${s.id}/complete`, undefined, auth)).status, 202);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM article_assets WHERE id = ?').get(s.id).n, 1);
  const response = await fetch(base + complete.asset.access_url, { headers: { Authorization: `Bearer ${otherToken}` } });
  assert.equal(response.status, 200); assert.equal(Number(response.headers.get('content-length')), s.size);
  const actual = crypto.createHash('sha256'); let received = 0;
  for await (const part of response.body) { actual.update(part); received += part.length; }
  assert.equal(received, s.size); assert.equal(actual.digest('hex'), expected.digest('hex'));
  assert.equal((await fetch(base + `/api/assets/proxy/${s.id}`)).status, 401);
  await remove(s, auth);
});

test('reports completion only after temporary-file cleanup releases the finalization lock', async () => {
  const data = Buffer.from('%PDF-1.7\ncleanup fixture'); const s = await create(data.length);
  await chunk(s, 0, data);
  const target = path.join(temp, 'asset-upload-sessions', s.id, 'upload.bin');
  const originalUnlink = fs.promises.unlink;
  let releaseCleanup;
  const cleanupStarted = new Promise(resolve => {
    fs.promises.unlink = async file => {
      if (file === target) {
        await new Promise(release => { releaseCleanup = release; resolve(); });
      }
      return originalUnlink(file);
    };
  });
  try {
    assert.equal((await request('POST', `/uploads/${s.id}/complete`)).status, 202);
    await cleanupStarted;
    const pending = await request('GET', `/uploads/${s.id}`);
    assert.equal(pending.data.completed, false);
    assert.equal(pending.data.processing, true);
    assert.equal((await request('POST', `/uploads/${s.id}/complete`)).status, 429);
  } finally {
    releaseCleanup?.();
    fs.promises.unlink = originalUnlink;
  }
  assert.equal((await poll(s)).completed, true);
  assert.equal(fs.existsSync(target), false);
  assert.equal((await request('POST', `/uploads/${s.id}/complete`)).status, 202);
  await remove(s);
});

test('finalization responds immediately, holds the lock, and retains chunks when OSS fails', async () => {
  const data = Buffer.from('%PDF-1.7\nfixture'); const s = await create(data.length);
  await chunk(s, 0, data); delayOss = true; failOss = true;
  assert.equal((await request('POST', `/uploads/${s.id}/complete`)).status, 202);
  for (let n = 0; !releaseOss && n < 100; n++) await new Promise(r => setTimeout(r, 10));
  assert.ok(releaseOss);
  assert.equal((await request('GET', `/uploads/${s.id}`)).data.processing, true);
  assert.equal((await request('DELETE', `/uploads/${s.id}`)).status, 429);
  assert.equal((await request('POST', `/uploads/${s.id}/complete`)).status, 429);
  releaseOss(); delayOss = false;
  assert.ok((await poll(s)).error);
  assert.equal(fs.statSync(path.join(temp, 'asset-upload-sessions', s.id, 'upload.bin')).size, data.length);
  failOss = false; await request('POST', `/uploads/${s.id}/complete`);
  assert.equal((await poll(s)).completed, true);
  await remove(s);
});

test('limits per-account temporary disk reservations and cleans expired sessions', async () => {
  const a = await create(MAX), b = await create(MAX);
  assert.equal((await request('POST', '/uploads', { size: MAX, fileName: 'test.pdf' })).status, 429);
  assert.equal((await request('GET', '/uploads')).data.length, 2);
  assert.equal((await request('GET', '/uploads', undefined, otherToken)).data.length, 0);
  const statePath = path.join(temp, 'asset-upload-sessions', a.id, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath)); state.expiresAt = 0; fs.writeFileSync(statePath, JSON.stringify(state));
  uploads.cleanup(true);
  assert.equal(fs.existsSync(statePath), false);
  await remove(b);
});


test('body and token role claims cannot exempt regular users, while admin sizes remain valid numbers', async () => {
  const forged = generateToken({ id: 'upload-user', role: 'super_admin' });
  assert.equal((await request('POST', '/uploads', { size: MAX + 1, role: 'admin', unlimited: true, maxBytes: null }, forged)).status, 413);
  for (const size of [-1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await request('POST', '/uploads', { size }, roleTokens.admin)).status, 400);
  }
  // Verify the removed cap was not merely replaced with another arbitrary cap.
  const large = await create(8 * 1024 ** 3, {}, roleTokens.admin);
  await remove(large, roleTokens.admin);
});

test('current role is rechecked on resume and final save, and admins still have type validation', async () => {
  const auth = roleTokens.admin;
  const s = await create(MAX + 1, {}, auth);
  const data = Buffer.alloc(CHUNK, 65); data.write('<html>');
  assert.equal((await chunk(s, 0, data, hash(data), auth)).status, 400);
  data.write('%PDF-1.7');
  assert.equal((await chunk(s, 0, data, hash(data), auth)).status, 200);
  db.prepare("UPDATE users SET role = 'user' WHERE id = 'upload-admin'").run();
  try {
    assert.equal((await chunk(s, 1, data, hash(data), auth)).status, 413);
    assert.equal((await request('POST', `/uploads/${s.id}/complete`, undefined, auth)).status, 413);
    const filePath = path.join(temp, 'demoted.pdf');
    fs.writeFileSync(filePath, '%PDF-1.7'); fs.truncateSync(filePath, MAX + 1);
    await assert.rejects(require('../backend/services/article-media').saveUserFileFromPath({
      filePath, id: crypto.randomUUID(), ownerId: 'upload-admin', size: MAX + 1, fileName: 'demoted.pdf', storage: 'local'
    }), { status: 413 });
  } finally {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = 'upload-admin'").run();
    await remove(s, auth);
  }
});


test('unconfigured storage uses local files, enabled but incomplete OSS never falls back', async () => {
  const configured = settings;
  const data = Buffer.from('%PDF-1.7\nlocal fallback');
  try {
    settings = { ossEnabled: false };
    const s = await create(data.length);
    await chunk(s, 0, data);
    await request('POST', `/uploads/${s.id}/complete`);
    const done = await poll(s);
    assert.equal(done.completed, true, done.error);
    assert.equal(done.asset.metadata.storage, 'local');
    const response = await fetch(base + done.asset.access_url);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), data);
    await remove(s);
    settings = { ...configured, ossAccessKeySecret: '' };
    const failed = await create(data.length, { storage: 'local' }, roleTokens.admin);
    await chunk(failed, 0, data, hash(data), roleTokens.admin);
    await request('POST', `/uploads/${failed.id}/complete`, undefined, roleTokens.admin);
    assert.ok((await poll(failed, roleTokens.admin)).error);
    assert.equal(db.prepare('SELECT id FROM article_assets WHERE id = ?').get(failed.id), undefined);
    assert.ok(fs.existsSync(path.join(temp, 'asset-upload-sessions', failed.id, 'upload.bin')));
    await remove(failed, roleTokens.admin);
  } finally { settings = configured; }
});

test('configured OSS overrides local requests and defaults for gallery, covers and inline images; failure creates no local assets', async () => {
  const configured = settings;
  const put = storage.putObject;
  const media = require('../backend/services/article-media');
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/wn4GBgYGJAQoAHgQCAQb7R3sAAAAASUVORK5CYII=', 'base64');
  const dataUrl = 'data:image/png;base64,' + image.toString('base64');
  const sent = [];
  try {
    settings = { ...configured, ossDefaultStorage: 'local' };
    storage.putObject = async options => { sent.push(options); return { url: 'https://oss.example.test/' + options.id, key: 'test/' + options.id, storage: 'oss' }; };
    const gallery = await media.saveUserFileAsset({ ownerId:'upload-user', buffer:image, fileName:'gallery.png', mimeType:'image/png', collection:'gallery', storage:'local' });
    assert.equal(JSON.parse(gallery.metadata).storage, 'oss');
    const article = await media.normalizeArticleMediaPayload({ coverImage:dataUrl, content:'![image](' + dataUrl + ')' }, { ownerId:'upload-user' });
    assert.equal(new Set(article.mediaAssetIds).size, 2);
    assert.deepEqual(sent.map(x => x.role), ['attachment', 'cover', 'body']);
    for (const id of article.mediaAssetIds) assert.equal(JSON.parse(db.prepare('SELECT metadata FROM article_assets WHERE id = ?').get(id).metadata).storage, 'oss');
    const count = db.prepare('SELECT count(*) n FROM article_assets').get().n;
    storage.putObject = async () => { throw new Error('offline'); };
    await assert.rejects(media.saveUserFileAsset({ ownerId:'upload-user', buffer:image, fileName:'failure.png', mimeType:'image/png', storage:'local' }), { status:503 });
    await assert.rejects(media.normalizeArticleMediaPayload({ coverImage:dataUrl }, { ownerId:'upload-user' }), { status:503 });
    storage.putObject = async () => null;
    await assert.rejects(media.saveUserImageAsset(dataUrl, { ownerId:'upload-user', storage:'local' }), { status:503 });
    assert.equal(db.prepare('SELECT count(*) n FROM article_assets').get().n, count);
  } finally { storage.putObject = put; settings = configured; }
});
