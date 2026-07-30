import { authFetch, authHeaders, getSession, noStoreUrl, parseResponse } from '../../api/client';
import { applyGrowthResult } from '../userGrowth';

const CHAT_EVENT_NAME = 'tsukuyomi:room-chat-updated';
const LEGACY_HISTORY_KEY = 'roomChatHistory';
const LEGACY_MIGRATED_KEY = 'roomChatHistory:migrated';
const MAX_HISTORY_MESSAGES = 24;
const inFlightTurns = new Map();

function currentUserId() {
  return String(getSession()?.user?.id || '').trim();
}

function historyKey() {
  const userId = currentUserId();
  return userId ? `roomChatHistory:${userId}` : 'roomChatHistory:guest';
}

function pendingKey() {
  const userId = currentUserId();
  return userId ? `roomChatPending:${userId}` : 'roomChatPending:guest';
}

function resetKey() {
  const userId = currentUserId();
  return userId ? `roomChatReset:${userId}` : 'roomChatReset:guest';
}

function normalizeHistory(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && ['user', 'assistant'].includes(message.role))
    .map((message) => ({
      id: message.id ? String(message.id) : '',
      turnId: message.turnId ? String(message.turnId) : '',
      role: message.role,
      content: String(message.content || ''),
      createdAt: message.createdAt || ''
    }))
    .filter((message) => message.content)
    .slice(-MAX_HISTORY_MESSAGES);
}

function readStoredHistory(key) {
  try {
    return normalizeHistory(JSON.parse(localStorage.getItem(key)));
  } catch (_) {
    return [];
  }
}

export function readRoomConversation() {
  const key = historyKey();
  const scoped = readStoredHistory(key);
  if (scoped.length || localStorage.getItem(key) != null) return scoped;

  const legacy = readStoredHistory(LEGACY_HISTORY_KEY);
  if (!legacy.length || localStorage.getItem(LEGACY_MIGRATED_KEY) === '1') return [];
  localStorage.setItem(key, JSON.stringify(legacy));
  localStorage.setItem(LEGACY_MIGRATED_KEY, '1');
  localStorage.removeItem(LEGACY_HISTORY_KEY);
  return legacy;
}

export function writeRoomConversation(messages) {
  const history = normalizeHistory(messages);
  localStorage.setItem(historyKey(), JSON.stringify(history));
  return history;
}

function readPendingTurns() {
  try {
    const turns = JSON.parse(localStorage.getItem(pendingKey()));
    return Array.isArray(turns) ? turns.filter((turn) => turn?.turnId).slice(-20) : [];
  } catch (_) {
    return [];
  }
}

function queuePendingTurn(turn) {
  const turns = readPendingTurns().filter((item) => item.turnId !== turn.turnId);
  turns.push(turn);
  localStorage.setItem(pendingKey(), JSON.stringify(turns.slice(-20)));
}

function removePendingTurn(turnId) {
  const turns = readPendingTurns().filter((turn) => turn.turnId !== turnId);
  if (turns.length) localStorage.setItem(pendingKey(), JSON.stringify(turns));
  else localStorage.removeItem(pendingKey());
}

async function postConversationTurn(turn) {
  const existing = inFlightTurns.get(turn.turnId);
  if (existing) return existing.promise;

  const controller = new AbortController();
  const request = (async () => {
    const response = await authFetch('/api/room/chat/turn', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
      body: JSON.stringify(turn),
      signal: controller.signal
    });
    const result = await parseResponse(response);
    if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
    if (result.growth) applyGrowthResult(result.growth);
    removePendingTurn(turn.turnId);
    return normalizeHistory(result.data);
  })();

  const pending = { controller, promise: request };
  inFlightTurns.set(turn.turnId, pending);
  try {
    return await request;
  } finally {
    if (inFlightTurns.get(turn.turnId) === pending) inFlightTurns.delete(turn.turnId);
  }
}

async function flushPendingTurns() {
  let history = null;
  for (const turn of readPendingTurns()) history = await postConversationTurn(turn);
  return history;
}

export async function loadRoomConversation() {
  const localHistory = readRoomConversation();
  if (!currentUserId()) return localHistory;

  await flushPendingTurns();

  const response = await authFetch(noStoreUrl('/api/room/chat?limit=24'), {
    headers: authHeaders({ Accept: 'application/json' }),
    cache: 'no-store'
  });
  const result = await parseResponse(response);
  if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);

  let history = normalizeHistory(result.data);
  if (!history.length && localHistory.length) {
    const importResponse = await authFetch('/api/room/chat/import', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
      body: JSON.stringify({ messages: localHistory })
    });
    const imported = await parseResponse(importResponse);
    if (!importResponse.ok || !imported.success) {
      throw new Error(imported.message || `HTTP ${importResponse.status}`);
    }
    history = normalizeHistory(imported.data);
  }
  return writeRoomConversation(history);
}

export async function saveRoomConversationTurn({ turnId, userMessage, assistantMessage }) {
  if (!currentUserId()) return readRoomConversation();
  const turn = { turnId, userMessage, assistantMessage };
  queuePendingTurn(turn);
  return writeRoomConversation(await postConversationTurn(turn));
}

export function clearLocalRoomConversation({ broadcast = false } = {}) {
  for (const pending of inFlightTurns.values()) pending.controller.abort();
  inFlightTurns.clear();
  localStorage.removeItem(historyKey());
  localStorage.removeItem(pendingKey());
  localStorage.removeItem(LEGACY_HISTORY_KEY);
  localStorage.setItem(LEGACY_MIGRATED_KEY, '1');
  if (broadcast) {
    localStorage.setItem(resetKey(), `${Date.now()}:${Math.random().toString(36).slice(2)}`);
  }
  return [];
}

export async function clearRoomConversation() {
  const authenticated = Boolean(currentUserId());
  const pendingRequests = [...inFlightTurns.values()].map(({ promise }) => promise);
  clearLocalRoomConversation({ broadcast: true });
  await Promise.allSettled(pendingRequests);
  if (!authenticated) return { deletedCount: 0 };

  const response = await authFetch('/api/room/chat', {
    method: 'DELETE',
    headers: authHeaders({ Accept: 'application/json' })
  });
  const result = await parseResponse(response);
  if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
  return result.data || { deletedCount: 0 };
}

export function startRoomConversationUpdates(onUpdate) {
  const handleUpdate = (event) => onUpdate?.(event?.detail || {});
  const handleStorage = (event) => {
    if (event.key === historyKey()) onUpdate?.({ source: 'storage', action: 'updated' });
    if (event.key === resetKey()) {
      clearLocalRoomConversation();
      onUpdate?.({ source: 'storage', action: 'cleared' });
    }
  };
  window.addEventListener(CHAT_EVENT_NAME, handleUpdate);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(CHAT_EVENT_NAME, handleUpdate);
    window.removeEventListener('storage', handleStorage);
  };
}
