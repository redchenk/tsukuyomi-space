import { cloneKnowledgeEntry, defaultKnowledgeEntries, upgradeRoomKnowledgeEntries, ROOM_KNOWLEDGE_VERSION } from '../../constants/room/knowledgeEntries';

/** Saved empty/reduced libraries are intentional. Only intact old defaults upgrade. */
export function normalizeRoomKnowledge(settings) {
  const saved = Array.isArray(settings?.entries) ? settings.entries.filter(entry => entry && typeof entry === 'object') : null;
  return {
    enabled: settings?.enabled !== false,
    builtinVersion: ROOM_KNOWLEDGE_VERSION,
    entries: (saved ? upgradeRoomKnowledgeEntries(saved, settings?.builtinVersion) : defaultKnowledgeEntries()).map(cloneKnowledgeEntry)
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

function knowledgeSearchText(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/彩葉/g, '彩叶').replace(/輝夜/g, '辉夜').replace(/月見/g, '月见')
    .replace(/ヤチヨ/g, '八千代').replace(/かぐや/g, '辉夜');
}

/** Follow-up topics come from the latest human question, never an invented answer. */
export function roomKnowledgeQuery(message, recentMessages = []) {
  const current = String(message || '').trim();
  const followup = current.length <= 50 && /^(那|然后|后来|接着|所以|她|他|它|这|这个|那个|为什么|为啥|还有|继续)/.test(current);
  const previous = Array.isArray(recentMessages) ? recentMessages.filter(item => item?.role === 'user' && item.content).at(-1) : null;
  return followup && previous ? `${String(previous.content).slice(0, 180)} ${current}` : current;
}

function roomKnowledgeRequestsNoSpoilers(message) {
  return /不(?:要)?剧透|别剧透|无剧透|不要透露|没看完|还没看|未看完|no spoilers?|spoiler[- ]?free/.test(knowledgeSearchText(message));
}

export function roomKnowledgeAllowsSpoilers(message) {
  const query = knowledgeSearchText(message);
  if (roomKnowledgeRequestsNoSpoilers(query)) return false;
  return /结局|结尾|剧透|真相|身世|时间旅行|八千年前|八千年(?:的)?(?:经历|历史|等待)|8000年前|回月球|义体|十年后|52\s*小时|五十二小时|cia|正仓院|remember.*(?:来源|来历|由来|怎么来|作曲|谁写|谁作)|(?:来源|来历|由来|怎么来|作曲|谁写|谁作).*remember|(?:不死|fushi|犬doge).*(?:来历|身世)|同一(?:个)?人|同一个人|已经看完|看过(?:电影|小说)|可以透露|spoilers? ok|ending|小说.*最后|八千代.*辉夜.*(?:关系|区别|是不是)|不死.*犬doge.*(?:吗|是不是)/.test(query);
}

/** Old unversioned corpus is a fallback for canon questions, not everyday small talk. */
export function shouldRetrieveRoomPersona(message, selected = []) {
  return !roomKnowledgeRequestsNoSpoilers(message)
    && /原作|电影|小说|剧情|设定|八千代|辉夜|彩叶|月夜见|remember|fushi|kassen|sengoku/i.test(knowledgeSearchText(message))
    && !selected.some(item => item.id?.startsWith('yachiyo_canon_') && ['小说', '电影官方资料'].includes(item.edition));
}

/** Rank precise titles/tags above shared vocabulary; keep spoilers opt-in. */
export function selectRoomKnowledgeEntries(message, settings, limit = 10, { recentMessages = [] } = {}) {
  const knowledge = normalizeRoomKnowledge(settings);
  const count = Number.isFinite(Number(limit)) ? Math.max(0, Math.min(20, Math.floor(Number(limit)))) : 10;
  if (!knowledge.enabled || !count) return [];
  const query = knowledgeSearchText(roomKnowledgeQuery(message, recentMessages));
  const words = query.match(/[a-z0-9_-]{2,}|[\u3400-\u9fff]{2,}/g) || [];
  const stop = new Set(['八千代', '八千', '千代', '你好', '可以', '什么', '怎么', '一下', '这个', '那个', '知道', '说说', '告诉', '请问']);
  const tokens = [...new Set(words.flatMap(word => /[\u3400-\u9fff]/.test(word)
    ? [word, ...Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2))] : [word]))].filter(token => !stop.has(token)).slice(0, 100);
  const allowSpoilers = !roomKnowledgeRequestsNoSpoilers(message) && (roomKnowledgeAllowsSpoilers(message) || roomKnowledgeAllowsSpoilers(query));
  const coreIds = new Set(['yachiyo_identity_001', 'yachiyo_personality_001', 'yachiyo_speech_001', 'yachiyo_rules_001', 'yachiyo_limits_001']);
  const records = knowledge.entries.filter(item => item.enabled && (item.title || item.content) && (!item.spoiler || allowSpoilers)
      && !(item.id === 'yachiyo_few_shots_001' && item.edition === '对话适配' && !/口吻|语气|说话方式|示例|台词风格/.test(query)))
    .map((item, index) => ({ ...item, index, label: knowledgeSearchText(`${item.title} ${item.tags}`), body: knowledgeSearchText(item.content) }));
  const frequencies = new Map(tokens.map(token => [token, records.filter(item => `${item.label} ${item.body}`.includes(token)).length]));
  const ranked = records.map(item => ({ ...item, score: tokens.reduce((sum, token) => {
    const weight = Math.log(1 + records.length / (1 + frequencies.get(token)));
    return sum + weight * (item.label.includes(token) ? 5 : item.body.includes(token) ? 1 : 0);
  }, 0) })).filter(item => item.score > 1).sort((a, b) => b.score - a.score || a.index - b.index);
  // The fixed persona already supplies the voice. Leave most space for the topic.
  const selected = ranked.slice(0, count);
  const fallback = records.filter(item => coreIds.has(item.id)).slice(0, ranked.length ? 1 : 3);
  for (const item of fallback) if (selected.length < count && !selected.some(row => row.id === item.id)) selected.push(item);
  return selected.map(({ label, body, index, score, ...item }) => item);
}

export function knowledgeContext(message, settings) {
  const entries = selectRoomKnowledgeEntries(message, settings);
  if (!entries.length) return '';
  return [
    '角色知识库（用户保存的当前版本；手动修改的条目优先。来源仅作事实核对，小说细节不自动等于电影镜头；没有资料支持时承认不确定）：',
    ...entries.map((item, index) => `${index + 1}. ${item.title}${item.edition ? `（${item.edition}；${item.references.join('；')}）` : '（用户自定义）'}：${item.content.slice(0, 1600)}`)
  ].join('\n');
}
