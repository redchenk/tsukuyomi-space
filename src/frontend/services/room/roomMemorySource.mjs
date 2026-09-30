const SOURCE_PREFIX = 'roomMemorySource:';

// Choices belong to one account in this browser. Guest records are never
// silently shared with another account, and choosing cloud never deletes them.
export function readMemorySource(accountId, storage = localStorage) {
  if (!accountId) return { mode: 'local', fingerprint: '' };
  try {
    const value = JSON.parse(storage.getItem(`${SOURCE_PREFIX}${accountId}`) || 'null');
    return { mode: value?.mode === 'local' ? 'local' : 'cloud', fingerprint: String(value?.fingerprint || '') };
  } catch (_) { return { mode: 'cloud', fingerprint: '' }; }
}

export function writeMemorySource(accountId, choice, storage = localStorage) {
  if (!accountId || !['local', 'cloud'].includes(choice.mode)) throw new Error('记忆来源无效');
  storage.setItem(`${SOURCE_PREFIX}${accountId}`, JSON.stringify({ mode: choice.mode, fingerprint: String(choice.fingerprint || '') }));
}

export function accountLocalMemoryKey(accountId) {
  return accountId ? `user-local:${accountId}` : '';
}

export function memoryImportRecord(row) {
  const importance = row.importance ?? 0.5, confidence = row.confidence ?? 0.8;
  if (![importance, confidence].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new Error('本地记忆的重要度和置信度必须为 0 到 1');
  }
  const types = ['profile', 'preference', 'project', 'episodic', 'semantic', 'conversation'];
  const type = row.type || 'conversation', tags = Array.isArray(row.tags) ? row.tags : [];
  if (!types.includes(type)) throw new Error('本地记忆类型无效，请先在访客身份下编辑');
  if (tags.length > 12 || tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 80)) throw new Error('每条记忆最多 12 个标签，每个标签 1 到 80 字');
  if (!row.id || String(row.id).length > 256) throw new Error('本地记忆的来源标识无效');
  return { id: String(row.id), type, summary: String(row.summary || ''),
    content: String(row.content || ''), importance, confidence, tags,
    createdAt: row.createdAt || '', updatedAt: row.updatedAt || '' };
}

export async function guestMemoryFingerprint(rows) {
  if (!rows.length) return '';
  // Fingerprinting is not import validation: old local records may exceed
  // cloud limits, but people must still be able to choose local or cloud.
  const text = JSON.stringify(rows.map(row => ({ id: String(row.id || ''), type: row.type,
    summary: row.summary, content: row.content, importance: row.importance, confidence: row.confidence,
    tags: row.tags, createdAt: row.createdAt, updatedAt: row.updatedAt })).sort((a, b) => a.id.localeCompare(b.id)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

// Ordinary requests stay below 1 MB; validation happens before any upload so
// an oversized local record cannot leave a misleading partially resolved choice.
export function memoryImportBatches(rows, maxContentLength = 12000) {
  const batches = [], encoder = new TextEncoder();
  let batch = [], size = 0;
  for (const row of rows) {
    const record = memoryImportRecord(row);
    if (!record.summary.trim() || !record.content.trim()) throw new Error('本地记忆摘要和内容不能为空');
    if (record.summary.length > 800 || record.content.length > maxContentLength) throw new Error(`本地记忆超出长度上限（摘要 800 字、内容 ${maxContentLength} 字），请先在访客身份下编辑`);
    const bytes = encoder.encode(JSON.stringify(record)).length;
    if (batch.length && (batch.length >= 100 || size + bytes > 700000)) { batches.push(batch); batch = []; size = 0; }
    batch.push(record); size += bytes;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
