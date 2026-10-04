import { apiUrl, authHeaders, getSession, noStoreUrl, parseResponse } from '../api/client';

export async function loadMessageLikeIds(ids = null) {
  if (!getSession()?.user?.id) return new Set();
  const path = noStoreUrl(`/api/messages/liked${ids ? `?ids=${encodeURIComponent(ids.join(','))}` : ''}`);
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    headers: authHeaders({ Accept: 'application/json' }),
    cache: 'no-store'
  });
  const result = await parseResponse(response);
  if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
  return new Set((Array.isArray(result.data) ? result.data : []).map(String));
}

export async function applyMessageLikeState(messages) {
  const ids = [...new Set((Array.isArray(messages) ? messages : []).map(item => String(item.id)))];
  if (!ids.length) return messages;
  const likedIds = await loadMessageLikeIds(ids.length <= 64 ? ids : null);
  for (const message of Array.isArray(messages) ? messages : []) {
    message.viewer_liked = likedIds.has(String(message.id));
  }
  return messages;
}
