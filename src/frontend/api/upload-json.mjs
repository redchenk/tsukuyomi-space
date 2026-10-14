// XHR reports bytes actually sent. Compression and server processing have no
// invented percentage, and success remains the caller's API response check.
export function uploadJson(resolveUrl, path, payload, { method = 'POST', headers = {}, signal, onProgress = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const abortError = () => new DOMException('上传已取消', 'AbortError');
    if (signal?.aborted) return reject(abortError());
    const xhr = new XMLHttpRequest();
    let settled = false;
    let lastLoaded = 0, lastTotal = 0;
    const abort = () => xhr.abort();
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      xhr.upload.onprogress = xhr.upload.onload = null;
      callback(value);
    };
    const report = (event, stage) => {
      let known = event.lengthComputable && event.total > 0;
      let loaded = event.loaded, total = event.total;
      if (stage === 'processing' && !known && lastTotal > 0) {
        // A successful upload load event acknowledges the known request body,
        // even if this browser omits totals on the final ProgressEvent.
        loaded = total = lastTotal;
        known = true;
      }
      if (known) { lastLoaded = loaded; lastTotal = total; }
      // Some browsers defer upload.onload until response headers arrive. The
      // last measured byte already marks the transition to server processing.
      if (known && loaded >= total) stage = 'processing';
      onProgress(known ? Math.min(100, Math.floor(loaded / total * 100)) : null,
        stage === 'processing' ? '正在保存…' : '正在上传…',
        { loaded: Number.isFinite(loaded) ? loaded : lastLoaded, total: known ? total : 0, stage });
    };
    xhr.open(method, resolveUrl(path));
    xhr.withCredentials = true;
    xhr.timeout = 180000;
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    for (const [key, value] of Object.entries(headers)) {
      // XHR appends repeated headers. Keep one JSON content type so the server
      // can parse callers which already pass authHeaders({ Content-Type }).
      if (value != null && !['content-type', 'x-requested-with'].includes(key.toLowerCase())) xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = event => report(event, 'uploading');
    xhr.upload.onload = event => report(event, 'processing');
    xhr.onload = () => finish(resolve, { ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, text: async () => xhr.responseText || '' });
    xhr.onerror = () => finish(reject, new Error('上传失败，请检查网络后重试'));
    xhr.ontimeout = () => finish(reject, new Error('上传超时，请重试'));
    xhr.onabort = () => finish(reject, abortError());
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { finish(reject, abortError()); return; }
    onProgress(null, '正在上传…', { stage: 'uploading' });
    xhr.send(JSON.stringify(payload));
  });
}
