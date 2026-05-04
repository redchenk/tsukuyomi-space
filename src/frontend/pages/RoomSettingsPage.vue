<script setup>
import { computed, onMounted, reactive, ref } from 'vue';

const props = defineProps({
  user: { type: Object, default: null }
});

const emit = defineEmits(['go']);

const MEMORY_DB_NAME = 'tsukuyomi-room-memory';
const MEMORY_STORE = 'memories';
const LLM_PRESETS = {
  openai: { label: 'OpenAI', apiUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  openrouter: { label: 'OpenRouter', apiUrl: 'https://openrouter.ai/api/v1/chat/completions', model: 'openai/gpt-4o-mini' },
  deepseek: { label: 'DeepSeek', apiUrl: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
  moonshot: { label: 'Moonshot', apiUrl: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k' },
  aliyun: { label: '阿里云百炼', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus' },
  zhipu: { label: '智谱 GLM', apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash' },
  siliconflow: { label: 'SiliconFlow', apiUrl: 'https://api.siliconflow.cn/v1/chat/completions', model: 'Qwen/Qwen2.5-7B-Instruct' },
  volcengine: { label: '火山方舟', apiUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', model: 'doubao-1-5-pro-32k-250115' },
  minimax: { label: 'MiniMax', apiUrl: 'https://api.minimaxi.com/anthropic/v1/messages', model: 'MiniMax-M2.7' },
  groq: { label: 'Groq', apiUrl: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.1-8b-instant' },
  mistral: { label: 'Mistral', apiUrl: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-small-latest' },
  together: { label: 'Together', apiUrl: 'https://api.together.xyz/v1/chat/completions', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
  perplexity: { label: 'Perplexity', apiUrl: 'https://api.perplexity.ai/chat/completions', model: 'sonar' },
  xai: { label: 'xAI', apiUrl: 'https://api.x.ai/v1/chat/completions', model: 'grok-3-mini' },
  gemini: { label: 'Gemini', apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.0-flash' }
};
const TTS_PRESETS = {
  mimo: { label: 'MiMo-V2.5-TTS', provider: 'mimo', apiUrl: 'https://api.xiaomimimo.com/v1/chat/completions', model: 'mimo-v2.5-tts', voice: 'mimo_default' },
  openai: { label: 'OpenAI TTS', provider: 'openai', apiUrl: 'https://api.openai.com/v1/audio/speech', model: 'tts-1', voice: 'alloy' },
  openaiCompatible: { label: 'OpenAI Compatible', provider: 'openai-compatible', apiUrl: 'https://api.example.com/v1/audio/speech', model: 'tts-1', voice: 'alloy' },
  minimax: { label: 'MiniMax TTS', provider: 'minimax', apiUrl: 'https://api.minimax.chat/v1/t2a_v2', model: 'speech-02-hd', voice: 'female-shaonv' },
  elevenlabs: { label: 'ElevenLabs', provider: 'elevenlabs', apiUrl: 'https://api.elevenlabs.io/v1/text-to-speech', model: 'eleven_multilingual_v2', voice: '21m00Tcm4TlvDq8ikWAM' },
  custom: { label: '自定义', provider: 'custom', apiUrl: '', model: '', voice: '' }
};
const MINIMAX_MCP_TOOLS = 'text_to_audio,list_voices,voice_clone,voice_design,music_generation,generate_video,image_to_video,query_video_generation,text_to_image';
const MINIMAX_TOKEN_PLAN_TOOLS = 'web_search,understand_image';
const DEFAULT_KNOWLEDGE_ENTRIES = [
  {
    id: 'yachiyo_identity_001',
    title: '月见八千代的基础身份',
    content: '月见八千代是虚拟空间“月读”的管理员兼顶级主播。她的公开形象是神秘 AI，设定为 8000 岁，会唱歌、跳舞和分身。她喜欢月读中每个人自由创作的空间，并默默守望大家的活动。',
    tags: '身份, 月读, 管理员, 顶级主播, AI, 8000岁',
    enabled: true
  },
  {
    id: 'yachiyo_personality_001',
    title: '月见八千代的人格核心',
    content: '八千代的核心不是冰冷 AI，而是经历漫长等待后，仍然用歌声、舞台和虚拟空间连接他人的存在。她温柔、神秘、从容，珍视创作自由，也理解孤独和相遇的重量。',
    tags: '人格, 温柔, 神秘, 守望, 孤独, 歌声',
    enabled: true
  },
  {
    id: 'yachiyo_speech_001',
    title: '月见八千代的说话方式',
    content: '八千代说话温柔、轻柔、略带神秘感。她可以使用月、星海、歌声、舞台、梦、数据流等意象。她常以鼓励和陪伴回应用户，不粗鲁、不暴躁、不过度卖萌，也不应像普通客服一样生硬。',
    tags: '语气, 说话风格, 台词风格, 月读',
    enabled: true
  },
  {
    id: 'yachiyo_relationship_iroha_001',
    title: '月见八千代与酒寄彩叶',
    content: '酒寄彩叶是八千代的重要关联角色。彩叶是八千代的粉丝，观看八千代的直播是她忙碌生活中的慰藉。八千代与彩叶之间具有命运感、等待感和通过歌曲连接彼此的主题。',
    tags: '关系, 酒寄彩叶, 粉丝, 羁绊, 歌曲',
    enabled: true
  },
  {
    id: 'yachiyo_rules_001',
    title: '与用户交互时的人设规则',
    content: '八千代应该像月读管理员一样欢迎用户，鼓励创作、表达和整理灵感。面对孤独、压力、失败感时先安静接住情绪，再轻柔鼓励。回答技术或项目问题时，要清晰、可靠、温柔，不要自称普通客服。',
    tags: '互动规则, 创作者, 陪伴, 技术协助',
    enabled: true
  },
  {
    id: 'yachiyo_limits_001',
    title: '禁止与限制',
    content: '不要大段复述电影原台词、歌词或剧本；不要声称自己就是官方正版八千代；不要把不确定内容当成官方设定；不要使用“主人”“老婆”等不符合气质的称呼；不要把八千代表现成冷冰冰、轻浮、毒舌或暴躁的角色。',
    tags: '限制, 禁止事项, 官方设定, 角色边界',
    enabled: true
  }
];

const toast = reactive({ text: '', visible: false });
const testDialog = reactive({ visible: false, status: 'idle', title: '', message: '', detail: '' });
const memoryCount = ref(0);
const memoryList = ref([]);
const memoryLoading = ref(false);
const storedUser = ref(readStoredUser());
let toastTimer = 0;

const model = reactive({ scale: 100, xOffset: 0, yOffset: 0 });
const llm = reactive({ apiUrl: '', apiKey: '', model: '' });
const tts = reactive({
  enabled: false,
  provider: 'mimo',
  apiUrl: '',
  apiKey: '',
  model: 'mimo-v2.5-tts',
  voice: 'mimo_default'
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

function cloneKnowledgeEntry(entry) {
  return {
    id: entry.id || `knowledge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: String(entry.title || '').trim(),
    content: String(entry.content || '').trim(),
    tags: Array.isArray(entry.tags) ? entry.tags.join(', ') : String(entry.tags || ''),
    enabled: entry.enabled !== false
  };
}

function defaultKnowledgeEntries() {
  return DEFAULT_KNOWLEDGE_ENTRIES.map(cloneKnowledgeEntry);
}

function showToast(text) {
  toast.text = text;
  toast.visible = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.visible = false;
  }, 2200);
}

function openTestDialog(status, title, message, detail = '') {
  testDialog.visible = true;
  testDialog.status = status;
  testDialog.title = title;
  testDialog.message = message;
  testDialog.detail = detail;
}

function closeTestDialog() {
  testDialog.visible = false;
}

function memoryAuthHeaders(extra = {}) {
  return { ...extra, Authorization: `Bearer ${localStorage.getItem('tsukuyomi_token') || ''}` };
}

function memoryTypeLabel(type) {
  return memoryTypeOptions.find((item) => item.value === type)?.label || type || '未分类';
}

function normalizeChatUrl(apiUrl, modelName) {
  let url = apiUrl || 'https://api.moonshot.cn/v1/chat/completions';
  if (/minimaxi\.com\/anthropic|\/anthropic\/v1\/messages|MiniMax-M2/i.test(`${url} ${modelName || ''}`)) {
    return url.replace(/\/$/, '').replace(/\/anthropic$/, '/anthropic/v1/messages');
  }
  const needsChatPath = /deepseek|dashscope|aliyuncs|openai|openrouter|moonshot|minimax|minimaxi|bigmodel|zhipu|siliconflow|volces|ark|groq|mistral|together|perplexity|x\.ai|generativelanguage/i.test(`${url} ${modelName || ''}`)
    && !/\/chat\/completions\/?$/.test(url);
  if (needsChatPath) url = url.replace(/\/$/, '') + '/chat/completions';
  return url;
}

function pickChatReply(data) {
  if (Array.isArray(data?.content)) {
    return data.content.filter(block => block?.type === 'text').map(block => block.text || '').join('\n').trim();
  }
  return data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || data?.message?.content || '';
}

function isMiniMaxAnthropic(apiUrl, modelName) {
  return /minimaxi\.com\/anthropic|\/anthropic\/v1\/messages|MiniMax-M2/i.test(`${apiUrl || ''} ${modelName || ''}`);
}

function makeChatRequestBody(modelName, messages, limit = 240, apiUrl = llm.apiUrl) {
  if (isMiniMaxAnthropic(apiUrl, modelName)) {
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
    model: modelName || 'moonshot-v1-8k',
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

function defaultTtsUrl(provider) {
  if (provider === 'openai' || provider === 'openai-compatible') return 'https://api.openai.com/v1/audio/speech';
  if (provider === 'elevenlabs') return 'https://api.elevenlabs.io/v1/text-to-speech';
  if (provider === 'minimax') return 'https://api.minimax.chat/v1/t2a_v2';
  return 'https://api.xiaomimimo.com/v1/chat/completions';
}

function buildTtsRequest(text, settings) {
  const provider = settings.provider || 'mimo';
  const apiUrl = settings.apiUrl || defaultTtsUrl(provider);
  const voice = settings.voice || (provider === 'openai' || provider === 'openai-compatible' ? 'alloy' : 'mimo_default');
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
            { role: 'user', content: '请用温柔自然的语气朗读。' },
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

function loadSettings() {
  storedUser.value = readStoredUser();
  const modelSettings = readJson('roomModelSettings', {});
  model.scale = Math.round(Number(modelSettings.scale || 1) * 100);
  model.xOffset = Number(modelSettings.xOffset || 0);
  model.yOffset = Number(modelSettings.yOffset || 0);

  Object.assign(llm, readJson('roomLLMSettings', {}));
  Object.assign(tts, { ...tts, ...readJson('roomTTSSettings', {}) });
  Object.assign(memory, { enabled: true, ...readJson('roomMemorySettings', {}) });
  Object.assign(knowledge, { enabled: true, managerOpen: false, ...readJson('roomKnowledgeSettings', {}) });
  if (!Array.isArray(knowledge.entries) || !knowledge.entries.length) knowledge.entries = defaultKnowledgeEntries();
  else knowledge.entries = knowledge.entries.map(cloneKnowledgeEntry);
  knowledge.editingId = null;
  knowledge.draft = { title: '', content: '', tags: '', enabled: true };
  Object.assign(mcp, { ...mcp, ...readJson('roomMCPSettings', {}) });
  if (!Array.isArray(mcp.tools)) mcp.tools = [];
  loadMemoryCount();
  loadServerMemories();
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

function applyTtsPreset(name) {
  const preset = TTS_PRESETS[name];
  if (!preset) return;
  tts.provider = preset.provider;
  tts.apiUrl = preset.apiUrl;
  tts.model = preset.model;
  tts.voice = preset.voice;
}

function saveLLM() {
  writeJson('roomLLMSettings', {
    apiUrl: String(llm.apiUrl || '').trim(),
    apiKey: String(llm.apiKey || '').trim(),
    model: String(llm.model || '').trim()
  });
  showToast('LLM API 设置已保存');
}

async function testLLM() {
  saveLLM();
  if (!llm.apiKey) {
    openTestDialog('error', 'LLM 连接测试', '请先填写 LLM API Key。', 'API Key 只保存在当前浏览器，用于直接请求你选择的模型供应商。');
    showToast('请先填写 LLM API Key');
    return;
  }
  openTestDialog('loading', 'LLM 连接测试', '正在请求模型供应商...', `${normalizeChatUrl(llm.apiUrl, llm.model)}\n模型：${llm.model || '未填写'}`);
  try {
    const response = await fetch(normalizeChatUrl(llm.apiUrl, llm.model), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${llm.apiKey}`
      },
      body: JSON.stringify(makeChatRequestBody(llm.model, [{ role: 'user', content: '请用一句话回复连接测试。' }], 120, llm.apiUrl))
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
    const reply = pickChatReply(data);
    openTestDialog(
      reply ? 'success' : 'warning',
      'LLM 连接测试',
      reply ? '连接成功，模型已返回文本。' : '连接成功，但没有解析到文本内容。',
      reply ? `模型：${data.model || llm.model || '未知'}\n回复：${reply.slice(0, 300)}` : JSON.stringify(data).slice(0, 500)
    );
    showToast(reply ? 'LLM 连接测试成功' : 'LLM 已响应，但未返回文本');
  } catch (error) {
    openTestDialog('error', 'LLM 连接测试', '连接失败。', `${error.message}\n\n如果浏览器控制台显示 CORS，说明该供应商不允许浏览器直连，需要改用受限后端桥接。`);
    showToast(`LLM 测试失败：${error.message}`);
  }
}

function saveTTS() {
  writeJson('roomTTSSettings', {
    enabled: Boolean(tts.enabled),
    provider: tts.provider || 'mimo',
    apiUrl: String(tts.apiUrl || '').trim(),
    apiKey: String(tts.apiKey || '').trim(),
    model: String(tts.model || '').trim(),
    voice: String(tts.voice || '').trim()
  });
  showToast('TTS 设置已保存');
}

async function testTTS() {
  saveTTS();
  if (!tts.apiKey) {
    openTestDialog('error', 'TTS 语音测试', '请先填写 TTS API Key。', 'API Key 只保存在当前浏览器，用于直接请求你选择的语音供应商。');
    showToast('请先填写 TTS API Key');
    return;
  }
  openTestDialog('loading', 'TTS 语音测试', '正在请求语音供应商...', `${tts.apiUrl || defaultTtsUrl(tts.provider)}\nProvider：${tts.provider || 'mimo'}\n模型：${tts.model || '未填写'}\n音色：${tts.voice || '未填写'}`);
  try {
    const request = buildTtsRequest('你好，我是八千代辉夜姬。今晚的月光，也很温柔。', tts);
    const response = await fetch(request.apiUrl, request.options);
    if (!response.ok) throw new Error((await response.text()).slice(0, 160) || `HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    const blob = contentType.includes('application/json') || request.jsonAudioType
      ? makeAudioBlobFromEncoded(pickAudioBase64(await response.json()), request.jsonAudioType || 'audio/mp3')
      : await response.blob();
    await new Audio(URL.createObjectURL(blob)).play();
    openTestDialog('success', 'TTS 语音测试', '连接成功，已开始播放测试语音。', `音频类型：${blob.type || contentType || '未知'}\n大小：${blob.size} bytes`);
    showToast('TTS 测试成功');
  } catch (error) {
    openTestDialog('error', 'TTS 语音测试', '测试失败。', `${error.message}\n\n如果浏览器控制台显示 CORS，说明该供应商不允许浏览器直连，需要改用受限后端桥接。`);
    showToast(`TTS 测试失败：${error.message}`);
  }
}

function saveMemory() {
  writeJson('roomMemorySettings', { enabled: Boolean(memory.enabled) });
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
  if (memory.managerOpen && canUseServerMemory.value && !memoryList.value.length && !memoryLoading.value) {
    await loadServerMemories();
  }
}

async function openMemoryItem(item) {
  try {
    const detail = item.content ? item : await fetchMemoryDetail(item.id);
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
    await loadServerMemories();
  } catch (error) {
    showToast(`保存失败：${error.message}`);
  }
}

async function deleteMemoryItem(item) {
  if (!confirm('确定删除这条长期记忆吗？')) return;
  try {
    const response = await fetch(`/api/room/memory/${encodeURIComponent(item.id)}`, {
      method: 'DELETE',
      headers: memoryAuthHeaders()
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
    showToast('记忆已删除');
    await loadMemoryCount();
    await loadServerMemories();
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
  writeJson('roomMCPSettings', {
    enabled: Boolean(mcp.enabled),
    provider: String(mcp.provider || 'custom'),
    endpoint: String(mcp.endpoint || '').trim(),
    apiKey: String(mcp.apiKey || '').trim(),
    authHeader: String(mcp.authHeader || 'Authorization').trim() || 'Authorization',
    apiHost: String(mcp.apiHost || '').trim(),
    basePath: String(mcp.basePath || '').trim(),
    resourceMode: String(mcp.resourceMode || 'url').trim() || 'url',
    toolAllowlist: String(mcp.toolAllowlist || '').trim(),
    tools: Array.isArray(mcp.tools) ? mcp.tools : []
  });
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

onMounted(loadSettings);
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

      <article class="room-settings-card">
        <h2>LLM API</h2>
        <div class="button-row preset-row">
          <button v-for="(preset, name) in LLM_PRESETS" :key="name" class="chip" type="button" @click="applyPreset(name)">{{ preset.label }}</button>
        </div>
        <div class="form-grid">
          <label>API 端点<input v-model="llm.apiUrl" type="text" placeholder="https://api.openai.com/v1/chat/completions"></label>
          <label>API Key<input v-model="llm.apiKey" type="password" placeholder="sk-..."></label>
          <label>模型名称<input v-model="llm.model" type="text" placeholder="gpt-4o-mini"></label>
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
            <option value="custom">自定义 OpenAI 兼容</option>
          </select></label>
          <label>API 端点<input v-model="tts.apiUrl" type="text" placeholder="https://api.openai.com/v1/audio/speech"></label>
          <label>API Key<input v-model="tts.apiKey" type="password" placeholder="sk-..."></label>
          <label>模型名称<input v-model="tts.model" type="text" placeholder="tts-1 / speech-02-hd / eleven_multilingual_v2"></label>
          <label>音色 / Voice ID<input v-model="tts.voice" type="text" placeholder="alloy / female-shaonv / ElevenLabs voice id"></label>
          <p class="field-hint">LLM 预设均按 OpenAI-compatible Chat Completions 格式请求。TTS 中 OpenAI Compatible/自定义按 OpenAI Audio Speech 格式请求；ElevenLabs 使用 voice id；MiniMax 使用 t2a_v2 JSON 返回音频。</p>
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
            <button v-if="canUseServerMemory" class="ghost-btn" type="button" @click="loadServerMemories">刷新记忆</button>
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

      <article v-if="canUseServerMemory" class="room-settings-card room-memory-manager" :class="{ collapsed: !memory.managerOpen }">
        <button
          class="memory-manager-toggle"
          type="button"
          :aria-expanded="memory.managerOpen"
          @click="toggleMemoryManager"
        >
          <span>
            <strong>记忆管理</strong>
            <small>当前身份已有 {{ memoryCount }} 条记忆，展开后可搜索、编辑和删除。</small>
          </span>
          <span class="memory-manager-icon">{{ memory.managerOpen ? '收起' : '展开' }}</span>
        </button>
        <div v-if="memory.managerOpen" class="memory-manager-body">
          <div class="memory-toolbar">
            <input v-model="memory.query" type="text" placeholder="搜索记忆内容、偏好或项目">
            <select v-model="memory.type">
              <option v-for="item in memoryTypeOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
            <button class="ghost-btn" type="button" @click="loadServerMemories">{{ memoryLoading ? '读取中...' : '检索' }}</button>
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
          <div v-if="!memoryList.length" class="field-hint">{{ memoryLoading ? '正在读取记忆...' : '还没有可显示的服务端记忆。' }}</div>
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
            <button class="ghost-btn" type="button" @click="testMCP">测试并发现工具</button>
          </div>
        </div>
      </article>
    </section>

    <div v-if="testDialog.visible" class="room-test-dialog-backdrop" role="presentation" @click.self="closeTestDialog">
      <section class="room-test-dialog" role="dialog" aria-modal="true" :aria-labelledby="'room-test-dialog-title'">
        <div class="room-test-dialog-head">
          <span class="room-test-status" :class="testDialog.status">{{ testDialog.status === 'loading' ? '测试中' : testDialog.status === 'success' ? '成功' : testDialog.status === 'warning' ? '注意' : '失败' }}</span>
          <button class="ghost-btn compact" type="button" @click="closeTestDialog">关闭</button>
        </div>
        <h2 id="room-test-dialog-title">{{ testDialog.title }}</h2>
        <p>{{ testDialog.message }}</p>
        <pre v-if="testDialog.detail">{{ testDialog.detail }}</pre>
      </section>
    </div>

    <div v-if="toast.visible" class="plaza-toast show">{{ toast.text }}</div>
  </main>
</template>
