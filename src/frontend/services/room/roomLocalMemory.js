import retrieval from '../../../../shared/room-memory-retrieval.cjs';
import { getSession } from '../../api/client';
import { publishLocalRoomMemoryUpdate } from './roomMemorySync';
import { accountLocalMemoryKey, readMemorySource } from './roomMemorySource.mjs';

const { SENSITIVE, lexicalScore, memoryExcerpt } = retrieval;
const STORE = 'memories';

export function usesLocalRoomMemory() {
  const accountId = String(getSession()?.user?.id || '');
  return !accountId || readMemorySource(accountId).mode === 'local';
}

export function roomLocalMemoryKey() {
  const accountId = String(getSession()?.user?.id || '');
  return accountId ? (usesLocalRoomMemory() ? accountLocalMemoryKey(accountId) : '') : guestMemoryKey();
}

export async function readLocalMemoryRecords(userKey) {
  if (!userKey) return [];
  const db = await openRoomMemoryDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).index('userKey').getAll(userKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function copyGuestMemoriesToAccount(accountId, rows) {
  const userKey = accountLocalMemoryKey(accountId);
  if (!accountId || String(getSession()?.user?.id || '') !== accountId) throw new Error('登录账号已变化，请重新选择');
  const db = await openRoomMemoryDb();
  try {
    if (String(getSession()?.user?.id || '') !== accountId) throw new Error('登录账号已变化，请重新选择');
    const tx = db.transaction(STORE, 'readwrite'), done = completed(tx);
    const store = tx.objectStore(STORE);
    // Keep intentional account-local edits on a repeated choice; the guest
    // originals stay in their own scope for a future explicit merge.
    for (const row of rows) {
      const id = `${userKey}:import:${row.id}`;
      const request = store.get(id);
      request.onsuccess = () => { if (!request.result) store.put({ ...row, id, userKey }); };
    }
    await done;
  } finally { db.close(); }
}

export function guestMemoryKey() {
  let id = localStorage.getItem('roomMemoryGuestId');
  if (!id) {
    id = `guest-${crypto.randomUUID()}`;
    localStorage.setItem('roomMemoryGuestId', id);
  }
  return `guest:${id}`;
}

export function openRoomMemoryDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
    const request = indexedDB.open('tsukuyomi-room-memory', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE) ? request.transaction.objectStore(STORE) : db.createObjectStore(STORE, { keyPath: 'id' });
      if (!store.indexNames.contains('userKey')) store.createIndex('userKey', 'userKey');
      if (!store.indexNames.contains('createdAt')) store.createIndex('createdAt', 'createdAt');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function completed(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('Memory transaction failed'));
  });
}

// Uses the same store as Room Settings, so edits, deletion and clear apply to
// the exact records used by retrieval. Account-local copies require an explicit
// source choice and are isolated from guest records and every other account.
export async function saveGuestMemory({ turnId, userMessage, assistantMessage, memoryEnabled = true, opener = false, replace = false }, scope = null) {
  const accountId = String(getSession()?.user?.id || '');
  const userKey = scope?.userKey || roomLocalMemoryKey();
  const expectedKey = accountId ? accountLocalMemoryKey(accountId) : guestMemoryKey();
  if (!turnId || !userKey || userKey !== expectedKey || (scope && scope.accountId !== accountId)) return;
  const content = `用户：${userMessage || ''}\n八千代：${assistantMessage || ''}`;
  const allowed = memoryEnabled && !opener && userMessage && !SENSITIVE.test(content);
  if (!allowed && !replace) return;
  const db = await openRoomMemoryDb();
  try {
    if (String(getSession()?.user?.id || '') !== accountId || (!scope && roomLocalMemoryKey() !== userKey)) return;
    const tx = db.transaction(STORE, 'readwrite');
    const done = completed(tx);
    const store = tx.objectStore(STORE);
    const request = store.index('userKey').getAll(userKey);
    request.onsuccess = () => {
      if (String(getSession()?.user?.id || '') !== accountId) { tx.abort(); return; }
      const rows = request.result;
      if (replace) for (const row of rows) {
        if (row.sourceTurnId === turnId && !row.manuallyEdited) store.delete(row.id);
      }
      if (allowed && (replace || !rows.some(row => row.sourceTurnId === turnId))) {
        // Preserve manually edited records when regenerating this turn.
        const now = new Date().toISOString();
        store.put({ id: `${userKey}:${turnId}:${crypto.randomUUID()}`, userKey, sourceTurnId: turnId,
          type: 'conversation', summary: content.slice(0, 280), content, importance: 0.5,
          confidence: 1, tags: ['chat-archive'], createdAt: now, updatedAt: now });
      }
    };
    await done;
    publishLocalRoomMemoryUpdate({ turnId }, replace ? 'updated' : 'created');
  } finally { db.close(); }
}

export async function retrieveGuestMemories(query, limit = 6) {
  const userKey = roomLocalMemoryKey();
  if (!userKey) return [];
  const db = await openRoomMemoryDb();
  try {
    const records = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).index('userKey').getAll(userKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (roomLocalMemoryKey() !== userKey) return [];
    return records.map(row => ({ ...row, score: lexicalScore(query, row.content) }))
      .filter(row => row.score > 0).sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit).map(row => ({ ...row, context: memoryExcerpt(row.content, query), source: 'indexeddb' }));
  } finally { db.close(); }
}
