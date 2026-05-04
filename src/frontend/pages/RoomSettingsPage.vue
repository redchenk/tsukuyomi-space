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
const memory = reactive({ enabled: true });
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

const visitorKey = computed(() => {
  if (props.user?.id) return `user:${props.user.id}`;
  let id = localStorage.getItem('roomMemoryGuestId');
  if (!id) {
    id = `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('roomMemoryGuestId', id);
  }
  return `guest:${id}`;
});

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

function loadSettings() {
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

async function clearMemory() {
  try {
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
          <label class="check-row"><input v-model="memory.enabled" type="checkbox"> 启用本地长期记忆</label>
          <p class="field-hint">记忆保存在本机 IndexedDB，按用户单独分桶，不上传到服务器。当前身份已有 {{ memoryCount }} 条本地记忆。</p>
          <div class="button-row">
            <button class="primary-btn" type="button" @click="saveMemory">保存记忆设置</button>
            <button class="danger-btn" type="button" @click="clearMemory">清空本用户记忆</button>
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

    <div v-if="toast.visible" class="plaza-toast show">{{ toast.text }}</div>
  </main>
</template>
