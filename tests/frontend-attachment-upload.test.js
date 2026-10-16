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

test('percentages measure file bytes and distinguish transfer completion from saved attachment confirmation', async () => {
  const { createAttachmentUploader } = await modulePromise;
  const file = new File([Buffer.alloc(100)], 'progress.txt');
  const samples = [];
  const state = { id: 'progress', size: 100, chunkBytes: CHUNK, parts: [], expiresAt: Date.now() + 86400000 };
  let completed = false;
  const request = async (method, path, opts = {}) => {
    if (method === 'PUT') { opts.onProgress(25); opts.onProgress(null); opts.onProgress(75); return {}; }
    if (path.endsWith('/complete')) { completed = true; return {}; }
    return completed ? { ...state, completed: true, asset: { id: 'saved' } } : state;
  };
  await createAttachmentUploader({ request, hash: sha, randomId: randomUUID, sleep: async () => {} })(file, { ownerId: 'test', onProgress: (percent, label, details) => samples.push({ percent, details }) });
  assert.ok(samples.some(s => s.percent === 25 && s.details.loaded === 25 && s.details.total === 100));
  assert.ok(samples.some(s => s.percent === 75 && s.details.loaded === 75));
  assert.ok(samples.some(s => s.percent === null && s.details.stage === 'uploading'));
  assert.ok(samples.some(s => s.percent === 100 && s.details.stage === 'processing'));
  assert.equal(samples.at(-1).details.stage, 'complete');
});


for (const accountRole of ['admin', 'super_admin']) test(`${accountRole} uploads above 100 MiB in bounded chunks with byte progress`, async () => {
  const { createAttachmentUploader, MAX_ATTACHMENT_BYTES } = await modulePromise;
  const size = MAX_ATTACHMENT_BYTES + 123;
  const file = { size, name: 'large.pdf', lastModified: 1,
    slice(start, end) { return new Blob([Buffer.alloc(Math.min(end, size) - start, 65)]); } };
  let uploaded = 0, complete = false;
  const samples = [];
  const state = { id: randomUUID(), size, chunkBytes: CHUNK, parts: [], expiresAt: Date.now() + 86400000 };
  const request = async (method, path, opts = {}) => {
    if (method === 'PUT') {
      assert.ok(opts.body.size <= CHUNK);
      uploaded += opts.body.size; opts.onProgress(opts.body.size);
    }
    if (path.endsWith('/complete')) complete = true;
    return { ...state, completed: complete, asset: complete ? { id: 'saved' } : undefined };
  };
  const upload = createAttachmentUploader({ request, hash: sha, randomId: randomUUID, sleep: async () => {} });
  const result = await upload(file, { ownerId: 'test', accountRole, onProgress: (percent, label, details) => samples.push(details) });
  assert.equal(result.id, 'saved'); assert.equal(uploaded, size);
  assert.equal(samples.at(-1).loaded, size); assert.equal(samples.at(-1).total, size);
  await assert.rejects(upload(new File(['<svg>'], 'evil.svg'), { ownerId: 'test', accountRole }), /不支持/);
});
