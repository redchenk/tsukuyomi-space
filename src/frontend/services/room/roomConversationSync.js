import { authFetch, authHeaders, getSession, noStoreUrl, parseResponse } from '../../api/client';
import { applyGrowthResult } from '../userGrowth';
import { saveGuestMemory } from './roomLocalMemory';

const CHAT_EVENT_NAME = 'tsukuyomi:room-chat-updated';
const LEGACY_HISTORY_KEY = 'roomChatHistory';
const LEGACY_MIGRATED_KEY = 'roomChatHistory:migrated';
const MAX_HISTORY_MESSAGES = 24;
const inFlightTurns = new Map();
const scheduledTurns = new Map();
const saveQueues = new Map();
const saveEpochs = new Map();

function currentUserId() {
  return String(getSession()?.user?.id || '').trim();
}

function historyKey(userId = currentUserId()) {
  return userId ? `roomChatHistory:${userId}` : 'roomChatHistory:guest';
}

function pendingKey(userId = currentUserId()) {
  return userId ? `roomChatPending:${userId}` : 'roomChatPending:guest';
}

function generationDraftKey() {
  const userId = currentUserId();
  return userId ? `roomChatGeneration:${userId}` : 'roomChatGeneration:guest';
}

export function readRoomGenerationDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(generationDraftKey()));
    if (!draft?.turnId || typeof draft.message !== 'string') return null;
    return draft;
  } catch (_) {
    return null;
  }
}

export function writeRoomGenerationDraft(draft) {
  const image = draft?.image && String(draft.image.dataUrl || '').length <= 750_000
    ? draft.image
    : draft?.image ? { name: draft.image.name || 'image', unavailable: true } : null;
  const value = { turnId: draft.turnId, message: String(draft.message || ''), opener: draft.opener === true, image, createdAt: Date.now() };
  try {
    localStorage.setItem(generationDraftKey(), JSON.stringify(value));
  } catch (_) {
    // The user can still retry in the current tab if storage is full.
    try { localStorage.setItem(generationDraftKey(), JSON.stringify({ ...value, image: image ? { name: image.name, unavailable: true } : null })); } catch (_) {}
  }
}

export function clearRoomGenerationDraft(turnId = '') {
  if (turnId && readRoomGenerationDraft()?.turnId !== turnId) return;
  localStorage.removeItem(generationDraftKey());
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

function accountChanged() {
  return new Error('登录账号已切换，请重新载入当前会话');
}

function requireSameAccount(userId) {
  if (currentUserId() !== userId) throw accountChanged();
}

function requireCurrentSession(userId, epoch) {
  requireSameAccount(userId);
  if (saveEpoch(userId) !== epoch) throw new Error('会话已清空，旧请求不会覆盖新会话');
}

function saveEpoch(userId) {
  return saveEpochs.get(userId) || 0;
}

function turnKey(userId, turnId) {
  return `${userId}:${turnId}`;
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

function readPendingTurns(userId = currentUserId()) {
  try {
    const turns = JSON.parse(localStorage.getItem(pendingKey(userId)));
    return Array.isArray(turns) ? turns.filter((turn) => turn?.turnId) : [];
  } catch (_) {
    return [];
  }
}

function queuePendingTurn(turn, userId = currentUserId()) {
  const turns = readPendingTurns(userId).filter((item) => item.turnId !== turn.turnId);
  turns.push(turn);
  localStorage.setItem(pendingKey(userId), JSON.stringify(turns));
}

function removePendingTurn(turnId, userId = currentUserId()) {
  const turns = readPendingTurns(userId).filter((turn) => turn.turnId !== turnId);
  if (turns.length) localStorage.setItem(pendingKey(userId), JSON.stringify(turns));
  else localStorage.removeItem(pendingKey(userId));
}

async function postConversationTurn(turn, userId, epoch) {
  requireSameAccount(userId);
  if (saveEpoch(userId) !== epoch) throw new Error('会话已清空，旧消息不会重新发送');
  const key = turnKey(userId, turn.turnId);
  const existing = inFlightTurns.get(key);
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
    if (saveEpoch(userId) !== epoch) throw new Error('会话已清空，旧消息不会重新发送');
    if (currentUserId() === userId && result.growth) applyGrowthResult(result.growth);
    removePendingTurn(turn.turnId, userId);
    return normalizeHistory(result.data);
  })();

  const pending = { controller, promise: request };
  inFlightTurns.set(key, pending);
  try {
    return await request;
  } finally {
    if (inFlightTurns.get(key) === pending) inFlightTurns.delete(key);
  }
}

function scheduleTurnSave(turn, userId) {
  const key = turnKey(userId, turn.turnId);
  if (scheduledTurns.has(key)) return scheduledTurns.get(key);
  const epoch = saveEpoch(userId);
  const previous = saveQueues.get(userId) || Promise.resolve();
  // A turn can finish generating while the previous turn is still being saved.
  // Send them in order so the server row order matches the visible conversation.
  const request = previous.catch(() => {}).then(() => postConversationTurn(turn, userId, epoch));
  const settled = request.catch(() => {});
  saveQueues.set(userId, settled);
  scheduledTurns.set(key, request);
  request.then(() => {
    if (scheduledTurns.get(key) === request) scheduledTurns.delete(key);
  }, () => {
    if (scheduledTurns.get(key) === request) scheduledTurns.delete(key);
  });
  return request;
}

function applySavedHistory(userId, serverHistory, preserveTurnIds = new Set()) {
  requireSameAccount(userId);
  const saved = normalizeHistory(serverHistory);
  const savedTurns = new Set(saved.map((item) => item.turnId));
  const pendingTurns = new Set(readPendingTurns(userId).map((turn) => turn.turnId));
  const localOnly = readStoredHistory(historyKey(userId)).filter((item) => (
    item.turnId && (preserveTurnIds.has(item.turnId) || (pendingTurns.has(item.turnId) && !savedTurns.has(item.turnId)))
  ));
  const history = normalizeHistory([...saved.filter((item) => !preserveTurnIds.has(item.turnId)), ...localOnly]);
  localStorage.setItem(historyKey(userId), JSON.stringify(history));
  return history;
}

async function flushPendingTurns(userId = currentUserId()) {
  let history = null;
  for (const turn of readPendingTurns(userId)) history = await scheduleTurnSave(turn, userId);
  return history;
}

export async function loadRoomConversation() {
  const userId = currentUserId();
  const epoch = saveEpoch(userId);
  const localHistory = readRoomConversation();
  if (!userId) {
    for (const turn of readPendingTurns(userId)) {
      requireCurrentSession(userId, epoch);
      await saveGuestMemory(turn);
      requireCurrentSession(userId, epoch);
      removePendingTurn(turn.turnId, userId);
    }
    return localHistory;
  }

  await flushPendingTurns(userId);
  requireCurrentSession(userId, epoch);
  const historyAtRequest = readStoredHistory(historyKey(userId));

  const response = await authFetch(noStoreUrl('/api/room/chat?limit=24'), {
    headers: authHeaders({ Accept: 'application/json' }),
    cache: 'no-store'
  });
  const result = await parseResponse(response);
  requireCurrentSession(userId, epoch);
  if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);

  let history = normalizeHistory(result.data);
  if (!history.length && localHistory.length) {
    const importResponse = await authFetch('/api/room/chat/import', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
      body: JSON.stringify({ messages: localHistory })
    });
    const imported = await parseResponse(importResponse);
    requireCurrentSession(userId, epoch);
    if (!importResponse.ok || !imported.success) {
      throw new Error(imported.message || `HTTP ${importResponse.status}`);
    }
    history = normalizeHistory(imported.data);
  }
  // A GET can start before a newly generated turn and finish after its POST.
  // Preserve turns created or edited during that request even when their outbox
  // entry has already been acknowledged and removed.
  const preserved = new Set(readStoredHistory(historyKey(userId))
    .filter((item) => !historyAtRequest.some((before) => (
      before.turnId === item.turnId && before.role === item.role && before.content === item.content
    )))
    .map((item) => item.turnId).filter(Boolean));
  return applySavedHistory(userId, history, preserved);
}

export async function saveRoomConversationTurn({ turnId, userMessage, assistantMessage, opener = false, memoryEnabled = true }) {
  const userId = currentUserId();
  const turn = { turnId, userMessage, assistantMessage, memoryEnabled, ...(opener ? { opener: true } : {}) };
  queuePendingTurn(turn, userId);
  if (!userId) {
    await saveGuestMemory(turn);
    requireSameAccount(userId);
    removePendingTurn(turn.turnId, userId);
    return readRoomConversation();
  }
  // A previously failed turn must be retried before this new one. The outbox
  // order is the conversation order, including after an offline interruption.
  return applySavedHistory(userId, await flushPendingTurns(userId));
}

/** Replace only the most recent complete turn, leaving earlier history intact. */
export async function replaceRoomConversationTurn({ turnId, expectedUserMessage, expectedAssistantMessage, userMessage, assistantMessage, memoryEnabled = true }) {
  const userId = currentUserId();
  const epoch = saveEpoch(userId);
  const history = readRoomConversation();
  const matching = history.filter((item) => item.turnId === turnId);
  const lastTurnId = history.at(-1)?.turnId;
  if (!turnId || lastTurnId !== turnId || !matching.some((item) => item.role === 'assistant')) {
    throw new Error('只能修改当前会话最后一轮对话');
  }
  const previousUser = matching.find((item) => item.role === 'user')?.content || '';
  const previousAssistant = matching.find((item) => item.role === 'assistant')?.content || '';
  if (previousUser !== expectedUserMessage || previousAssistant !== expectedAssistantMessage) {
    throw new Error('对话已在其他设备更新，请刷新后重试');
  }
  let next = history.map((item) => item.turnId !== turnId ? item : {
    ...item,
    content: item.role === 'user' ? userMessage : assistantMessage
  });
  if (userId) {
    // A newly generated turn may still be in the durable local outbox. Wait for
    // that save before replacing it, rather than racing the two requests.
    await flushPendingTurns(userId);
    requireCurrentSession(userId, epoch);
    const response = await authFetch(`/api/room/chat/turn/${encodeURIComponent(turnId)}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
      body: JSON.stringify({ expectedUserMessage, expectedAssistantMessage, userMessage, assistantMessage, memoryEnabled })
    });
    const result = await parseResponse(response);
    requireCurrentSession(userId, epoch);
    if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
    next = normalizeHistory(result.data);
  } else {
    await saveGuestMemory({ turnId, userMessage, assistantMessage, memoryEnabled, replace: true });
    requireCurrentSession(userId, epoch);
  }
  return userId ? applySavedHistory(userId, next) : writeRoomConversation(next);
}

export function clearLocalRoomConversation({ broadcast = false } = {}) {
  const userId = currentUserId();
  saveEpochs.set(userId, saveEpoch(userId) + 1);
  for (const [key, pending] of inFlightTurns) {
    if (!key.startsWith(`${userId}:`)) continue;
    pending.controller.abort();
    inFlightTurns.delete(key);
  }
  localStorage.removeItem(historyKey());
  localStorage.removeItem(pendingKey());
  clearRoomGenerationDraft();
  localStorage.removeItem(LEGACY_HISTORY_KEY);
  localStorage.setItem(LEGACY_MIGRATED_KEY, '1');
  if (broadcast) {
    localStorage.setItem(resetKey(), `${Date.now()}:${Math.random().toString(36).slice(2)}`);
  }
  return [];
}

export async function clearRoomConversation() {
  const userId = currentUserId();
  const authenticated = Boolean(userId);
  saveEpochs.set(userId, saveEpoch(userId) + 1);
  const pendingRequests = [...inFlightTurns].filter(([key]) => key.startsWith(`${userId}:`)).map(([, pending]) => pending.promise);
  for (const [key, pending] of inFlightTurns) {
    if (key.startsWith(`${userId}:`)) pending.controller.abort();
  }
  await Promise.allSettled([...pendingRequests, saveQueues.get(userId)]);
  requireSameAccount(userId);
  if (!authenticated) {
    clearLocalRoomConversation({ broadcast: true });
    return { deletedCount: 0 };
  }

  const response = await authFetch('/api/room/chat', {
    method: 'DELETE',
    headers: authHeaders({ Accept: 'application/json' })
  });
  const result = await parseResponse(response);
  requireSameAccount(userId);
  if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
  clearLocalRoomConversation({ broadcast: true });
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
