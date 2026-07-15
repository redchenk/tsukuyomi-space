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

export function publishNotificationBadge(value) {
  const count = normalizeNotificationCount(value);
  void applyAppBadge(count);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NOTIFICATION_BADGE_EVENT, { detail: { count } }));
  }

  return count;
}
