import { authFetch } from '../api/client';
export function reportSignal(kind = '', key = '', extra = {}) {
  if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
  void authFetch('/api/stats/journey', {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, key, ...extra })
  }).catch(() => {});
}
