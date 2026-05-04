<script setup>
import { computed, onMounted, reactive, ref } from 'vue';

const props = defineProps({
  user: { type: Object, default: null }
});

const emit = defineEmits(['go']);

const MEMORY_DB_NAME = 'tsukuyomi-room-memory';
const MEMORY_STORE = 'memories';
const LLM_PRESETS = {
  deepseek: { apiUrl: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
  moonshot: { apiUrl: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k' },
  openai: { apiUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  aliyun: { apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus' }
};
const MINIMAX_MCP_TOOLS = 'text_to_audio,list_voices,voice_clone,voice_design,music_generation,generate_video,image_to_video,query_video_generation,text_to_image';
const MINIMAX_TOKEN_PLAN_TOOLS = 'web_search,understand_image';

const toast = reactive({ text: '', visible: false });
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
const memory = reactive({ enabled: true, query: '', type: '', editing: null, expanded: {} });
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

function showToast(text) {
  toast.text = text;
  toast.visible = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.visible = false;
  }, 2200);
}

function memoryAuthHeaders(extra = {}) {
  return { ...extra, Authorization: `Bearer ${localStorage.getItem('tsukuyomi_token') || ''}` };
}

function memoryTypeLabel(type) {
  return memoryTypeOptions.find((item) => item.value === type)?.label || type || '未分类';
}

function normalizeChatUrl(apiUrl, modelName) {
  let url = apiUrl || 'https://api.moonshot.cn/v1/chat/completions';
  const needsChatPath = /deepseek|dashscope|aliyuncs|openai|moonshot/i.test(`${url} ${modelName || ''}`)
    && !/\/chat\/completions\/?$/.test(url);
  if (needsChatPath) url = url.replace(/\/$/, '') + '/chat/completions';
  return url;
}

function pickChatReply(data) {
  return data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || data?.message?.content || '';
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
    showToast('请先填写 LLM API Key');
    return;
  }
  try {
    const response = await fetch(normalizeChatUrl(llm.apiUrl, llm.model), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${llm.apiKey}`
      },
      body: JSON.stringify({
        model: llm.model || 'moonshot-v1-8k',
        messages: [{ role: 'user', content: '请用一句话回复连接测试。' }],
        temperature: 0.4
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
    showToast(pickChatReply(data) ? 'LLM 连接测试成功' : 'LLM 已响应，但未返回文本');
  } catch (error) {
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
    showToast('请先填写 TTS API Key');
    return;
  }
  try {
    const provider = tts.provider || 'mimo';
    const apiUrl = tts.apiUrl || (provider === 'openai'
      ? 'https://api.openai.com/v1/audio/speech'
      : 'https://api.xiaomimimo.com/v1/chat/completions');
    const isMimo = provider === 'mimo' || /xiaomimimo/i.test(apiUrl);
    const response = await fetch(apiUrl, isMimo ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': tts.apiKey },
      body: JSON.stringify({
        model: tts.model || 'mimo-v2.5-tts',
        messages: [
          { role: 'user', content: '请用温柔自然的语气朗读。' },
          { role: 'assistant', content: '你好，我是八千代辉夜姬。今晚的月光，也很温柔。' }
        ],
        modalities: ['audio'],
        audio: { format: 'wav', voice: tts.voice || 'mimo_default' }
      })
    } : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tts.apiKey}` },
      body: JSON.stringify({
        model: tts.model || 'tts-1',
        input: '你好，我是八千代辉夜姬。今晚的月光，也很温柔。',
        voice: tts.voice || 'alloy',
        response_format: 'mp3'
      })
    });
    if (!response.ok) throw new Error((await response.text()).slice(0, 160) || `HTTP ${response.status}`);
    const blob = isMimo
      ? makeAudioBlobFromBase64(pickAudioBase64(await response.json()), 'audio/wav')
      : await response.blob();
    await new Audio(URL.createObjectURL(blob)).play();
    showToast('TTS 测试成功');
  } catch (error) {
    showToast(`TTS 测试失败：${error.message}`);
  }
}

function saveMemory() {
  writeJson('roomMemorySettings', { enabled: Boolean(memory.enabled) });
  showToast(memory.enabled ? '长期记忆已开启' : '长期记忆已关闭');
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
          <button v-for="(_, name) in LLM_PRESETS" :key="name" class="chip" type="button" @click="applyPreset(name)">{{ name }}</button>
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
        <div class="form-grid">
          <label class="check-row"><input v-model="tts.enabled" type="checkbox"> 启用语音合成</label>
          <label>Provider<select v-model="tts.provider"><option value="mimo">MiMo-V2.5-TTS</option><option value="openai">OpenAI TTS</option></select></label>
          <label>API 端点<input v-model="tts.apiUrl" type="text" placeholder="https://api.xiaomimimo.com/v1/chat/completions"></label>
          <label>API Key<input v-model="tts.apiKey" type="password" placeholder="sk-..."></label>
          <label>模型名称<input v-model="tts.model" type="text" placeholder="mimo-v2.5-tts"></label>
          <label>音色<input v-model="tts.voice" type="text" placeholder="mimo_default"></label>
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

      <article v-if="canUseServerMemory" class="room-settings-card room-memory-manager">
        <h2>记忆管理</h2>
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

    <div v-if="toast.visible" class="plaza-toast show">{{ toast.text }}</div>
  </main>
</template>
