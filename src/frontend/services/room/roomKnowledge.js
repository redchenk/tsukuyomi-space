import { cloneKnowledgeEntry, defaultKnowledgeEntries } from '../../constants/room/knowledgeEntries';

/** A saved empty list is intentional; defaults are only for first use. */
export function normalizeRoomKnowledge(settings) {
  return {
    enabled: settings?.enabled !== false,
    entries: (Array.isArray(settings?.entries) ? settings.entries : defaultKnowledgeEntries())
      .filter((entry) => entry && typeof entry === 'object')
      .map(cloneKnowledgeEntry)
  };
}

/** Apply the editor draft before persisting, whichever save button was used. */
export function applyKnowledgeDraft(entries, draft, editingId) {
  const hasDraft = editingId || [draft?.title, draft?.content, draft?.tags].some((value) => String(value || '').trim());
  if (!hasDraft) return entries.map(cloneKnowledgeEntry);
  const entry = cloneKnowledgeEntry(draft);
  if (!entry.title || !entry.content) throw new Error('请填写知识条目的标题和内容');
  if (!editingId) return [entry, ...entries.map(cloneKnowledgeEntry)];
  if (!entries.some((item) => item.id === editingId)) throw new Error('该知识条目已不存在，请重新读取后编辑');
  return entries.map((item) => item.id === editingId ? { ...entry, id: editingId } : cloneKnowledgeEntry(item));
}

/** Ranked records can be budgeted individually without cutting off later hits. */
export function selectRoomKnowledgeEntries(message, settings, limit = 10) {
  const knowledge = normalizeRoomKnowledge(settings);
  if (!knowledge.enabled) return [];
  const query = String(message || '').toLowerCase().trim();
  const words = query.match(/[a-z0-9_-]{2,}|[\u3400-\u9fff]{2,}/g) || [];
  const tokens = [...new Set(words.flatMap((word) => /[\u3400-\u9fff]/.test(word)
    ? [word, ...Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2))]
    : [word]))].slice(0, 80);
  const coreIds = new Set(['yachiyo_identity_001', 'yachiyo_personality_001', 'yachiyo_speech_001', 'yachiyo_rules_001', 'yachiyo_limits_001']);
  return knowledge.entries.filter((item) => item.enabled && (item.title || item.content))
    .map((item, index) => {
      const haystack = `${item.title} ${item.tags} ${item.content}`.toLowerCase();
      const hits = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
      return { ...item, index, score: hits * 4 + (coreIds.has(item.id) ? 3 : 0) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, Math.max(0, Math.min(20, Number(limit) || 10)));
}

export function knowledgeContext(message, settings) {
  const entries = selectRoomKnowledgeEntries(message, settings);
  if (!entries.length) return '';
  return [
    '角色知识库（用户在房间设置中保存的当前版本；角色细节与口吻以此处为准，其他检索背景不能覆盖这些设置）：',
    ...entries.map((item, index) => `${index + 1}. ${item.title}：${item.content.slice(0, 1600)}`)
  ].join('\n');
}
