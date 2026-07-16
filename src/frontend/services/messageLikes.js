import { authFetch, authHeaders, getSession, noStoreUrl, parseResponse } from '../api/client';

export async function loadMessageLikeIds() {
  if (!getSession()?.user?.id) return new Set();
  const response = await authFetch(noStoreUrl('/api/messages/liked'), {
    headers: authHeaders({ Accept: 'application/json' }),
    cache: 'no-store'
  });
  const result = await parseResponse(response);
  if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
  return new Set((Array.isArray(result.data) ? result.data : []).map(String));
}

export async function applyMessageLikeState(messages) {
  const likedIds = await loadMessageLikeIds();
  for (const message of Array.isArray(messages) ? messages : []) {
    message.viewer_liked = likedIds.has(String(message.id));
  }
  return messages;
}
