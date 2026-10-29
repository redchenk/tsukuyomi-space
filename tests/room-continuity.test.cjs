const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'room-continuity-'));
Object.assign(process.env, { NODE_ENV: 'test', DATA_DIR: directory, DB_PATH: path.join(directory, 'test.db'), JWT_SECRET: 'synthetic-room-continuity-test-secret', ADMIN_PASSWORD: 'synthetic-admin-test', ROOM_LOCAL_INTELLIGENCE: 'false', ROOM_MEMORY_BACKEND: 'sqlite', ROOM_WEATHER_OFFLINE: 'true', REDIS_URL: '' });
const db = require('../backend/db');
const memory = require('../backend/services/room-memory');
before(() => {
  require('../backend/db/migrations/init').runMigrations();
  for (const id of ['owner', 'other']) db.prepare("INSERT INTO users(id,username,email,password_hash,role) VALUES(?,?,?,'test','user')").run(id, id, `${id}@example.test`);
});
after(() => { db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
const save = (turnId, userMessage, extra = {}) => memory.captureChatTurn('owner', { turnId, userMessage, assistantMessage: '收到。', ...extra });
const retrieve = options => memory.retrieveChatMemories('owner', '晚上好', 6, { sourceOnly: true, ...options });

test('unrelated new-session greeting still receives explicit name and agreement without semantic worker', async () => {
  save('name', '我叫月核。');
  save('promise', '下次如果我说“晚上好”，请你回答“晚上好月核”。');
  const result = await retrieve();
  assert.match(result.continuity.map(r => r.content).join('\n'), /我叫月核/);
  assert.match(result.continuity.map(r => r.content).join('\n'), /晚上好月核/);
  assert.equal((await memory.retrieveChatMemories('other', '晚上好', 6, { sourceOnly: true })).continuity.length, 0);
});

test('correction retires old name and deleting the correction never resurrects the old name', async () => {
  const [id] = save('correct', '请叫我新月。');
  assert.match((await retrieve()).continuity.map(r => r.content).join('\n'), /新月/);
  assert.doesNotMatch((await retrieve()).continuity.map(r => r.content).join('\n'), /我叫月核/);
  await memory.deleteMemory('owner', id);
  assert.doesNotMatch((await retrieve()).continuity.map(r => r.content).join('\n'), /新月|我叫月核/);
});

test('manual editing invalidates old cue immediately and retries re-read current sources', async () => {
  const found = (await retrieve()).continuity.find(r => r.content.includes('下次'));
  assert.ok(found);
  await memory.updateMemory('owner', found.id, { summary: '已取消', content: '约定已取消，不再使用该回复。' });
  assert.doesNotMatch((await retrieve({ snapshotIds: [found.id] })).continuity.map(r => r.content).join('\n'), /晚上好月核/);
});

test('disabled memory, openers, quoted names and source turn exclusions cannot create or leak anchors', async () => {
  save('disabled', '我叫禁用名。', { memoryEnabled: false });
  save('opener', '我叫开场名。', { opener: true });
  save('quoted', '假如我叫引述名。');
  save('fresh', '我叫排除名。');
  const result = await retrieve({ excludeTurnIds: ['fresh'] });
  assert.doesNotMatch(result.continuity.map(r => r.content).join('\n'), /禁用名|开场名|引述名|排除名/);
});

test('clear removes anchors and their sources together', async () => {
  await memory.clearMemories('owner');
  assert.equal((await retrieve()).continuity.length, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM room_memory_facts WHERE user_id=?').get('owner').n, 0);
});

test('a name fast path does not discard other facts in the same source turn', async () => {
  save('mixed', '我叫月核，我对花生过敏。');
  const result = await memory.retrieveChatMemories('owner', '花生过敏', 6, { sourceOnly: true });
  assert.ok(result.memories.some(row => row.context.includes('花生过敏')));
  assert.ok(result.continuity.some(row => row.content.includes('我叫月核')));
});
