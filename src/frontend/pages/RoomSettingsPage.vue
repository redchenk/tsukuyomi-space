<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { apiFetch, apiUrl, authFetch, authHeaders, getSession, noStoreUrl, parseResponse } from '../api/client';
import TsIcon from '../components/TsIcon.vue';
import { cloneKnowledgeEntry, defaultKnowledgeEntries } from '../constants/room/knowledgeEntries';
import { applyKnowledgeDraft, normalizeRoomKnowledge } from '../services/room/roomKnowledge';
import { roomLive2DManifest } from '../constants/room/live2dManifest';
import {
  clearRoomLive2DQueue,
  queueRoomLive2DForNextRoom,
  readRoomLive2DDebugState
} from '../services/room/live2dControl';
import {
  fetchWithLocalOllamaGuidance,
  localOllamaWindowsCommand,
  normalizeLocalOllamaBaseUrl
} from '../services/room/localOllamaTransport';
import {
  describeAudioPlaybackError,
  prepareAsyncAudioSource,
  primeAsyncAudioPlayback,
  releaseAsyncAudioPlayback
} from '../services/room/audioPlayback';
import { publishLocalRoomMemoryUpdate, refreshRoomMemorySync, startRoomMemorySync } from '../services/room/roomMemorySync';
import { requestTtsAudioBlob } from '../services/room/ttsTransport';
import {
  activePersonaPrompt,
  clearDiaryArchive,
  diaryArchiveKey,
  downloadDiaryArchive,
  importDiaryArchive,
  readDiaryArchive,
  serializeDiaryArchive,
  updatePersonaPrompt
} from '../services/room/roomDiaryArchive';
import { DIARY_SYNC_UPDATED_EVENT, syncDiaryArchive } from '../services/room/roomDiarySync';
import { formatDateTime } from '../utils/time';

const props = defineProps({
  user: { type: Object, default: null }
});

const emit = defineEmits(['go']);

const MEMORY_DB_NAME = 'tsukuyomi-room-memory';
const MEMORY_STORE = 'memories';
const ROOM_MEMORY_UPDATED_KEY = 'roomMemoryLastUpdatedAt';
let stopRoomMemorySync = () => {};
let memoryRefreshTimer = 0;
const MODEL_CATALOG_CACHE_KEY = 'roomModelCatalogOpenRouter';
const LLM_PRESETS = {
  ollama: { label: 'Ollama 本机', apiUrl: 'http://localhost:11434/api/chat', model: 'qwen2.5:7b', useProxy: false, apiKey: '' },
  openai: { label: 'OpenAI Responses', apiUrl: 'https://api.openai.com/v1/responses', model: 'gpt-5.5' },
  openaiChat: { label: 'OpenAI Chat', apiUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  openrouter: { label: 'OpenRouter', apiUrl: 'https://openrouter.ai/api/v1/chat/completions', model: 'openai/gpt-5.2' },
  deepseek: { label: 'DeepSeek', apiUrl: 'https://api.deepseek.com/chat/completions', model: 'deepseek-v4-flash' },
  kimi: { label: 'Kimi', apiUrl: 'https://api.moonshot.cn/v1/chat/completions', model: 'kimi-k2.6' },
  zhipu: { label: '智谱 GLM', apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-5.1' },
  siliconflow: { label: 'SiliconFlow', apiUrl: 'https://api.siliconflow.cn/v1/chat/completions', model: 'deepseek-ai/DeepSeek-V3' },
  volcengine: { label: '火山方舟', apiUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', model: 'ep-替换为你的接入点ID' },
  minimax: { label: 'MiniMax', apiUrl: 'https://api.minimaxi.com/anthropic/v1/messages', model: 'MiniMax-M2.7' },
  groq: { label: 'Groq', apiUrl: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.1-8b-instant' },
  mistral: { label: 'Mistral', apiUrl: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-small-latest' },
  together: { label: 'Together', apiUrl: 'https://api.together.xyz/v1/chat/completions', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
  perplexity: { label: 'Perplexity', apiUrl: 'https://api.perplexity.ai/chat/completions', model: 'sonar' },
  xai: { label: 'Grok', apiUrl: 'https://api.x.ai/v1/responses', model: 'grok-4.3' },
  gemini: { label: 'Gemini', apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.5-flash' }
};
const ALIYUN_LLM_PRESETS = {
  cn: { label: '北京 · 通用 qwen-plus', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus' },
  cnVision: { label: '北京 · 视觉 qwen-vl-plus', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-vl-plus' },
  cnVisionMax: { label: '北京 · 视觉 qwen-vl-max', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-vl-max' },
  intl: { label: '国际/新加坡 · qwen-plus', apiUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus' },
  us: { label: '美国 · qwen-plus', apiUrl: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus' }
};
const MIMO_LLM_PRESETS = {
  standardPro: { label: '标准模式 · mimo-v2.5-pro', apiUrl: 'https://api.xiaomimimo.com/v1/chat/completions', model: 'mimo-v2.5-pro' },
  standardFlash: { label: '标准模式 · mimo-v2-flash', apiUrl: 'https://api.xiaomimimo.com/v1/chat/completions', model: 'mimo-v2-flash' },
  tokenPlan: { label: 'Token Plan · mimo-v2.5', apiUrl: 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions', model: 'mimo-v2.5' },
  tokenPlanPro: { label: 'Token Plan · mimo-v2.5-pro', apiUrl: 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions', model: 'mimo-v2.5-pro' }
};
const MODEL_PROVIDER_PREFIXES = {
  openai: ['openai/'],
  openrouter: [],
  deepseek: ['deepseek/'],
  kimi: ['moonshotai/', 'moonshot/'],
  zhipu: ['z-ai/', 'thudm/'],
  aliyun: ['qwen/', 'alibaba/'],
  siliconflow: ['deepseek/', 'qwen/', 'meta-llama/', 'mistralai/'],
  volcengine: ['bytedance/', 'doubao/'],
  minimax: ['minimax/'],
  groq: ['meta-llama/', 'openai/', 'qwen/'],
  mistral: ['mistralai/'],
  together: ['meta-llama/', 'mistralai/', 'qwen/', 'deepseek/'],
  perplexity: ['perplexity/'],
  xai: ['x-ai/'],
  gemini: ['google/'],
  mimo: ['xiaomi/', 'mimo/'],
  ollama: []
};
const MODEL_RECOMMEND_PATTERNS = {
  openai: ['gpt-5.5', 'gpt-5.2', 'gpt-5.1', 'gpt-5', 'gpt-4.1', 'gpt-4o'],
  openrouter: ['openai/gpt-5.5', 'openai/gpt-5.2', 'anthropic/claude-opus-4.5', 'google/gemini-3', 'x-ai/grok-4', 'deepseek/deepseek-chat'],
  deepseek: ['deepseek-v4-flash', 'deepseek-chat', 'deepseek-v3', 'deepseek-r1'],
  kimi: ['kimi-k2', 'moonshot-v1-128k', 'moonshot-v1-32k'],
  zhipu: ['glm-5', 'glm-4.5', 'glm-4-plus'],
  aliyun: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-vl-max', 'qwen-vl-plus'],
  siliconflow: ['deepseek-v3', 'deepseek-r1', 'qwen3', 'qwen2.5'],
  volcengine: ['doubao-1.5-pro', 'doubao-pro', 'doubao-lite'],
  minimax: ['minimax-m2', 'minimax-01'],
  groq: ['llama-3.3-70b', 'llama-3.1-8b', 'qwen'],
  mistral: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'],
  together: ['llama-3.3-70b', 'deepseek-v3', 'qwen3', 'mistral-large'],
  perplexity: ['sonar-pro', 'sonar'],
  xai: ['grok-4', 'grok-3'],
  gemini: ['gemini-3', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  mimo: ['mimo-v2.5-pro', 'mimo-v2.5', 'mimo-v2-flash'],
  ollama: ['qwen2.5', 'llama3.1', 'llama3.2', 'gemma3', 'mistral']
};
const MODEL_NON_CHAT_PATTERN = /(embedding|moderation|tts|audio|whisper|image|vision-preview|rerank|reward|guard|ocr|video|speech)/i;
const MINIMAX_DEFAULT_VOICE_ID = 'female-shaonv';
const LEGACY_MINIMAX_DEFAULT_VOICE_IDS = ['yachiyo_jp_prompt_20260525c', 'English_expressive_narrator'];
const TTS_PRESETS = {
  mimo: { label: 'MiMo-V2.5-TTS', provider: 'mimo', apiUrl: 'https://api.xiaomimimo.com/v1/chat/completions', model: 'mimo-v2.5-tts', voice: 'mimo_default' },
  openai: { label: 'OpenAI TTS', provider: 'openai', apiUrl: 'https://api.openai.com/v1/audio/speech', model: 'tts-1', voice: 'alloy' },
  openaiCompatible: { label: 'OpenAI Compatible', provider: 'openai-compatible', apiUrl: 'https://api.example.com/v1/audio/speech', model: 'tts-1', voice: 'alloy' },
  minimax: { label: 'MiniMax TTS', provider: 'minimax', apiUrl: 'https://api.minimaxi.com/v1/t2a_v2', model: 'speech-2.8-hd', voice: MINIMAX_DEFAULT_VOICE_ID, textLang: 'ja' },
  elevenlabs: { label: 'ElevenLabs', provider: 'elevenlabs', apiUrl: 'https://api.elevenlabs.io/v1/text-to-speech', model: 'eleven_multilingual_v2', voice: '21m00Tcm4TlvDq8ikWAM' },
  gptSovitsLocal: { label: '本机 GPT-SoVITS 直连', provider: 'gpt-sovits', apiUrl: 'http://localhost:9880/tts', model: 'auto', voice: '', useProxy: false, textLang: 'auto', promptLang: 'ja', gptWeightPath: 'GPT_weights_v2ProPlus/yachiyo-v2pro-e20.ckpt', sovitsWeightPath: 'SoVITS_weights_v2ProPlus/yachiyo-v2pro_e12_s684.pth' },
  custom: { label: '自定义', provider: 'custom', apiUrl: '', model: '', voice: '' }
};
const BEGINNER_LLM_PROVIDERS = [
  { value: 'openaiChat', label: 'OpenAI', detail: '通用稳定' },
  { value: 'deepseek', label: 'DeepSeek', detail: '中文友好' },
  { value: 'kimi', label: 'Kimi', detail: '长文本' },
  { value: 'openrouter', label: 'OpenRouter', detail: '模型丰富' },
  { value: 'zhipu', label: '智谱 GLM', detail: '国内服务' }
];
const DEFAULT_GPT_SOVITS_GPT_WEIGHT = 'GPT_weights_v2ProPlus/yachiyo-v2pro-e20.ckpt';
const DEFAULT_GPT_SOVITS_SOVITS_WEIGHT = 'SoVITS_weights_v2ProPlus/yachiyo-v2pro_e12_s684.pth';
const GPT_SOVITS_LANGUAGE_OPTIONS = [
  { value: 'zh', label: '中文 / zh' },
  { value: 'ja', label: '日语 / ja' },
  { value: 'en', label: '英语 / en' },
  { value: 'yue', label: '粤语 / yue' },
  { value: 'ko', label: '韩语 / ko' },
  { value: 'auto', label: '自动 / auto' }
];
const MINIMAX_MCP_TOOLS = 'text_to_audio,list_voices,voice_clone,voice_design,music_generation,generate_video,image_to_video,query_video_generation,text_to_image';
const MINIMAX_TOKEN_PLAN_TOOLS = 'web_search,understand_image';

const toast = reactive({ text: '', type: 'success', visible: false });
const modelSaveNotice = reactive({ visible: false, text: '', detail: '' });
const testDialog = reactive({ visible: false, target: '', status: 'idle', title: '', message: '', detail: '' });
const testDialogCard = ref(null);
let testDialogTrigger = null;
let ttsTestPlayback = null;
const memoryCount = ref(0);
const memoryList = ref([]);
const memoryLoading = ref(false);
const memoryError = ref('');
const memoryFilteredTotal = ref(0);
const memoryHasMore = ref(false);
const memoryContentLimit = ref(12000);
const MEMORY_PAGE_SIZE = 80;
let memoryListRequestId = 0;
let memoryEditRequestId = 0;
const memoryVector = reactive({ backend: '', enabled: false, pending: 0, failed: 0, embedding: '' });
const storedUser = ref(readStoredUser());
const modelCatalog = reactive({ loading: false, message: '', error: '', updatedAt: '', models: [] });
const setupLlmMode = ref('ollama');
const setupCloudProvider = ref('openaiChat');
const activeSection = ref('llm');
const mobileSectionsOpen = ref(false);
const settingsSearch = ref('');
const setupGuideVisible = ref(true);
const showLlmKey = ref(false);
const savingSettings = ref(false);
const knowledgeDraftOpen = ref(false);
const knowledgeExpanded = reactive({});
const settingsPanel = ref(null);
const connectionCheck = reactive({ status: 'idle', snapshot: '' });
const settingsNavigation = [
  { id: 'llm', label: '聊天模型', icon: 'message', group: '基础与陪伴', badge: '必需', keywords: 'API 密钥 模型 端点 代理 图片 补充指令 Ollama' },
  { id: 'tts', label: '语音与朗读', icon: 'audioLines', group: '基础与陪伴', badge: '可选', keywords: 'TTS 音色 GPT SoVITS 语言 权重' },
  { id: 'memory', label: '长期记忆', icon: 'bookmark', group: '基础与陪伴', keywords: 'Mem0 检索 同步 偏好' },
  { id: 'knowledge', label: '角色知识库', icon: 'book', group: '基础与陪伴', keywords: '八千代 人格 条目 注入' },
  { id: 'model', label: '角色与布局', icon: 'layers', group: '房间个性化', keywords: '大小 位置 浮窗' },
  { id: 'diary', label: '日记与存档', icon: 'fileText', group: '房间个性化', keywords: '人设 导入 导出 备份 好感度' },
  { id: 'mcp', label: '工具与扩展', icon: 'grid', group: '进阶功能', badge: 'MCP', keywords: '搜索 白名单 鉴权 MiniMax' },
  { id: 'debug', label: 'Live2D 调试', icon: 'code', group: '进阶功能', keywords: '表情 动作 队列 JSON' }
];
const filteredSettingsGroups = computed(() => ['基础与陪伴', '房间个性化', '进阶功能'].map(label => ({
  label,
  items: settingsNavigation.filter(item => item.group === label && `${item.label} ${item.keywords}`.toLowerCase().includes(settingsSearch.value.trim().toLowerCase()))
})).filter(group => group.items.length));
const currentSection = computed(() => settingsNavigation.find(item => item.id === activeSection.value));
const testedConnectionStatus = computed(() => connectionCheck.snapshot === sectionSnapshot('llm') ? connectionCheck.status : 'idle');
const connectionStatusText = computed(() => ({ idle: llmSetupReady.value ? '尚未测试连接' : '待完成配置', loading: '正在测试连接', success: '连接测试通过', warning: '已响应，未返回文本', error: '连接测试失败' })[testedConnectionStatus.value]);

async function selectSettingsSection(id) {
  if (!settingsNavigation.some(item => item.id === id)) return;
  activeSection.value = id;
  mobileSectionsOpen.value = false;
  if (id === 'memory' && !memory.managerOpen) {
    memory.managerOpen = true;
    void loadVisibleMemories();
  }
  await nextTick();
  settingsPanel.value?.scrollIntoView({ block: 'start', behavior: 'auto' });
  settingsPanel.value?.focus({ preventScroll: true });
}

function discardSettings() {
  if (!hasUnsavedSettings.value || savingSettings.value || memorySavePending.value) return;
  if (!window.confirm('放弃尚未保存的修改，恢复到上次保存的设置？已保存的记忆和条目不会撤销。')) return;
  cancelMemoryEdit();
  loadSettings();
  knowledgeDraftOpen.value = false;
  showToast('已恢复到上次保存的设置');
}
const ollamaRepairCommand = computed(() => localOllamaWindowsCommand(
  typeof window === 'undefined' ? '' : window.location.origin
));
const showOllamaRepairAction = computed(() => (
  testDialog.target === 'llm'
  && testDialog.status === 'error'
  && isOllamaApi(llm.apiUrl)
));
let toastTimer = 0;
let modelNoticeTimer = 0;

const model = reactive({ scale: 100, xOffset: 0, yOffset: 0 });
const llm = reactive({ apiUrl: '', apiKey: '', model: '', useProxy: false, visionMode: 'auto', systemPrompt: '' });
const tts = reactive({
  enabled: false,
  provider: 'mimo',
  apiUrl: '',
  apiKey: '',
  model: 'mimo-v2.5-tts',
  voice: 'mimo_default',
  refAudioPath: '',
  promptText: '',
  textLang: 'auto',
  promptLang: 'ja',
  gptWeightPath: DEFAULT_GPT_SOVITS_GPT_WEIGHT,
  sovitsWeightPath: DEFAULT_GPT_SOVITS_SOVITS_WEIGHT,
  useProxy: false
});
const initialTtsSettings = { ...tts };
const memory = reactive({ enabled: true, query: '', type: '', editing: null, expanded: {}, managerOpen: false });
const memoryEditor = ref(null);
const memorySummaryInput = ref(null);
const memoryEditingOriginal = ref('');
const memorySavePending = ref(false);
const memorySaveError = ref('');
const knowledge = reactive({
  enabled: true,
  managerOpen: false,
  entries: [],
  editingId: null,
  draft: { title: '', content: '', tags: '', enabled: true }
});
const knowledgeEditor = ref(null);
const knowledgeTitleInput = ref(null);
const mcp = reactive({
  enabled: false,
  provider: 'custom',
  endpoint: '',
  apiKey: '',
  authHeader: 'Authorization',
  apiHost: 'https://api.minimaxi.chat',
  basePath: '',
  resourceMode: 'url',
  toolAllowlist: '',
  tools: []
});
const initialMcpSettings = { ...mcp };
const live2dDebug = reactive({
  status: 'idle',
  current: null,
  normalized: null,
  raw: null,
  history: [],
  activeIndex: 0,
  total: 0,
  updatedAt: 0
});
const live2dTest = reactive({
  expression: 'smile',
  motion: '',
  durationMs: 5000
});
const diary = reactive({
  open: false,
  entryCount: 0,
  personaName: '',
  affection: 0,
  slotId: 1,
  lastDiaryAt: '',
  persona: { name: '', description: '', personality: '', scenario: '', creatorNotes: '', tags: '' }
});
const diaryFileInput = ref(null);
const diarySyncStatus = ref('');
const savedSections = reactive({});
const settingsSections = ['model', 'llm', 'tts', 'memory', 'knowledge', 'mcp', 'diary'];
function sectionSnapshot(section) {
  const value = { model, llm, tts, memory: { enabled: memory.enabled }, knowledge: { enabled: knowledge.enabled, entries: knowledge.entries }, mcp, diary: diary.persona }[section];
  return JSON.stringify(value);
}
function rememberSaved(section) { savedSections[section] = sectionSnapshot(section); }
const pendingSections = computed(() => settingsSections.filter((section) => savedSections[section] !== undefined && savedSections[section] !== sectionSnapshot(section)));
const hasKnowledgeDraft = computed(() => Boolean(knowledge.editingId || [knowledge.draft.title, knowledge.draft.content, knowledge.draft.tags].some((value) => String(value || '').trim())));
function memoryEditSnapshot(value) {
  if (!value) return '';
  return JSON.stringify({
    id: value.id,
    type: value.type,
    summary: value.summary,
    content: value.content,
    importance: Number(value.importance),
    confidence: Number(value.confidence),
    tags: value.tags
  });
}
const hasMemoryDraft = computed(() => Boolean(memory.editing && memoryEditSnapshot(memory.editing) !== memoryEditingOriginal.value));
const hasUnsavedSettings = computed(() => pendingSections.value.length > 0 || hasKnowledgeDraft.value || hasMemoryDraft.value);

function persistSettings(key, value, label) {
  try {
    writeJson(key, value);
    return true;
  } catch (error) {
    showToast(`${label}保存失败：浏览器存储不可用或空间不足。修改仍保留在表单中，请重试。`, 'error');
    return false;
  }
}

async function saveAllSettings() {
  if (savingSettings.value || memorySavePending.value) return false;
  savingSettings.value = true;
  try {
    const sections = new Set(pendingSections.value);
    if (hasKnowledgeDraft.value) sections.add('knowledge');
    const actions = { model: saveModel, llm: () => saveLLM(false), tts: () => saveTTS(false), memory: saveMemory, knowledge: () => saveKnowledge(false), mcp: () => saveMCP(false), diary: saveDiaryPersona };
    for (const section of sections) {
      if (actions[section]() === false) {
        await selectSettingsSection(section);
        return false;
      }
    }
    if (hasMemoryDraft.value && !(await saveMemoryEdit())) {
      await selectSettingsSection('memory');
      return false;
    }
    showToast('所有修改已保存');
    return true;
  } finally {
    savingSettings.value = false;
  }
}

async function enterRoom() {
  if (await saveAllSettings()) emit('go', '/room');
}

function warnBeforeUnload(event) {
  if (!hasUnsavedSettings.value) return;
  event.preventDefault();
  event.returnValue = '';
}
onBeforeRouteLeave(() => !hasUnsavedSettings.value || window.confirm('设置尚未保存，离开会丢失这些修改。确定离开吗？'));

const roomUser = computed(() => storedUser.value || (props.user?.id ? props.user : null));
const roomIdentityLabel = computed(() => roomUser.value?.username || '访客身份');
const llmConnectionLabel = computed(() => llm.model || '待配置');
const ttsConnectionLabel = computed(() => tts.enabled ? (tts.voice || tts.provider || '已启用') : '未启用');
const llmSetupReady = computed(() => Boolean(llm.apiUrl && llm.model) && (!llmNeedsApiKey(llm.apiUrl) || Boolean(llm.apiKey)));
const ttsSetupReady = computed(() => !tts.enabled || (Boolean(tts.apiUrl) && (tts.provider === 'gpt-sovits' || Boolean(tts.apiKey))));
const visitorKey = computed(() => {
  if (roomUser.value?.id) return `user:${roomUser.value.id}`;
  let id = localStorage.getItem('roomMemoryGuestId');
  if (!id) {
    id = `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('roomMemoryGuestId', id);
  }
  return `guest:${id}`;
});
const canUseServerMemory = computed(() => Boolean(roomUser.value?.id));
const llmProviderKey = computed(() => detectLLMProvider(llm.apiUrl, llm.model));
const syncedModelOptions = computed(() => modelOptionsForProvider(llmProviderKey.value));
const recommendedModelOption = computed(() => recommendedModelForProvider(llmProviderKey.value));
const recommendedModelText = computed(() => {
  const option = recommendedModelOption.value;
  if (!option) return '暂无可用推荐；请先同步模型列表，或使用供应商预设。';
  const value = syncedModelSelectValue(option);
  return `${value}（${option.source === 'openrouter' ? '来自 OpenRouter 最新目录' : '来自本地预设'}）`;
});
const memoryModeLabel = computed(() => canUseServerMemory.value ? '服务端私有记忆' : '本地浏览器记忆');
const memoryVectorLabel = computed(() => {
  if (!canUseServerMemory.value) return '本地记忆';
  if (memoryVector.mem0?.enabled) return memoryVector.mem0.lastError ? 'Mem0 暂不可用 · 本地检索兜底' : 'Mem0 本机持久化检索';
  if (!memoryVector.enabled) return 'SQLite 向量检索';
  if (memoryVector.failed) return `Milvus ${memoryVector.failed} 条同步失败`;
  if (memoryVector.pending) return `Milvus ${memoryVector.pending} 条待同步`;
  return 'Milvus 已同步';
});
const memoryLocationText = computed(() => canUseServerMemory.value
  ? '记忆保存在当前账号中，并用于后续对话。访客记忆与账号记忆分别保存。'
  : '当前为访客，记忆仅保存在这台设备的当前浏览器中。');
const memoryTypeOptions = [
  { value: '', label: '全部类型' },
  { value: 'profile', label: '用户画像' },
  { value: 'preference', label: '偏好规则' },
  { value: 'project', label: '项目记忆' },
  { value: 'episodic', label: '事件记忆' },
  { value: 'semantic', label: '语义记忆' },
  { value: 'conversation', label: '对话片段' }
];
const live2dExpressionOptions = roomLive2DManifest.expressions;
const live2dMotionOptions = [{ id: '', label: '不触发动作' }, ...roomLive2DManifest.motions];
const live2dDebugJson = computed(() => JSON.stringify({
  status: live2dDebug.status,
  activeIndex: live2dDebug.activeIndex,
  total: live2dDebug.total,
  current: live2dDebug.current,
  normalized: live2dDebug.normalized
}, null, 2));
function readStoredUser() {
  return getSession()?.user || null;
}

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value == null ? fallback : value;
  } catch (_) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function compactModelPrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return 'free';
  return `$${(price * 1000000).toFixed(price * 1000000 < 0.01 ? 4 : 2)}/M`;
}

function detectLLMProvider(apiUrl = '', modelName = '') {
  const source = `${apiUrl || ''} ${modelName || ''}`.toLowerCase();
  if (/localhost:11434|127\.0\.0\.1:11434|\[::1\]:11434|ollama/.test(source)) return 'ollama';
  if (/openrouter/.test(source)) return 'openrouter';
  if (/dashscope|aliyuncs|qwen|alibaba/.test(source)) return 'aliyun';
  if (/xiaomimimo|token-plan-cn|mimo/.test(source)) return 'mimo';
  if (/api\.openai\.com|^gpt-|^o\d|openai\//.test(source)) return 'openai';
  if (/deepseek/.test(source)) return 'deepseek';
  if (/moonshot|kimi/.test(source)) return 'kimi';
  if (/bigmodel|zhipu|glm|z-ai/.test(source)) return 'zhipu';
  if (/siliconflow/.test(source)) return 'siliconflow';
  if (/volces|ark|doubao|bytedance/.test(source)) return 'volcengine';
  if (/minimax|minimaxi/.test(source)) return 'minimax';
  if (/groq/.test(source)) return 'groq';
  if (/mistral/.test(source)) return 'mistral';
  if (/together/.test(source)) return 'together';
  if (/perplexity|sonar/.test(source)) return 'perplexity';
  if (/x\.ai|grok|x-ai\//.test(source)) return 'xai';
  if (/generativelanguage|gemini|google\//.test(source)) return 'gemini';
  return 'custom';
}

function normalizeLocalLLMUrl(apiUrl = '') {
  const value = String(apiUrl || '').trim();
  return normalizeLocalOllamaBaseUrl(value);
}

function isOllamaApi(apiUrl = '') {
  try {
    const parsed = new URL(normalizeLocalLLMUrl(apiUrl));
    return ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname.toLowerCase())
      && (parsed.port || '11434') === '11434';
  } catch (_) {
    return false;
  }
}

function normalizeOllamaUrl(apiUrl = '') {
  const parsed = new URL(normalizeLocalLLMUrl(apiUrl || 'http://localhost:11434/api/chat'));
  const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  if (pathname === '/' || pathname === '/api') parsed.pathname = '/api/chat';
  else if (pathname === '/v1') parsed.pathname = '/v1/chat/completions';
  return parsed.toString().replace(/\/$/, '');
}

function isOllamaNativeApi(apiUrl = '') {
  try {
    return isOllamaApi(apiUrl) && /^\/api\/chat\/?$/.test(new URL(normalizeOllamaUrl(apiUrl)).pathname);
  } catch (_) {
    return false;
  }
}

function llmNeedsApiKey(apiUrl = llm.apiUrl) {
  return !isOllamaApi(apiUrl);
}

function nativeModelId(openRouterId, provider = llmProviderKey.value) {
  const id = String(openRouterId || '').trim();
  if (!id || provider === 'openrouter') return id;
  const slashIndex = id.indexOf('/');
  return slashIndex >= 0 ? id.slice(slashIndex + 1) : id;
}

function modelModalities(architecture, key) {
  const values = architecture?.[key];
  return Array.isArray(values) ? values.map((item) => String(item).toLowerCase()) : [];
}

function providerStaticModelOptions(provider) {
  const presets = [
    ...Object.values(LLM_PRESETS),
    ...Object.values(ALIYUN_LLM_PRESETS),
    ...Object.values(MIMO_LLM_PRESETS)
  ];
  return presets
    .filter((preset) => detectLLMProvider(preset.apiUrl, preset.model) === provider)
    .map((preset) => ({
      id: preset.model,
      nativeId: preset.model,
      label: preset.label,
      detail: preset.apiUrl,
      contextLength: 0,
      created: 0,
      inputModalities: ['text'],
      outputModalities: ['text'],
      source: 'preset'
    }));
}

function modelOptionsForProvider(provider) {
  const prefixes = MODEL_PROVIDER_PREFIXES[provider] || [];
  const synced = (modelCatalog.models || [])
    .filter((model) => provider === 'openrouter' || prefixes.some((prefix) => model.id.toLowerCase().startsWith(prefix)))
    .slice(0, provider === 'openrouter' ? 240 : 80)
    .map((model) => {
      const nativeId = nativeModelId(model.id, provider);
      const context = model.context_length ? `${Math.round(model.context_length / 1000)}k ctx` : '';
      const promptPrice = compactModelPrice(model.pricing?.prompt);
      const outputPrice = compactModelPrice(model.pricing?.completion);
      const modalities = Array.isArray(model.architecture?.input_modalities)
        ? model.architecture.input_modalities.join('+')
        : '';
      return {
        id: model.id,
        nativeId,
        label: model.name || model.id,
        detail: [nativeId, context, modalities, `${promptPrice}/${outputPrice}`].filter(Boolean).join(' · '),
        contextLength: Number(model.context_length || 0),
        created: Number(model.created || 0),
        inputModalities: modelModalities(model.architecture, 'input_modalities'),
        outputModalities: modelModalities(model.architecture, 'output_modalities'),
        source: 'openrouter'
      };
    });
  const seen = new Set(synced.map((item) => item.nativeId));
  return [
    ...synced,
    ...providerStaticModelOptions(provider).filter((item) => !seen.has(item.nativeId))
  ];
}

function modelRecommendationScore(option, provider) {
  if (!option) return -Infinity;
  const id = String(option.id || '').toLowerCase();
  const nativeId = String(option.nativeId || '').toLowerCase();
  const label = String(option.label || '').toLowerCase();
  const haystack = `${id} ${nativeId} ${label}`;
  let score = option.source === 'openrouter' ? 80 : 20;
  const inputModalities = option.inputModalities || [];
  const outputModalities = option.outputModalities || [];
  if (inputModalities.length && !inputModalities.includes('text')) score -= 700;
  if (outputModalities.length && !outputModalities.includes('text')) score -= 900;
  if (MODEL_NON_CHAT_PATTERN.test(haystack)) score -= 520;
  if (/preview|experimental|beta|alpha|deprecated/i.test(haystack)) score -= 30;
  if (/latest|stable/i.test(haystack)) score += 45;
  if (/pro|max|large|opus/i.test(haystack)) score += 34;
  if (/flash|mini|small|lite|instant/i.test(haystack)) score += 10;
  const patterns = MODEL_RECOMMEND_PATTERNS[provider] || [];
  patterns.forEach((pattern, index) => {
    if (haystack.includes(pattern.toLowerCase())) score += 900 - index * 70;
  });
  if (option.contextLength) score += Math.min(90, Math.log2(Number(option.contextLength || 0) + 1) * 5);
  if (option.created) score += Math.min(120, Number(option.created) / 100000000);
  return score;
}

function recommendedModelForProvider(provider) {
  const options = modelOptionsForProvider(provider);
  if (!options.length) return null;
  return [...options].sort((left, right) => modelRecommendationScore(right, provider) - modelRecommendationScore(left, provider))[0] || null;
}

function loadModelCatalogCache() {
  const cached = readJson(MODEL_CATALOG_CACHE_KEY, null);
  if (!cached || !Array.isArray(cached.models)) return;
  modelCatalog.models = cached.models;
  modelCatalog.updatedAt = cached.updatedAt || '';
  modelCatalog.message = cached.models.length ? `已载入缓存模型 ${cached.models.length} 个` : '';
}

async function syncModelCatalog() {
  modelCatalog.loading = true;
  modelCatalog.error = '';
  modelCatalog.message = '正在同步 OpenRouter 模型目录...';
  try {
    const response = await apiFetch(`/api/room/models/openrouter?_${Date.now()}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
    modelCatalog.models = Array.isArray(result.data?.models) ? result.data.models : [];
    modelCatalog.updatedAt = result.data?.updatedAt || new Date().toISOString();
    writeJson(MODEL_CATALOG_CACHE_KEY, {
      models: modelCatalog.models,
      updatedAt: modelCatalog.updatedAt
    });
    modelCatalog.message = `已同步 ${modelCatalog.models.length} 个模型；当前供应商匹配 ${syncedModelOptions.value.length} 个；最新推荐 ${recommendedModelOption.value ? syncedModelSelectValue(recommendedModelOption.value) : '暂无'}`;
    showToast('模型目录已同步');
  } catch (error) {
    modelCatalog.error = `模型目录同步失败：${error.message}`;
    modelCatalog.message = modelCatalog.error;
    showToast(`模型同步失败：${error.message}`, 'error');
  } finally {
    modelCatalog.loading = false;
  }
}

function applySyncedModel(option) {
  if (!option?.nativeId) return;
  llm.model = option.nativeId;
  if (option.source === 'openrouter' && llmProviderKey.value === 'openrouter') {
    llm.model = option.id;
  }
  showToast(`已选择模型：${llm.model}`);
}

function applyRecommendedModel() {
  const option = recommendedModelOption.value;
  if (!option) {
    showToast('暂无推荐模型，请先同步模型列表', 'error');
    return;
  }
  applySyncedModel(option);
}

function applyRecommendedModelForProvider(provider) {
  const option = recommendedModelForProvider(provider);
  if (!option || option.source !== 'openrouter') return false;
  llm.model = option.source === 'openrouter' && provider === 'openrouter' ? option.id : option.nativeId;
  showToast(`已应用最新模型：${llm.model}`);
  return true;
}

function applySyncedModelById(modelId) {
  const option = syncedModelOptions.value.find((item) => item.nativeId === modelId || item.id === modelId);
  applySyncedModel(option);
}

function syncedModelSelectValue(option) {
  return option.source === 'openrouter' && llmProviderKey.value === 'openrouter' ? option.id : option.nativeId;
}

function showToast(text, type = 'success') {
  toast.text = text;
  toast.type = type;
  toast.visible = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.visible = false;
  }, 3200);
}

function modelQualityLabel() {
  return '标准模型：移动端与桌面端使用同一套清晰度、帧率和物理效果';
}

async function copyOllamaRepairCommand() {
  const command = ollamaRepairCommand.value;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(command);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = command;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    showToast('Ollama 修复命令已复制');
  } catch (_) {
    showToast('复制失败，请手动复制测试窗口中的命令', 'error');
  }
}

function showModelSaveNotice() {
  modelSaveNotice.visible = true;
  modelSaveNotice.text = '模型设置已保存';
  modelSaveNotice.detail = `${modelQualityLabel()}。返回房间后生效。`;
  clearTimeout(modelNoticeTimer);
  modelNoticeTimer = setTimeout(() => {
    modelSaveNotice.visible = false;
  }, 6000);
}

function openTestDialog(target, status, title, message, detail = '') {
  if (!testDialog.visible && typeof document !== 'undefined') testDialogTrigger = document.activeElement;
  testDialog.visible = true;
  testDialog.target = target;
  testDialog.status = status;
  testDialog.title = title;
  testDialog.message = message;
  testDialog.detail = detail;
  nextTick(() => testDialogCard.value?.querySelector('button')?.focus());
}

function closeTestDialog() {
  testDialog.visible = false;
  testDialogTrigger?.focus?.({ preventScroll: true });
}

function handleTestDialogKey(event) {
  if (event.key === 'Escape') { event.preventDefault(); closeTestDialog(); return; }
  if (event.key !== 'Tab') return;
  const buttons = [...(testDialogCard.value?.querySelectorAll('button:not(:disabled)') || [])];
  const first = buttons[0], last = buttons[buttons.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

function testDialogTargetLabel(target = testDialog.target) {
  if (target === 'llm') return 'LLM';
  if (target === 'tts') return 'TTS';
  if (target === 'mcp') return 'MCP';
  if (target === 'live2d') return 'Live2D';
  return '连接测试';
}

function testStatusLabel(status) {
  return status === 'loading' ? '测试中' : status === 'success' ? '成功' : status === 'warning' ? '注意' : '失败';
}

function memoryAuthHeaders(extra = {}) {
  return authHeaders({ Accept: 'application/json', ...extra });
}

function memoryTypeLabel(type) {
  return memoryTypeOptions.find((item) => item.value === type)?.label || type || '未分类';
}

function syncLive2DDebugState(state = readRoomLive2DDebugState()) {
  live2dDebug.status = state.status || 'idle';
  live2dDebug.current = state.current || null;
  live2dDebug.normalized = state.normalized || null;
  live2dDebug.raw = state.raw || null;
  live2dDebug.history = Array.isArray(state.history) ? state.history : [];
  live2dDebug.activeIndex = Number(state.activeIndex || 0);
  live2dDebug.total = Number(state.total || 0);
  live2dDebug.updatedAt = Number(state.updatedAt || 0);
}

function live2DStatusLabel(status = live2dDebug.status) {
  if (status === 'queued') return '队列中';
  if (status === 'playing') return '执行中';
  if (status === 'pending') return '待回房间执行';
  return '空闲';
}

function formatDebugTime(value) {
  if (!value) return '暂无';
  return formatDateTime(value, 'zh-CN');
}

function onLive2DDebugEvent(event) {
  syncLive2DDebugState(event.detail || readRoomLive2DDebugState());
}

function refreshMemoryState() {
  storedUser.value = readStoredUser();
  loadMemoryCount();
  if (memory.managerOpen) loadVisibleMemories();
}

function onRoomMemoryUpdated(event) {
  if (memory.enabled === false) return;
  const action = String(event?.detail?.action || '');
  const memoryIds = Array.isArray(event?.detail?.memoryIds) ? event.detail.memoryIds.map(String) : [];
  const editingId = String(memory.editing?.id || '');
  if (editingId && (action === 'cleared' || (action === 'deleted' && memoryIds.includes(editingId)))) {
    memoryEditRequestId += 1;
    memory.editing = null;
    memoryEditingOriginal.value = '';
    memorySaveError.value = '';
    memory.expanded[editingId] = false;
  }
  clearTimeout(memoryRefreshTimer);
  memoryRefreshTimer = setTimeout(refreshMemoryState, 80);
}

function onRoomSettingsStorageEvent(event) {
  syncLive2DDebugState();
  if (event?.key === 'tsukuyomi_user' || event?.key === 'admin_user') {
    refreshRoomMemorySync();
    loadDiaryArchive();
  }
  if (event?.key === diaryArchiveKey() && !pendingSections.value.includes('diary')) loadDiaryArchive();
  if (event?.key === ROOM_MEMORY_UPDATED_KEY || event?.key === 'tsukuyomi_user' || event?.key === 'admin_user') {
    onRoomMemoryUpdated();
  }
}

function queueLive2DTest(intent, message = 'Live2D 测试指令已加入待执行队列，返回房间后会自动播放。') {
  const normalized = queueRoomLive2DForNextRoom(intent);
  syncLive2DDebugState();
  if (!normalized) {
    openTestDialog('live2d', 'error', 'Live2D 调试', '指令无效。', JSON.stringify(intent, null, 2));
    return;
  }
  openTestDialog('live2d', 'success', 'Live2D 调试', message, JSON.stringify(normalized, null, 2));
  showToast('Live2D 调试指令已准备');
}

function queueCustomLive2DTest() {
  queueLive2DTest({
    expression: live2dTest.expression,
    motion: live2dTest.motion || 'none',
    durationMs: live2dTest.durationMs,
    expressionMix: [{ expression: live2dTest.expression, weight: 1 }],
    intensity: 0.72
  });
}

function queuePresetLive2DSequence(name) {
  const presets = {
    greeting: {
      sequence: [
        { expression: 'smile', motion: 'tap_body', durationMs: 2600 },
        { expression: 'neutral', delayMs: 120, durationMs: 1800 }
      ]
    },
    shy: {
      sequence: [
        { expression: 'bsmile', durationMs: 3200 },
        { expression: 'smile', delayMs: 100, durationMs: 2200 },
        { expression: 'neutral', delayMs: 120, durationMs: 1600 }
      ]
    },
    tears: {
      sequence: [
        { expression: 'namida', durationMs: 2800 },
        { expression: 'tears', delayMs: 120, durationMs: 3200 },
        { expression: 'neutral', delayMs: 180, durationMs: 1800 }
      ]
    }
  };
  queueLive2DTest(presets[name], '动作队列已加入待执行队列，返回房间后会按顺序播放。');
}

function clearLive2DDebugQueue() {
  clearRoomLive2DQueue();
  syncLive2DDebugState();
  showToast('Live2D 队列已清空');
}

function normalizeChatUrl(apiUrl, modelName) {
  let url = normalizeLocalLLMUrl(apiUrl || 'https://api.moonshot.cn/v1/chat/completions');
  if (isOllamaApi(url)) return normalizeOllamaUrl(url);
  if (/(api\.openai\.com|api\.x\.ai)\/v1\/responses\/?$/i.test(url)) return url.replace(/\/$/, '');
  if (/(api\.openai\.com|api\.x\.ai)\/v1\/?$/i.test(url)) return url.replace(/\/$/, '') + '/responses';
  if (/minimaxi\.com\/anthropic|\/anthropic\/v1\/messages|MiniMax-M2/i.test(`${url} ${modelName || ''}`)) {
    return url.replace(/\/$/, '').replace(/\/anthropic$/, '/anthropic/v1/messages');
  }
  if (/anthropic/i.test(`${url} ${modelName || ''}`) && !/\/v1\/messages\/?$/.test(url)) {
    return url.replace(/\/$/, '') + '/v1/messages';
  }
  const needsChatPath = /deepseek|dashscope|aliyuncs|openai|openrouter|moonshot|minimax|minimaxi|bigmodel|zhipu|siliconflow|volces|ark|groq|mistral|together|perplexity|x\.ai|generativelanguage|xiaomimimo|token-plan-cn/i.test(`${url} ${modelName || ''}`)
    && !/\/chat\/completions\/?$/.test(url);
  if (needsChatPath) url = url.replace(/\/$/, '') + '/chat/completions';
  return url;
}

function pickChatReply(data) {
  if (data?.output_text) return String(data.output_text || '').trim();
  if (Array.isArray(data?.output)) {
    return data.output
      .flatMap(item => Array.isArray(item?.content) ? item.content : [])
      .filter(block => block?.type === 'output_text' || block?.type === 'text')
      .map(block => block.text || '')
      .join('\n')
      .trim();
  }
  if (Array.isArray(data?.content)) {
    return data.content.filter(block => block?.type === 'text').map(block => block.text || '').join('\n').trim();
  }
  return data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || data?.message?.content || data?.response || '';
}

function isOpenAIResponsesApi(apiUrl) {
  return /(api\.openai\.com|api\.x\.ai)\/v1\/responses\/?$/i.test(normalizeChatUrl(apiUrl || '', ''));
}

function isOpenRouterApi(apiUrl) {
  return /openrouter\.ai\/api\/v1\/chat\/completions\/?$/i.test(normalizeChatUrl(apiUrl || '', ''));
}

function isKimiChatTarget(apiUrl, modelName) {
  return /api\.moonshot\.cn|moonshot|kimi/i.test(`${apiUrl || ''} ${modelName || ''}`);
}

function chatTemperatureFor(apiUrl, modelName, fallback) {
  return isKimiChatTarget(apiUrl, modelName) ? 1 : fallback;
}

function openRouterHeaders(apiUrl) {
  if (!isOpenRouterApi(apiUrl)) return {};
  return {
    'HTTP-Referer': window.location.origin,
    'X-OpenRouter-Title': 'Tsukuyomi Space'
  };
}

function isMiniMaxAnthropic(apiUrl, modelName) {
  return /minimaxi\.com\/anthropic|\/anthropic\/v1\/messages|MiniMax-M2/i.test(`${apiUrl || ''} ${modelName || ''}`);
}

function isAnthropicChatApi(apiUrl, modelName) {
  return /api\.anthropic\.com|anthropic\.com\/v1\/messages|minimaxi\.com\/anthropic|\/anthropic\/v1\/messages|MiniMax-M2/i.test(`${apiUrl || ''} ${modelName || ''}`);
}

function makeChatRequestBody(modelName, messages, limit = 240, apiUrl = llm.apiUrl) {
  const defaultModel = /api\.moonshot\.cn|kimi/i.test(`${apiUrl || ''} ${modelName || ''}`) ? 'kimi-k2.6' : 'moonshot-v1-8k';
  if (isOllamaNativeApi(apiUrl)) {
    return {
      model: modelName || 'qwen2.5:7b',
      messages,
      stream: false,
      think: false,
      options: {
        temperature: chatTemperatureFor(apiUrl, modelName || 'qwen2.5:7b', 0.4),
        num_predict: limit
      }
    };
  }
  if (isOpenAIResponsesApi(apiUrl)) {
    const instructions = messages.filter(item => item.role === 'system').map(item => String(item.content || '')).join('\n\n');
    return {
      model: modelName || 'gpt-5.5',
      instructions: instructions || undefined,
      input: messages
        .filter(item => item.role !== 'system')
        .map(item => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: String(item.content || '') })),
      max_output_tokens: limit
    };
  }
  if (isAnthropicChatApi(apiUrl, modelName)) {
    const system = messages.filter(item => item.role === 'system').map(item => String(item.content || '')).join('\n\n');
    return {
      model: modelName || 'MiniMax-M2.7',
      system,
      messages: messages
        .filter(item => item.role !== 'system')
        .map(item => ({ role: item.role, content: String(item.content || '') })),
      max_tokens: limit,
      temperature: 1,
      stream: false
    };
  }
  const body = {
    model: modelName || defaultModel,
    messages,
    temperature: chatTemperatureFor(apiUrl, modelName || defaultModel, 0.4)
  };
  body.max_tokens = limit;
  return body;
}

function defaultTtsUrl(provider) {
  if (provider === 'openai' || provider === 'openai-compatible') return 'https://api.openai.com/v1/audio/speech';
  if (provider === 'elevenlabs') return 'https://api.elevenlabs.io/v1/text-to-speech';
  if (provider === 'minimax') return 'https://api.minimaxi.com/v1/t2a_v2';
  if (provider === 'gpt-sovits') return 'http://localhost:9880/tts';
  return 'https://api.xiaomimimo.com/v1/chat/completions';
}

function normalizeLocalGptSovitsUrl(url) {
  const parsed = new URL(url || defaultTtsUrl('gpt-sovits'));
  if (window.location.protocol === 'https:' && parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1') {
    parsed.hostname = 'localhost';
  }
  return parsed;
}

function buildGptSovitsControlUrl(settings, pathname, params) {
  const url = normalizeLocalGptSovitsUrl(settings.apiUrl || defaultTtsUrl('gpt-sovits'));
  url.pathname = pathname;
  url.search = '';
  Object.entries(params || {}).forEach(([key, value]) => {
    if (String(value || '').trim()) url.searchParams.set(key, String(value).trim());
  });
  url.searchParams.set('_', String(Date.now()));
  return url.toString();
}

function requestLocalGptSovitsControl(url, timeout = 70000) {
  return new Promise((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => resolve(false), timeout);
    const done = () => {
      window.clearTimeout(timer);
      resolve(true);
    };
    image.onload = done;
    image.onerror = done;
    image.src = url;
  });
}

async function ensureGptSovitsWeights(settings) {
  const gptWeightPath = settings.gptWeightPath || DEFAULT_GPT_SOVITS_GPT_WEIGHT;
  const sovitsWeightPath = settings.sovitsWeightPath || DEFAULT_GPT_SOVITS_SOVITS_WEIGHT;
  await requestLocalGptSovitsControl(buildGptSovitsControlUrl(settings, '/set_gpt_weights', { weights_path: gptWeightPath }));
  await requestLocalGptSovitsControl(buildGptSovitsControlUrl(settings, '/set_sovits_weights', { weights_path: sovitsWeightPath }));
}

function normalizeGptSovitsLang(value, fallback = 'zh') {
  const raw = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  const aliases = {
    cn: 'zh',
    'zh-cn': 'zh',
    'zh-hans': 'zh',
    chinese: 'zh',
    mandarin: 'zh',
    '中文': 'zh',
    '汉语': 'zh',
    '漢語': 'zh',
    jp: 'ja',
    jpn: 'ja',
    japanese: 'ja',
    '日语': 'ja',
    '日文': 'ja',
    '日本語': 'ja',
    english: 'en',
    '英语': 'en',
    '英文': 'en',
    cantonese: 'yue',
    '粤语': 'yue',
    '粵語': 'yue',
    korean: 'ko',
    '韩语': 'ko',
    '韓語': 'ko',
    '自动': 'auto'
  };
  const normalized = aliases[raw] || raw || fallback;
  return ['zh', 'ja', 'en', 'yue', 'ko', 'auto', 'all-zh', 'all-ja', 'all-yue', 'auto-yue'].includes(normalized)
    ? normalized.replace(/-/g, '_')
    : fallback;
}

function chatRequestHeaders(apiUrl, apiKey, modelName = llm.model) {
  const normalized = normalizeChatUrl(apiUrl, modelName);
  if (isOllamaApi(normalized)) return { 'Content-Type': 'application/json' };
  return {
    'Content-Type': 'application/json',
    ...openRouterHeaders(normalized),
    ...(isAnthropicChatApi(normalized, modelName)
      ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
      : { Authorization: `Bearer ${apiKey}` })
  };
}

function detectGptSovitsTextLang(text) {
  const value = String(text || '');
  if (/[\u3040-\u30ff]/u.test(value)) return 'ja';
  if (/[\uac00-\ud7af]/u.test(value)) return 'ko';
  if (/[\u4e00-\u9fff]/u.test(value)) return 'zh';
  return 'en';
}

function resolveGptSovitsTextLang(text, settings) {
  const configured = normalizeGptSovitsLang(settings.textLang || settings.model, 'auto');
  return configured === 'auto' ? detectGptSovitsTextLang(text) : configured;
}

function normalizeGptSovitsRefAudioPath(value) {
  return String(value || '').trim();
}

function gptSovitsPathWarning(path) {
  return /[^\x00-\x7F]/.test(String(path || ''))
    ? '参考音频路径保留原样；请确认它在运行 GPT-SoVITS 的设备上真实存在。'
    : '';
}

function gptSovitsTestText(settings) {
  const promptLang = normalizeGptSovitsLang(settings.promptLang, 'ja');
  const textLang = normalizeGptSovitsLang(settings.textLang || settings.model, 'auto');
  const lang = textLang === 'auto' ? promptLang : textLang;
  if (lang === 'ja') return 'こんにちは、月見八千代です。今夜の月明かりも、とても優しいですね。';
  if (lang === 'en') return 'Hello, I am Tsukimi Yachiyo. The moonlight feels gentle tonight.';
  if (lang === 'ko') return '안녕하세요, 저는 츠키미 야치요입니다. 오늘 밤 달빛도 참 부드럽네요.';
  return '你好，我是八千代辉夜姬。今晚的月光，也很温柔。';
}

function openMemoryDb() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MEMORY_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(MEMORY_STORE)
        ? request.transaction.objectStore(MEMORY_STORE)
        : db.createObjectStore(MEMORY_STORE, { keyPath: 'id' });
      if (!store.indexNames.contains('userKey')) store.createIndex('userKey', 'userKey', { unique: false });
      if (!store.indexNames.contains('createdAt')) store.createIndex('createdAt', 'createdAt', { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function txToPromise(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
  });
}

async function loadMemoryCount() {
  try {
    if (canUseServerMemory.value) {
      const response = await authFetch(noStoreUrl('/api/room/memory/status'), {
        headers: memoryAuthHeaders(),
        cache: 'no-store'
      });
      const result = await parseResponse(response);
      if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
      memoryCount.value = result.data?.count || 0;
      memoryContentLimit.value = Number(result.data?.maxContentLength) || 12000;
      memoryVector.backend = result.data?.vectorStore?.backend || '';
      memoryVector.enabled = Boolean(result.data?.vectorStore?.enabled);
      memoryVector.pending = Number(result.data?.vectorSync?.pending || 0);
      memoryVector.failed = Number(result.data?.vectorSync?.failed || 0);
      memoryVector.embedding = result.data?.embedding?.activeModel || '';
      memoryVector.mem0 = result.data?.mem0 || null;
      return;
    }
    Object.assign(memoryVector, { backend: '', enabled: false, pending: 0, failed: 0, embedding: '', mem0: null });
    const db = await openMemoryDb();
    if (!db) return;
    const tx = db.transaction(MEMORY_STORE, 'readonly');
    const index = tx.objectStore(MEMORY_STORE).index('userKey');
    const records = await requestToPromise(index.getAll(IDBKeyRange.only(visitorKey.value)));
    memoryCount.value = records.length;
  } catch (_) {
    memoryCount.value = 0;
  }
}

async function loadServerMemories({ append = false } = {}) {
  storedUser.value = readStoredUser();
  if (!canUseServerMemory.value) {
    memoryList.value = [];
    return;
  }
  if (append && (memoryLoading.value || !memoryHasMore.value)) return;
  const requestId = ++memoryListRequestId;
  memoryLoading.value = true;
  memoryError.value = '';
  try {
    const params = new URLSearchParams({
      view: 'manage',
      limit: String(MEMORY_PAGE_SIZE),
      offset: String(append ? memoryList.value.length : 0)
    });
    if (memory.query.trim()) params.set('q', memory.query.trim());
    if (memory.type) params.set('type', memory.type);
    const response = await authFetch(noStoreUrl(`/api/room/memory?${params}`), {
      headers: memoryAuthHeaders(),
      cache: 'no-store'
    });
    const result = await parseResponse(response);
    if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
    if (requestId !== memoryListRequestId) return;
    const page = Array.isArray(result.data?.items) ? result.data.items : [];
    memoryList.value = append ? [...memoryList.value, ...page] : page;
    memoryFilteredTotal.value = Number(result.data?.total) || 0;
    memoryHasMore.value = Boolean(result.data?.hasMore);
  } catch (error) {
    if (requestId !== memoryListRequestId) return;
    if (!append) {
      memoryList.value = [];
      memoryFilteredTotal.value = 0;
      memoryHasMore.value = false;
    }
    memoryError.value = error.message || '读取记忆失败';
    showToast(`读取记忆失败：${error.message}`, 'error');
  } finally {
    if (requestId === memoryListRequestId) memoryLoading.value = false;
  }
}

function buildGptSovitsAudioUrl(text, settings) {
  const url = normalizeLocalGptSovitsUrl(settings.apiUrl || defaultTtsUrl(settings.provider));
  url.searchParams.set('text', String(text));
  url.searchParams.set('text_lang', resolveGptSovitsTextLang(text, settings));
  url.searchParams.set('ref_audio_path', normalizeGptSovitsRefAudioPath(settings.refAudioPath || settings.voice));
  url.searchParams.set('prompt_text', settings.promptText || '');
  url.searchParams.set('prompt_lang', normalizeGptSovitsLang(settings.promptLang, 'ja'));
  url.searchParams.set('text_split_method', 'cut5');
  url.searchParams.set('batch_size', '1');
  url.searchParams.set('media_type', 'wav');
  url.searchParams.set('streaming_mode', 'false');
  url.searchParams.set('parallel_infer', 'true');
  return url.toString();
}

async function loadLocalMemories({ append = false } = {}) {
  if (append && (memoryLoading.value || !memoryHasMore.value)) return;
  const requestId = ++memoryListRequestId;
  memoryLoading.value = true;
  memoryError.value = '';
  try {
    const db = await openMemoryDb();
    if (!db) {
      memoryList.value = [];
      memoryCount.value = 0;
      memoryFilteredTotal.value = 0;
      memoryHasMore.value = false;
      return;
    }
    const tx = db.transaction(MEMORY_STORE, 'readonly');
    const index = tx.objectStore(MEMORY_STORE).index('userKey');
    const records = await requestToPromise(index.getAll(IDBKeyRange.only(visitorKey.value)));
    const query = memory.query.trim().toLowerCase();
    const type = memory.type.trim();
    const filtered = records
      .filter((item) => !type || item.type === type)
      .filter((item) => {
        if (!query) return true;
        return `${item.summary || ''}\n${item.content || ''}\n${item.visitorName || ''}`.toLowerCase().includes(query);
      })
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    if (requestId !== memoryListRequestId) return;
    const offset = append ? memoryList.value.length : 0;
    const page = filtered.slice(offset, offset + MEMORY_PAGE_SIZE)
      .map((item) => ({
        ...item,
        type: item.type || 'conversation',
        importance: Number(item.importance ?? 0.5),
        confidence: Number(item.confidence ?? 0.8),
        tags: Array.isArray(item.tags) ? item.tags : []
      }));
    memoryList.value = append ? [...memoryList.value, ...page] : page;
    memoryCount.value = records.length;
    memoryFilteredTotal.value = filtered.length;
    memoryHasMore.value = offset + page.length < filtered.length;
  } catch (error) {
    if (requestId !== memoryListRequestId) return;
    if (!append) {
      memoryList.value = [];
      memoryFilteredTotal.value = 0;
      memoryHasMore.value = false;
    }
    memoryError.value = error.message || '读取本地记忆失败';
    showToast(`读取本地记忆失败：${error.message}`, 'error');
  } finally {
    if (requestId === memoryListRequestId) memoryLoading.value = false;
  }
}

async function loadVisibleMemories(options = {}) {
  storedUser.value = readStoredUser();
  if (canUseServerMemory.value) return loadServerMemories(options);
  return loadLocalMemories(options);
}

function loadMoreMemories() {
  return loadVisibleMemories({ append: true });
}

function loadSettings() {
  storedUser.value = readStoredUser();
  loadModelCatalogCache();
  const modelSettings = readJson('roomModelSettings', {});
  model.scale = Math.round(Number(modelSettings.scale || 1) * 100);
  model.xOffset = Number(modelSettings.xOffset || 0);
  model.yOffset = Number(modelSettings.yOffset || 0);

  Object.assign(llm, { apiUrl: '', apiKey: '', model: '', useProxy: false, visionMode: 'auto', systemPrompt: '', ...readJson('roomLLMSettings', {}) });
  if (isOllamaApi(llm.apiUrl)) {
    llm.apiUrl = normalizeOllamaUrl(llm.apiUrl);
    llm.useProxy = false;
    if (!llm.model) llm.model = 'qwen2.5:7b';
  }
  Object.assign(tts, { ...initialTtsSettings, ...readJson('roomTTSSettings', {}) });
  if (tts.provider === 'gpt-sovits') {
    tts.useProxy = false;
    if (!tts.apiUrl) tts.apiUrl = defaultTtsUrl('gpt-sovits');
  }
  if (tts.provider === 'minimax') {
    if (!tts.apiUrl || /api\.minimax\.chat/.test(tts.apiUrl)) tts.apiUrl = defaultTtsUrl('minimax');
    if (!tts.model) tts.model = 'speech-2.8-hd';
    if (!tts.voice || LEGACY_MINIMAX_DEFAULT_VOICE_IDS.includes(tts.voice)) tts.voice = MINIMAX_DEFAULT_VOICE_ID;
    if (!tts.textLang) tts.textLang = 'ja';
  }
  Object.assign(memory, { enabled: true, ...readJson('roomMemorySettings', {}) });
  Object.assign(knowledge, normalizeRoomKnowledge(readJson('roomKnowledgeSettings', null)));
  knowledge.editingId = null;
  knowledge.draft = { title: '', content: '', tags: '', enabled: true };
  Object.assign(mcp, { ...initialMcpSettings, ...readJson('roomMCPSettings', {}) });
  if (!Array.isArray(mcp.tools)) mcp.tools = [];
  setupLlmMode.value = isOllamaApi(llm.apiUrl) ? 'ollama' : 'cloud';
  const activePreset = BEGINNER_LLM_PROVIDERS.find(({ value }) => {
    const preset = LLM_PRESETS[value];
    return preset && detectLLMProvider(preset.apiUrl, preset.model) === llmProviderKey.value;
  });
  if (activePreset) setupCloudProvider.value = activePreset.value;
  loadDiaryArchive();
  settingsSections.forEach(rememberSaved);
  loadMemoryCount();
  if (memory.managerOpen) loadVisibleMemories();
}

function loadDiaryArchive() {
  const archive = readDiaryArchive();
  const persona = activePersonaPrompt(archive);
  const entries = archive.data.diary || [];
  diary.entryCount = entries.length;
  diary.personaName = persona.data.name || '';
  diary.affection = Number(archive.data.gameData.characterStats.affection) || 0;
  diary.slotId = Number(archive.slotId) || 1;
  const latest = entries[entries.length - 1];
  diary.lastDiaryAt = latest ? `${latest.date} ${latest.time}` : '';
  diary.persona = {
    name: persona.data.name || '',
    description: persona.data.description || '',
    personality: persona.data.personality || '',
    scenario: persona.data.scenario || '',
    creatorNotes: persona.data.creator_notes || '',
    tags: Array.isArray(persona.data.tags) ? persona.data.tags.join('、') : ''
  };
  rememberSaved('diary');
}

async function syncDiarySettings() {
  try {
    await syncDiaryArchive();
    if (!pendingSections.value.includes('diary')) loadDiaryArchive();
  } catch (error) {
    diarySyncStatus.value = `同步失败：${error.message}。本机存档仍保留，请稍后重试。`;
  }
}

function onDiarySyncUpdated(event) {
  diarySyncStatus.value = String(event?.detail?.message || '');
}

function onDiaryVisibilityChange() {
  if (document.visibilityState === 'visible') void syncDiarySettings();
}

function saveDiaryPersona() {
  if (!String(diary.persona.name || '').trim()) {
    showToast('请填写日记角色名', 'error');
    return false;
  }
  try {
    updatePersonaPrompt({
      data: {
        name: String(diary.persona.name || '').trim(),
        description: diary.persona.description,
        personality: diary.persona.personality,
        scenario: diary.persona.scenario,
        creator_notes: diary.persona.creatorNotes,
        tags: String(diary.persona.tags || '').split(/[、,，\s]+/).map((item) => item.trim()).filter(Boolean)
      }
    });
    loadDiaryArchive();
    showToast('日记人设已保存，仅用于写日记，不会改变聊天角色');
    void syncDiarySettings();
    return true;
  } catch (error) {
    showToast('日记人设保存失败，请检查浏览器存储后重试', 'error');
    return false;
  }
}

function exportDiaryArchiveFile() {
  try {
    const name = downloadDiaryArchive();
    showToast(`已导出存档：${name}`);
  } catch (error) {
    showToast(`导出失败：${error.message}`, 'error');
  }
}

function pickDiaryFile() {
  diaryFileInput.value?.click();
}

async function onDiaryImportFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  const owner = diaryArchiveKey();
  try {
    const text = await file.text();
    if (owner !== diaryArchiveKey()) throw new Error('账号已切换，请重新选择存档');
    const archive = importDiaryArchive(text);
    loadDiaryArchive();
    showToast(`已导入 ${archive.data.diary.length} 篇日记，角色：${diary.personaName || '未命名'}。聊天设置保持不变。`);
    void syncDiarySettings();
  } catch (error) {
    showToast(`导入失败：${error.message}`, 'error');
  }
}

async function copyDiaryArchivePreview() {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(serializeDiaryArchive());
    showToast('存档 JSON 已复制');
  } catch (_) {
    showToast('复制失败，请改用导出存档 JSON', 'error');
  }
}

function resetDiaryArchiveData() {
  if (!window.confirm('确定要清空当前账号的人设与日记存档吗？已同步的日记也会从其他设备删除。该操作不可撤销。')) return;
  try {
    clearDiaryArchive();
    loadDiaryArchive();
    showToast('本机存档已清空，正在同步到账号');
    void syncDiarySettings();
  } catch (_) { showToast('清空失败，请检查浏览器存储后重试', 'error'); }
}

function applyMcpProvider(provider) {  mcp.provider = provider;
  if (provider === 'minimax-global') {
    mcp.enabled = true;
    mcp.authHeader = 'Authorization';
    mcp.apiHost = 'https://api.minimaxi.chat';
    mcp.resourceMode = 'url';
    mcp.toolAllowlist = mcp.toolAllowlist || MINIMAX_MCP_TOOLS;
    showToast('已应用 MiniMax Global MCP 预设，请填写你的 MCP REST 端点和 MiniMax API Key');
  } else if (provider === 'minimax-mainland') {
    mcp.enabled = true;
    mcp.authHeader = 'Authorization';
    mcp.apiHost = 'https://api.minimax.chat';
    mcp.resourceMode = 'url';
    mcp.toolAllowlist = mcp.toolAllowlist || MINIMAX_MCP_TOOLS;
    showToast('已应用 MiniMax Mainland MCP 预设，请填写你的 MCP REST 端点和 MiniMax API Key');
  } else if (provider === 'minimax-token-plan') {
    mcp.enabled = true;
    mcp.authHeader = 'Authorization';
    mcp.endpoint = '/api/mcp/token-plan';
    mcp.apiHost = 'https://api.minimaxi.com';
    mcp.resourceMode = 'url';
    mcp.toolAllowlist = MINIMAX_TOKEN_PLAN_TOOLS;
    showToast('已应用 MiniMax Token Plan MCP 站内桥接预设');
  }
}

function saveModel() {
  if (!persistSettings('roomModelSettings', {
    ...readJson('roomModelSettings', {}),
    scale: Number(model.scale || 100) / 100,
    xOffset: Number(model.xOffset || 0),
    yOffset: Number(model.yOffset || 0)
  }, '模型设置')) return false;
  rememberSaved('model');
  showModelSaveNotice();
  showToast(`模型设置已保存：${modelQualityLabel()}，回到房间后生效`);
  return true;
}

function resetModel() {
  model.scale = 100;
  model.xOffset = 0;
  model.yOffset = 0;
  saveModel();
}

function chooseSetupLlmMode(mode) {
  setupLlmMode.value = mode;
  if (mode === 'ollama') {
    applyPreset('ollama');
    return;
  }
  if (isOllamaApi(llm.apiUrl) || !llm.apiUrl) applySetupCloudProvider(setupCloudProvider.value);
}

function applySetupCloudProvider(provider) {
  setupCloudProvider.value = provider;
  applyPreset(provider);
}

function applyAdvancedLlmPreset(value) {
  const [group, name] = String(value || '').split(':');
  if (!name) return;
  if (group === 'aliyun') applyAliyunPreset(name);
  else if (group === 'mimo') applyMimoPreset(name);
  else applyPreset(name);
  setupLlmMode.value = isOllamaApi(llm.apiUrl) ? 'ollama' : 'cloud';
}

function applySetupTtsProvider(provider) {
  applyTtsPreset(provider);
  tts.enabled = true;
}

function resetPanels() {
  localStorage.removeItem('roomPanelPositions');
  showToast('房间浮窗位置已重置');
}

function applyPreset(name) {
  const preset = LLM_PRESETS[name];
  if (!preset) return;
  llm.apiUrl = preset.apiUrl;
  llm.model = preset.model;
  if ('apiKey' in preset) llm.apiKey = preset.apiKey;
  if ('useProxy' in preset) llm.useProxy = Boolean(preset.useProxy);
  applyRecommendedModelForProvider(detectLLMProvider(preset.apiUrl, preset.model));
}

function applyAliyunPreset(name) {
  const preset = ALIYUN_LLM_PRESETS[name];
  if (!preset) return;
  llm.apiUrl = preset.apiUrl;
  llm.model = preset.model;
  applyRecommendedModelForProvider('aliyun');
}

function applyMimoPreset(name) {
  const preset = MIMO_LLM_PRESETS[name];
  if (!preset) return;
  llm.apiUrl = preset.apiUrl;
  llm.model = preset.model;
}

function applyTtsPreset(name) {
  const preset = TTS_PRESETS[name];
  if (!preset) return;
  tts.provider = preset.provider;
  tts.apiUrl = preset.apiUrl;
  tts.model = preset.model;
  tts.voice = preset.voice;
  if ('useProxy' in preset) tts.useProxy = Boolean(preset.useProxy);
  if ('textLang' in preset) tts.textLang = preset.textLang;
  if ('promptLang' in preset) tts.promptLang = preset.promptLang;
  if ('gptWeightPath' in preset) tts.gptWeightPath = preset.gptWeightPath;
  if ('sovitsWeightPath' in preset) tts.sovitsWeightPath = preset.sovitsWeightPath;
  if (tts.provider === 'gpt-sovits') tts.useProxy = false;
}

function normalizedLLMSettings() {
  const apiUrl = isOllamaApi(llm.apiUrl)
    ? normalizeOllamaUrl(llm.apiUrl)
    : String(llm.apiUrl || '').trim();
  const modelName = String(llm.model || '').trim() || (isOllamaApi(apiUrl) ? 'qwen2.5:7b' : '');
  const needsApiKey = llmNeedsApiKey(apiUrl);
  return {
    apiUrl,
    apiKey: needsApiKey ? String(llm.apiKey || '').trim() : '',
    model: modelName,
    useProxy: needsApiKey ? Boolean(llm.useProxy) : false,
    visionMode: ['auto', 'llm', 'mcp'].includes(llm.visionMode) ? llm.visionMode : 'auto',
    systemPrompt: String(llm.systemPrompt || '').trim(),
    needsApiKey
  };
}

function saveLLM(showDialog = true) {
  const settings = normalizedLLMSettings();
  try {
    const endpoint = new URL(settings.apiUrl);
    if (!['http:', 'https:'].includes(endpoint.protocol) || !settings.model) throw new Error();
  } catch (_) {
    showToast('请填写有效的 HTTP(S) API 端点和模型名称', 'error');
    return false;
  }
  llm.apiUrl = settings.apiUrl;
  llm.model = settings.model;
  llm.useProxy = settings.useProxy;
  if (!settings.needsApiKey) llm.apiKey = '';
  if (!persistSettings('roomLLMSettings', {
    ...readJson('roomLLMSettings', {}),
    apiUrl: settings.apiUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    useProxy: settings.useProxy,
    visionMode: settings.visionMode,
    systemPrompt: settings.systemPrompt
  }, 'LLM 设置')) return false;
  rememberSaved('llm');
  const ready = !settings.needsApiKey || Boolean(settings.apiKey);
  if (showDialog) {
    openTestDialog(
      'llm',
      ready ? 'success' : 'warning',
      'LLM 设置已保存',
      ready ? (settings.needsApiKey ? 'LLM API 设置已保存到当前浏览器。' : 'Ollama 本机设置已保存，无需 API Key。') : 'LLM API 设置已保存，但还没有填写 API Key。',
      `端点：${settings.apiUrl || '未填写'}\n模型：${settings.model || '未填写'}\n请求方式：${settings.useProxy ? '服务器受限代理' : '浏览器直连'}\n图片理解策略：${settings.visionMode || 'auto'}`
    );
  }
  showToast('LLM API 设置已保存');
  return true;
}

async function testLLM() {
  if (connectionCheck.status === 'loading') return;
  const settings = normalizedLLMSettings();
  connectionCheck.snapshot = sectionSnapshot('llm');
  connectionCheck.status = 'error';
  try {
    if (!['http:', 'https:'].includes(new URL(settings.apiUrl).protocol) || !settings.model) throw new Error();
  } catch (_) {
    openTestDialog('llm', 'error', 'LLM 连接测试', '请填写有效的 API 端点和模型名称。');
    return;
  }
  if (settings.needsApiKey && !settings.apiKey) {
    openTestDialog('llm', 'error', 'LLM 连接测试', '请先填写 LLM API Key。', 'API Key 只保存在当前浏览器，用于直接请求你选择的模型供应商。');
    showToast('请先填写 LLM API Key', 'error');
    return;
  }
  const requestUrl = settings.useProxy ? apiUrl('/api/chat') : normalizeChatUrl(settings.apiUrl, settings.model);
  const requestFetch = settings.useProxy
    ? (options) => apiFetch('/api/chat', options)
    : (options) => fetchWithLocalOllamaGuidance(requestUrl, options);
  openTestDialog('llm', 'loading', 'LLM 连接测试', settings.useProxy ? '正在通过站内受限代理请求模型供应商...' : '正在请求模型供应商...', `${requestUrl}\n模型：${settings.model || '未填写'}`);
  connectionCheck.status = 'loading';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await requestFetch({
      method: 'POST',
      signal: controller.signal,
      headers: settings.useProxy ? { 'Content-Type': 'application/json' } : chatRequestHeaders(settings.apiUrl, settings.apiKey, settings.model),
      body: JSON.stringify(settings.useProxy
        ? { message: '请用一句话回复连接测试。', apiKey: settings.apiKey, apiUrl: settings.apiUrl, model: settings.model }
        : makeChatRequestBody(settings.model, [{ role: 'user', content: '请用一句话回复连接测试。' }], 120, settings.apiUrl))
    });
    const raw = await response.json().catch(() => ({}));
    const data = settings.useProxy ? raw.data || raw : raw;
    if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
    const reply = pickChatReply(data);
    connectionCheck.status = reply ? 'success' : 'warning';
    openTestDialog(
      'llm',
      reply ? 'success' : 'warning',
      'LLM 连接测试',
      reply ? '连接成功，模型已返回文本。' : '连接成功，但没有解析到文本内容。',
      reply ? `模型：${data.model || settings.model || '未知'}\n回复：${reply.slice(0, 300)}` : JSON.stringify(data).slice(0, 500)
    );
    showToast(reply ? 'LLM 连接测试成功' : 'LLM 已响应，但未返回文本', reply ? 'success' : 'error');
  } catch (error) {
    connectionCheck.status = 'error';
    const corsHint = settings.needsApiKey
      ? '如果浏览器控制台显示 CORS，说明该供应商不允许浏览器直连，需要改用受限后端桥接。'
      : `请允许浏览器访问本地网络。Windows PowerShell 运行：\n${ollamaRepairCommand.value}\n\n然后从任务栏完全退出并重新打开 Ollama。`;
    openTestDialog('llm', 'error', 'LLM 连接测试', '连接失败。', `${error.message}\n\n${corsHint}`);
    showToast(`LLM 测试失败：${error.message}`, 'error');
  } finally {
    clearTimeout(timeout);
  }
}

function saveTTS(showDialog = true) {
  const shouldShowDialog = showDialog !== false;
  if (tts.enabled) {
    try {
      const endpoint = new URL(String(tts.apiUrl || defaultTtsUrl(tts.provider)).trim());
      if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error();
      tts.apiUrl = endpoint.href;
    } catch (_) {
      showToast('请填写有效的 HTTP(S) 语音端点，或关闭语音', 'error');
      return false;
    }
  }
  if (tts.provider === 'gpt-sovits') {
    tts.textLang = normalizeGptSovitsLang(tts.textLang || tts.model, 'auto');
    tts.promptLang = normalizeGptSovitsLang(tts.promptLang, 'ja');
    tts.model = tts.textLang;
    tts.refAudioPath = normalizeGptSovitsRefAudioPath(tts.refAudioPath || tts.voice);
    tts.gptWeightPath = String(tts.gptWeightPath || DEFAULT_GPT_SOVITS_GPT_WEIGHT).trim();
    tts.sovitsWeightPath = String(tts.sovitsWeightPath || DEFAULT_GPT_SOVITS_SOVITS_WEIGHT).trim();
    tts.useProxy = false;
  }
  if (tts.provider === 'minimax') {
    tts.textLang = normalizeGptSovitsLang(tts.textLang || 'ja', 'ja');
    tts.model = String(tts.model || 'speech-2.8-hd').trim();
    tts.voice = String(tts.voice || MINIMAX_DEFAULT_VOICE_ID).trim();
  }
  const hasTtsLanguageSelect = tts.provider === 'gpt-sovits' || tts.provider === 'minimax';
  const settings = {
    enabled: Boolean(tts.enabled),
    provider: tts.provider || 'mimo',
    apiUrl: String(tts.apiUrl || '').trim(),
    apiKey: String(tts.apiKey || '').trim(),
    model: String(tts.model || '').trim(),
    voice: String(tts.voice || '').trim(),
    refAudioPath: String(tts.refAudioPath || '').trim(),
    promptText: String(tts.promptText || '').trim(),
    textLang: hasTtsLanguageSelect ? normalizeGptSovitsLang(tts.textLang, tts.provider === 'minimax' ? 'ja' : 'auto') : String(tts.textLang || '').trim(),
    promptLang: tts.provider === 'gpt-sovits' ? normalizeGptSovitsLang(tts.promptLang, 'ja') : String(tts.promptLang || '').trim(),
    gptWeightPath: String(tts.gptWeightPath || '').trim(),
    sovitsWeightPath: String(tts.sovitsWeightPath || '').trim(),
    useProxy: tts.provider === 'gpt-sovits' ? false : Boolean(tts.useProxy)
  };
  try {
    writeJson('roomTTSSettings', settings);
  } catch (error) {
    const message = `TTS 设置保存失败：${error.message || '浏览器存储不可用'}`;
    if (shouldShowDialog) openTestDialog('tts', 'error', 'TTS 设置保存失败', message);
    showToast(message, 'error');
    return false;
  }
  const localGptSovits = tts.provider === 'gpt-sovits';
  if (shouldShowDialog) {
    openTestDialog(
      'tts',
      tts.enabled && (tts.apiKey || localGptSovits) ? 'success' : 'warning',
      'TTS 设置已保存',
      tts.enabled
        ? (tts.apiKey || localGptSovits ? 'TTS 语音设置已保存到当前浏览器。' : 'TTS 已启用并保存，但还没有填写 API Key。')
        : 'TTS 设置已保存，当前未启用语音合成。',
      `Provider：${tts.provider || 'mimo'}\n端点：${String(tts.apiUrl || '').trim() || defaultTtsUrl(tts.provider)}\n模型/语言：${String(tts.model || tts.textLang || '').trim() || '未填写'}\n音色/参考音频：${String(tts.voice || tts.refAudioPath || '').trim() || '未填写'}\n请求方式：${tts.useProxy ? '服务器受限代理' : '浏览器直连'}${gptSovitsPathWarning(tts.refAudioPath) ? `\n提示：${gptSovitsPathWarning(tts.refAudioPath)}` : ''}`
    );
  }
  rememberSaved('tts');
  showToast('TTS 设置已保存');
  return true;
}

async function testTTS() {
  if (!saveTTS()) return;
  if (tts.provider !== 'gpt-sovits' && !tts.apiKey) {
    openTestDialog('tts', 'error', 'TTS 语音测试', '请先填写 TTS API Key。', 'API Key 只保存在当前浏览器，用于直接请求你选择的语音供应商。');
    showToast('请先填写 TTS API Key', 'error');
    return;
  }
  releaseAsyncAudioPlayback(ttsTestPlayback);
  const audioPlayback = primeAsyncAudioPlayback();
  ttsTestPlayback = audioPlayback;
  let objectUrl = '';
  const testText = tts.provider === 'gpt-sovits' || tts.provider === 'minimax'
    ? gptSovitsTestText(tts)
    : '你好，我是八千代辉夜姬。今晚的月光，也很温柔。';
  openTestDialog('tts', 'loading', 'TTS 语音测试', tts.useProxy ? '正在通过站内受限代理请求语音供应商...' : '正在请求语音供应商...', `${tts.useProxy ? apiUrl('/api/tts') : (tts.apiUrl || defaultTtsUrl(tts.provider))}\nProvider：${tts.provider || 'mimo'}\n模型/语言：${tts.model || tts.textLang || '未填写'}\n音色/参考音频：${tts.voice || tts.refAudioPath || '未填写'}\n测试文本：${testText}`);
  try {
    if (tts.provider === 'gpt-sovits' && !tts.useProxy) {
      await ensureGptSovitsWeights(tts);
      const audioUrl = buildGptSovitsAudioUrl(testText, tts);
      const audio = await prepareAsyncAudioSource(audioPlayback, audioUrl);
      await audio.play();
      openTestDialog('tts', 'success', 'TTS 语音测试', '已直接请求本机 GPT-SoVITS 9880 端口并开始播放。', audioUrl);
      showToast('TTS 测试成功');
      return;
    }
    const blob = await requestTtsAudioBlob(testText, {
      ...tts,
      textLang: normalizeGptSovitsLang(tts.textLang, tts.provider === 'minimax' ? 'ja' : 'auto'),
      promptLang: normalizeGptSovitsLang(tts.promptLang, 'ja')
    }, {
      fetchDirect: fetch,
      fetchProxy: apiFetch
    });
    objectUrl = URL.createObjectURL(blob);
    const audio = await prepareAsyncAudioSource(audioPlayback, objectUrl);
    audio.addEventListener('ended', () => URL.revokeObjectURL(objectUrl), { once: true });
    await audio.play();
    openTestDialog('tts', 'success', 'TTS 语音测试', '连接成功，已开始播放测试语音。', `音频类型：${blob.type || '未知'}\n大小：${blob.size} bytes`);
    showToast('TTS 测试成功');
  } catch (error) {
    releaseAsyncAudioPlayback(audioPlayback);
    if (ttsTestPlayback === audioPlayback) ttsTestPlayback = null;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const message = describeAudioPlaybackError(error);
    openTestDialog('tts', 'error', 'TTS 语音测试', '测试失败。', `${message}\n\n如果浏览器控制台显示 CORS，说明该供应商不允许浏览器直连，需要改用受限后端桥接。`);
    showToast(`TTS 测试失败：${message}`, 'error');
  }
}

function saveMemory() {
  if (!persistSettings('roomMemorySettings', { enabled: Boolean(memory.enabled) }, '记忆设置')) return false;
  rememberSaved('memory');
  loadMemoryCount();
  showToast(memory.enabled ? '长期记忆已开启' : '长期记忆已关闭');
  return true;
}

async function syncMemoryVectors() {
  if (!canUseServerMemory.value) {
    showToast('登录后才能同步账号私有向量记忆', 'error');
    return;
  }
  try {
    const response = await authFetch('/api/room/memory/vector-sync', {
      method: 'POST',
      headers: memoryAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ limit: 500 })
    });
    const result = await parseResponse(response);
    if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
    await loadMemoryCount();
    showToast(result.message || '向量记忆已同步');
  } catch (error) {
    showToast(`向量同步失败：${error.message}`, 'error');
  }
}

function persistKnowledge(entries, enabled = knowledge.enabled) {
  const next = entries.map(cloneKnowledgeEntry).filter(item => item.title || item.content);
  if (!persistSettings('roomKnowledgeSettings', { enabled: Boolean(enabled), entries: next }, '角色知识库')) return false;
  knowledge.enabled = Boolean(enabled);
  knowledge.entries = next;
  rememberSaved('knowledge');
  return true;
}

function saveKnowledge(showMessage = true) {
  try {
    const entries = applyKnowledgeDraft(knowledge.entries, knowledge.draft, knowledge.editingId);
    if (!persistKnowledge(entries)) return false;
    resetKnowledgeDraft();
    if (showMessage) showToast('角色知识库已保存，下一次对话生效');
    return true;
  } catch (error) {
    showToast(error.message, 'error');
    return false;
  }
}

function toggleKnowledgeManager() {
  knowledge.managerOpen = !knowledge.managerOpen;
}

function resetKnowledgeDraft() {
  knowledge.editingId = null;
  knowledge.draft = { title: '', content: '', tags: '', enabled: true };
}

async function editKnowledgeEntry(item) {
  knowledge.editingId = item.id;
  knowledge.draft = cloneKnowledgeEntry(item);
  knowledge.managerOpen = true;
  await nextTick();
  knowledgeEditor.value?.scrollIntoView({
    behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'center'
  });
  knowledgeTitleInput.value?.focus({ preventScroll: true });
}

function saveKnowledgeEntry() {
  if (!String(knowledge.draft.title || '').trim() || !String(knowledge.draft.content || '').trim()) {
    showToast('请填写知识条目的标题和内容', 'error');
    return false;
  }
  const editing = Boolean(knowledge.editingId);
  if (!saveKnowledge(false)) return false;
  showToast(editing ? '知识条目已更新' : '知识条目已添加');
  return true;
}

function deleteKnowledgeEntry(item) {
  if (!confirm(`确定删除知识条目“${item.title}”吗？`)) return;
  if (!persistKnowledge(knowledge.entries.filter(entry => entry.id !== item.id))) return;
  if (knowledge.editingId === item.id) resetKnowledgeDraft();
  showToast('知识条目已删除');
}

function resetKnowledgeDefaults() {
  if (!confirm('确定恢复默认八千代知识库吗？这会覆盖当前知识条目。')) return;
  if (!persistKnowledge(defaultKnowledgeEntries(), true)) return;
  resetKnowledgeDraft();
  showToast('已恢复默认角色知识库');
}

async function toggleMemoryManager() {
  memory.managerOpen = !memory.managerOpen;
  if (memory.managerOpen && !memoryList.value.length && !memoryLoading.value) {
    await loadVisibleMemories();
  }
}

async function openMemoryItem(item) {
  try {
    const detail = item.content || !canUseServerMemory.value ? item : await fetchMemoryDetail(item.id);
    memory.expanded[item.id] = true;
    const index = memoryList.value.findIndex((entry) => entry.id === item.id);
    if (index >= 0) memoryList.value[index] = { ...memoryList.value[index], ...detail };
    return detail;
  } catch (error) {
    showToast(`读取原文失败：${error.message}`, 'error');
    return null;
  }
}

async function fetchMemoryDetail(id) {
  const response = await authFetch(noStoreUrl(`/api/room/memory/${encodeURIComponent(id)}`), {
    headers: memoryAuthHeaders(),
    cache: 'no-store'
  });
  const result = await parseResponse(response);
  if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
  return result.data;
}

async function editMemory(item) {
  if (memorySavePending.value) return;
  if (hasMemoryDraft.value && memory.editing?.id !== item.id
    && !window.confirm('当前记忆尚未保存，切换会丢失修改。确定继续吗？')) return;
  const requestId = ++memoryEditRequestId;
  const detail = await openMemoryItem(item);
  if (!detail || requestId !== memoryEditRequestId) return;
  memory.editing = {
    id: detail.id,
    type: detail.type || 'conversation',
    summary: detail.summary || '',
    content: detail.content || '',
    importance: Number(detail.importance ?? 0.5),
    confidence: Number(detail.confidence ?? 0.8),
    tags: (detail.tags || []).join(', ')
  };
  memoryEditingOriginal.value = memoryEditSnapshot(memory.editing);
  memorySaveError.value = '';
  await nextTick();
  memoryEditor.value?.scrollIntoView({
    behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'center'
  });
  memorySummaryInput.value?.focus({ preventScroll: true });
}

async function toggleMemoryContent(item) {
  if (memory.expanded[item.id]) {
    memory.expanded[item.id] = false;
    return;
  }
  await openMemoryItem(item);
}

function cancelMemoryEdit() {
  memoryEditRequestId += 1;
  memory.editing = null;
  memoryEditingOriginal.value = '';
  memorySaveError.value = '';
}

async function saveMemoryEdit() {
  if (!memory.editing || memorySavePending.value) return false;
  memorySaveError.value = '';
  const draft = {
    id: memory.editing.id,
    type: memory.editing.type,
    summary: String(memory.editing.summary ?? ''),
    content: String(memory.editing.content ?? ''),
    importance: Number(memory.editing.importance),
    confidence: Number(memory.editing.confidence),
    tags: String(memory.editing.tags || '').split(',').map((item) => item.trim()).filter(Boolean)
  };
  try {
    if (!draft.summary.trim() || !draft.content.trim()) throw new Error('记忆摘要和内容不能为空');
    if (draft.summary.length > 800) throw new Error('记忆摘要不能超过 800 字');
    if (canUseServerMemory.value && draft.content.length > memoryContentLimit.value) {
      throw new Error(`单条记忆内容不能超过 ${memoryContentLimit.value} 字，原记录未修改`);
    }
    memorySavePending.value = true;
    if (!canUseServerMemory.value) {
      const db = await openMemoryDb();
      if (!db) throw new Error('IndexedDB 不可用');
      const existing = await requestToPromise(db.transaction(MEMORY_STORE, 'readonly').objectStore(MEMORY_STORE).get(draft.id));
      if (!existing || existing.userKey !== visitorKey.value) throw new Error('记忆不存在');
      const tx = db.transaction(MEMORY_STORE, 'readwrite');
      tx.objectStore(MEMORY_STORE).put({
        ...existing,
        ...draft,
        manuallyEdited: true,
        updatedAt: new Date().toISOString()
      });
      await txToPromise(tx);
      memory.editing = null;
      memoryEditingOriginal.value = '';
      memory.expanded[draft.id] = false;
      publishLocalRoomMemoryUpdate({ id: draft.id });
      await loadLocalMemories();
      showToast('本地记忆已更新');
      return true;
    }
    const response = await authFetch(`/api/room/memory/${encodeURIComponent(draft.id)}`, {
      method: 'PUT',
      headers: memoryAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(draft)
    });
    const result = await parseResponse(response);
    if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
    memory.editing = null;
    memoryEditingOriginal.value = '';
    memory.expanded[draft.id] = false;
    await loadVisibleMemories();
    showToast('记忆已更新');
    return true;
  } catch (error) {
    memorySaveError.value = error.message || '请稍后重试';
    showToast(`保存失败：${error.message}`, 'error');
    return false;
  } finally {
    memorySavePending.value = false;
  }
}

async function deleteMemoryItem(item) {
  if (!confirm('确定删除这条长期记忆吗？')) return;
  try {
    if (!canUseServerMemory.value) {
      const db = await openMemoryDb();
      if (!db) throw new Error('IndexedDB 不可用');
      const tx = db.transaction(MEMORY_STORE, 'readwrite');
      tx.objectStore(MEMORY_STORE).delete(item.id);
      await txToPromise(tx);
      publishLocalRoomMemoryUpdate(item, 'deleted');
      showToast('本地记忆已删除');
      await loadLocalMemories();
      return;
    }
    const response = await authFetch(`/api/room/memory/${encodeURIComponent(item.id)}`, {
      method: 'DELETE',
      headers: memoryAuthHeaders()
    });
    const result = await parseResponse(response);
    if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
    showToast('记忆已删除');
    await loadMemoryCount();
    await loadVisibleMemories();
  } catch (error) {
    showToast(`删除失败：${error.message}`, 'error');
  }
}

async function clearMemory() {
  try {
    if (canUseServerMemory.value) {
      const response = await authFetch('/api/room/memory', {
        method: 'DELETE',
        headers: memoryAuthHeaders()
      });
      const result = await parseResponse(response);
      if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
      memoryCount.value = 0;
      memoryList.value = [];
      memoryEditRequestId += 1;
      memory.editing = null;
      memoryEditingOriginal.value = '';
      memorySaveError.value = '';
      memory.expanded = {};
      showToast(`已清空 ${result.data?.count || 0} 条服务端记忆`);
      return;
    }
    const db = await openMemoryDb();
    if (!db) return;
    const tx = db.transaction(MEMORY_STORE, 'readwrite');
    const index = tx.objectStore(MEMORY_STORE).index('userKey');
    const records = await requestToPromise(index.getAll(IDBKeyRange.only(visitorKey.value)));
    records.forEach((record) => tx.objectStore(MEMORY_STORE).delete(record.id));
    await txToPromise(tx);
    memoryCount.value = 0;
    memoryList.value = [];
    memoryEditRequestId += 1;
    memory.editing = null;
    memoryEditingOriginal.value = '';
    memorySaveError.value = '';
    memory.expanded = {};
    publishLocalRoomMemoryUpdate(null, 'cleared');
    showToast(`已清空 ${records.length} 条本地记忆`);
  } catch (error) {
    showToast(`清空失败：${error.message}`, 'error');
  }
}

function makeMcpHeaders() {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const key = String(mcp.apiKey || '').trim();
  const headerName = String(mcp.authHeader || 'Authorization').trim();
  if (key && headerName) {
    headers[headerName] = /^Bearer\s+/i.test(key) || headerName.toLowerCase() !== 'authorization' ? key : `Bearer ${key}`;
  }
  return headers;
}

async function callMcp(method, params = {}) {
  const endpoint = String(mcp.endpoint || '').trim();
  if (!endpoint) throw new Error('请先填写 MCP HTTP 端点');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: makeMcpHeaders(),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data?.error?.message || `HTTP ${response.status}`);
  return data.result || data;
}

function saveMCP(showDialog = true) {
  const endpoint = String(mcp.endpoint || '').trim();
  if (mcp.enabled) {
    try {
      if (!endpoint) throw new Error();
      const url = new URL(endpoint, window.location.origin);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch (_) {
      showToast('请填写有效的 MCP 端点，或关闭 MCP', 'error');
      return false;
    }
  }
  const toolAllowlist = String(mcp.toolAllowlist || '').trim();
  if (!persistSettings('roomMCPSettings', {
    enabled: Boolean(mcp.enabled),
    provider: String(mcp.provider || 'custom'),
    endpoint,
    apiKey: String(mcp.apiKey || '').trim(),
    authHeader: String(mcp.authHeader || 'Authorization').trim() || 'Authorization',
    apiHost: String(mcp.apiHost || '').trim(),
    basePath: String(mcp.basePath || '').trim(),
    resourceMode: String(mcp.resourceMode || 'url').trim() || 'url',
    toolAllowlist,
    tools: Array.isArray(mcp.tools) ? mcp.tools : []
  }, 'MCP 设置')) return false;
  rememberSaved('mcp');
  if (showDialog) openTestDialog(
    'mcp',
    mcp.enabled && endpoint ? 'success' : 'warning',
    'MCP 设置已保存',
    mcp.enabled
      ? (endpoint ? 'MCP 设置已保存并启用。' : 'MCP 已启用并保存，但还没有填写端点。')
      : 'MCP 设置已保存，当前未启用。',
    `Provider：${mcp.provider || 'custom'}\n端点：${endpoint || '未填写'}\n认证头：${String(mcp.authHeader || 'Authorization').trim() || 'Authorization'}\n工具白名单：${toolAllowlist || '允许全部'}\n已发现工具：${Array.isArray(mcp.tools) ? mcp.tools.length : 0}`
  );
  showToast(mcp.enabled ? 'MCP 设置已保存并启用' : 'MCP 设置已保存（当前未启用）');
  return true;
}

async function testMCP() {
  try {
    const result = await callMcp('tools/list');
    const tools = Array.isArray(result.tools) ? result.tools : [];
    mcp.tools = tools.map((tool) => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || tool.input_schema || { type: 'object', properties: {} }
    })).filter((tool) => tool.name);
    if (!saveMCP()) return;
    showToast(mcp.tools.length ? `MCP 已连接，发现 ${mcp.tools.length} 个工具` : 'MCP 已连接，但未发现工具');
  } catch (error) {
    showToast(`MCP 测试失败：${error.message}`, 'error');
  }
}

async function testMCPWithDialog() {
  if (!saveMCP(false)) return;
  openTestDialog(
    'mcp',
    'loading',
    'MCP 工具测试',
    '正在请求 MCP tools/list...',
    `端点：${mcp.endpoint || '未填写'}\nProvider：${mcp.provider || 'custom'}\n启用状态：${mcp.enabled ? '已启用' : '未启用'}`
  );
  try {
    const result = await callMcp('tools/list');
    const tools = Array.isArray(result.tools) ? result.tools : [];
    mcp.tools = tools.map((tool) => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || tool.input_schema || { type: 'object', properties: {} }
    })).filter((tool) => tool.name);
    if (!saveMCP(false)) return;
    openTestDialog(
      'mcp',
      mcp.tools.length ? 'success' : 'warning',
      'MCP 工具测试',
      mcp.tools.length ? `连接成功，发现 ${mcp.tools.length} 个工具。` : 'MCP 已响应，但未发现可用工具。',
      mcp.tools.length
        ? mcp.tools.map((tool, index) => `${index + 1}. ${tool.name}${tool.description ? ` - ${tool.description}` : ''}`).join('\n')
        : JSON.stringify(result, null, 2).slice(0, 800)
    );
    showToast(mcp.tools.length ? `MCP 已连接，发现 ${mcp.tools.length} 个工具` : 'MCP 已连接，但未发现工具');
  } catch (error) {
    openTestDialog(
      'mcp',
      'error',
      'MCP 工具测试',
      'MCP 测试失败。',
      `${error.message}\n\n请确认 MCP 端点可访问、支持 JSON-RPC tools/list，并且如果由浏览器直连则需要允许 CORS。`
    );
    showToast(`MCP 测试失败：${error.message}`, 'error');
  }
}

watch(() => props.user?.id || '', (userId, previousUserId) => {
  if (userId === previousUserId) return;
  refreshRoomMemorySync();
  refreshMemoryState();
  loadDiaryArchive();
  void syncDiarySettings();
});

onMounted(() => {
  stopRoomMemorySync = startRoomMemorySync();
  loadSettings();
  window.addEventListener(DIARY_SYNC_UPDATED_EVENT, onDiarySyncUpdated);
  window.addEventListener('focus', onDiaryVisibilityChange);
  document.addEventListener('visibilitychange', onDiaryVisibilityChange);
  void syncDiarySettings();
  syncLive2DDebugState();
  window.addEventListener('tsukuyomi:room-live2d-debug', onLive2DDebugEvent);
  window.addEventListener('tsukuyomi:room-memory-updated', onRoomMemoryUpdated);
  window.addEventListener('storage', onRoomSettingsStorageEvent);
  window.addEventListener('beforeunload', warnBeforeUnload);
});

onBeforeUnmount(() => {
  stopRoomMemorySync();
  releaseAsyncAudioPlayback(ttsTestPlayback);
  ttsTestPlayback = null;
  window.removeEventListener('tsukuyomi:room-live2d-debug', onLive2DDebugEvent);
  window.removeEventListener('tsukuyomi:room-memory-updated', onRoomMemoryUpdated);
  window.removeEventListener('storage', onRoomSettingsStorageEvent);
  window.removeEventListener('beforeunload', warnBeforeUnload);
  window.removeEventListener(DIARY_SYNC_UPDATED_EVENT, onDiarySyncUpdated);
  window.removeEventListener('focus', onDiaryVisibilityChange);
  document.removeEventListener('visibilitychange', onDiaryVisibilityChange);
  clearTimeout(modelNoticeTimer);
  clearTimeout(memoryRefreshTimer);
  clearTimeout(toastTimer);
});
</script>

<template>
  <main class="page room-settings-page">
    <header class="settings-page-heading">
      <div>
        <nav class="settings-breadcrumb" aria-label="当前位置">
          <a href="/room" @click.prevent="emit('go', '/room')">私人居所</a
          ><TsIcon name="chevronRight" :size="14" /><span>房间设置</span>
        </nav>
        <h1>房间设置</h1>
        <p>先连接聊天模型，其他功能可以稍后设置。</p>
      </div>
      <a class="ghost-btn" href="/room" @click.prevent="emit('go', '/room')"
        ><TsIcon name="arrowLeft" :size="17" />返回房间</a
      >
    </header>
    <section v-if="setupGuideVisible" class="settings-welcome">
      <span class="settings-welcome-icon"
        ><TsIcon name="sparkles" :size="24"
      /></span>
      <div>
        <strong>只需连接一个模型，就能开始聊天</strong>
        <p>语音、记忆和外观按需调整，不必一次填完所有设置。</p>
      </div>
      <ol class="settings-flow" aria-label="模型连接步骤">
        <li><b>1</b>选择服务</li>
        <li><b>2</b>填写密钥</li>
        <li><b>3</b>测试连接</li>
      </ol>
      <button
        class="ghost-btn"
        type="button"
        aria-label="收起配置提示"
        @click="setupGuideVisible = false"
      >
        <TsIcon name="x" :size="16" />
      </button>
    </section>
    <div class="settings-workspace">
      <button
        class="ghost-btn settings-mobile-menu"
        type="button"
        :aria-expanded="mobileSectionsOpen"
        aria-controls="settings-navigation"
        @click="mobileSectionsOpen = !mobileSectionsOpen"
      >
        <TsIcon :name="currentSection.icon" :size="20" /><strong>{{
          currentSection.label
        }}</strong
        ><span>全部设置</span><TsIcon name="chevronDown" :size="18" />
      </button>
      <aside
        id="settings-navigation"
        class="settings-navigation"
        :class="{ 'is-open': mobileSectionsOpen }"
      >
        <label class="settings-search"
          ><TsIcon name="search" :size="17" /><input
            v-model="settingsSearch"
            type="search"
            aria-label="搜索设置"
            placeholder="搜索设置"
        /></label>
        <nav aria-label="设置分类">
          <section v-for="group in filteredSettingsGroups" :key="group.label">
            <h2>{{ group.label }}</h2>
            <button
              v-for="item in group.items"
              :key="item.id"
              type="button"
              class="settings-nav-button"
              :class="{ active: activeSection === item.id }"
              :aria-current="activeSection === item.id ? 'page' : undefined"
              @click="selectSettingsSection(item.id)"
            >
              <TsIcon :name="item.icon" :size="18" /><span>{{
                item.label
              }}</span
              ><small v-if="item.badge">{{ item.badge }}</small
              ><span
                v-if="pendingSections.includes(item.id)"
                class="settings-unsaved-mark"
                aria-label="有未保存修改"
              ></span>
            </button>
          </section>
          <p v-if="!filteredSettingsGroups.length" class="field-hint">
            没有匹配的设置，试试“语音”或“密钥”。
          </p>
        </nav>
        <div class="settings-nav-help">
          <TsIcon name="helpCircle" :size="18" />
          <div>
            <small>第一次配置？</small
            ><button
              class="ghost-btn settings-text-btn"
              type="button"
              @click="
                setupGuideVisible = true;
                selectSettingsSection('llm');
              "
            >
              查看配置指引<TsIcon name="arrowRight" :size="14" />
            </button>
          </div>
        </div>
      </aside>
      <div
        ref="settingsPanel"
        class="settings-main"
        tabindex="-1"
        :aria-label="currentSection.label"
      >
        <article
          v-show="activeSection === 'llm'"
          id="room-llm-settings"
          class="room-settings-card"
        >
          <div class="room-card-head">
            <span class="room-card-icon"
              ><TsIcon name="message" :size="23"
            /></span>
            <div>
              <h2>聊天模型<span class="settings-badge">必需</span></h2>
              <p>连接一个模型，让八千代开始回应你。</p>
            </div>
          </div>
          <div class="settings-mode-grid">
            <label
              class="settings-mode"
              :class="{ selected: setupLlmMode === 'cloud' }"
              ><TsIcon name="cloud" :size="26" /><span
                ><strong>云端 API</strong
                ><small>无需安装 · 使用服务商密钥</small></span
              ><input
                type="radio"
                name="settings-llm-mode"
                :checked="setupLlmMode === 'cloud'"
                @change="chooseSetupLlmMode('cloud')"
            /></label>
            <label
              class="settings-mode"
              :class="{ selected: setupLlmMode === 'ollama' }"
              ><TsIcon name="layers" :size="26" /><span
                ><strong>本机 Ollama</strong
                ><small>已安装本机模型 · 无需密钥</small></span
              ><input
                type="radio"
                name="settings-llm-mode"
                :checked="setupLlmMode === 'ollama'"
                @change="chooseSetupLlmMode('ollama')"
            /></label>
          </div>
          <div v-if="setupLlmMode === 'cloud'" class="settings-field">
            <div class="settings-field-title">
              <span>服务商</span><small>选择后自动填写接口地址</small>
            </div>
            <div class="settings-providers">
              <button
                class="ghost-btn"
                type="button"
                :class="{ selected: llmProviderKey === 'deepseek' }"
                :aria-pressed="llmProviderKey === 'deepseek'"
                @click="applySetupCloudProvider('deepseek')"
              >
                DeepSeek<TsIcon
                  v-if="llmProviderKey === 'deepseek'"
                  name="check"
                  :size="16"
                />
              </button>
              <button
                class="ghost-btn"
                type="button"
                :class="{ selected: llmProviderKey === 'openai' }"
                :aria-pressed="llmProviderKey === 'openai'"
                @click="applySetupCloudProvider('openaiChat')"
              >
                OpenAI<TsIcon
                  v-if="llmProviderKey === 'openai'"
                  name="check"
                  :size="16"
                />
              </button>
              <button
                class="ghost-btn"
                type="button"
                :class="{ selected: llmProviderKey === 'aliyun' }"
                :aria-pressed="llmProviderKey === 'aliyun'"
                @click="applyAliyunPreset('cn')"
              >
                阿里云百炼<TsIcon
                  v-if="llmProviderKey === 'aliyun'"
                  name="check"
                  :size="16"
                />
              </button>
              <select
                aria-label="更多服务商"
                :value="''"
                @change="applyAdvancedLlmPreset($event.target.value)"
              >
                <option value="">更多服务商</option>
                <optgroup label="服务商">
                  <option
                    v-for="(preset, name) in LLM_PRESETS"
                    :key="name"
                    :value="`llm:${name}`"
                  >
                    {{ preset.label }}
                  </option>
                </optgroup>
                <optgroup label="阿里云百炼">
                  <option
                    v-for="(preset, name) in ALIYUN_LLM_PRESETS"
                    :key="name"
                    :value="`aliyun:${name}`"
                  >
                    {{ preset.label }}
                  </option>
                </optgroup>
                <optgroup label="Xiaomi MiMo">
                  <option
                    v-for="(preset, name) in MIMO_LLM_PRESETS"
                    :key="name"
                    :value="`mimo:${name}`"
                  >
                    {{ preset.label }}
                  </option>
                </optgroup>
              </select>
            </div>
          </div>
          <div v-if="setupLlmMode === 'cloud'" class="settings-field">
            <label for="settings-llm-key"
              >API 密钥 <small>API Key</small></label
            >
            <div class="settings-secret">
              <TsIcon name="lock" :size="18" /><input
                id="settings-llm-key"
                v-model="llm.apiKey"
                :type="showLlmKey ? 'text' : 'password'"
                autocomplete="off"
                spellcheck="false"
                placeholder="粘贴服务商提供的密钥"
              /><button
                type="button"
                class="ghost-btn"
                :aria-label="showLlmKey ? '隐藏 API 密钥' : '显示 API 密钥'"
                :aria-pressed="showLlmKey"
                @click="showLlmKey = !showLlmKey"
              >
                <TsIcon :name="showLlmKey ? 'eyeOff' : 'eye'" :size="18" />
              </button>
            </div>
            <p class="field-hint">
              <TsIcon
                name="shield"
                :size="14"
              />密钥保存在当前浏览器，调用时发送给所选服务。
            </p>
          </div>
          <div class="settings-field">
            <div class="settings-field-title">
              <label for="settings-llm-model">模型 <small>Model</small></label
              ><button
                class="ghost-btn settings-text-btn"
                type="button"
                :disabled="modelCatalog.loading"
                @click="syncModelCatalog"
              >
                <TsIcon name="refresh" :size="15" />{{
                  modelCatalog.loading ? '刷新中…' : '刷新模型'
                }}
              </button>
            </div>
            <input
              id="settings-llm-model"
              v-model="llm.model"
              type="text"
              list="llmSyncedModels"
              spellcheck="false"
              placeholder="输入完整模型名称"
            /><datalist id="llmSyncedModels">
              <option
                v-for="option in syncedModelOptions"
                :key="`${option.source}-${option.id}`"
                :value="syncedModelSelectValue(option)"
              >
                {{ option.label }}
              </option>
            </datalist>
            <p class="field-hint">
              {{
                setupLlmMode === 'ollama'
                  ? '填写当前设备中已下载的模型名称。'
                  : '选择服务商提供的模型，或粘贴完整模型名称。'
              }}
            </p>
            <p v-if="modelCatalog.error" class="field-hint error" role="alert">
              {{ modelCatalog.error }}
            </p>
          </div>
          <div v-if="setupLlmMode === 'ollama'" class="settings-note">
            <TsIcon name="info" :size="19" />
            <div>
              <strong>在访问设备上运行 Ollama</strong>
              <p>
                手机上的 localhost
                指手机本身。连接电脑模型时，请在高级设置填写可访问的地址，并允许本站跨域访问。
              </p>
              <button
                class="ghost-btn compact"
                type="button"
                @click="copyOllamaRepairCommand"
              >
                复制 Windows 配置命令
              </button>
            </div>
          </div>
          <details class="settings-disclosure">
            <summary>
              <TsIcon name="sliders" :size="18" /><span
                ><strong>高级连接设置</strong
                ><small>API 端点 · 图片理解 · 代理 · 补充指令</small></span
              ><TsIcon name="chevronDown" :size="17" />
            </summary>
            <div class="settings-disclosure-body form-grid">
              <label
                >API 端点<input
                  v-model="llm.apiUrl"
                  type="url"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="https://…/chat/completions"
              /></label>
              <label v-if="setupLlmMode === 'ollama'"
                >API 密钥（可选）<input
                  v-model="llm.apiKey"
                  type="password"
                  autocomplete="off"
                  placeholder="本机 Ollama 可留空"
              /></label>
              <label
                >图片理解<select v-model="llm.visionMode">
                  <option value="auto">自动识别视觉模型</option>
                  <option value="llm">强制发送给 LLM</option>
                  <option value="mcp">使用 MCP understand_image</option>
                </select></label
              >
              <label class="check-row"
                ><input
                  v-model="llm.useProxy"
                  type="checkbox"
                  :disabled="llmProviderKey === 'ollama'"
                />使用服务器受限代理</label
              >
              <p class="field-hint">
                关闭时由浏览器直连服务商；开启时请求经过本站后端，仅支持已允许的服务商。Ollama
                从当前设备直接连接。
              </p>
              <label
                >对话补充指令<textarea
                  v-model="llm.systemPrompt"
                  placeholder="可选：回复长度、语言或交流偏好"
                ></textarea>
              </label>
              <p class="field-hint">只用于聊天，与日记人设分开保存。</p>
              <label
                >模型目录<select
                  :value="llm.model"
                  @change="applySyncedModelById($event.target.value)"
                >
                  <option value="">选择目录中的模型</option>
                  <option
                    v-for="option in syncedModelOptions"
                    :key="`${option.source}-${option.id}`"
                    :value="syncedModelSelectValue(option)"
                  >
                    {{ option.label }} · {{ option.detail }}
                  </option>
                </select></label
              >
              <p class="field-hint">
                目录来自
                OpenRouter，并按当前服务商筛选。实际可用模型以服务商账号为准。{{
                  modelCatalog.message
                }}
              </p>
              <div class="model-recommend-card">
                <span>推荐模型</span><strong>{{ recommendedModelText }}</strong
                ><button
                  class="ghost-btn"
                  type="button"
                  :disabled="!recommendedModelOption"
                  @click="applyRecommendedModel"
                >
                  应用推荐
                </button>
              </div>
            </div>
          </details>
          <div class="settings-test-footer">
            <div class="settings-connection" role="status">
              <span class="settings-status" :class="testedConnectionStatus"
                ><TsIcon
                  :name="
                    testedConnectionStatus === 'success' ? 'check' : 'info'
                  "
                  :size="16"
                />{{ connectionStatusText }}</span
              ><small>使用当前表单测试，修改后记得保存。</small>
            </div>
            <button
              class="ghost-btn"
              type="button"
              :disabled="connectionCheck.status === 'loading'"
              @click="testLLM"
            >
              <TsIcon name="play" :size="16" />{{
                testedConnectionStatus === 'loading' ? '测试中…' : '测试连接'
              }}
            </button>
          </div>
        </article>
        <article
          v-show="activeSection === 'tts'"
          id="room-tts-settings"
          class="room-settings-card"
        >
          <div class="room-card-head">
            <span class="room-card-icon"
              ><TsIcon name="audioLines" :size="23"
            /></span>
            <div>
              <h2>语音与朗读<span class="settings-badge">可选</span></h2>
              <p>让回复拥有声音；关闭语音也能正常聊天。</p>
            </div>
          </div>
          <label class="settings-toggle-row"
            ><span
              ><strong>开启语音合成</strong
              ><small>为八千代的回复播放合成语音。</small></span
            ><input
              v-model="tts.enabled"
              type="checkbox"
              role="switch"
              aria-label="开启语音合成"
          /></label>
          <div class="settings-note">
            <TsIcon name="info" :size="18" />
            <p>
              {{
                tts.enabled
                  ? '语音服务独立配置，保存后生效。'
                  : '先用文字聊天也很好，需要时再开启声音。'
              }}
            </p>
          </div>
          <div v-show="tts.enabled" class="settings-section-fields">
            <label
              >语音服务<select
                aria-label="语音服务"
                :value="
                  Object.keys(TTS_PRESETS).find(
                    (key) => TTS_PRESETS[key].provider === tts.provider,
                  ) || 'custom'
                "
                @change="applySetupTtsProvider($event.target.value)"
              >
                <option
                  v-for="(preset, name) in TTS_PRESETS"
                  :key="name"
                  :value="name"
                >
                  {{ preset.label }}
                </option>
              </select></label
            >
            <label v-if="tts.provider !== 'gpt-sovits'"
              >API 密钥<input
                v-model="tts.apiKey"
                type="password"
                autocomplete="off"
                placeholder="粘贴语音服务密钥" /></label
            ><label
              >音色 / Voice ID<input
                v-model="tts.voice"
                type="text"
                placeholder="音色名称或 Voice ID"
            /></label>
            <details class="settings-disclosure">
              <summary>
                <TsIcon name="sliders" :size="18" /><span
                  ><strong>高级语音设置</strong
                  ><small>端点、模型、语言与本机参数</small></span
                ><TsIcon name="chevronDown" :size="17" />
              </summary>
              <div class="settings-disclosure-body form-grid">
                <label
                  >API 端点<input
                    v-model="tts.apiUrl"
                    type="url"
                    spellcheck="false"
                    placeholder="https://…/audio/speech" /></label
                ><label
                  >模型名称<input
                    v-model="tts.model"
                    type="text"
                    placeholder="tts-1 / speech-02-hd / eleven_multilingual_v2"
                /></label>

                <template
                  v-if="
                    tts.provider === 'gpt-sovits' || tts.provider === 'minimax'
                  "
                >
                  <label
                    >文本语言<select v-model="tts.textLang">
                      <option
                        v-for="option in GPT_SOVITS_LANGUAGE_OPTIONS"
                        :key="`text-${option.value}`"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </option>
                    </select></label
                  >
                </template>
                <template v-if="tts.provider === 'gpt-sovits'">
                  <label
                    >参考音频路径<input
                      v-model="tts.refAudioPath"
                      type="text"
                      placeholder="E:\\visualstudio\\tts\\xxx.wav"
                  /></label>
                  <label
                    >参考音频文本<input
                      v-model="tts.promptText"
                      type="text"
                      placeholder="参考音频里说的话"
                  /></label>
                  <label
                    >参考音频语言<select v-model="tts.promptLang">
                      <option
                        v-for="option in GPT_SOVITS_LANGUAGE_OPTIONS"
                        :key="`prompt-${option.value}`"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </option>
                    </select></label
                  >
                  <label
                    >GPT 权重路径<input
                      v-model="tts.gptWeightPath"
                      type="text"
                      placeholder="GPT_weights_v2ProPlus/yachiyo-v2pro-e20.ckpt"
                  /></label>
                  <label
                    >SoVITS 权重路径<input
                      v-model="tts.sovitsWeightPath"
                      type="text"
                      placeholder="SoVITS_weights_v2ProPlus/yachiyo-v2pro_e12_s684.pth"
                  /></label>
                  <p
                    v-if="gptSovitsPathWarning(tts.refAudioPath)"
                    class="field-hint warning-text"
                  >
                    {{ gptSovitsPathWarning(tts.refAudioPath) }}
                  </p>
                </template>
                <label v-if="tts.provider !== 'gpt-sovits'" class="check-row"
                  ><input v-model="tts.useProxy" type="checkbox" />
                  使用服务器受限代理规避 CORS</label
                >
                <p class="field-hint" v-if="tts.provider === 'gpt-sovits'">
                  本机 GPT-SoVITS 仅支持浏览器直连
                  http://localhost:9880/tts。请在访问设备上启动 GPT-SoVITS
                  API，网站服务器不会代为连接 GPT-SoVITS。
                </p>
                <p class="field-hint" v-else>
                  关闭时由浏览器直连供应商；开启后请求会经过本站后端，仅允许预设供应商域名，用于处理
                  CORS 限制。
                </p>
              </div>
            </details>
            <div class="button-row">
              <button class="ghost-btn" type="button" @click="testTTS">
                <TsIcon name="play" :size="16" />保存并试听
              </button>
            </div>
          </div>
        </article>
        <article
          v-show="activeSection === 'memory'"
          id="room-memory-settings"
          class="room-settings-card room-memory-manager"
        >
          <div class="room-card-head">
            <span class="room-card-icon"
              ><TsIcon name="bookmark" :size="23"
            /></span>
            <div>
              <h2>长期记忆</h2>
              <p>记住聊过的事情，让对话更有连续性。</p>
            </div>
          </div>
          <label class="settings-toggle-row"
            ><span
              ><strong>开启长期记忆</strong
              ><small>允许保存与注入当前身份的长期记忆。</small></span
            ><input
              v-model="memory.enabled"
              type="checkbox"
              role="switch"
              aria-label="开启长期记忆"
          /></label>
          <div class="settings-note">
            <TsIcon name="shield" :size="18" />
            <div>
              <strong>{{ roomIdentityLabel }} · {{ memoryModeLabel }}</strong>
              <p>{{ memoryLocationText }}</p>
            </div>
          </div>
          <div class="settings-field-title">
            <h3>记忆管理</h3>
            <span class="settings-badge">{{ memoryCount }} 条记忆</span>
          </div>
          <div class="memory-manager-body" :aria-busy="memoryLoading">
            <div class="memory-toolbar">
              <input
                aria-label="搜索记忆"
                v-model="memory.query"
                type="text"
                placeholder="搜索记忆内容、偏好或项目"
              />
              <select aria-label="记忆类型" v-model="memory.type">
                <option
                  v-for="item in memoryTypeOptions"
                  :key="item.value"
                  :value="item.value"
                >
                  {{ item.label }}
                </option>
              </select>
              <button
                class="ghost-btn"
                type="button"
                :disabled="memoryLoading"
                :aria-busy="memoryLoading"
                @click="loadVisibleMemories"
              >
                {{ memoryLoading ? '读取中...' : '搜索' }}
              </button>
            </div>
            <form
              v-if="memory.editing"
              ref="memoryEditor"
              class="memory-editor"
              :aria-busy="memorySavePending"
              @submit.prevent="saveMemoryEdit"
            >
              <div class="memory-editor-status" role="status">
                <span>正在编辑</span
                ><strong>{{ memory.editing.summary || '未命名记忆' }}</strong>
              </div>
              <label
                >类型
                <select
                  v-model="memory.editing.type"
                  :disabled="memorySavePending"
                >
                  <option
                    v-for="item in memoryTypeOptions.filter(
                      (option) => option.value,
                    )"
                    :key="item.value"
                    :value="item.value"
                  >
                    {{ item.label }}
                  </option>
                </select>
              </label>
              <label
                >摘要<input
                  ref="memorySummaryInput"
                  v-model="memory.editing.summary"
                  type="text"
                  :disabled="memorySavePending"
              /></label>
              <label
                >内容<textarea
                  v-model="memory.editing.content"
                  rows="8"
                  :disabled="memorySavePending"
                ></textarea>
              </label>
              <small v-if="canUseServerMemory" class="field-hint"
                >{{ memory.editing.content.length }} /
                {{
                  memoryContentLimit
                }}
                字；超出上限时保存会被拒绝，原记录不会被截断。</small
              >
              <label
                >标签<input
                  v-model="memory.editing.tags"
                  type="text"
                  placeholder="逗号分隔"
                  :disabled="memorySavePending"
              /></label>
              <div class="memory-score-row">
                <label
                  >重要度
                  <strong>{{
                    Number(memory.editing.importance).toFixed(2)
                  }}</strong
                  ><input
                    v-model="memory.editing.importance"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    :disabled="memorySavePending"
                /></label>
                <label
                  >置信度
                  <strong>{{
                    Number(memory.editing.confidence).toFixed(2)
                  }}</strong
                  ><input
                    v-model="memory.editing.confidence"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    :disabled="memorySavePending"
                /></label>
              </div>
              <div v-if="memorySaveError" class="field-hint error" role="alert">
                保存失败：{{ memorySaveError }}
              </div>
              <div class="button-row">
                <button
                  class="primary-btn"
                  type="submit"
                  :disabled="memorySavePending"
                >
                  {{ memorySavePending ? '保存中...' : '保存记忆' }}
                </button>
                <button
                  class="ghost-btn"
                  type="button"
                  :disabled="memorySavePending"
                  @click="cancelMemoryEdit"
                >
                  取消
                </button>
              </div>
            </form>
            <LoadingSkeleton
              v-if="memoryLoading && !memoryList.length"
              variant="list"
              :count="4"
              label="正在读取记忆"
            />
            <div
              v-else-if="memoryError && !memoryList.length"
              class="field-hint error"
              role="alert"
            >
              {{ memoryError }}
            </div>
            <div v-else-if="!memoryList.length" class="field-hint">
              {{ `还没有可显示的${memoryModeLabel}。` }}
            </div>
            <div v-else class="memory-list">
              <article
                v-for="item in memoryList"
                :key="item.id"
                class="memory-item"
              >
                <div class="memory-item-head">
                  <span class="chip">{{ memoryTypeLabel(item.type) }}</span>
                  <span class="field-hint"
                    >重要度 {{ Number(item.importance || 0).toFixed(2) }} ·
                    置信度 {{ Number(item.confidence || 0).toFixed(2) }}</span
                  >
                </div>
                <strong>{{ item.summary }}</strong>
                <button
                  class="memory-expand-btn"
                  type="button"
                  @click="toggleMemoryContent(item)"
                >
                  {{ memory.expanded[item.id] ? '收起原文' : '展开原文' }}
                </button>
                <p v-if="memory.expanded[item.id]">
                  {{ item.content || '正在读取原文...' }}
                </p>
                <div v-if="item.tags?.length" class="memory-tags">
                  <span v-for="tag in item.tags" :key="`${item.id}-${tag}`">{{
                    tag
                  }}</span>
                </div>
                <div class="button-row">
                  <button
                    class="ghost-btn"
                    type="button"
                    @click="editMemory(item)"
                  >
                    编辑
                  </button>
                  <button
                    class="danger-btn"
                    type="button"
                    @click="deleteMemoryItem(item)"
                  >
                    删除
                  </button>
                </div>
              </article>
            </div>
            <div
              v-if="memoryError && memoryList.length"
              class="field-hint error"
              role="alert"
            >
              {{ memoryError }}
            </div>
            <div v-if="memoryList.length" class="button-row memory-list-more">
              <span class="field-hint"
                >已显示 {{ memoryList.length }} / {{ memoryFilteredTotal }} 条{{
                  memory.query || memory.type ? '匹配记忆' : '记忆'
                }}</span
              >
              <button
                v-if="memoryHasMore"
                class="ghost-btn"
                type="button"
                :disabled="memoryLoading"
                @click="loadMoreMemories"
              >
                {{ memoryLoading ? '加载中...' : '加载更多' }}
              </button>
            </div>
          </div>
          <details class="settings-disclosure">
            <summary>
              <TsIcon name="sliders" :size="18" /><span
                ><strong>同步与存储</strong
                ><small>查看记忆检索与同步状态</small></span
              ><TsIcon name="chevronDown" :size="17" />
            </summary>
            <div class="settings-disclosure-body form-grid">
              <p class="field-hint">
                {{ memoryVectorLabel
                }}<template v-if="memoryVector.embedding">
                  · {{ memoryVector.embedding }}</template
                >
              </p>
              <div class="button-row">
                <button
                  class="ghost-btn"
                  type="button"
                  @click="loadVisibleMemories"
                >
                  刷新记忆</button
                ><button
                  v-if="canUseServerMemory"
                  class="ghost-btn"
                  type="button"
                  @click="syncMemoryVectors"
                >
                  同步向量库
                </button>
              </div>
            </div>
          </details>
          <div class="settings-danger">
            <div>
              <strong>清空当前身份的记忆</strong>
              <p>不会清除其他用户的记忆，操作前需确认。</p>
            </div>
            <button class="danger-btn" type="button" @click="clearMemory">
              清空记忆
            </button>
          </div>
        </article>
        <article
          v-show="activeSection === 'knowledge'"
          id="room-knowledge-settings"
          class="room-settings-card room-knowledge-manager"
        >
          <div class="room-card-head">
            <span class="room-card-icon"
              ><TsIcon name="book" :size="23"
            /></span>
            <div>
              <h2>角色知识库</h2>
              <p>角色设定与长期记忆分开管理，避免相互覆盖。</p>
            </div>
          </div>
          <label class="settings-toggle-row"
            ><span
              ><strong>启用角色知识库注入</strong
              ><small>聊天时选取相关条目，补充八千代的设定。</small></span
            ><input
              v-model="knowledge.enabled"
              type="checkbox"
              role="switch"
              aria-label="启用角色知识库注入"
          /></label>
          <div class="settings-note">
            <TsIcon name="lock" :size="18" />
            <p>
              保存在当前浏览器，不自动同步到其他设备，也不会覆盖你的长期记忆。
            </p>
          </div>
          <div class="settings-field-title">
            <h3>
              知识条目 <small>{{ knowledge.entries.length }} 条</small>
            </h3>
            <button
              class="ghost-btn"
              type="button"
              @click="knowledgeDraftOpen = true"
            >
              <TsIcon name="plus" :size="16" />添加条目
            </button>
          </div>
          <form
            ref="knowledgeEditor"
            v-if="knowledgeDraftOpen || knowledge.editingId"
            class="knowledge-editor"
            :class="{ 'is-editing': knowledge.editingId }"
            @submit.prevent="saveKnowledgeEntry"
          >
            <div
              v-if="knowledge.editingId"
              class="knowledge-editor-status"
              role="status"
              aria-live="polite"
            >
              <span>正在编辑</span>
              <strong>{{ knowledge.draft.title }}</strong>
            </div>
            <label
              >标题<input
                ref="knowledgeTitleInput"
                v-model="knowledge.draft.title"
                type="text"
                placeholder="例如：月见八千代的说话方式"
            /></label>
            <label
              >内容<textarea
                v-model="knowledge.draft.content"
                placeholder="写入角色事实、人设规则、口吻或行为边界"
              ></textarea>
            </label>
            <label
              >标签<input
                v-model="knowledge.draft.tags"
                type="text"
                placeholder="逗号分隔，如 温柔, 月读, 创作者"
            /></label>
            <label class="check-row"
              ><input v-model="knowledge.draft.enabled" type="checkbox" />
              启用这条知识</label
            >
            <div class="button-row">
              <button class="primary-btn" type="submit">
                {{ knowledge.editingId ? '保存条目' : '添加条目' }}
              </button>
              <button
                class="ghost-btn"
                type="button"
                @click="
                  resetKnowledgeDraft();
                  knowledgeDraftOpen = false;
                "
              >
                {{ knowledge.editingId ? '取消编辑' : '清空表单' }}
              </button>
            </div>
          </form>
          <div class="knowledge-list">
            <article
              v-for="item in knowledge.entries"
              :key="item.id"
              class="memory-item knowledge-item"
              :class="{ disabled: !item.enabled }"
            >
              <div class="memory-item-head">
                <span class="chip">{{ item.enabled ? '启用' : '停用' }}</span>
                <span class="field-hint">{{ item.tags || '未设置标签' }}</span>
              </div>
              <strong>{{ item.title }}</strong>
              <p>
                {{
                  knowledgeExpanded[item.id]
                    ? item.content
                    : item.content.slice(0, 160)
                }}{{
                  !knowledgeExpanded[item.id] && item.content.length > 160
                    ? '…'
                    : ''
                }}
              </p>
              <button
                v-if="item.content.length > 160"
                class="memory-expand-btn"
                type="button"
                @click="
                  knowledgeExpanded[item.id] = !knowledgeExpanded[item.id]
                "
              >
                {{ knowledgeExpanded[item.id] ? '收起内容' : '查看完整内容' }}
              </button>
              <div class="button-row">
                <button
                  class="ghost-btn"
                  type="button"
                  @click="editKnowledgeEntry(item)"
                >
                  编辑
                </button>
                <button
                  class="danger-btn"
                  type="button"
                  @click="deleteKnowledgeEntry(item)"
                >
                  删除
                </button>
              </div>
            </article>
          </div>
          <div class="settings-danger">
            <div>
              <strong>恢复默认知识库</strong>
              <p>将替换自定义条目，操作前需确认。</p>
            </div>
            <button
              class="danger-btn"
              type="button"
              @click="resetKnowledgeDefaults"
            >
              恢复默认
            </button>
          </div>
        </article>
        <article
          v-show="activeSection === 'model'"
          id="room-model-settings"
          class="room-settings-card"
        >
          <div class="room-card-head">
            <span class="room-card-icon"
              ><TsIcon name="layers" :size="23"
            /></span>
            <div>
              <h2>角色与布局</h2>
              <p>只调整模型和浮窗的位置，不影响聊天或记忆。</p>
            </div>
          </div>
          <div class="form-grid">
            <label
              >模型大小 <strong>{{ model.scale }}%</strong
              ><input v-model="model.scale" type="range" min="60" max="160"
            /></label>
            <label
              >水平位置 <strong>{{ model.xOffset }} px</strong
              ><input v-model="model.xOffset" type="range" min="-240" max="240"
            /></label>
            <label
              >垂直位置 <strong>{{ model.yOffset }} px</strong
              ><input v-model="model.yOffset" type="range" min="-180" max="180"
            /></label>
            <div class="settings-note">
              <TsIcon name="info" :size="18" />
              <p>
                保存后返回房间查看效果。表情与动作测试位于独立的 Live2D
                调试分类。
              </p>
            </div>
            <div
              v-if="modelSaveNotice.visible"
              class="model-save-notice"
              role="status"
              aria-live="polite"
            >
              <span class="room-test-status success">已保存</span>
              <div>
                <strong>{{ modelSaveNotice.text }}</strong>
                <p>{{ modelSaveNotice.detail }}</p>
              </div>
            </div>
            <div class="button-row">
              <button class="ghost-btn" type="button" @click="resetModel">
                重置模型
              </button>
              <button class="ghost-btn" type="button" @click="resetPanels">
                重置浮窗位置
              </button>
            </div>
          </div>
        </article>
        <article
          v-show="activeSection === 'diary'"
          id="room-diary-settings"
          class="room-settings-card"
        >
          <div class="room-card-head">
            <span class="room-card-icon"
              ><TsIcon name="fileText" :size="23"
            /></span>
            <div>
              <h2>日记与存档</h2>
              <p>管理日记人设与备份；与聊天补充指令分开。</p>
            </div>
          </div>
          <div class="diary-archive-summary">
            <span class="room-test-status success"
              >槽位 {{ diary.slotId }}</span
            >
            <span class="field-hint"
              >角色：{{ diary.personaName || '未设置' }}</span
            >
            <span class="field-hint">日记：{{ diary.entryCount }} 篇</span>
            <span class="field-hint">好感度：{{ diary.affection }}</span>
            <span v-if="diary.lastDiaryAt" class="field-hint"
              >最近一篇：{{ diary.lastDiaryAt }}</span
            >
          </div>
          <div class="button-row">
            <span v-if="diarySyncStatus" class="field-hint" role="status">{{
              diarySyncStatus
            }}</span>
            <button class="ghost-btn" type="button" @click="syncDiarySettings">
              同步账号日记
            </button>
          </div>
          <details
            class="diary-persona-editor settings-disclosure"
            :open="diary.open"
            @toggle="diary.open = $event.currentTarget.open"
          >
            <summary>
              <TsIcon name="book" :size="18" /><span
                ><strong>编辑日记人设</strong
                ><small>角色名、性格、背景与写作偏好</small></span
              ><TsIcon name="chevronDown" :size="17" />
            </summary>
            <div class="form-grid">
              <label
                >角色名<input
                  v-model="diary.persona.name"
                  type="text"
                  placeholder="例如：八千代"
              /></label>
              <label
                >角色简介<textarea
                  v-model="diary.persona.description"
                  placeholder="身份、外貌、与对方的关系"
                ></textarea>
              </label>
              <label
                >性格与口吻<textarea
                  v-model="diary.persona.personality"
                  placeholder="说话习惯、情绪基调、称呼方式"
                ></textarea>
              </label>
              <label
                >相处背景<textarea
                  v-model="diary.persona.scenario"
                  placeholder="日常场景与关系设定"
                ></textarea>
              </label>
              <label
                >补充设定<textarea
                  v-model="diary.persona.creatorNotes"
                  placeholder="可选：写作偏好、禁忌、口头禅"
                ></textarea>
              </label>
              <label
                >标签<input
                  v-model="diary.persona.tags"
                  type="text"
                  placeholder="用顿号或逗号分隔"
              /></label>
              <div class="button-row">
                <button
                  class="primary-btn"
                  type="button"
                  @click="saveDiaryPersona"
                >
                  保存人设
                </button>
              </div>
            </div>
          </details>
          <div class="form-grid">
            <input
              ref="diaryFileInput"
              type="file"
              accept="application/json,.json"
              hidden
              @change="onDiaryImportFile"
            />
            <div class="button-row">
              <button
                class="ghost-btn"
                type="button"
                @click="exportDiaryArchiveFile"
              >
                导出存档 JSON
              </button>
              <button class="ghost-btn" type="button" @click="pickDiaryFile">
                导入存档 JSON
              </button>
              <button
                class="ghost-btn"
                type="button"
                @click="copyDiaryArchivePreview"
              >
                复制存档 JSON
              </button>
            </div>
            <p class="field-hint">
              登录后日记与日记人设同步到当前账号，访客存档保留在本机。导出的
              JSON 格式与桌面版备份一致（version / timestamp / exportDate /
              slotId / data.gameData / data.diary / data.settings / data.prompts
              / data.other），可直接导入继续累积。
            </p>
          </div>
          <div class="settings-danger">
            <div>
              <strong>清空日记存档</strong>
              <p>清空前，请先导出备份。</p>
            </div>
            <button
              class="danger-btn"
              type="button"
              @click="resetDiaryArchiveData"
            >
              清空存档
            </button>
          </div>
        </article>
        <article
          v-show="activeSection === 'mcp'"
          id="room-mcp-settings"
          class="room-settings-card"
        >
          <div class="room-card-head">
            <span class="room-card-icon"
              ><TsIcon name="grid" :size="23"
            /></span>
            <div>
              <h2>工具与扩展<span class="settings-badge">进阶</span></h2>
              <p>有搜索、图片理解或生成需求时，再开启外部工具。</p>
            </div>
          </div>
          <div class="form-grid">
            <label class="settings-toggle-row"
              ><span
                ><strong>允许模型调用 MCP 工具</strong
                ><small>只连接你信任的工具服务。</small></span
              ><input
                v-model="mcp.enabled"
                type="checkbox"
                role="switch"
                aria-label="允许模型调用 MCP 工具"
            /></label>
            <label
              >提供商
              <select
                v-model="mcp.provider"
                @change="applyMcpProvider(mcp.provider)"
              >
                <option value="custom">自定义 MCP</option>
                <option value="minimax-global">MiniMax MCP JS - Global</option>
                <option value="minimax-mainland">
                  MiniMax MCP JS - Mainland
                </option>
                <option value="minimax-token-plan">
                  MiniMax Token Plan MCP
                </option>
              </select>
            </label>
            <label
              >MCP HTTP 端点<input
                v-model="mcp.endpoint"
                type="text"
                placeholder="https://example.com/mcp"
            /></label>
            <label
              >鉴权头<input
                v-model="mcp.authHeader"
                type="text"
                placeholder="Authorization"
            /></label>
            <label
              >访问密钥<input
                v-model="mcp.apiKey"
                type="password"
                placeholder="Bearer ..."
            /></label>
            <p class="field-hint warning-text">
              密钥保存在当前浏览器，调用时用于连接所选工具服务。
            </p>
            <template v-if="mcp.provider.startsWith('minimax')">
              <label
                >MiniMax API Host<input
                  v-model="mcp.apiHost"
                  type="text"
                  placeholder="https://api.minimaxi.chat"
              /></label>
              <label
                >输出目录 / Base Path<input
                  v-model="mcp.basePath"
                  type="text"
                  placeholder="可选，留空由 MCP 服务决定"
              /></label>
              <label
                >资源模式
                <select v-model="mcp.resourceMode">
                  <option value="url">url</option>
                  <option value="local">local</option>
                </select>
              </label>
            </template>
            <label
              >工具白名单<input
                v-model="mcp.toolAllowlist"
                type="text"
                placeholder="留空允许全部，或用逗号分隔工具名"
            /></label>
            <p class="field-hint">
              MCP 请求由浏览器直接发出，端点需要支持 CORS 与 JSON-RPC 的
              tools/list、tools/call。MiniMax MCP JS 预设按 REST 模式传
              meta.auth；Token Plan MCP 使用本站受限桥接
              /api/mcp/token-plan，后端只启动官方
              minimax-coding-plan-mcp，不会请求任意地址。
            </p>
            <div v-if="mcp.tools.length" class="mcp-tool-list">
              <span v-for="tool in mcp.tools" :key="tool.name" class="chip">{{
                tool.name
              }}</span>
            </div>
            <div class="button-row">
              <button
                class="ghost-btn"
                type="button"
                @click="testMCPWithDialog"
              >
                测试并发现工具
              </button>
            </div>
          </div>
        </article>
        <article
          v-show="activeSection === 'debug'"
          id="room-live2d-debug"
          class="room-settings-card"
        >
          <div class="room-card-head">
            <span class="room-card-icon"
              ><TsIcon name="code" :size="23"
            /></span>
            <div>
              <h2>Live2D 调试<span class="settings-badge">开发调试</span></h2>
              <p>排查表情、动作与队列；正常使用时无需配置。</p>
            </div>
          </div>
          <div class="live2d-debug-summary">
            <span
              class="room-test-status"
              :class="
                live2dDebug.status === 'playing'
                  ? 'loading'
                  : live2dDebug.status === 'pending'
                    ? 'warning'
                    : 'success'
              "
            >
              {{ live2DStatusLabel() }}
            </span>
            <span class="field-hint"
              >最近更新：{{ formatDebugTime(live2dDebug.updatedAt) }}</span
            >
            <span class="field-hint"
              >队列进度：{{ live2dDebug.activeIndex }} /
              {{ live2dDebug.total }}</span
            >
          </div>
          <div class="form-grid">
            <label
              >表情
              <select v-model="live2dTest.expression">
                <option
                  v-for="item in live2dExpressionOptions"
                  :key="item.id"
                  :value="item.id"
                >
                  {{ item.label }} / {{ item.id }}
                </option>
              </select>
            </label>
            <label
              >动作
              <select v-model="live2dTest.motion">
                <option
                  v-for="item in live2dMotionOptions"
                  :key="item.id || 'none'"
                  :value="item.id"
                >
                  {{ item.label }}{{ item.id ? ` / ${item.id}` : '' }}
                </option>
              </select>
            </label>
            <label
              >恢复时间 <strong>{{ live2dTest.durationMs }}ms</strong
              ><input
                v-model="live2dTest.durationMs"
                type="range"
                min="800"
                max="12000"
                step="100"
            /></label>
            <div class="button-row">
              <button
                class="primary-btn"
                type="button"
                @click="queueCustomLive2DTest"
              >
                测试当前组合
              </button>
              <button
                class="ghost-btn"
                type="button"
                @click="queuePresetLive2DSequence('greeting')"
              >
                问候队列
              </button>
              <button
                class="ghost-btn"
                type="button"
                @click="queuePresetLive2DSequence('shy')"
              >
                害羞队列
              </button>
              <button
                class="ghost-btn"
                type="button"
                @click="queuePresetLive2DSequence('tears')"
              >
                落泪队列
              </button>
            </div>
            <p class="field-hint">
              调试指令会写入待执行队列。返回房间后自动播放；如果房间在另一个标签页打开，也会通过
              storage 事件执行。
            </p>
            <details class="live2d-debug-details">
              <summary>最近一次控制 JSON</summary>
              <pre>{{ live2dDebugJson }}</pre>
            </details>
            <div v-if="live2dDebug.history.length" class="live2d-debug-history">
              <article
                v-for="item in live2dDebug.history"
                :key="item.id"
                class="memory-item"
              >
                <div class="memory-item-head">
                  <span class="chip">{{ item.source || 'debug' }}</span>
                  <span class="field-hint">{{
                    formatDebugTime(item.createdAt)
                  }}</span>
                </div>
                <pre>{{ JSON.stringify(item.normalized, null, 2) }}</pre>
              </article>
            </div>
          </div>
          <div class="settings-danger">
            <div>
              <strong>清空待执行队列</strong>
              <p>停止尚未执行的调试指令。</p>
            </div>
            <button
              class="danger-btn"
              type="button"
              @click="clearLive2DDebugQueue"
            >
              清空队列
            </button>
          </div>
        </article>
        <p class="settings-caption">TSUKUYOMI SPACE · ROOM SETTINGS</p>
      </div>
      <aside class="settings-context">
        <section class="settings-context-card">
          <h2>
            当前房间
            <small>{{
              hasUnsavedSettings ? '含未保存修改' : '已保存的配置'
            }}</small>
          </h2>
          <div class="settings-context-item">
            <TsIcon name="message" :size="18" />
            <div>
              <span>聊天模型</span><small>{{ llmConnectionLabel }}</small>
            </div>
            <span class="settings-badge" :class="testedConnectionStatus">{{
              {
                idle: llmSetupReady ? '待测试' : '待配置',
                loading: '测试中',
                success: '已连接',
                warning: '待检查',
                error: '失败',
              }[testedConnectionStatus]
            }}</span>
          </div>
          <div class="settings-context-item">
            <TsIcon name="audioLines" :size="18" />
            <div>
              <span>语音朗读</span
              ><small>{{
                tts.enabled ? ttsConnectionLabel : '先用文字，也很好'
              }}</small>
            </div>
            <span class="settings-badge">{{
              tts.enabled ? '已开启' : '未开启'
            }}</span>
          </div>
          <div class="settings-context-item">
            <TsIcon name="bookmark" :size="18" />
            <div>
              <span>长期记忆</span><small>{{ memoryModeLabel }}</small>
            </div>
            <span class="settings-badge" :class="{ success: memory.enabled }">{{
              memory.enabled ? '已开启' : '已关闭'
            }}</span>
          </div>
          <p class="settings-context-foot">
            <TsIcon name="info" :size="14" />聊天仅需完成模型连接
          </p>
        </section>
        <section class="settings-context-card settings-reminder">
          <span><TsIcon name="sparkles" :size="15" /> A LITTLE REMINDER</span>
          <p>先聊起来，<br />再慢慢变成你的房间。</p>
          <small>大部分选项保持默认就好，<br />之后随时可以回来调整。</small>
        </section>
        <section class="settings-context-card settings-privacy">
          <h2><TsIcon name="shield" :size="18" />数据存在哪里？</h2>
          <strong>密钥、接口与知识库</strong>
          <p>保存在当前浏览器，不自动跨设备同步。</p>
          <strong>记忆、日记与日记人设</strong>
          <p>
            {{
              canUseServerMemory
                ? '登录后使用当前账号的私有数据并同步。'
                : '访客保存在本机；登录后使用账号私有数据。'
            }}
          </p>
          <small>记忆和条目的单独保存会立即生效。</small>
        </section>
      </aside>
    </div>
    <footer class="settings-savebar">
      <div class="settings-savebar-inner">
        <div class="settings-save-state" role="status">
          <TsIcon :name="hasUnsavedSettings ? 'penLine' : 'check'" :size="16" />
          <div>
            <span>{{
              hasUnsavedSettings ? '有尚未保存的修改' : '所有修改已保存'
            }}</span
            ><small>{{
              hasUnsavedSettings ? '修改后记得保存' : '可以安心返回房间'
            }}</small>
          </div>
        </div>
        <div class="button-row">
          <button
            class="ghost-btn settings-discard"
            type="button"
            :disabled="
              !hasUnsavedSettings || savingSettings || memorySavePending
            "
            @click="discardSettings"
          >
            放弃修改</button
          ><button
            class="primary-btn"
            type="button"
            :disabled="savingSettings || memorySavePending"
            @click="enterRoom"
          >
            <TsIcon name="arrowRight" :size="17" />{{
              savingSettings
                ? '保存中…'
                : hasUnsavedSettings
                  ? '保存并返回房间'
                  : '返回房间'
            }}
          </button>
        </div>
      </div>
    </footer>
    <Teleport to="body">
      <div
        v-if="testDialog.visible"
        class="room-test-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="testDialog.title || testDialogTargetLabel()"
        @click.self="closeTestDialog"
        @keydown="handleTestDialogKey"
      >
        <section
          ref="testDialogCard"
          class="room-test-modal-card"
          data-material="popover"
          :aria-busy="testDialog.status === 'loading'"
        >
          <div class="room-test-dialog-head">
            <span class="room-test-status" :class="testDialog.status">{{
              testStatusLabel(testDialog.status)
            }}</span>
            <button
              class="ghost-btn compact"
              type="button"
              @click="closeTestDialog"
            >
              关闭
            </button>
          </div>
          <small class="room-test-target">{{ testDialogTargetLabel() }}</small>
          <h3>{{ testDialog.title }}</h3>
          <StatusLoader
            v-if="testDialog.status === 'loading'"
            :label="testDialog.message"
            :detail="testDialog.detail"
          />
          <template v-else>
            <p>{{ testDialog.message }}</p>
            <pre v-if="testDialog.detail">{{ testDialog.detail }}</pre>
            <button
              v-if="showOllamaRepairAction"
              class="ghost-btn room-test-repair"
              type="button"
              @click="copyOllamaRepairCommand"
            >
              <TsIcon name="copy" :size="16" />复制 Windows 修复命令
            </button>
          </template>
        </section>
      </div>
    </Teleport>

    <div
      v-if="toast.visible"
      class="plaza-toast show"
      :class="toast.type"
      :role="toast.type === 'error' ? 'alert' : 'status'"
      aria-live="polite"
    >
      {{ toast.text }}
    </div>
  </main>
</template>
