import { getSession } from '../../api/client';

export const ROOM_RELATIONSHIP_UPDATED = 'tsukuyomi:room-relationship-updated';

export function announceRelationship(userId, relationship, change = null) {
  if (!relationship || String(getSession()?.user?.id || '') !== String(userId)) return;
  window.dispatchEvent(new CustomEvent(ROOM_RELATIONSHIP_UPDATED, {
    detail: { userId: String(userId), relationship, change }
  }));
}
