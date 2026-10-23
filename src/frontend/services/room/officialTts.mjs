const active = new Map();
const keys = new Map();
const PREFIX = 'official-voice-v1:';
export async function requestOfficialTts(text, settings, request, prepareText) {
  if (!settings.officialAccount || typeof request !== 'function') throw new Error('请登录后重新保存官方语音设置。');
  const account = settings.officialAccount;
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${account}\n${text}`))), b => b.toString(16).padStart(2, '0')).join('');
  if (active.has(fingerprint)) return active.get(fingerprint);
  const run = async () => {
    let saved = keys.get(fingerprint);
    try { saved ||= JSON.parse(sessionStorage.getItem(PREFIX + fingerprint)); } catch (_) { /* Storage is optional. */ }
    if (!saved || Date.now() - saved.time > 24 * 3600000) saved = { key: crypto.randomUUID(), time: Date.now() };
    keys.set(fingerprint, saved);
    if (keys.size > 100) keys.delete(keys.keys().next().value);
    try { sessionStorage.setItem(PREFIX + fingerprint, JSON.stringify(saved)); } catch (_) { /* Keep in-memory idempotency. */ }
    const forget = () => { keys.delete(fingerprint); try { sessionStorage.removeItem(PREFIX + fingerprint); } catch (_) {} };
    const headers = { 'X-TTS-Account': account, 'Content-Type': 'application/json' };
    const json = async (path, options = {}) => {
      const response = await request(path, { ...options, headers, cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '官方语音暂不可用');
      return result.data;
    };
    let job;
    if (saved.jobId) job = await json(`/api/tts/official/jobs/${saved.jobId}`);
    else {
      const status = await json('/api/tts/official/status');
      if (!status.online) throw new Error('官方语音算力离线，未发起翻译或合成，请稍后重试。');
      const prepared = prepareText ? await prepareText(text) : text;
      if (!prepared?.trim()) throw new Error('语音文本为空，未发起合成。');
      job = await json('/api/tts/official/jobs', { method: 'POST', body: JSON.stringify({ text: prepared, requestKey: saved.key }) });
      saved.jobId = job.id;
      try { sessionStorage.setItem(PREFIX + fingerprint, JSON.stringify(saved)); } catch (_) {}
    }
    const deadline = Date.now() + 110000;
    while (job.state === 'processing' && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      job = await json(`/api/tts/official/jobs/${job.id}`);
    }
    if (['failed', 'expired'].includes(job.state)) { forget(); throw new Error(job.message); }
    if (job.state !== 'ready') throw new Error('语音仍在处理中，请稍后再次点击，同一请求不会重复扣费。');
    const response = await request(`/api/tts/official/jobs/${job.id}/audio`, { headers, cache: 'no-store', signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      if (response.status === 410) forget();
      throw new Error('暂时无法读取语音，请重试；缓存有效期内不会重复扣费。');
    }
    return response.blob();
  };
  const promise = run(); active.set(fingerprint, promise);
  try { return await promise; } finally { active.delete(fingerprint); }
}
