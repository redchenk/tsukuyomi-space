import registry from '../../../../shared/model-catalog.cjs';
export const { detectProvider, catalogPlan, normalizePage, statusError } = registry;
export const CATALOG_TTL = 6 * 60 * 60 * 1000;
export const CATALOG_CACHE_KEY = 'roomModelCatalog:v2';
const RETAIN_MS = 7 * 24 * 60 * 60 * 1000;

export async function catalogScope(settings, { crypto = globalThis.crypto, storage = globalThis.localStorage } = {}) {
  const plan = catalogPlan(settings);
  if (!crypto?.subtle) return ''; // No insecure credential hashes or shared-account fallback.
  let salt;
  try { salt = storage.getItem('roomModelCatalog:salt'); } catch (_) { /* Storage may be disabled. */ }
  if (!salt || !/^[a-f0-9]{32}$/.test(salt)) {
    salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2, '0')).join('');
    try { storage.setItem('roomModelCatalog:salt', salt); } catch (_) { /* Refresh still works without a cache. */ }
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}\n${plan.url}\n${settings.apiKey || ''}`));
  return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
}
export function readCatalogCache(scope, storage = globalThis.localStorage, now = Date.now()) {
  if (!scope) return null;
  try {
    const text = storage.getItem(CATALOG_CACHE_KEY);
    if (!text || text.length > 1024 * 1024) return null;
    const entry = JSON.parse(text)?.[scope];
    const age = now - Date.parse(entry?.updatedAt);
    if (!entry || !Number.isFinite(age) || age < 0 || age > RETAIN_MS || !Array.isArray(entry.models) || entry.models.length > registry.MAX_MODELS) return null;
    if (entry.models.some(m => typeof m?.id !== 'string' || m.id.length > 240 || m.nativeId !== m.id || m.source !== 'provider')) return null;
    return { ...entry, fresh: age < CATALOG_TTL };
  } catch (_) { return null; }
}
export function writeCatalogCache(scope, entry, storage = globalThis.localStorage, now = Date.now()) {
  if (!scope) return;
  try {
    let cached = JSON.parse(storage.getItem(CATALOG_CACHE_KEY) || '{}');
    if (!cached || Array.isArray(cached) || typeof cached !== 'object') cached = {};
    // Copy metadata only, even if a caller accidentally supplies credentials.
    cached[scope] = { models: entry.models, updatedAt: entry.updatedAt, truncated: Boolean(entry.truncated) };
    const entries = Object.entries(cached).filter(([, v]) => now - Date.parse(v?.updatedAt) < RETAIN_MS)
      .sort((a, b) => Date.parse(b[1].updatedAt) - Date.parse(a[1].updatedAt)).slice(0, 8);
    let text = JSON.stringify(Object.fromEntries(entries));
    while (text.length > 1024 * 1024 && entries.length > 1) { entries.pop(); text = JSON.stringify(Object.fromEntries(entries)); }
    if (text.length <= 1024 * 1024) storage.setItem(CATALOG_CACHE_KEY, text);
  } catch (_) { /* Quota/privacy restrictions must not turn a successful refresh into a failure. */ }
}
export async function readCatalogJson(response, signal, acceptErrorBody = false) {
  let reader;
  const abort = () => { reader?.cancel().catch(() => {}); };
  try {
    if (!response.ok && !acceptErrorBody) throw statusError(response.status);
    if (Number(response.headers.get('content-length')) > registry.MAX_PAGE_BYTES) throw Object.assign(new Error('模型列表响应过大。'), { code: 'RESPONSE_TOO_LARGE' });
    reader = response.body?.getReader();
    if (!reader) throw Object.assign(new Error('模型列表响应无效。'), { code: 'INVALID_RESPONSE' });
    signal?.addEventListener('abort', abort, { once: true });
    const chunks = []; let size = 0;
    const decoder = new TextDecoder();
    for (;;) {
      if (signal?.aborted) throw signal.reason;
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > registry.MAX_PAGE_BYTES) throw Object.assign(new Error('模型列表响应过大。'), { code: 'RESPONSE_TOO_LARGE' });
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    try { return JSON.parse(chunks.join('')); } catch (_) { throw Object.assign(new Error('服务商没有返回有效的 JSON 模型列表。'), { code: 'INVALID_RESPONSE' }); }
  } finally { signal?.removeEventListener('abort', abort); if (reader) reader.cancel().catch(() => {}); else response.body?.cancel().catch(() => {}); }
}
export async function fetchModelCatalog(settings, { fetch = globalThis.fetch, relay, signal, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason || Object.assign(new Error('模型列表请求超时，请稍后刷新。'), { code: 'TIMEOUT' }));
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(() => controller.abort(Object.assign(new Error('模型列表请求超时，请稍后刷新。'), { code: 'TIMEOUT' })), timeoutMs);
  let rejectDeadline;
  const deadline = new Promise((_, reject) => { rejectDeadline = () => reject(controller.signal.reason); controller.signal.addEventListener('abort', rejectDeadline, { once: true }); });
  const bounded = task => Promise.race([task, deadline]);
  let cursor = '', useRelay = false;
  const models = new Map(), cursors = new Set();
  try {
    for (let page = 0; page < 8; page++) {
      if (controller.signal.aborted) throw controller.signal.reason;
      const plan = catalogPlan({ ...settings, cursor });
      let result;
      if (!useRelay) {
        let response;
        try { response = await bounded(fetch(plan.url, { method: 'GET', headers: plan.headers, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store', signal: controller.signal })); }
        catch (error) {
          if (controller.signal.aborted) throw controller.signal.reason;
          if (!(error instanceof TypeError) || !relay) throw error;
          useRelay = true;
        }
        if (response) result = normalizePage(await bounded(readCatalogJson(response, controller.signal)), plan, cursor);
      }
      if (useRelay) {
        const response = await bounded(relay({ apiUrl: settings.apiUrl, apiKey: settings.apiKey || '', workspaceId: settings.workspaceId || '', cursor }, controller.signal));
        const payload = await bounded(readCatalogJson(response, controller.signal, true));
        if (!payload.success) throw Object.assign(new Error(payload.message || '模型列表转发失败。'), { code: payload.code || 'RELAY_FAILED' });
        result = payload.data;
        if (!Array.isArray(result?.models) || result.provider !== plan.provider) throw Object.assign(new Error('模型列表响应无效。'), { code: 'INVALID_RESPONSE' });
      }
      for (const model of result.models) if (models.size < registry.MAX_MODELS) models.set(model.id, model);
      if (!result.nextCursor) return { models: [...models.values()], updatedAt: new Date().toISOString(), truncated: false };
      if (models.size >= registry.MAX_MODELS || page === 7) return { models: [...models.values()], updatedAt: new Date().toISOString(), truncated: true };
      if (cursors.has(result.nextCursor)) throw Object.assign(new Error('服务商返回了重复分页游标。'), { code: 'INVALID_RESPONSE' });
      cursors.add(result.nextCursor); cursor = result.nextCursor;
    }
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error.code) throw error;
    throw Object.assign(new Error('模型目录连接失败，请稍后刷新；已有模型和手动输入仍可使用。'), { code: 'NETWORK_FAILED' });
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', rejectDeadline); controller.abort();
  }
}
