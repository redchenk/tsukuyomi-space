import { authFetch, authHeaders, getSession, noStoreUrl, parseResponse } from '../../api/client';

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
  if (existing) return existing;

  const request = (async () => {
    const response = await authFetch('/api/room/chat/turn', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
      body: JSON.stringify(turn)
    });
    const result = await parseResponse(response);
    if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
    removePendingTurn(turn.turnId);
    return normalizeHistory(result.data);
  })();

  inFlightTurns.set(turn.turnId, request);
  try {
    return await request;
  } finally {
    if (inFlightTurns.get(turn.turnId) === request) inFlightTurns.delete(turn.turnId);
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

export function startRoomConversationUpdates(onUpdate) {
  const handleUpdate = (event) => onUpdate?.(event?.detail || {});
  const handleStorage = (event) => {
    if (event.key === historyKey()) onUpdate?.({ source: 'storage', action: 'updated' });
  };
  window.addEventListener(CHAT_EVENT_NAME, handleUpdate);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(CHAT_EVENT_NAME, handleUpdate);
    window.removeEventListener('storage', handleStorage);
  };
}
