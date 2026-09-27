export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.mp4,.m4v,.webm,.mov,.mp3,.flac,.wav,.ogg,.m4a,.pdf,.txt,.md,.markdown';
const MIMES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg',
  flac: 'audio/flac', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown' };
export function attachmentMime(file) { return MIMES[file.name.split('.').pop().toLowerCase()] || ''; }
const abortError = () => new DOMException('上传已暂停，24 小时内重新选择同一文件可继续', 'AbortError');
const checkAbort = signal => { if (signal?.aborted) throw abortError(); };
const digest = async blob => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('');

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    checkAbort(signal);
    const abort = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

// Binary XHR keeps per-chunk progress and cookie authentication on both sites.
export function uploadRequest(resolveUrl, method, path, { body, signal, onProgress, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    checkAbort(signal);
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const finish = callback => value => { signal?.removeEventListener('abort', abort); callback(value); };
    const done = finish(resolve), failed = finish(reject);
    xhr.open(method, resolveUrl(path));
    xhr.withCredentials = true;
    xhr.timeout = method === 'PUT' ? 180000 : 30000;
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    if (body !== undefined) xhr.setRequestHeader('Content-Type', body instanceof Blob ? 'application/octet-stream' : 'application/json');
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress?.(event.loaded); };
    xhr.onload = () => {
      let result;
      try { result = JSON.parse(xhr.responseText); } catch (_) { /* Proxy error pages are not JSON. */ }
      if (xhr.status >= 200 && xhr.status < 300 && result?.success) return done(result.data);
      failed(Object.assign(new Error(result?.message || `上传请求失败 (HTTP ${xhr.status})`), { status: xhr.status }));
    };
    xhr.onerror = () => failed(new Error('网络中断，正在尝试续传'));
    xhr.ontimeout = () => failed(new Error('上传超时，正在尝试续传'));
    xhr.onabort = () => failed(abortError());
    signal?.addEventListener('abort', abort, { once: true });
    xhr.send(body instanceof Blob ? body : body === undefined ? null : JSON.stringify(body));
  });
}

export function createAttachmentUploader({ request, storage, hash = digest, sleep = delay, randomId = () => crypto.randomUUID() }) {
  return async function upload(file, { ownerId, storageMode = 'auto', signal, onProgress = () => {} } = {}) {
    if (!file.size) throw new Error('文件内容为空');
    if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('单个文件不能超过 100 MB');
    const mimeType = attachmentMime(file);
    if (!mimeType) throw new Error('暂不支持这种文件类型，请选择图片、音视频、PDF、TXT 或 Markdown');
    if (!ownerId) throw new Error('请先登录后上传附件');
    checkAbort(signal);
    onProgress(0, '正在检查文件…');
    // Store only a session reference. File bytes never enter localStorage.
    const key = `tsukuyomi_upload:${ownerId}:${await hash(new Blob([JSON.stringify([file.name, file.size, file.lastModified, storageMode]), await file.slice(0, 65536).arrayBuffer()]))}`;
    let saved = null;
    try { saved = JSON.parse(storage?.getItem(key) || 'null'); } catch (_) { /* Private browsing may disable storage. */ }
    if (!saved || saved.expiresAt <= Date.now()) saved = { requestId: randomId(), expiresAt: Date.now() + 86400000 };
    const remember = () => { try { storage?.setItem(key, JSON.stringify(saved)); } catch (_) {} };
    const forget = () => { try { storage?.removeItem(key); } catch (_) {} };
    const retry = async (method, path, options = {}) => {
      for (let attempt = 0; ; attempt++) {
        checkAbort(signal);
        try { return await request(method, path, { ...options, signal }); }
        catch (e) {
          if (e.name === 'AbortError' || attempt >= 5 || (e.status && ![408, 422, 429].includes(e.status) && e.status < 500)) throw e;
          onProgress(null, `连接不稳定，正在重试（${attempt + 1}/5）…`);
          await sleep(Math.min(1000 * 2 ** attempt, 16000), signal);
        }
      }
    };
    let state;
    remember();
    if (saved.id) {
      try { state = await retry('GET', `/api/assets/uploads/${saved.id}`); }
      catch (e) { if (![404, 410].includes(e.status)) throw e; saved = { requestId: randomId(), expiresAt: Date.now() + 86400000 }; remember(); }
    }
    if (!state) {
      state = await retry('POST', '/api/assets/uploads', { body: { requestId: saved.requestId, size: file.size, fileName: file.name, mimeType, alt: file.name.replace(/\.[^.]+$/, ''), storage: storageMode } });
      saved = { ...saved, id: state.id, expiresAt: state.expiresAt }; remember();
    }
    const path = `/api/assets/uploads/${state.id}`;
    try {
      if (state.size !== file.size || state.chunkBytes !== 4 * 1024 * 1024) throw Object.assign(new Error('上传记录不匹配，请重新选择文件'), { status: 409 });
      // Rehash acknowledged chunks before resuming, including completed receipts.
      for (let index = 0; index < Math.ceil(file.size / state.chunkBytes); index++) {
        checkAbort(signal);
        const chunk = file.slice(index * state.chunkBytes, (index + 1) * state.chunkBytes);
        const checksum = await hash(chunk);
        if (state.parts[index]) {
          if (state.parts[index].hash !== checksum) throw Object.assign(new Error('文件已改变，请重新选择文件上传'), { status: 409 });
          onProgress(Math.min(95, Math.round((index + 1) * state.chunkBytes / file.size * 95)), '已恢复上传，正在校验…');
          continue;
        }
        await retry('PUT', `${path}/${index}`, { body: chunk, headers: { 'X-Upload-SHA256': checksum },
          onProgress: loaded => onProgress(Math.min(95, Math.round((index * state.chunkBytes + loaded) / file.size * 95)), '正在上传…') });
      }
      onProgress(96, '文件已接收，正在保存…');
      let starts = 0;
      const deadline = Date.now() + 12 * 60 * 1000;
      while (Date.now() < deadline) {
        state = await retry('GET', path);
        if (state.completed && state.asset) { forget(); onProgress(100, '附件已上传'); return state.asset; }
        if (!state.processing) {
          if (starts >= 3) throw new Error(state.error || '保存附件失败，重新选择同一文件可重试');
          starts++;
          await retry('POST', `${path}/complete`);
        }
        await sleep(3000, signal);
      }
      throw new Error('文件仍在保存，请稍后刷新附件库；重新选择同一文件可继续检查');
    } catch (e) {
      if ([400, 409, 413, 415].includes(e.status)) {
        try { await request('DELETE', path, { signal }); forget(); } catch (_) {}
      }
      if (e.name !== 'AbortError' && !e.status) e.message += '。24 小时内重新选择同一文件可继续';
      throw e;
    }
  };
}
