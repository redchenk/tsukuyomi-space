import { apiUrl, getSession } from '../../api/client';

const MEMORY_EVENT_NAME = 'tsukuyomi:room-memory-updated';
const MEMORY_UPDATED_KEY = 'roomMemoryLastUpdatedAt';

let consumers = 0;
let stream = null;
let streamUserId = '';

function currentUserId() {
  return String(getSession()?.user?.id || '').trim();
}

function dispatchMemoryUpdate(detail = {}) {
  if (typeof window === 'undefined') return;
  const updatedAt = Date.now();
  try {
    localStorage.setItem(MEMORY_UPDATED_KEY, String(updatedAt));
  } catch (_) {}
  window.dispatchEvent(new CustomEvent(MEMORY_EVENT_NAME, {
    detail: { ...detail, updatedAt }
  }));
}

function closeStream() {
  stream?.close();
  stream = null;
  streamUserId = '';
}

function handleServerEvent(event) {
  if (currentUserId() !== streamUserId) {
    refreshRoomMemorySync();
    return;
  }

  let payload = {};
  try {
    payload = event?.data ? JSON.parse(event.data) : {};
  } catch (_) {}
  dispatchMemoryUpdate({
    source: 'server',
    action: event?.type === 'ready' ? 'sync' : String(payload.action || 'updated'),
    memoryIds: Array.isArray(payload.memoryIds) ? payload.memoryIds.map(String) : [],
    revision: String(payload.revision || '')
  });
}

function ensureStream() {
  if (!consumers || typeof window === 'undefined' || typeof EventSource === 'undefined') return;
  const userId = currentUserId();
  if (!userId) {
    closeStream();
    return;
  }
  if (stream && streamUserId === userId) return;

  closeStream();
  streamUserId = userId;
  stream = new EventSource(apiUrl('/api/room/memory/events'), { withCredentials: true });
  stream.addEventListener('ready', handleServerEvent);
  stream.addEventListener('memory', handleServerEvent);
  stream.addEventListener('error', () => {
    if (!currentUserId()) closeStream();
    else if (currentUserId() !== streamUserId) refreshRoomMemorySync();
  });
}

export function startRoomMemorySync() {
  let active = true;
  consumers += 1;
  ensureStream();
  return () => {
    if (!active) return;
    active = false;
    consumers = Math.max(0, consumers - 1);
    if (!consumers) closeStream();
  };
}

export function refreshRoomMemorySync() {
  closeStream();
  ensureStream();
}

export function publishLocalRoomMemoryUpdate(memory, action = 'updated') {
  dispatchMemoryUpdate({
    source: 'local',
    action,
    memoryIds: memory?.id ? [String(memory.id)] : []
  });
}
