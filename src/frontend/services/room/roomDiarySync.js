import { authFetch, getSession, parseResponse } from '../../api/client';
import {
  acknowledgeDiaryClear,
  acknowledgeDiaryDeletions,
  diaryArchiveKey,
  diaryMetadataDirtyToken,
  diaryMetadataRevision,
  pendingDiaryClear,
  pendingDiaryDeletions,
  readDiaryArchive,
  acknowledgeDiaryMetadata,
  writeDiaryArchive
} from './roomDiaryArchive';

export const DIARY_SYNC_UPDATED_EVENT = 'tsukuyomi:room-diary-sync-updated';
const WRITE_BATCH_SIZE = 25;
const inflight = new Map();

function announce(status, message) {
  if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(DIARY_SYNC_UPDATED_EVENT, { detail: { status, message } }));
}

function currentOwner() { return String(getSession()?.user?.id || '').trim(); }

function assertOwner(owner, archiveKey) {
  if (!owner || currentOwner() !== owner || diaryArchiveKey() !== archiveKey) {
    throw new Error('登录账号已切换，请重新打开日记');
  }
}

async function request(path, options = {}) {
  const response = await authFetch(path, { cache: 'no-store', ...options });
  const result = await parseResponse(response);
  if (!response.ok || !result.success) throw new Error(result.message || `日记同步失败（${response.status}）`);
  return result.data;
}

async function loadRemote(owner, archiveKey) {
  const entries = new Map();
  const deleted = new Set();
  let cursor = '';
  do {
    assertOwner(owner, archiveKey);
    const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const page = await request(`/api/room/diary${params}`);
    if (String(page?.userId || '') !== owner) throw new Error('云端账号与本机存档不一致，已取消同步');
    for (const row of page.entries || []) {
      const id = String(row.diaryId || '');
      if (!id) continue;
      if (row.deleted) deleted.add(id);
      else if (row.entry) entries.set(id, row.entry);
    }
    cursor = page.nextCursor || '';
  } while (cursor);
  return { entries, deleted };
}

async function writeBatch(owner, archiveKey, entries = [], deletedIds = []) {
  assertOwner(owner, archiveKey);
  await request('/api/room/diary/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedUserId: owner, entries, deletedIds })
  });
}

function archiveMetadata(archive) {
  const gameData = archive.data.gameData || {};
  return {
    slotId: Number(archive.slotId) || 1,
    prompts: archive.data.prompts || {},
    activePersonaId: String(archive.data.activePersonaId || ''),
    affection: Number(gameData.characterStats?.affection) || 0,
    trust: Number(gameData.characterStats?.trust) || 0,
    characterName: String(gameData.characterSystemData?.character?.name || '')
  };
}

function applyMetadata(archive, metadata) {
  if (!metadata) return archive;
  archive.slotId = Number(metadata.slotId) || archive.slotId;
  archive.data.prompts = metadata.prompts || archive.data.prompts;
  archive.data.activePersonaId = String(metadata.activePersonaId || '');
  const affection = Number(metadata.affection) || 0;
  const trust = Number(metadata.trust) || 0;
  const gameData = archive.data.gameData;
  gameData.characterStats = { ...gameData.characterStats, affection, trust };
  gameData.characterSystemData = {
    ...gameData.characterSystemData,
    stats: { ...gameData.characterSystemData?.stats, affection, trust },
    character: { ...gameData.characterSystemData?.character, name: String(metadata.characterName || '') }
  };
  return archive;
}

function shortHash(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}

function mergeMetadata(remote, local) {
  const prompts = { ...(remote.prompts || {}) };
  let selectedLocalId = String(local.activePersonaId || '');
  for (const [id, prompt] of Object.entries(local.prompts || {})) {
    if (!Object.hasOwn(prompts, id)) {
      prompts[id] = prompt;
    } else if (JSON.stringify(prompts[id]) !== JSON.stringify(prompt)) {
      const copyId = `${id}-local-${shortHash(prompt)}`;
      prompts[copyId] = { ...prompt, id: copyId };
      if (selectedLocalId === id) selectedLocalId = copyId;
    }
  }
  return {
    slotId: Math.max(Number(remote.slotId) || 1, Number(local.slotId) || 1),
    prompts,
    activePersonaId: selectedLocalId && Object.hasOwn(prompts, selectedLocalId)
      ? selectedLocalId : String(remote.activePersonaId || ''),
    affection: Math.max(Number(remote.affection) || 0, Number(local.affection) || 0),
    trust: Math.max(Number(remote.trust) || 0, Number(local.trust) || 0),
    characterName: String(local.characterName || remote.characterName || '')
  };
}

async function syncMetadata(owner, archiveKey, { forceLocal = false } = {}) {
  assertOwner(owner, archiveKey);
  const remote = await request('/api/room/diary/metadata');
  if (String(remote?.userId || '') !== owner) throw new Error('云端账号与本机人设不一致，已取消同步');
  const localArchive = readDiaryArchive();
  const local = archiveMetadata(localArchive);
  const token = diaryMetadataDirtyToken();
  const knownRevision = diaryMetadataRevision();
  let metadata = remote.metadata;
  let revision = Number(remote.revision) || 0;

  if (!metadata || token || forceLocal) {
    const proposed = forceLocal ? local : metadata
      ? (knownRevision === revision && token !== 'legacy' ? local : mergeMetadata(metadata, local))
      : local;
    if (!metadata || JSON.stringify(proposed) !== JSON.stringify(metadata)) {
      assertOwner(owner, archiveKey);
      const written = await request('/api/room/diary/metadata', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedUserId: owner, expectedRevision: revision, metadata: proposed })
      });
      revision = Number(written.revision);
      metadata = proposed;
    }
  }
  assertOwner(owner, archiveKey);
  if (diaryMetadataDirtyToken() !== token) {
    throw new Error('同步时日记人设发生了新修改，请再次同步');
  }
  acknowledgeDiaryMetadata(revision, token);
  return metadata;
}

async function performSync(owner, archiveKey, { ensureDiaryId = '' } = {}) {
  announce('syncing', '正在同步日记…');
  try {
    // Verify the authenticated cookie before uploading any browser-local data.
    let remote = await loadRemote(owner, archiveKey);
    assertOwner(owner, archiveKey);

    const clearing = pendingDiaryClear();
    if (clearing) {
      await request('/api/room/diary', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedUserId: owner })
      });
      assertOwner(owner, archiveKey);
      remote = await loadRemote(owner, archiveKey);
    }

    const pending = pendingDiaryDeletions();
    for (let i = 0; i < pending.length; i += 100) {
      const batch = pending.slice(i, i + 100);
      await writeBatch(owner, archiveKey, [], batch);
      assertOwner(owner, archiveKey);
      acknowledgeDiaryDeletions(batch);
      for (const id of batch) {
        remote.entries.delete(id);
        remote.deleted.add(id);
      }
    }

    const local = readDiaryArchive().data.diary || [];
    const missing = local.filter((entry) => entry?.diaryId
      && !remote.entries.has(entry.diaryId)
      && !remote.deleted.has(entry.diaryId));
    for (let i = 0; i < missing.length; i += WRITE_BATCH_SIZE) {
      await writeBatch(owner, archiveKey, missing.slice(i, i + WRITE_BATCH_SIZE));
    }

    // Read server truth again: a second device may have deleted an entry while
    // this device was uploading, and tombstones always win over stale caches.
    remote = await loadRemote(owner, archiveKey);
    assertOwner(owner, archiveKey);
    if (pendingDiaryClear() !== clearing) throw new Error('清空日记正在等待同步，请重试');
    const pendingNow = new Set(pendingDiaryDeletions());
    const metadata = await syncMetadata(owner, archiveKey, { forceLocal: clearing });
    const latest = readDiaryArchive();
    const merged = new Map((latest.data.diary || [])
      .filter((entry) => !remote.deleted.has(entry.diaryId) && !pendingNow.has(entry.diaryId))
      .map((entry) => [entry.diaryId, entry]));
    for (const [id, entry] of remote.entries) {
      if (!pendingNow.has(id)) merged.set(id, entry);
    }
    latest.data.diary = [...merged.values()];
    applyMetadata(latest, metadata);
    writeDiaryArchive(latest);
    if (clearing) acknowledgeDiaryClear();
    if (ensureDiaryId && !remote.entries.has(ensureDiaryId)) {
      throw new Error('这篇日记只保存在本机，云端尚未确认，请重试同步');
    }
    announce('synced', '已同步到当前账号，可在其他设备查看');
    return { scope: 'account', count: latest.data.diary.length, synced: true };
  } catch (error) {
    announce('error', `日记云端同步失败：${error.message}；本机存档仍保留`);
    throw error;
  }
}

export function syncDiaryArchive(options = {}) {
  const owner = currentOwner();
  if (!owner) {
    announce('local', '访客日记只保存在当前浏览器，登录后可跨设备同步');
    return Promise.resolve({ scope: 'local', count: readDiaryArchive().data.diary.length, synced: false });
  }
  const archiveKey = diaryArchiveKey();
  const previous = inflight.get(owner);
  const operation = (previous || Promise.resolve())
    .catch(() => {})
    .then(() => performSync(owner, archiveKey, options));
  inflight.set(owner, operation);
  operation.finally(() => { if (inflight.get(owner) === operation) inflight.delete(owner); }).catch(() => {});
  return operation;
}
