import runtime from '../../../../shared/model-runtime.cjs';

export const OFFICIAL_CHAT_PATH = '/official-api/v1/chat/completions';
// Public compatibility marker; authentication is the HttpOnly site Cookie.
export const OFFICIAL_SESSION_MARKER = 'tsukuyomi-site-session';
const originOf = () => globalThis.window?.location?.origin || globalThis.location?.origin || '';
export function officialChatUrl(origin = originOf()) {
  return new URL(OFFICIAL_CHAT_PATH, origin).href;
}
export function isOfficialRoomApi(value, origin = originOf()) {
  try {
    const url = new URL(value, origin);
    return url.origin === new URL(origin).origin && url.pathname === OFFICIAL_CHAT_PATH
      && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}
export function roomChatConfigured(settings = {}, origin = originOf()) {
  if (!String(settings.model || '').trim() || !String(settings.apiUrl || '').trim()) return false;
  try {
    const url = new URL(settings.apiUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
    if (isOfficialRoomApi(settings.apiUrl, origin)) return true;
    if (settings.apiKey === OFFICIAL_SESSION_MARKER) return false;
    return (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && (url.port || '11434') === '11434')
      || Boolean(String(settings.apiKey || '').trim());
  } catch { return false; }
}
export async function fetchOfficialRoomDashboard({ signal, request = globalThis.fetch } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await request('/official-api/api/dashboard', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(response.status === 401 ? '请先登录月读空间，再使用站内直供。' : data?.error?.message || '站内直供暂时无法读取，请稍后刷新。'), { statusCode: response.status });
    if (!data.me?.account_id || !Array.isArray(data.models)) throw new Error('站内直供返回的数据不完整，请稍后刷新。');
    return { ...data, models: data.models.filter(model => model.enabled && typeof model.id === 'string' && Number.isInteger(model.max_output_tokens) && model.max_output_tokens >= 16) };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
export function officialRoomSettings(settings, dashboard, origin = originOf()) {
  if (!dashboard?.enabled) throw new Error('站内直供暂未开放，请选择其他连接方式或稍后再试。');
  const model = dashboard.models.find(item => item.id === settings.model && item.enabled);
  if (!model) throw new Error('该站内模型暂不可用，请刷新模型列表后重新选择。');
  const next = { ...settings, apiUrl: officialChatUrl(origin), apiKey: OFFICIAL_SESSION_MARKER, useProxy: false, catalogWorkspaceId: '' };
  const config = runtime.normalizeRuntime(settings.runtimeConfig);
  const scope = runtime.scopes(next).model;
  const layer = config.models[scope] || { parameters: {}, mappings: {}, capabilities: {} };
  const requested = runtime.resolveParameters({ ...next, runtimeConfig: config }).maxOutputTokens.value;
  config.models[scope] = { ...layer, parameters: { ...layer.parameters, maxOutputTokens: Math.min(requested ?? model.max_output_tokens, model.max_output_tokens) }, mappings: { ...layer.mappings, maxOutputTokens: 'max_tokens' } };
  config.declarations[scope] = { text: true, image: false, tools: true, streaming: true };
  next.runtimeConfig = config;
  return next;
}

export function officialRoomRequestBody(body, model) {
  // Room uses concise visible replies, including for its connection test.
  return { ...body, ...(model?.provider === 'deepseek' ? { thinking: { type: 'disabled' } } : {}), ...(body.stream ? { stream_options: { include_usage: true } } : {}) };
}
