import deepseek from '../../../../shared/deepseek-chat.cjs';
import { authFetch, getSession } from '../../api/client';
import { isOfficialRoomApi, fetchOfficialRoomDashboard } from './roomOfficialApi.mjs';

export { deepseek };
const account = () => String(getSession()?.user?.id || '');
export async function deepseekRequest(settings, path, { body, file, purpose, signal, method = 'POST' } = {}) {
  const owner = account(), official = isOfficialRoomApi(settings.apiUrl);
  const headers = {}, init = { method, signal, credentials: official ? 'same-origin' : 'omit', redirect: 'error' };
  let url = deepseek.endpoint(settings, path), request = fetch;
  if (official) {
    const dashboard = await fetchOfficialRoomDashboard({ signal });
    if (account() !== owner) throw new Error('账号已切换，请重新发送。');
    headers['X-Official-Expected-Account'] = dashboard.me.account_id;
    headers['Idempotency-Key'] = crypto.randomUUID();
  } else if (!settings.apiKey || settings.apiKey === 'tsukuyomi-site-session') throw new Error('请先配置自己的 DeepSeek API Key。');
  if (file && !official && !settings.useProxy) {
    const form = new FormData();
    if (purpose) form.append('purpose', purpose);
    form.append('file', file, file.name || 'recording.wav'); init.body = form;
  } else {
    let payload = body;
    if (file) {
      // Room limits bridged uploads to 8 MiB. Direct DeepSeek allows larger files.
      if (file.size > 8 * 1024 * 1024) throw new Error('桥接上传每个文件最多 8 MB，请压缩文件或使用自己的 API 直连。');
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      payload = { file: { name: file.name || 'recording.wav', type: file.type, data: btoa(binary) }, ...(purpose ? { purpose } : {}) };
    }
    if (!official && settings.useProxy) {
      if (new URL(settings.apiUrl).hostname !== 'api.deepseek.com') throw new Error('自定义网关请使用直连；受限桥接仅支持 DeepSeek 官方域名。');
      url = `/api/chat/deepseek${path}`; request = authFetch; init.credentials = 'same-origin';
      headers['X-Deepseek-Key'] = settings.apiKey;
    }
    if (payload !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(payload); }
  }
  if (!official && !settings.useProxy) headers.Authorization = `Bearer ${settings.apiKey}`;
  const response = await request(url, { ...init, headers });
  if (account() !== owner) { await response.body?.cancel(); throw new Error('账号已切换，旧请求不会写入新会话。'); }
  return response;
}
export async function requestDeepseekReply(args) {
  const body = deepseek.buildRequest(args);
  const response = await deepseekRequest(args.settings, '/chat/completions', { body, signal: args.signal });
  return deepseek.readReply(response, { signal: args.signal, onDelta: args.onDelta, onUpdate: args.onUpdate, target: deepseek.endpoint(args.settings) });
}
export async function deepseekTool(settings, path, options) {
  const response = await deepseekRequest(settings, path, options);
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error?.message || data.message || `DeepSeek ${response.status}`);
  return data;
}
export function filePurpose(file) {
  return /\.(pdf|docx?|pptx?)$/i.test(file.name) ? 'text_recognition' : 'user_data';
}
