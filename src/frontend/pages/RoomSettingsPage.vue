<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { cloneKnowledgeEntry, defaultKnowledgeEntries } from '../constants/room/knowledgeEntries';
import { roomLive2DManifest } from '../constants/room/live2dManifest';
import {
  clearRoomLive2DQueue,
  queueRoomLive2DForNextRoom,
  readRoomLive2DDebugState
} from '../services/room/live2dControl';
import { formatDateTime } from '../utils/time';

const props = defineProps({
  user: { type: Object, default: null }
});

const emit = defineEmits(['go']);

const MEMORY_DB_NAME = 'tsukuyomi-room-memory';
const MEMORY_STORE = 'memories';
const LLM_PRESETS = {
  openai: { label: 'OpenAI Responses', apiUrl: 'https://api.openai.com/v1/responses', model: 'gpt-5.5' },
  openaiChat: { label: 'OpenAI Chat', apiUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  openrouter: { label: 'OpenRouter', apiUrl: 'https://openrouter.ai/api/v1/chat/completions', model: 'openai/gpt-5.2' },
  deepseek: { label: 'DeepSeek', apiUrl: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
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
const TTS_PRESETS = {
  mimo: { label: 'MiMo-V2.5-TTS', provider: 'mimo', apiUrl: 'https://api.xiaomimimo.com/v1/chat/completions', model: 'mimo-v2.5-tts', voice: 'mimo_default' },
  openai: { label: 'OpenAI TTS', provider: 'openai', apiUrl: 'https://api.openai.com/v1/audio/speech', model: 'tts-1', voice: 'alloy' },
  openaiCompatible: { label: 'OpenAI Compatible', provider: 'openai-compatible', apiUrl: 'https://api.example.com/v1/audio/speech', model: 'tts-1', voice: 'alloy' },
  minimax: { label: 'MiniMax TTS', provider: 'minimax', apiUrl: 'https://api.minimax.chat/v1/t2a_v2', model: 'speech-02-hd', voice: 'female-shaonv' },
  elevenlabs: { label: 'ElevenLabs', provider: 'elevenlabs', apiUrl: 'https://api.elevenlabs.io/v1/text-to-speech', model: 'eleven_multilingual_v2', voice: '21m00Tcm4TlvDq8ikWAM' },
  gptSovitsLocal: { label: '本机 GPT-SoVITS 直连', provider: 'gpt-sovits', apiUrl: 'http://localhost:9880/tts', model: 'auto', voice: '', useProxy: false, textLang: 'auto', promptLang: 'ja', gptWeightPath: 'GPT_weights_v2ProPlus/yachiyo-v2pro-e15.ckpt', sovitsWeightPath: 'SoVITS_weights_v2ProPlus/yachiyo-v2pro_e8_s456.pth' },
  custom: { label: '自定义', provider: 'custom', apiUrl: '', model: '', voice: '' }
};
const DEFAULT_GPT_SOVITS_GPT_WEIGHT = 'GPT_weights_v2ProPlus/yachiyo-v2pro-e15.ckpt';
const DEFAULT_GPT_SOVITS_SOVITS_WEIGHT = 'SoVITS_weights_v2ProPlus/yachiyo-v2pro_e8_s456.pth';
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

const toast = reactive({ text: '', visible: false });
const testDialog = reactive({ visible: false, target: '', status: 'idle', title: '', message: '', detail: '' });
const memoryCount = ref(0);
const memoryList = ref([]);
const memoryLoading = ref(false);
const storedUser = ref(readStoredUser());
let toastTimer = 0;

const model = reactive({ scale: 100, xOffset: 0, yOffset: 0 });
const llm = reactive({ apiUrl: '', apiKey: '', model: '', useProxy: false, visionMode: 'auto' });
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
const memory = reactive({ enabled: true, query: '', type: '', editing: null, expanded: {}, managerOpen: false });
const knowledge = reactive({
  enabled: true,
  managerOpen: false,
  entries: [],
  editingId: null,
  draft: { title: '', content: '', tags: '', enabled: true }
});
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

const roomUser = computed(() => storedUser.value || (props.user?.id && localStorage.getItem('tsukuyomi_token') ? props.user : null));
const visitorKey = computed(() => {
  if (roomUser.value?.id) return `user:${roomUser.value.id}`;
  let id = localStorage.getItem('roomMemoryGuestId');
  if (!id) {
    id = `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('roomMemoryGuestId', id);
  }
  return `guest:${id}`;
});
const canUseServerMemory = computed(() => Boolean(roomUser.value?.id && localStorage.getItem('tsukuyomi_token')));
const memoryModeLabel = computed(() => canUseServerMemory.value ? '服务端私有记忆' : '本地浏览器记忆');
const memoryLocationText = computed(() => canUseServerMemory.value
  ? '记忆保存在服务端 SQLite 向量记忆库，按登录用户隔离；未登录时自动退回本机 IndexedDB。'
  : '当前未登录，记忆仅保存在本机 IndexedDB，不上传服务器。');
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
  try {
    return JSON.parse(localStorage.getItem('tsukuyomi_user') || 'null');
  } catch (_) {
    return null;
  }
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

function showToast(text) {
  toast.text = text;
  toast.visible = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.visible = false;
  }, 2200);
}

function openTestDialog(target, status, title, message, detail = '') {
  testDialog.visible = true;
  testDialog.target = target;
  testDialog.status = status;
  testDialog.title = title;
  testDialog.message = message;
  testDialog.detail = detail;
}

function closeTestDialog() {
  testDialog.visible = false;
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
  return { ...extra, Authorization: `Bearer ${localStorage.getItem('tsukuyomi_token') || ''}` };
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

function onLive2DStorageEvent() {
  syncLive2DDebugState();
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
  let url = apiUrl || 'https://api.moonshot.cn/v1/chat/completions';
  if (/(api\.openai\.com|api\.x\.ai)\/v1\/responses\/?$/i.test(url)) return url.replace(/\/$/, '');
  if (/(api\.openai\.com|api\.x\.ai)\/v1\/?$/i.test(url)) return url.replace(/\/$/, '') + '/responses';
  if (/minimaxi\.com\/anthropic|\/anthropic\/v1\/messages|MiniMax-M2/i.test(`${url} ${modelName || ''}`)) {
    return url.replace(/\/$/, '').replace(/\/anthropic$/, '/anthropic/v1/messages');
  }
  if (/anthropic/i.test(`${url} ${modelName || ''}`) && !/\/v1\/messages\/?$/.test(url)) {
    return url.replace(/\/$/, '') + '/v1/messages';
  }
  const needsChatPath = /deepseek|dashscope|aliyuncs|openai|openrouter|moonshot|minimax|minimaxi|bigmodel|zhipu|siliconflow|volces|ark|groq|mistral|together|perplexity|x\.ai|generativelanguage/i.test(`${url} ${modelName || ''}`)
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
  return data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || data?.message?.content || '';
}

function isOpenAIResponsesApi(apiUrl) {
  return /(api\.openai\.com|api\.x\.ai)\/v1\/responses\/?$/i.test(normalizeChatUrl(apiUrl || '', ''));
}

function isOpenRouterApi(apiUrl) {
  return /openrouter\.ai\/api\/v1\/chat\/completions\/?$/i.test(normalizeChatUrl(apiUrl || '', ''));
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
    temperature: 0.4
  };
  body.max_tokens = limit;
  return body;
}

function pickAudioBase64(data) {
  return data?.choices?.[0]?.message?.audio?.data
    || data?.choices?.[0]?.message?.audio
    || data?.audio?.data
    || data?.data?.audio;
}

function makeAudioBlobFromBase64(base64, type) {
  const raw = atob(String(base64 || ''));
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return new Blob([bytes], { type });
}

function makeAudioBlobFromEncoded(value, type) {
  const text = String(value || '').trim();
  if (/^[0-9a-f]+$/i.test(text) && text.length % 2 === 0) {
    const bytes = new Uint8Array(text.length / 2);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = parseInt(text.slice(index * 2, index * 2 + 2), 16);
    }
    return new Blob([bytes], { type });
  }
  return makeAudioBlobFromBase64(text, type);
}

function detectTtsLanguage(text, textLang) {
  const configured = normalizeGptSovitsLang(textLang, '');
  if (configured && configured !== 'auto') return configured;
  const value = String(text || '');
  if (/[\u3040-\u30ff]/u.test(value)) return 'ja';
  if (/[\uac00-\ud7af]/u.test(value)) return 'ko';
  if (/[\u4e00-\u9fff]/u.test(value)) return 'zh';
  return 'en';
}

function ttsReadInstruction(text, textLang) {
  const lang = detectTtsLanguage(text, textLang);
  if (lang === 'ja') return '以下の日本語テキストだけを、柔らかく自然な声で朗読してください。説明、翻訳、括弧内の動作指示、舞台指示は読まないでください。';
  if (lang === 'en') return 'Read only the following English text in a soft, natural voice. Do not read explanations, translations, action cues, or stage directions.';
  if (lang === 'ko') return '다음 한국어 텍스트만 부드럽고 자연스러운 목소리로 읽어 주세요. 설명, 번역, 괄호 안의 동작 지시나 무대 지시는 읽지 마세요.';
  return '只朗读下面的中文文本，语气温柔自然。不要翻译，不要解释，不要读括号里的动作提示或舞台提示。';
}

function defaultTtsUrl(provider) {
  if (provider === 'openai' || provider === 'openai-compatible') return 'https://api.openai.com/v1/audio/speech';
  if (provider === 'elevenlabs') return 'https://api.elevenlabs.io/v1/text-to-speech';
  if (provider === 'minimax') return 'https://api.minimax.chat/v1/t2a_v2';
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
  const path = String(value || '').trim();
  if (/月见八千代|月見八千代|ai配音训练|超时空辉夜姬/.test(path)) {
    return 'E:\\visualstudio\\tts\\reference\\yachiyo_ref_ja.wav';
  }
  return path;
}

function gptSovitsPathWarning(path) {
  return /[^\x00-\x7F]/.test(String(path || ''))
    ? '参考音频路径含中文或特殊字符，GPT-SoVITS 本地 API 可能无法读取；已建议使用 E:\\visualstudio\\tts\\reference\\yachiyo_ref_ja.wav。'
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

function buildTtsRequest(text, settings) {
  const provider = settings.provider || 'mimo';
  const apiUrl = settings.apiUrl || defaultTtsUrl(provider);
  const voice = settings.voice || (provider === 'openai' || provider === 'openai-compatible' ? 'alloy' : 'mimo_default');
  if (provider === 'gpt-sovits') {
    return {
      apiUrl,
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: String(text),
          text_lang: resolveGptSovitsTextLang(text, settings),
          ref_audio_path: normalizeGptSovitsRefAudioPath(settings.refAudioPath || settings.voice),
          prompt_text: settings.promptText || '',
          prompt_lang: normalizeGptSovitsLang(settings.promptLang, 'ja'),
          text_split_method: 'cut5',
          batch_size: 1,
          media_type: 'wav',
          streaming_mode: false,
          parallel_infer: true
        })
      }
    };
  }
  if (provider === 'mimo' || /xiaomimimo/i.test(apiUrl)) {
    return {
      apiUrl,
      jsonAudioType: 'audio/wav',
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': settings.apiKey },
        body: JSON.stringify({
          model: settings.model || 'mimo-v2.5-tts',
          messages: [
            { role: 'user', content: ttsReadInstruction(text, settings.textLang) },
            { role: 'assistant', content: String(text) }
          ],
          modalities: ['audio'],
          audio: { format: 'wav', voice }
        })
      }
    };
  }
  if (provider === 'elevenlabs') {
    const baseUrl = apiUrl.replace(/\/$/, '');
    const finalUrl = /\/text-to-speech\/[^/]+/i.test(baseUrl) ? baseUrl : `${baseUrl}/${encodeURIComponent(voice || '21m00Tcm4TlvDq8ikWAM')}`;
    return {
      apiUrl: finalUrl,
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': settings.apiKey },
        body: JSON.stringify({ text: String(text), model_id: settings.model || 'eleven_multilingual_v2' })
      }
    };
  }
  if (provider === 'minimax') {
    return {
      apiUrl,
      jsonAudioType: 'audio/mp3',
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
        body: JSON.stringify({
          model: settings.model || 'speech-02-hd',
          text: String(text),
          stream: false,
          voice_setting: { voice_id: voice || 'female-shaonv', speed: 1, vol: 1, pitch: 0 },
          audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 }
        })
      }
    };
  }
  return {
    apiUrl,
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
      body: JSON.stringify({
        model: settings.model || 'tts-1',
        input: String(text),
        voice,
        response_format: 'mp3'
      })
    }
  };
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
      const response = await fetch('/api/room/memory/status', {
        headers: { Authorization: `Bearer ${localStorage.getItem('tsukuyomi_token')}` }
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
      memoryCount.value = result.data?.count || 0;
      return;
    }
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

async function loadServerMemories() {
  storedUser.value = readStoredUser();
  if (!canUseServerMemory.value) {
    memoryList.value = [];
    return;
  }
  memoryLoading.value = true;
  try {
    const params = new URLSearchParams({ limit: '80' });
    if (memory.query.trim()) params.set('q', memory.query.trim());
    if (memory.type && !memory.query.trim()) params.set('type', memory.type);
    const response = await fetch(`/api/room/memory?${params}`, {
      headers: memoryAuthHeaders()
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
    memoryList.value = Array.isArray(result.data) ? result.data : [];
    memoryCount.value = memoryList.value.length || memoryCount.value;
  } catch (error) {
    showToast(`读取记忆失败：${error.message}`);
  } finally {
    memoryLoading.value = false;
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

async function loadLocalMemories() {
  memoryLoading.value = true;
  try {
    const db = await openMemoryDb();
    if (!db) {
      memoryList.value = [];
      memoryCount.value = 0;
      return;
    }
    const tx = db.transaction(MEMORY_STORE, 'readonly');
    const index = tx.objectStore(MEMORY_STORE).index('userKey');
    const records = await requestToPromise(index.getAll(IDBKeyRange.only(visitorKey.value)));
    const query = memory.query.trim().toLowerCase();
    const type = memory.type.trim();
    memoryList.value = records
      .filter((item) => !type || item.type === type)
      .filter((item) => {
        if (!query) return true;
        return `${item.summary || ''}\n${item.content || ''}\n${item.visitorName || ''}`.toLowerCase().includes(query);
      })
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 80)
      .map((item) => ({
        ...item,
        type: item.type || 'conversation',
        importance: Number(item.importance ?? 0.5),
        confidence: Number(item.confidence ?? 0.8),
        tags: Array.isArray(item.tags) ? item.tags : []
      }));
    memoryCount.value = records.length;
  } catch (error) {
    showToast(`读取本地记忆失败：${error.message}`);
  } finally {
    memoryLoading.value = false;
  }
}

async function loadVisibleMemories() {
  storedUser.value = readStoredUser();
  if (canUseServerMemory.value) return loadServerMemories();
  return loadLocalMemories();
}

function loadSettings() {
  storedUser.value = readStoredUser();
  const modelSettings = readJson('roomModelSettings', {});
  model.scale = Math.round(Number(modelSettings.scale || 1) * 100);
  model.xOffset = Number(modelSettings.xOffset || 0);
  model.yOffset = Number(modelSettings.yOffset || 0);

  Object.assign(llm, readJson('roomLLMSettings', {}));
  Object.assign(tts, { ...tts, ...readJson('roomTTSSettings', {}) });
  if (tts.provider === 'gpt-sovits') {
    tts.useProxy = false;
    if (!tts.apiUrl || /127\.0\.0\.1/.test(tts.apiUrl)) tts.apiUrl = defaultTtsUrl('gpt-sovits');
  }
  Object.assign(memory, { enabled: true, ...readJson('roomMemorySettings', {}) });
  Object.assign(knowledge, { enabled: true, managerOpen: false, ...readJson('roomKnowledgeSettings', {}) });
  if (!Array.isArray(knowledge.entries) || !knowledge.entries.length) knowledge.entries = defaultKnowledgeEntries();
  else knowledge.entries = knowledge.entries.map(cloneKnowledgeEntry);
  knowledge.editingId = null;
  knowledge.draft = { title: '', content: '', tags: '', enabled: true };
  Object.assign(mcp, { ...mcp, ...readJson('roomMCPSettings', {}) });
  if (!Array.isArray(mcp.tools)) mcp.tools = [];
  loadMemoryCount();
  if (memory.managerOpen) loadVisibleMemories();
}

function applyMcpProvider(provider) {
  mcp.provider = provider;
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
  writeJson('roomModelSettings', {
    scale: Number(model.scale || 100) / 100,
    xOffset: Number(model.xOffset || 0),
    yOffset: Number(model.yOffset || 0)
  });
  showToast('模型设置已保存，回到房间后生效');
}

function resetModel() {
  model.scale = 100;
  model.xOffset = 0;
  model.yOffset = 0;
  saveModel();
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
}

function applyAliyunPreset(name) {
  const preset = ALIYUN_LLM_PRESETS[name];
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

function saveLLM() {
  writeJson('roomLLMSettings', {
    apiUrl: String(llm.apiUrl || '').trim(),
    apiKey: String(llm.apiKey || '').trim(),
    model: String(llm.model || '').trim(),
    useProxy: Boolean(llm.useProxy),
    visionMode: ['auto', 'llm', 'mcp'].includes(llm.visionMode) ? llm.visionMode : 'auto'
  });
  openTestDialog(
    'llm',
    llm.apiKey ? 'success' : 'warning',
    'LLM 设置已保存',
    llm.apiKey ? 'LLM API 设置已保存到当前浏览器。' : 'LLM API 设置已保存，但还没有填写 API Key。',
    `端点：${String(llm.apiUrl || '').trim() || '未填写'}\n模型：${String(llm.model || '').trim() || '未填写'}\n请求方式：${llm.useProxy ? '服务器受限代理' : '浏览器直连'}\n图片理解策略：${llm.visionMode || 'auto'}`
  );
  showToast('LLM API 设置已保存');
}

async function testLLM() {
  saveLLM();
  if (!llm.apiKey) {
    openTestDialog('llm', 'error', 'LLM 连接测试', '请先填写 LLM API Key。', 'API Key 只保存在当前浏览器，用于直接请求你选择的模型供应商。');
    showToast('请先填写 LLM API Key');
    return;
  }
  openTestDialog('llm', 'loading', 'LLM 连接测试', llm.useProxy ? '正在通过站内受限代理请求模型供应商...' : '正在请求模型供应商...', `${llm.useProxy ? '/api/chat' : normalizeChatUrl(llm.apiUrl, llm.model)}\n模型：${llm.model || '未填写'}`);
  try {
    const response = await fetch(llm.useProxy ? '/api/chat' : normalizeChatUrl(llm.apiUrl, llm.model), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...openRouterHeaders(llm.apiUrl),
        ...(llm.useProxy || isAnthropicChatApi(llm.apiUrl, llm.model) ? {} : { Authorization: `Bearer ${llm.apiKey}` }),
        ...(!llm.useProxy && isAnthropicChatApi(llm.apiUrl, llm.model) ? { 'x-api-key': llm.apiKey, 'anthropic-version': '2023-06-01' } : {})
      },
      body: JSON.stringify(llm.useProxy
        ? { message: '请用一句话回复连接测试。', apiKey: llm.apiKey, apiUrl: llm.apiUrl, model: llm.model }
        : makeChatRequestBody(llm.model, [{ role: 'user', content: '请用一句话回复连接测试。' }], 120, llm.apiUrl))
    });
    const raw = await response.json().catch(() => ({}));
    const data = llm.useProxy ? raw.data || raw : raw;
    if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
    const reply = pickChatReply(data);
    openTestDialog(
      'llm',
      reply ? 'success' : 'warning',
      'LLM 连接测试',
      reply ? '连接成功，模型已返回文本。' : '连接成功，但没有解析到文本内容。',
      reply ? `模型：${data.model || llm.model || '未知'}\n回复：${reply.slice(0, 300)}` : JSON.stringify(data).slice(0, 500)
    );
    showToast(reply ? 'LLM 连接测试成功' : 'LLM 已响应，但未返回文本');
  } catch (error) {
    openTestDialog('llm', 'error', 'LLM 连接测试', '连接失败。', `${error.message}\n\n如果浏览器控制台显示 CORS，说明该供应商不允许浏览器直连，需要改用受限后端桥接。`);
    showToast(`LLM 测试失败：${error.message}`);
  }
}

function saveTTS() {
  if (tts.provider === 'gpt-sovits') {
    tts.textLang = normalizeGptSovitsLang(tts.textLang || tts.model, 'auto');
    tts.promptLang = normalizeGptSovitsLang(tts.promptLang, 'ja');
    tts.model = tts.textLang;
    tts.refAudioPath = normalizeGptSovitsRefAudioPath(tts.refAudioPath || tts.voice);
    tts.gptWeightPath = String(tts.gptWeightPath || DEFAULT_GPT_SOVITS_GPT_WEIGHT).trim();
    tts.sovitsWeightPath = String(tts.sovitsWeightPath || DEFAULT_GPT_SOVITS_SOVITS_WEIGHT).trim();
    tts.useProxy = false;
  }
  writeJson('roomTTSSettings', {
    enabled: Boolean(tts.enabled),
    provider: tts.provider || 'mimo',
    apiUrl: String(tts.apiUrl || '').trim(),
    apiKey: String(tts.apiKey || '').trim(),
    model: String(tts.model || '').trim(),
    voice: String(tts.voice || '').trim(),
    refAudioPath: String(tts.refAudioPath || '').trim(),
    promptText: String(tts.promptText || '').trim(),
    textLang: tts.provider === 'gpt-sovits' ? normalizeGptSovitsLang(tts.textLang, 'auto') : String(tts.textLang || '').trim(),
    promptLang: tts.provider === 'gpt-sovits' ? normalizeGptSovitsLang(tts.promptLang, 'ja') : String(tts.promptLang || '').trim(),
    gptWeightPath: String(tts.gptWeightPath || '').trim(),
    sovitsWeightPath: String(tts.sovitsWeightPath || '').trim(),
    useProxy: tts.provider === 'gpt-sovits' ? false : Boolean(tts.useProxy)
  });
  const localGptSovits = tts.provider === 'gpt-sovits';
  openTestDialog(
    'tts',
    tts.enabled && (tts.apiKey || localGptSovits) ? 'success' : 'warning',
    'TTS 设置已保存',
    tts.enabled
      ? (tts.apiKey || localGptSovits ? 'TTS 语音设置已保存到当前浏览器。' : 'TTS 已启用并保存，但还没有填写 API Key。')
      : 'TTS 设置已保存，当前未启用语音合成。',
    `Provider：${tts.provider || 'mimo'}\n端点：${String(tts.apiUrl || '').trim() || defaultTtsUrl(tts.provider)}\n模型/语言：${String(tts.model || tts.textLang || '').trim() || '未填写'}\n音色/参考音频：${String(tts.voice || tts.refAudioPath || '').trim() || '未填写'}\n请求方式：${tts.useProxy ? '服务器受限代理' : '浏览器直连'}${gptSovitsPathWarning(tts.refAudioPath) ? `\n提示：${gptSovitsPathWarning(tts.refAudioPath)}` : ''}`
  );
  showToast('TTS 设置已保存');
}

async function testTTS() {
  saveTTS();
  if (tts.provider !== 'gpt-sovits' && !tts.apiKey) {
    openTestDialog('tts', 'error', 'TTS 语音测试', '请先填写 TTS API Key。', 'API Key 只保存在当前浏览器，用于直接请求你选择的语音供应商。');
    showToast('请先填写 TTS API Key');
    return;
  }
  const testText = tts.provider === 'gpt-sovits'
    ? gptSovitsTestText(tts)
    : '你好，我是八千代辉夜姬。今晚的月光，也很温柔。';
  openTestDialog('tts', 'loading', 'TTS 语音测试', tts.useProxy ? '正在通过站内受限代理请求语音供应商...' : '正在请求语音供应商...', `${tts.useProxy ? '/api/tts' : (tts.apiUrl || defaultTtsUrl(tts.provider))}\nProvider：${tts.provider || 'mimo'}\n模型/语言：${tts.model || tts.textLang || '未填写'}\n音色/参考音频：${tts.voice || tts.refAudioPath || '未填写'}\n测试文本：${testText}`);
  try {
    if (tts.provider === 'gpt-sovits' && !tts.useProxy) {
      await ensureGptSovitsWeights(tts);
      const audioUrl = buildGptSovitsAudioUrl(testText, tts);
      await new Audio(audioUrl).play();
      openTestDialog('tts', 'success', 'TTS 语音测试', '已直接请求本机 GPT-SoVITS 9880 端口并开始播放。', audioUrl);
      showToast('TTS 测试成功');
      return;
    }
    const request = buildTtsRequest(testText, tts);
    const response = tts.useProxy
      ? await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: testText,
          apiKey: tts.apiKey,
          apiUrl: tts.apiUrl,
          provider: tts.provider,
          model: tts.model,
          voice: tts.voice,
          refAudioPath: tts.refAudioPath,
          promptText: tts.promptText,
          textLang: normalizeGptSovitsLang(tts.textLang, 'auto'),
          promptLang: normalizeGptSovitsLang(tts.promptLang, 'ja'),
          gptWeightPath: tts.gptWeightPath,
          sovitsWeightPath: tts.sovitsWeightPath
        })
      })
      : await fetch(request.apiUrl, request.options);
    if (!response.ok) throw new Error((await response.text()).slice(0, 160) || `HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    const blob = contentType.includes('application/json')
      ? makeAudioBlobFromEncoded(pickAudioBase64(await response.json()), request.jsonAudioType || 'audio/mp3')
      : await response.blob();
    await new Audio(URL.createObjectURL(blob)).play();
    openTestDialog('tts', 'success', 'TTS 语音测试', '连接成功，已开始播放测试语音。', `音频类型：${blob.type || contentType || '未知'}\n大小：${blob.size} bytes`);
    showToast('TTS 测试成功');
  } catch (error) {
    openTestDialog('tts', 'error', 'TTS 语音测试', '测试失败。', `${error.message}\n\n如果浏览器控制台显示 CORS，说明该供应商不允许浏览器直连，需要改用受限后端桥接。`);
    showToast(`TTS 测试失败：${error.message}`);
  }
}

function saveMemory() {
  writeJson('roomMemorySettings', { enabled: Boolean(memory.enabled) });
  loadMemoryCount();
  showToast(memory.enabled ? '长期记忆已开启' : '长期记忆已关闭');
}

function saveKnowledge(showMessage = true) {
  knowledge.entries = knowledge.entries.map(cloneKnowledgeEntry).filter(item => item.title || item.content);
  writeJson('roomKnowledgeSettings', {
    enabled: Boolean(knowledge.enabled),
    entries: knowledge.entries
  });
  if (showMessage) showToast('角色知识库已保存，回到房间后生效');
}

function toggleKnowledgeManager() {
  knowledge.managerOpen = !knowledge.managerOpen;
}

function resetKnowledgeDraft() {
  knowledge.editingId = null;
  knowledge.draft = { title: '', content: '', tags: '', enabled: true };
}

function editKnowledgeEntry(item) {
  knowledge.editingId = item.id;
  knowledge.draft = cloneKnowledgeEntry(item);
  knowledge.managerOpen = true;
}

function saveKnowledgeEntry() {
  const entry = cloneKnowledgeEntry(knowledge.draft);
  if (!entry.title || !entry.content) {
    showToast('请填写知识条目的标题和内容');
    return;
  }
  const index = knowledge.entries.findIndex(item => item.id === knowledge.editingId);
  if (index >= 0) knowledge.entries[index] = { ...entry, id: knowledge.editingId };
  else knowledge.entries.unshift(entry);
  resetKnowledgeDraft();
  saveKnowledge(false);
  showToast(index >= 0 ? '知识条目已更新' : '知识条目已添加');
}

function deleteKnowledgeEntry(item) {
  if (!confirm(`确定删除知识条目“${item.title}”吗？`)) return;
  knowledge.entries = knowledge.entries.filter(entry => entry.id !== item.id);
  if (knowledge.editingId === item.id) resetKnowledgeDraft();
  saveKnowledge(false);
  showToast('知识条目已删除');
}

function resetKnowledgeDefaults() {
  if (!confirm('确定恢复默认八千代知识库吗？这会覆盖当前知识条目。')) return;
  knowledge.enabled = true;
  knowledge.entries = defaultKnowledgeEntries();
  resetKnowledgeDraft();
  saveKnowledge(false);
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
    showToast(`读取原文失败：${error.message}`);
    return item;
  }
}

async function fetchMemoryDetail(id) {
  const response = await fetch(`/api/room/memory/${encodeURIComponent(id)}`, {
    headers: memoryAuthHeaders()
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
  return result.data;
}

async function editMemory(item) {
  const detail = await openMemoryItem(item);
  memory.editing = {
    id: detail.id,
    type: detail.type || 'conversation',
    summary: detail.summary || '',
    content: detail.content || '',
    importance: Number(detail.importance || 0.5),
    confidence: Number(detail.confidence || 0.8),
    tags: (detail.tags || []).join(', ')
  };
}

async function toggleMemoryContent(item) {
  if (memory.expanded[item.id]) {
    memory.expanded[item.id] = false;
    return;
  }
  await openMemoryItem(item);
}

function cancelMemoryEdit() {
  memory.editing = null;
}

async function saveMemoryEdit() {
  if (!memory.editing) return;
  try {
    if (!canUseServerMemory.value) {
      const db = await openMemoryDb();
      if (!db) throw new Error('IndexedDB 不可用');
      const existing = memoryList.value.find((item) => item.id === memory.editing.id);
      if (!existing) throw new Error('记忆不存在');
      const tx = db.transaction(MEMORY_STORE, 'readwrite');
      tx.objectStore(MEMORY_STORE).put({
        ...existing,
        type: memory.editing.type,
        summary: memory.editing.summary,
        content: memory.editing.content,
        importance: Number(memory.editing.importance),
        confidence: Number(memory.editing.confidence),
        tags: String(memory.editing.tags || '').split(',').map((item) => item.trim()).filter(Boolean),
        updatedAt: new Date().toISOString()
      });
      await txToPromise(tx);
      showToast('本地记忆已更新');
      memory.editing = null;
      await loadLocalMemories();
      return;
    }
    const response = await fetch(`/api/room/memory/${encodeURIComponent(memory.editing.id)}`, {
      method: 'PATCH',
      headers: memoryAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        type: memory.editing.type,
        summary: memory.editing.summary,
        content: memory.editing.content,
        importance: Number(memory.editing.importance),
        confidence: Number(memory.editing.confidence),
        tags: String(memory.editing.tags || '').split(',').map((item) => item.trim()).filter(Boolean)
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
    showToast('记忆已更新');
    memory.editing = null;
    await loadVisibleMemories();
  } catch (error) {
    showToast(`保存失败：${error.message}`);
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
      showToast('本地记忆已删除');
      await loadLocalMemories();
      return;
    }
    const response = await fetch(`/api/room/memory/${encodeURIComponent(item.id)}`, {
      method: 'DELETE',
      headers: memoryAuthHeaders()
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
    showToast('记忆已删除');
    await loadMemoryCount();
    await loadVisibleMemories();
  } catch (error) {
    showToast(`删除失败：${error.message}`);
  }
}

async function clearMemory() {
  try {
    if (canUseServerMemory.value) {
      const response = await fetch('/api/room/memory', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('tsukuyomi_token')}` }
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
      memoryCount.value = 0;
      memoryList.value = [];
      memory.editing = null;
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
    memory.editing = null;
    memory.expanded = {};
    showToast(`已清空 ${records.length} 条本地记忆`);
  } catch (error) {
    showToast(`清空失败：${error.message}`);
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

function saveMCP() {
  const endpoint = String(mcp.endpoint || '').trim();
  const toolAllowlist = String(mcp.toolAllowlist || '').trim();
  writeJson('roomMCPSettings', {
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
  });
  openTestDialog(
    'mcp',
    mcp.enabled && endpoint ? 'success' : 'warning',
    'MCP 设置已保存',
    mcp.enabled
      ? (endpoint ? 'MCP 设置已保存并启用。' : 'MCP 已启用并保存，但还没有填写端点。')
      : 'MCP 设置已保存，当前未启用。',
    `Provider：${mcp.provider || 'custom'}\n端点：${endpoint || '未填写'}\n认证头：${String(mcp.authHeader || 'Authorization').trim() || 'Authorization'}\n工具白名单：${toolAllowlist || '允许全部'}\n已发现工具：${Array.isArray(mcp.tools) ? mcp.tools.length : 0}`
  );
  showToast(mcp.enabled ? 'MCP 设置已保存并启用' : 'MCP 设置已保存（当前未启用）');
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
    saveMCP();
    showToast(mcp.tools.length ? `MCP 已连接，发现 ${mcp.tools.length} 个工具` : 'MCP 已连接，但未发现工具');
  } catch (error) {
    showToast(`MCP 测试失败：${error.message}`);
  }
}

async function testMCPWithDialog() {
  saveMCP();
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
    saveMCP();
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
    showToast(`MCP 测试失败：${error.message}`);
  }
}

onMounted(() => {
  loadSettings();
  syncLive2DDebugState();
  window.addEventListener('tsukuyomi:room-live2d-debug', onLive2DDebugEvent);
  window.addEventListener('storage', onLive2DStorageEvent);
});

onBeforeUnmount(() => {
  window.removeEventListener('tsukuyomi:room-live2d-debug', onLive2DDebugEvent);
  window.removeEventListener('storage', onLive2DStorageEvent);
});
</script>

<template>
  <main class="page room-settings-page">
    <section class="room-settings-hero">
      <div>
        <div class="hub-kicker">Room Settings</div>
        <h1 class="section-title">房间设置</h1>
        <p class="section-subtitle">模型位置、LLM、TTS、长期记忆和 MCP 工具都集中在这里管理。保存后回到房间即可使用。</p>
      </div>
      <div class="room-settings-actions">
        <a class="primary-btn" href="/room" @click.prevent="emit('go', '/room')">返回房间</a>
        <button class="ghost-btn" type="button" @click="loadSettings">重新读取</button>
      </div>
    </section>

    <section class="room-settings-grid">
      <article class="room-settings-card">
        <h2>模型与浮窗</h2>
        <div class="form-grid">
          <label>模型大小 <strong>{{ model.scale }}%</strong><input v-model="model.scale" type="range" min="60" max="160"></label>
          <label>水平位置 <strong>{{ model.xOffset }}</strong><input v-model="model.xOffset" type="range" min="-240" max="240"></label>
          <label>垂直位置 <strong>{{ model.yOffset }}</strong><input v-model="model.yOffset" type="range" min="-180" max="180"></label>
          <div class="button-row">
            <button class="primary-btn" type="button" @click="saveModel">保存模型设置</button>
            <button class="ghost-btn" type="button" @click="resetModel">重置模型</button>
            <button class="ghost-btn" type="button" @click="resetPanels">重置浮窗位置</button>
          </div>
        </div>
      </article>

      <article class="room-settings-card room-live2d-debug-card">
        <h2>Live2D 调试</h2>
        <div class="live2d-debug-summary">
          <span class="room-test-status" :class="live2dDebug.status === 'playing' ? 'loading' : live2dDebug.status === 'pending' ? 'warning' : 'success'">
            {{ live2DStatusLabel() }}
          </span>
          <span class="field-hint">最近更新：{{ formatDebugTime(live2dDebug.updatedAt) }}</span>
          <span class="field-hint">队列进度：{{ live2dDebug.activeIndex }} / {{ live2dDebug.total }}</span>
        </div>
        <div class="form-grid">
          <label>表情
            <select v-model="live2dTest.expression">
              <option v-for="item in live2dExpressionOptions" :key="item.id" :value="item.id">{{ item.label }} / {{ item.id }}</option>
            </select>
          </label>
          <label>动作
            <select v-model="live2dTest.motion">
              <option v-for="item in live2dMotionOptions" :key="item.id || 'none'" :value="item.id">{{ item.label }}{{ item.id ? ` / ${item.id}` : '' }}</option>
            </select>
          </label>
          <label>恢复时间 <strong>{{ live2dTest.durationMs }}ms</strong><input v-model="live2dTest.durationMs" type="range" min="800" max="12000" step="100"></label>
          <div class="button-row">
            <button class="primary-btn" type="button" @click="queueCustomLive2DTest">测试当前组合</button>
            <button class="ghost-btn" type="button" @click="queuePresetLive2DSequence('greeting')">问候队列</button>
            <button class="ghost-btn" type="button" @click="queuePresetLive2DSequence('shy')">害羞队列</button>
            <button class="ghost-btn" type="button" @click="queuePresetLive2DSequence('tears')">落泪队列</button>
            <button class="danger-btn" type="button" @click="clearLive2DDebugQueue">清空队列</button>
          </div>
          <p class="field-hint">调试指令会写入待执行队列。返回房间后自动播放；如果房间在另一个标签页打开，也会通过 storage 事件执行。</p>
          <details class="live2d-debug-details">
            <summary>最近一次控制 JSON</summary>
            <pre>{{ live2dDebugJson }}</pre>
          </details>
          <div v-if="live2dDebug.history.length" class="live2d-debug-history">
            <article v-for="item in live2dDebug.history" :key="item.id" class="memory-item">
              <div class="memory-item-head">
                <span class="chip">{{ item.source || 'debug' }}</span>
                <span class="field-hint">{{ formatDebugTime(item.createdAt) }}</span>
              </div>
              <pre>{{ JSON.stringify(item.normalized, null, 2) }}</pre>
            </article>
          </div>
        </div>
      </article>

      <article class="room-settings-card">
        <h2>LLM API</h2>
        <div class="button-row preset-row">
          <details class="preset-menu">
            <summary class="chip">阿里云百炼</summary>
            <div class="preset-submenu">
              <button v-for="(preset, name) in ALIYUN_LLM_PRESETS" :key="name" class="chip" type="button" @click="applyAliyunPreset(name)">{{ preset.label }}</button>
            </div>
          </details>
          <button v-for="(preset, name) in LLM_PRESETS" :key="name" class="chip" type="button" @click="applyPreset(name)">{{ preset.label }}</button>
        </div>
        <div class="form-grid">
          <label>API 端点<input v-model="llm.apiUrl" type="text" placeholder="https://api.openai.com/v1/chat/completions"></label>
          <label>API Key<input v-model="llm.apiKey" type="password" placeholder="sk-..."></label>
          <label>模型名称<input v-model="llm.model" type="text" placeholder="gpt-4o-mini"></label>
          <label>图片理解策略<select v-model="llm.visionMode">
            <option value="auto">自动识别视觉模型</option>
            <option value="llm">强制发送给 LLM</option>
            <option value="mcp">使用 MCP understand_image</option>
          </select></label>
          <label class="check-row"><input v-model="llm.useProxy" type="checkbox"> 使用服务器受限代理规避 CORS</label>
          <p class="field-hint">关闭时由浏览器直连供应商，更保护隐私；开启后请求会经过本站后端，仅允许预设供应商域名，用于处理 CORS 限制。</p>
          <div class="button-row">
            <button class="primary-btn" type="button" @click="saveLLM">保存 LLM</button>
            <button class="ghost-btn" type="button" @click="testLLM">测试连接</button>
          </div>
        </div>
      </article>

      <article class="room-settings-card">
        <h2>TTS 语音</h2>
        <div class="button-row preset-row">
          <button v-for="(preset, name) in TTS_PRESETS" :key="name" class="chip" type="button" @click="applyTtsPreset(name)">{{ preset.label }}</button>
        </div>
        <div class="form-grid">
          <label class="check-row"><input v-model="tts.enabled" type="checkbox"> 启用语音合成</label>
          <label>Provider<select v-model="tts.provider">
            <option value="mimo">MiMo-V2.5-TTS</option>
            <option value="openai">OpenAI TTS</option>
            <option value="openai-compatible">OpenAI Compatible</option>
            <option value="minimax">MiniMax TTS</option>
            <option value="elevenlabs">ElevenLabs</option>
            <option value="gpt-sovits">本地 GPT-SoVITS</option>
            <option value="custom">自定义 OpenAI 兼容</option>
          </select></label>
          <label>API 端点<input v-model="tts.apiUrl" type="text" placeholder="https://api.openai.com/v1/audio/speech"></label>
          <label>API Key<input v-model="tts.apiKey" type="password" placeholder="sk-..."></label>
          <label>模型名称<input v-model="tts.model" type="text" placeholder="tts-1 / speech-02-hd / eleven_multilingual_v2"></label>
          <label>音色 / Voice ID<input v-model="tts.voice" type="text" placeholder="alloy / female-shaonv / ElevenLabs voice id"></label>
          <template v-if="tts.provider === 'gpt-sovits'">
            <label>文本语言<select v-model="tts.textLang">
              <option v-for="option in GPT_SOVITS_LANGUAGE_OPTIONS" :key="`text-${option.value}`" :value="option.value">{{ option.label }}</option>
            </select></label>
            <label>参考音频路径<input v-model="tts.refAudioPath" type="text" placeholder="E:\\visualstudio\\tts\\xxx.wav"></label>
            <label>参考音频文本<input v-model="tts.promptText" type="text" placeholder="参考音频里说的话"></label>
            <label>参考音频语言<select v-model="tts.promptLang">
              <option v-for="option in GPT_SOVITS_LANGUAGE_OPTIONS" :key="`prompt-${option.value}`" :value="option.value">{{ option.label }}</option>
            </select></label>
            <label>GPT 权重路径<input v-model="tts.gptWeightPath" type="text" placeholder="GPT_weights_v2ProPlus/yachiyo-v2pro-e15.ckpt"></label>
            <label>SoVITS 权重路径<input v-model="tts.sovitsWeightPath" type="text" placeholder="SoVITS_weights_v2ProPlus/yachiyo-v2pro_e8_s456.pth"></label>
            <p v-if="gptSovitsPathWarning(tts.refAudioPath)" class="field-hint warning-text">{{ gptSovitsPathWarning(tts.refAudioPath) }}</p>
          </template>
          <label v-if="tts.provider !== 'gpt-sovits'" class="check-row"><input v-model="tts.useProxy" type="checkbox"> 使用服务器受限代理规避 CORS</label>
          <p class="field-hint" v-if="tts.provider === 'gpt-sovits'">本机 GPT-SoVITS 仅支持浏览器直连 http://localhost:9880/tts。请在访问设备上启动 GPT-SoVITS API，网站服务器不会代为连接 GPT-SoVITS。</p>
          <p class="field-hint" v-else>关闭时由浏览器直连供应商；开启后请求会经过本站后端，仅允许预设供应商域名，用于处理 CORS 限制。</p>
          <div class="button-row">
            <button class="primary-btn" type="button" @click="saveTTS">保存 TTS</button>
            <button class="ghost-btn" type="button" @click="testTTS">测试语音</button>
          </div>
        </div>
      </article>

      <article class="room-settings-card">
        <h2>长期记忆</h2>
        <div class="form-grid">
          <label class="check-row"><input v-model="memory.enabled" type="checkbox"> 启用长期记忆</label>
          <p class="field-hint">{{ memoryLocationText }} 当前身份已有 {{ memoryCount }} 条记忆。</p>
          <div class="button-row">
            <button class="primary-btn" type="button" @click="saveMemory">保存记忆设置</button>
            <button class="ghost-btn" type="button" @click="loadVisibleMemories">刷新记忆</button>
            <button class="danger-btn" type="button" @click="clearMemory">清空本用户记忆</button>
          </div>
        </div>
      </article>

      <article class="room-settings-card room-knowledge-manager" :class="{ collapsed: !knowledge.managerOpen }">
        <button
          class="memory-manager-toggle"
          type="button"
          :aria-expanded="knowledge.managerOpen"
          @click="toggleKnowledgeManager"
        >
          <span>
            <strong>角色知识库</strong>
            <small>用于还原八千代的人格、说话方式和关系设定。当前有 {{ knowledge.entries.length }} 条知识。</small>
          </span>
          <span class="memory-manager-icon">{{ knowledge.managerOpen ? '收起' : '展开' }}</span>
        </button>
        <div v-if="knowledge.managerOpen" class="memory-manager-body">
          <label class="check-row"><input v-model="knowledge.enabled" type="checkbox"> 启用角色知识库注入</label>
          <p class="field-hint">知识库保存在当前浏览器 localStorage。聊天时会按用户问题选取相关条目注入 LLM，不会覆盖每个用户独立的长期记忆。</p>
          <form class="knowledge-editor" @submit.prevent="saveKnowledgeEntry">
            <label>标题<input v-model="knowledge.draft.title" type="text" placeholder="例如：月见八千代的说话方式"></label>
            <label>内容<textarea v-model="knowledge.draft.content" placeholder="写入角色事实、人设规则、口吻或行为边界"></textarea></label>
            <label>标签<input v-model="knowledge.draft.tags" type="text" placeholder="逗号分隔，如 温柔, 月读, 创作者"></label>
            <label class="check-row"><input v-model="knowledge.draft.enabled" type="checkbox"> 启用这条知识</label>
            <div class="button-row">
              <button class="primary-btn" type="submit">{{ knowledge.editingId ? '保存条目' : '添加条目' }}</button>
              <button class="ghost-btn" type="button" @click="resetKnowledgeDraft">清空表单</button>
              <button class="ghost-btn" type="button" @click="saveKnowledge">保存知识库</button>
              <button class="danger-btn" type="button" @click="resetKnowledgeDefaults">恢复默认</button>
            </div>
          </form>
          <div class="knowledge-list">
            <article v-for="item in knowledge.entries" :key="item.id" class="memory-item knowledge-item" :class="{ disabled: !item.enabled }">
              <div class="memory-item-head">
                <span class="chip">{{ item.enabled ? '启用' : '停用' }}</span>
                <span class="field-hint">{{ item.tags || '未设置标签' }}</span>
              </div>
              <strong>{{ item.title }}</strong>
              <p>{{ item.content }}</p>
              <div class="button-row">
                <button class="ghost-btn" type="button" @click="editKnowledgeEntry(item)">编辑</button>
                <button class="danger-btn" type="button" @click="deleteKnowledgeEntry(item)">删除</button>
              </div>
            </article>
          </div>
        </div>
      </article>

      <article class="room-settings-card room-memory-manager" :class="{ collapsed: !memory.managerOpen }">
        <button
          class="memory-manager-toggle"
          type="button"
          :aria-expanded="memory.managerOpen"
          @click="toggleMemoryManager"
        >
          <span>
            <strong>记忆管理</strong>
            <small>{{ memoryModeLabel }}已有 {{ memoryCount }} 条，展开后可搜索、编辑和删除。</small>
          </span>
          <span class="memory-manager-icon">{{ memory.managerOpen ? '收起' : '展开' }}</span>
        </button>
        <div v-if="memory.managerOpen" class="memory-manager-body">
          <div class="memory-toolbar">
            <input v-model="memory.query" type="text" placeholder="搜索记忆内容、偏好或项目">
            <select v-model="memory.type">
              <option v-for="item in memoryTypeOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
            <button class="ghost-btn" type="button" @click="loadVisibleMemories">{{ memoryLoading ? '读取中...' : '检索' }}</button>
          </div>
          <form v-if="memory.editing" class="memory-editor" @submit.prevent="saveMemoryEdit">
          <label>类型
            <select v-model="memory.editing.type">
              <option v-for="item in memoryTypeOptions.filter((option) => option.value)" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </label>
          <label>摘要<input v-model="memory.editing.summary" type="text"></label>
          <label>内容<textarea v-model="memory.editing.content"></textarea></label>
          <label>标签<input v-model="memory.editing.tags" type="text" placeholder="逗号分隔"></label>
          <div class="memory-score-row">
            <label>重要度 <strong>{{ Number(memory.editing.importance).toFixed(2) }}</strong><input v-model="memory.editing.importance" type="range" min="0" max="1" step="0.05"></label>
            <label>置信度 <strong>{{ Number(memory.editing.confidence).toFixed(2) }}</strong><input v-model="memory.editing.confidence" type="range" min="0" max="1" step="0.05"></label>
          </div>
          <div class="button-row">
            <button class="primary-btn" type="submit">保存记忆</button>
            <button class="ghost-btn" type="button" @click="cancelMemoryEdit">取消</button>
          </div>
          </form>
          <div v-if="!memoryList.length" class="field-hint">{{ memoryLoading ? '正在读取记忆...' : `还没有可显示的${memoryModeLabel}。` }}</div>
          <div v-else class="memory-list">
            <article v-for="item in memoryList" :key="item.id" class="memory-item">
            <div class="memory-item-head">
              <span class="chip">{{ memoryTypeLabel(item.type) }}</span>
              <span class="field-hint">重要度 {{ Number(item.importance || 0).toFixed(2) }} · 置信度 {{ Number(item.confidence || 0).toFixed(2) }}</span>
            </div>
            <strong>{{ item.summary }}</strong>
            <button class="memory-expand-btn" type="button" @click="toggleMemoryContent(item)">
              {{ memory.expanded[item.id] ? '收起原文' : '展开原文' }}
            </button>
            <p v-if="memory.expanded[item.id]">{{ item.content || '正在读取原文...' }}</p>
            <div v-if="item.tags?.length" class="memory-tags">
              <span v-for="tag in item.tags" :key="`${item.id}-${tag}`">{{ tag }}</span>
            </div>
            <div class="button-row">
              <button class="ghost-btn" type="button" @click="editMemory(item)">编辑</button>
              <button class="danger-btn" type="button" @click="deleteMemoryItem(item)">删除</button>
            </div>
            </article>
          </div>
        </div>
      </article>

      <article class="room-settings-card">
        <h2>MCP 工具接入</h2>
        <div class="form-grid">
          <label class="check-row"><input v-model="mcp.enabled" type="checkbox"> 允许 LLM 调用 MCP 工具</label>
          <label>提供商
            <select v-model="mcp.provider" @change="applyMcpProvider(mcp.provider)">
              <option value="custom">自定义 MCP</option>
              <option value="minimax-global">MiniMax MCP JS - Global</option>
              <option value="minimax-mainland">MiniMax MCP JS - Mainland</option>
              <option value="minimax-token-plan">MiniMax Token Plan MCP</option>
            </select>
          </label>
          <label>MCP HTTP 端点<input v-model="mcp.endpoint" type="text" placeholder="https://example.com/mcp"></label>
          <label>鉴权头<input v-model="mcp.authHeader" type="text" placeholder="Authorization"></label>
          <label>访问密钥<input v-model="mcp.apiKey" type="password" placeholder="Bearer ..."></label>
          <template v-if="mcp.provider.startsWith('minimax')">
            <label>MiniMax API Host<input v-model="mcp.apiHost" type="text" placeholder="https://api.minimaxi.chat"></label>
            <label>输出目录 / Base Path<input v-model="mcp.basePath" type="text" placeholder="可选，留空由 MCP 服务决定"></label>
            <label>资源模式
              <select v-model="mcp.resourceMode">
                <option value="url">url</option>
                <option value="local">local</option>
              </select>
            </label>
          </template>
          <label>工具白名单<input v-model="mcp.toolAllowlist" type="text" placeholder="留空允许全部，或用逗号分隔工具名"></label>
          <p class="field-hint">MCP 请求由浏览器直接发出，端点需要支持 CORS 与 JSON-RPC 的 tools/list、tools/call。MiniMax MCP JS 预设按 REST 模式传 meta.auth；Token Plan MCP 使用本站受限桥接 /api/mcp/token-plan，后端只启动官方 minimax-coding-plan-mcp，不会请求任意地址。</p>
          <div v-if="mcp.tools.length" class="mcp-tool-list">
            <span v-for="tool in mcp.tools" :key="tool.name" class="chip">{{ tool.name }}</span>
          </div>
          <div class="button-row">
            <button class="primary-btn" type="button" @click="saveMCP">保存 MCP</button>
            <button class="ghost-btn" type="button" @click="testMCPWithDialog">测试并发现工具</button>
          </div>
        </div>
      </article>
    </section>

    <Teleport to="body">
      <div
        v-if="testDialog.visible"
        class="room-test-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="testDialog.title || testDialogTargetLabel()"
        @click.self="closeTestDialog"
      >
        <section class="room-test-modal-card">
          <div class="room-test-dialog-head">
            <span class="room-test-status" :class="testDialog.status">{{ testStatusLabel(testDialog.status) }}</span>
            <button class="ghost-btn compact" type="button" @click="closeTestDialog">关闭</button>
          </div>
          <small class="room-test-target">{{ testDialogTargetLabel() }}</small>
          <h3>{{ testDialog.title }}</h3>
          <p>{{ testDialog.message }}</p>
          <pre v-if="testDialog.detail">{{ testDialog.detail }}</pre>
        </section>
      </div>
    </Teleport>

    <div v-if="toast.visible" class="plaza-toast show">{{ toast.text }}</div>
  </main>
</template>
