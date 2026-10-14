import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadJson } from '../src/frontend/api/upload-json.mjs';
test('JSON transfers use measured bytes, unknown lengths and a separate server-processing phase', async () => {
  let xhr;
  const previous = globalThis.XMLHttpRequest;
  globalThis.XMLHttpRequest = class {
    constructor() { xhr = this; this.upload = {}; this.headers = {}; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(k, v) { this.headers[k] = this.headers[k] ? this.headers[k] + ', ' + v : v; }
    send(body) { this.body = body; }
    abort() { this.onabort(); }
  };
  try {
    const samples = [];
    const pending = uploadJson(p => 'https://example.test' + p, '/api/user/avatar', { avatar: 'fixture' }, { headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, onProgress: (p, label, details) => samples.push({ p, details }) });
    assert.equal(xhr.withCredentials, true);
    assert.equal(xhr.headers['X-Requested-With'], 'XMLHttpRequest');
    assert.equal(xhr.headers['Content-Type'], 'application/json');
    xhr.upload.onprogress({ lengthComputable: true, loaded: 12, total: 48 });
    assert.equal(samples.at(-1).p, 25);
    xhr.upload.onprogress({ lengthComputable: false, loaded: 20, total: 0 });
    assert.equal(samples.at(-1).p, null);
    xhr.upload.onload({ lengthComputable: true, loaded: 48, total: 48 });
    assert.equal(samples.at(-1).details.stage, 'processing');
    let resolved = false; pending.then(() => { resolved = true; });
    await Promise.resolve(); assert.equal(resolved, false);
    xhr.status = 200; xhr.responseText = '{"success":true}'; xhr.onload();
    assert.equal(await (await pending).text(), '{"success":true}');
    assert.equal(xhr.upload.onprogress, null);
    const controller = new AbortController();
    const aborted = uploadJson(p => p, '/api/assets', {}, { signal: controller.signal });
    controller.abort(); await assert.rejects(aborted, { name: 'AbortError' });
    await assert.rejects(uploadJson(p => p, '/api/assets', {}, { signal: controller.signal }), { name: 'AbortError' });
  } finally { globalThis.XMLHttpRequest = previous; }
});
