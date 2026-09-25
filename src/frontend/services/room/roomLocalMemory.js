import retrieval from '../../../../shared/room-memory-retrieval.cjs';
import { getSession } from '../../api/client';
import { publishLocalRoomMemoryUpdate } from './roomMemorySync';

const { SENSITIVE, lexicalScore, memoryExcerpt } = retrieval;
const STORE = 'memories';

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
// the exact records used by retrieval. Guest data never becomes account data.
export async function saveGuestMemory({ turnId, userMessage, assistantMessage, memoryEnabled = true, opener = false, replace = false }) {
  if (getSession()?.user?.id || !turnId) return;
  const userKey = guestMemoryKey();
  const content = `用户：${userMessage || ''}\n八千代：${assistantMessage || ''}`;
  const allowed = memoryEnabled && !opener && userMessage && !SENSITIVE.test(content);
  if (!allowed && !replace) return;
  const db = await openRoomMemoryDb();
  try {
    if (getSession()?.user?.id) return;
    const tx = db.transaction(STORE, 'readwrite');
    const done = completed(tx);
    const store = tx.objectStore(STORE);
    const request = store.index('userKey').getAll(userKey);
    request.onsuccess = () => {
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
  if (getSession()?.user?.id) return [];
  const userKey = guestMemoryKey();
  const db = await openRoomMemoryDb();
  try {
    const records = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).index('userKey').getAll(userKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (getSession()?.user?.id) return [];
    return records.map(row => ({ ...row, score: lexicalScore(query, row.content) }))
      .filter(row => row.score > 0).sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit).map(row => ({ ...row, context: memoryExcerpt(row.content, query), source: 'indexeddb' }));
  } finally { db.close(); }
}
