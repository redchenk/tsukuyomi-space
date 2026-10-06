const assert = require('node:assert/strict');
const { test } = require('node:test');
const { webcrypto } = require('node:crypto');
if (!globalThis.crypto) globalThis.crypto = webcrypto;

async function source() { return import('../src/frontend/services/room/roomMemorySource.mjs'); }
const record = (id, content = '用户喜欢看月亮。') => ({ id, type: 'preference', summary: '偏好', content, importance: 0, confidence: 0, tags: ['月亮'] });

test('memory source choices remain scoped to the account and default safely to cloud', async () => {
  const { readMemorySource, writeMemorySource, accountLocalMemoryKey } = await source();
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  writeMemorySource('first', { mode: 'local', fingerprint: 'chosen' }, storage);
  assert.deepEqual(readMemorySource('first', storage), { mode: 'local', fingerprint: 'chosen' });
  assert.deepEqual(readMemorySource('second', storage), { mode: 'cloud', fingerprint: '' });
  assert.notEqual(accountLocalMemoryKey('first'), accountLocalMemoryKey('second'));
  values.set('roomMemorySource:second', '{bad');
  assert.equal(readMemorySource('second', storage).mode, 'cloud');
  assert.throws(() => writeMemorySource('', { mode: 'local' }, storage));
});

test('guest choice fingerprint is stable across ordering but changes on edits and deletion', async () => {
  const { guestMemoryFingerprint } = await source();
  const rows = [record('one'), record('two', '在晴天观星。')];
  const fingerprint = await guestMemoryFingerprint(rows);
  assert.equal(fingerprint, await guestMemoryFingerprint([...rows].reverse()));
  for (const change of [{ content: '新的内容' }, { importance: 0.23 }, { confidence: 0.91 }, { tags: [] }]) {
    assert.notEqual(fingerprint, await guestMemoryFingerprint([{ ...rows[0], ...change }, rows[1]]));
  }
  assert.notEqual(fingerprint, await guestMemoryFingerprint(rows.slice(0, 1)));
  assert.equal(await guestMemoryFingerprint([]), '');
});

test('bounded import batches preserve zero scores and paragraphs, exclude owners, and validate every row first', async () => {
  const { memoryImportBatches } = await source();
  const content = '  第一段。\n\n  第二段。\n';
  const batches = memoryImportBatches(Array.from({ length: 201 }, (_, index) => ({ ...record(String(index), content), user_id: 'another-account', userKey: 'guest:test' })));
  assert.deepEqual(batches.map(batch => batch.length), [100, 100, 1]);
  assert.equal(batches[0][0].content, content);
  assert.equal(batches[0][0].importance, 0);
  assert.equal(batches[0][0].confidence, 0);
  assert.equal(batches[0][0].user_id, undefined);
  assert.equal(batches[0][0].userKey, undefined);
  assert.throws(() => memoryImportBatches([...batches[0], { ...record('bad'), confidence: 2 }]), /0 到 1/);
  assert.throws(() => memoryImportBatches([record('long', '字'.repeat(12001))]), /长度上限/);
  assert.throws(() => memoryImportBatches([record('blank', ' ')]), /不能为空/);
  const longBatches = memoryImportBatches(Array.from({ length: 50 }, (_, index) => record(String(index), '字'.repeat(12000))));
  for (const batch of longBatches) assert.ok(Buffer.byteLength(JSON.stringify({ expectedUserId: 'test', records: batch })) < 1000000);
});

test('legacy local records remain selectable even when they cannot be imported into cloud', async () => {
  const { guestMemoryFingerprint, memoryImportBatches } = await source();
  const rows = [{ ...record('legacy'), tags: Array.from({ length: 13 }, (_, index) => `标签${index}`) }];
  assert.match(await guestMemoryFingerprint(rows), /^[a-f0-9]{64}$/);
  assert.throws(() => memoryImportBatches(rows), /12 个标签/);
});

test('signed-in local retrieval never falls through to cloud and guards source changes during a read', async () => {
  const { createRoomMemoryRetriever } = await import('../src/frontend/services/room/roomMemoryRetrieval.mjs');
  let local = true, calls = 0, finish;
  const run = createRoomMemoryRetriever({ getAccountId: () => 'first', isEnabled: () => true, useLocal: () => local,
    retrieveGuest: async () => [{ content: '本地记忆' }], request: async () => { calls++; return { success: true, data: [] }; }, warn() {} });
  assert.equal((await run('问题')).data[0].content, '本地记忆');
  assert.equal(calls, 0);
  const pendingRun = createRoomMemoryRetriever({ getAccountId: () => 'first', isEnabled: () => true, useLocal: () => local,
    retrieveGuest: () => new Promise(resolve => { finish = resolve; }), request: async () => { calls++; }, warn() {} });
  const pending = pendingRun('问题');
  local = false;
  finish([{ content: '旧来源' }]);
  await assert.rejects(pending, error => error.reason === 'account_changed');
  assert.equal(calls, 0);
  local = true;
  const unavailable = createRoomMemoryRetriever({ getAccountId: () => 'first', isEnabled: () => true, useLocal: () => local,
    retrieveGuest: async () => { throw new Error('IndexedDB failed'); }, request: async () => { calls++; }, warn() {} });
  assert.equal((await unavailable('问题')).retrieval.backend, 'unavailable');
  assert.equal(calls, 0);
});

test('actual local retrieval excludes automatic turns, preserves manual edits and revalidates the selected IDs', async () => {
  const vm = require('node:vm'), fs = require('node:fs');
  const code = fs.readFileSync('src/frontend/services/room/roomLocalMemory.js', 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  let rows = [
    { id: 'target', sourceTurnId: 'target-turn', content: '红茶', updatedAt: '1' },
    { id: 'recent', sourceTurnId: 'recent-turn', content: '红茶', updatedAt: '2' },
    { id: 'old', sourceTurnId: 'old-turn', content: '红茶', updatedAt: '3' },
    { id: 'manual', sourceTurnId: 'target-turn', manuallyEdited: true, content: '红茶', updatedAt: '4' }
  ];
  const context = { retrieval: require('../shared/room-memory-retrieval.cjs'), getSession: () => ({ user: { id: 'one' } }),
    readMemorySource: () => ({ mode: 'local' }), accountLocalMemoryKey: id => 'local:' + id, queueMicrotask };
  vm.runInNewContext(code + '\nglobalThis.retrieve = retrieveGuestMemories;', context);
  context.openRoomMemoryDb = async () => ({ close() {}, transaction: () => ({ objectStore: () => ({
    index: () => ({ getAll: () => { const req = {}; queueMicrotask(() => { req.result = rows; req.onsuccess(); }); return req; } })
  }) }) });
  const ids = value => Array.from(value, row => row.id);
  assert.deepEqual(ids(await context.retrieve('红茶', 6, { excludeTurnIds: ['target-turn', 'recent-turn'] })), ['manual', 'old']);
  const first = await context.retrieve('红茶', 6, { snapshotIds: ['old'] });
  assert.deepEqual(ids(first), ['old']);
  rows[2].content = '红茶换成绿茶';
  const edited = await context.retrieve('红茶', 6, { snapshotIds: ['old'] });
  assert.notEqual(edited[0].retrievalRevision, first[0].retrievalRevision);
  rows = rows.filter(row => row.id !== 'old');
  assert.deepEqual(ids(await context.retrieve('红茶', 6, { snapshotIds: ['old'] })), []);
  assert.deepEqual(ids(await context.retrieve('红茶', 6, { snapshotIds: [] })), []);
});
