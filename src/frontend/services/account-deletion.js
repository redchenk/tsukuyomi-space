import { authFetch, authHeaders, noStoreUrl, parseResponse } from '../api/client';
export async function deletionRequest(path, body) {
  const response = await authFetch(body === undefined ? noStoreUrl(path) : path, {
    method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
    headers: authHeaders(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const result = await parseResponse(response);
  if (!response.ok || !result.success) {
    const error = new Error(result.message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return result.data;
}
