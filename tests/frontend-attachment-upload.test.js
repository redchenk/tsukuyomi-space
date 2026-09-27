const { test } = require('node:test');
const assert = require('node:assert/strict');
const { File } = require('node:buffer');
const { createHash, randomUUID } = require('node:crypto');
const modulePromise = import('../src/frontend/api/attachment-upload.mjs');
const CHUNK = 4 * 1024 * 1024;
const sha = async blob => createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
function fixture() {
  const values = new Map();
  const storage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const state = { id: randomUUID(), size: CHUNK + 100, chunkBytes: CHUNK, parts: [], completed: false, expiresAt: Date.now() + 86400000 };
  const calls = []; let dropped = false, offline = false, initDropped = false;
  const request = async (method, url, opts = {}) => {
    calls.push({ method, url, body: opts.body });
    if (offline) throw new Error('offline');
    if (method === 'POST' && url.endsWith('/uploads')) {
      if (!initDropped) { initDropped = true; throw new Error('lost init acknowledgement'); }
      return structuredClone(state);
    }
    if (method === 'PUT') {
      const part = Number(url.split('/').pop());
      assert.equal(opts.headers['X-Upload-SHA256'], await sha(opts.body));
      if (!state.parts[part]) state.parts.push({ hash: opts.headers['X-Upload-SHA256'], size: opts.body.size });
      opts.onProgress?.(opts.body.size);
      if (!dropped) { dropped = true; throw new Error('lost chunk acknowledgement'); }
    }
    if (url.endsWith('/complete')) { state.completed = true; state.asset = { id: state.id }; }
    return structuredClone(state);
  };
  const file = new File([Buffer.alloc(CHUNK + 100, 65)], 'large.txt', { lastModified: 1 });
  return { values, storage, state, calls, request, file, setOffline: v => { offline = v; } };
}
test('retries lost acknowledgements idempotently, uses binary chunks, and clears resume metadata', async () => {
  const { createAttachmentUploader } = await modulePromise; const f = fixture(); const progress = [];
  const upload = createAttachmentUploader({ ...f, hash: sha, randomId: randomUUID, sleep: async () => {} });
  const result = await upload(f.file, { ownerId: 'test', onProgress: p => progress.push(p) });
  assert.equal(result.id, f.state.id); assert.equal(f.state.parts.length, 2);
  const starts = f.calls.filter(c => c.url.endsWith('/uploads'));
  assert.equal(starts[0].body.requestId, starts[1].body.requestId);
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 3);
  assert.equal(progress.at(-1), 100); assert.equal(f.values.size, 0);
});
test('a refreshed uploader resumes a partial file and never resends acknowledged bytes', async () => {
  const { createAttachmentUploader } = await modulePromise; const f = fixture();
  const controller = new AbortController();
  const upload = createAttachmentUploader({ ...f, hash: sha, randomId: randomUUID, sleep: async () => { controller.abort(); } });
  await assert.rejects(upload(f.file, { ownerId: 'test', signal: controller.signal }), { name: 'AbortError' });
  // First interruption was during lost init response. Resume, then pause on first chunk acknowledgement loss.
  const second = new AbortController();
  await assert.rejects(createAttachmentUploader({ ...f, hash: sha, randomId: randomUUID, sleep: async () => { second.abort(); } })(f.file, { ownerId: 'test', signal: second.signal }), { name: 'AbortError' });
  assert.equal(f.state.parts.length, 1);
  assert.ok([...f.values.values()].every(v => !v.includes('data:') && v.length < 250));
  f.calls.length = 0;
  const result = await createAttachmentUploader({ ...f, hash: sha, randomId: randomUUID, sleep: async () => {} })(f.file, { ownerId: 'test' });
  assert.equal(result.id, f.state.id);
  assert.deepEqual(f.calls.filter(c => c.method === 'PUT').map(c => c.url.split('/').pop()), ['1']);
});
test('rejects files larger than 100 MiB and unsupported formats before any request', async () => {
  const { createAttachmentUploader, MAX_ATTACHMENT_BYTES } = await modulePromise; const f = fixture();
  const upload = createAttachmentUploader({ ...f, hash: sha, randomId: randomUUID });
  await assert.rejects(upload({ size: MAX_ATTACHMENT_BYTES + 1, name: 'big.pdf' }, { ownerId: 'test' }), /100 MB/);
  await assert.rejects(upload(new File(['<svg>'], 'evil.svg'), { ownerId: 'test' }), /不支持/);
  assert.equal(f.calls.length, 0);
});
test('does not retry authorization failures', async () => {
  const { createAttachmentUploader } = await modulePromise; const f = fixture(); let count = 0;
  const upload = createAttachmentUploader({ ...f, hash: sha, randomId: randomUUID, request: async () => { count++; throw Object.assign(new Error('login'), { status: 401 }); } });
  await assert.rejects(upload(f.file, { ownerId: 'test' }), /login/); assert.equal(count, 1);
});
test('changing a previously acknowledged chunk rejects the resume instead of mixing files', async () => {
  const { createAttachmentUploader } = await modulePromise; const f = fixture(); f.state.parts = [{ hash: '0'.repeat(64), size: CHUNK }];
  const upload = createAttachmentUploader({ ...f, hash: sha, randomId: randomUUID, sleep: async () => {} });
  await assert.rejects(upload(f.file, { ownerId: 'test' }), /文件已改变/);
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 0);
  assert.equal(f.calls.at(-1).method, 'DELETE');
});
