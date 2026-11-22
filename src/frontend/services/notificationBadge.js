export const NOTIFICATION_BADGE_EVENT = 'tsukuyomi:notification-badge';

export function normalizeNotificationCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.floor(count);
}

export async function applyAppBadge(value, badgeTarget = typeof navigator !== 'undefined' ? navigator : null) {
  const count = normalizeNotificationCount(value);

  try {
    if (count > 0 && typeof badgeTarget?.setAppBadge === 'function') {
      await badgeTarget.setAppBadge(count);
    } else if (count === 0 && typeof badgeTarget?.clearAppBadge === 'function') {
      await badgeTarget.clearAppBadge();
    }
  } catch (_) {
    // In-page badges remain the fallback when the browser or install state rejects app badging.
  }

  return count;
}

export function inboxVisitKey(userId) {
  return `tsukuyomi:inbox-visited:${userId}`;
}

const visitsThisSession = new Map();

export function lastInboxVisit(userId) {
  const sessionId = visitsThisSession.get(userId) || 0;
  try {
    return Math.max(sessionId, normalizeNotificationCount(localStorage.getItem(inboxVisitKey(userId))));
  } catch {
    return sessionId;
  }
}

export function rememberInboxVisit(userId, displayedId) {
  const previous = lastInboxVisit(userId);
  const newest = normalizeNotificationCount(displayedId);
  if (!userId || newest <= previous) return previous;
  visitsThisSession.set(userId, newest);
  try {
    localStorage.setItem(inboxVisitKey(userId), String(newest));
  } catch {
    // Keep the visit for this browser session when persistent storage is unavailable.
  }
  return newest;
}

export function publishNotificationBadge(value, details = {}) {
  const count = normalizeNotificationCount(value);
  void applyAppBadge(count);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NOTIFICATION_BADGE_EVENT, { detail: { ...details, count } }));
  }

  return count;
}
