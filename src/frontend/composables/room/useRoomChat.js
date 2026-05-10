import { nextTick, ref } from 'vue';
import { defaultKnowledgeEntries } from '../../constants/room/knowledgeEntries';
import { readJson, writeJson } from '../../services/room/roomStorage';

function uid() {
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function stripControlTags(text) {
  return String(text || '')
    .replace(/<\|ACT:[\s\S]*?\|>/g, '')
    .replace(/<\|DELAY:\d+(?:\.\d+)?\|>/g, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
}

function stripLeadingActionHints(text) {
  let value = String(text || '').trim();
  const actionHintPattern = /^(?:\s*(?:[\(（][^()（）\n]{1,100}[\)）]|[\[【][^[\]【】\n]{1,100}[\]】]|\*[^*\n]{1,100}\*|(?:动作|表情|姿态|语气|神态|动作提示)\s*[:：][^\n]{1,140})\s*)+/u;
  let previous = '';
  while (value && value !== previous) {
    previous = value;
    value = value.replace(actionHintPattern, '').trimStart();
  }
  return value.trim();
}

function isActionHint(value) {
  return /(?:\u52a8\u4f5c|\u8868\u60c5|\u59ff\u6001|\u8bed\u6c14|\u795e\u6001|\u63d0\u793a|\u5fae\u7b11|\u8f7b\u7b11|\u7b11|\u70b9\u5934|\u6447\u5934|\u7728\u773c|\u4f4e\u5934|\u62ac\u5934|\u53f9\u6c14|\u9760\u8fd1|\u6c89\u9ed8|\u505c\u987f|\u51dd\u89c6|\u4f38\u624b|\u6325\u624b|\u6b6a\u5934|\u8138\u7ea2|\u8f7b\u58f0|\u5c0f\u58f0|\u6e29\u67d4\u5730|\u770b\u5411)/u.test(String(value || ''));
}

function stripActionHints(text) {
  let value = String(text || '').trim();
  const leadingActionHintPattern = /^(?:\s*(?:[\(\uFF08][^()\uFF08\uFF09\n]{1,100}[\)\uFF09]|[\[\u3010][^[\]\u3010\u3011\n]{1,100}[\]\u3011]|\*[^*\n]{1,100}\*|(?:\u52a8\u4f5c|\u8868\u60c5|\u59ff\u6001|\u8bed\u6c14|\u795e\u6001|\u52a8\u4f5c\u63d0\u793a)\s*[:\uFF1A][^\n]{1,140})\s*)+/u;
  let previous = '';
  while (value && value !== previous) {
    previous = value;
    value = value.replace(leadingActionHintPattern, '').trimStart();
  }

  return value
    .replace(/(?:^|\n)\s*(?:\u52a8\u4f5c|\u8868\u60c5|\u59ff\u6001|\u8bed\u6c14|\u795e\u6001|\u52a8\u4f5c\u63d0\u793a)\s*[:\uFF1A][^\n]{1,140}(?=\n|$)/gu, '\n')
    .replace(/[\(\uFF08]([^()\uFF08\uFF09\n]{1,80})[\)\uFF09]/gu, (match, cue) => (isActionHint(cue) ? '' : match))
    .replace(/[\[\u3010]([^[\]\u3010\u3011\n]{1,80})[\]\u3011]/gu, (match, cue) => (isActionHint(cue) ? '' : match))
    .replace(/\*([^*\n]{1,80})\*/gu, (match, cue) => (isActionHint(cue) ? '' : match))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanReply(text) {
  const cleaned = stripActionHints(stripControlTags(text));
  return cleaned || '\u55ef\uff0c\u6211\u5728\u3002';
}

function cleanTtsText(text) {
  return cleanReply(text)
    .replace(/(?:^|\n)\s*(?:動作|表情|姿勢|口調|感情|リアクション|しぐさ|ト書き)\s*[:：][^\n]{1,140}(?=\n|$)/gu, '\n')
    .replace(/[\(\uFF08]([^()\uFF08\uFF09\n]{1,80})[\)\uFF09]/gu, (match, cue) => (
      /(?:微笑|笑う|うなず|首をかしげ|見つめ|手を振|ため息|囁|近づ|照れ|沈黙|目を伏せ|表情|動作|しぐさ)/u.test(cue) ? '' : match
    ))
    .replace(/[\[\u3010]([^[\]\u3010\u3011\n]{1,80})[\]\u3011]/gu, (match, cue) => (
      /(?:微笑|笑う|うなず|首をかしげ|見つめ|手を振|ため息|囁|近づ|照れ|沈黙|目を伏せ|表情|動作|しぐさ)/u.test(cue) ? '' : match
    ))
    .replace(/\*([^*\n]{1,80})\*/gu, (match, cue) => (
      /(?:微笑|笑う|うなず|首をかしげ|見つめ|手を振|ため息|囁|近づ|照れ|沈黙|目を伏せ|表情|動作|しぐさ)/u.test(cue) ? '' : match
    ))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const LIVE2D_EXPRESSION_ALIASES = {
  smile: 'smile',
  happy: 'smile',
  joy: 'smile',
  cheerful: 'smile',
  '\u5f00\u5fc3': 'smile',
  '\u9ad8\u5174': 'smile',
  '\u6109\u5feb': 'smile',
  '\u5fae\u7b11': 'smile',
  '\u7b11': 'smile',
  '\u512a\u3057\u3044': 'smile',
  '\u5b09\u3057\u3044': 'smile',
  blush: 'bsmile',
  shy: 'bsmile',
  embarrassed: 'bsmile',
  playful: 'bsmile',
  bsmile: 'bsmile',
  angry: 'bsmile',
  annoyed: 'bsmile',
  '\u5bb3\u7f9e': 'bsmile',
  '\u8138\u7ea2': 'bsmile',
  '\u8c03\u76ae': 'bsmile',
  '\u751f\u6c14': 'bsmile',
  '\u6124\u6012': 'bsmile',
  '\u7167\u308c': 'bsmile',
  namida: 'namida',
  sad: 'namida',
  sorrow: 'namida',
  '\u96be\u8fc7': 'namida',
  '\u60b2\u4f24': 'namida',
  '\u4f24\u5fc3': 'namida',
  '\u6cea': 'namida',
  '\u60b2\u3057\u3044': 'namida',
  tears: 'tears',
  crying: 'tears',
  cry: 'tears',
  '\u54ed': 'tears',
  '\u54ed\u6ce3': 'tears',
  '\u6d41\u6cea': 'tears',
  '\u5927\u54ed': 'tears',
  '\u6ce3\u304f': 'tears'
};

function normalizeLive2DExpression(value) {
  const key = String(value || '').trim().toLowerCase();
  return LIVE2D_EXPRESSION_ALIASES[key] || '';
}

function extractJsonObject(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  const fenced = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start >= 0 && end > start) return value.slice(start, end + 1).trim();
  return null;
}

function normalizeLive2DIntent(input) {
  if (!input || typeof input !== 'object') return null;
  const rawExpression = input.expression || input.expressionId || input.face || input.mood || input.emotion || '';
  const expression = normalizeLive2DExpression(rawExpression);
  const motion = String(input.motion || input.action || '').trim().toLowerCase().replace(/\s+/g, '_');
  const normalizedMotion = motion && motion !== 'none' ? motion : '';
  if (!expression && !normalizedMotion) return null;
  return {
    emotion: String(input.emotion || input.mood || '').trim() || null,
    expression: expression || null,
    motion: normalizedMotion || null,
    intensity: Number.isFinite(Number(input.intensity)) ? Number(input.intensity) : null
  };
}

function inferLive2DIntent(text) {
  const value = String(text || '').toLowerCase();
  const matchers = [
    { expression: 'tears', pattern: /(\u5927\u54ed|\u54ed\u6ce3|\u6d41\u6cea|\u5d29\u6e83|crying|tears|\u6ce3\u304f)/u, emotion: 'crying' },
    { expression: 'namida', pattern: /(\u96be\u8fc7|\u60b2\u4f24|\u4f24\u5fc3|\u5bc2\u5bde|\u6cea|sad|sorrow|\u60b2\u3057\u3044)/u, emotion: 'sad' },
    { expression: 'bsmile', pattern: /(\u5bb3\u7f9e|\u8138\u7ea2|\u8c03\u76ae|\u751f\u6c14|\u6124\u6012|shy|blush|angry|annoyed|\u7167\u308c)/u, emotion: 'shy' },
    { expression: 'smile', pattern: /(\u5f00\u5fc3|\u9ad8\u5174|\u6109\u5feb|\u5fae\u7b11|\u7b11|happy|smile|joy|\u5b09\u3057\u3044|\u512a\u3057\u3044)/u, emotion: 'happy' }
  ];
  const matched = matchers.find((item) => item.pattern.test(value));
  return matched
    ? { emotion: matched.emotion, expression: matched.expression, motion: null, intensity: 0.5 }
    : null;
}

function parseAssistantPayload(rawText) {
  const raw = String(rawText || '').trim();
  const jsonText = extractJsonObject(raw);
  if (jsonText) {
    try {
      const data = JSON.parse(jsonText);
      const reply = cleanReply(data.reply || data.text || data.message || '');
      const live2d = normalizeLive2DIntent(data.live2d || data.pose || data.act || data) || inferLive2DIntent(reply);
      return { reply, live2d };
    } catch (_) {
      // fall through to plain text handling
    }
  }
  const reply = cleanReply(raw);
  return { reply, live2d: inferLive2DIntent(reply) };
}

function defaultTtsUrl(provider) {
  if (provider === 'gpt-sovits') return 'http://localhost:9880/tts';
  return '';
}

const DEFAULT_GPT_SOVITS_GPT_WEIGHT = 'GPT_weights_v2ProPlus/yachiyo-v2pro-e15.ckpt';
const DEFAULT_GPT_SOVITS_SOVITS_WEIGHT = 'SoVITS_weights_v2ProPlus/yachiyo-v2pro_e8_s456.pth';

function normalizeLocalGptSovitsUrl(url) {
  const parsed = new URL(url || defaultTtsUrl('gpt-sovits'));
  if (window.location.protocol === 'https:' && parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1') {
    parsed.hostname = 'localhost';
  }
  return parsed;
}

function buildGptSovitsControlUrl(settings, pathname, params) {
  const url = normalizeLocalGptSovitsUrl(settings.apiUrl || defaultTtsUrl(settings.provider));
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
    '\u4e2d\u6587': 'zh',
    '\u6c49\u8bed': 'zh',
    '\u6f22\u8a9e': 'zh',
    jp: 'ja',
    jpn: 'ja',
    japanese: 'ja',
    '\u65e5\u8bed': 'ja',
    '\u65e5\u6587': 'ja',
    '\u65e5\u672c\u8a9e': 'ja',
    english: 'en',
    '\u82f1\u8bed': 'en',
    '\u82f1\u6587': 'en',
    cantonese: 'yue',
    '\u7ca4\u8bed': 'yue',
    '\u7cb5\u8a9e': 'yue',
    korean: 'ko',
    '\u97e9\u8bed': 'ko',
    '\u97d3\u8a9e': 'ko',
    '\u81ea\u52a8': 'auto'
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

function compactSpeechText(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?~～…—\-"'“”‘’()[\]{}<>《》【】]/g, '')
    .trim();
}

function prepareGptSovitsText(text) {
  const raw = String(text || '').trim();
  const compact = compactSpeechText(raw);
  const shortReplies = {
    '\u55ef': '\u55ef\uff0c\u6211\u5728\u3002',
    '\u6069': '\u55ef\uff0c\u6211\u5728\u3002',
    '\u5509': '\u55ef\uff0c\u6211\u5728\u542c\u3002',
    '\u563f': '\u563f\uff0c\u6211\u5728\u3002',
    '\u55e8': '\u55e8\uff0c\u6211\u5728\u3002',
    '\u54c8': '\u54c8\uff0c\u6211\u5728\u3002',
    '\u54e6': '\u54e6\uff0c\u6211\u77e5\u9053\u4e86\u3002',
    '\u5662': '\u54e6\uff0c\u6211\u77e5\u9053\u4e86\u3002',
    '\u554a': '\u554a\uff0c\u6211\u5728\u542c\u3002',
    '\u8bf6': '\u8bf6\uff0c\u6211\u5728\u542c\u3002',
    '\u6b38': '\u8bf6\uff0c\u6211\u5728\u542c\u3002',
    '\u597d': '\u597d\u7684\u3002',
    '\u884c': '\u597d\u7684\u3002',
    '\u662f': '\u662f\u7684\u3002'
  };
  if (shortReplies[compact]) return shortReplies[compact];
  if (compact.length > 0 && compact.length <= 2) return `${compact}\uff0c\u6211\u5728\u3002`;
  return raw || '\u55ef\uff0c\u6211\u5728\u3002';
}

function pickGptSovitsSplitMethod(text) {
  return compactSpeechText(text).length <= 4 ? 'cut0' : 'cut5';
}

function buildGptSovitsAudioUrl(text, settings) {
  const url = normalizeLocalGptSovitsUrl(settings.apiUrl || defaultTtsUrl(settings.provider));
  const speechText = prepareGptSovitsText(text);
  url.searchParams.set('text', speechText);
  url.searchParams.set('text_lang', resolveGptSovitsTextLang(speechText, settings));
  url.searchParams.set('ref_audio_path', normalizeGptSovitsRefAudioPath(settings.refAudioPath || settings.voice));
  url.searchParams.set('prompt_text', settings.promptText || '');
  url.searchParams.set('prompt_lang', normalizeGptSovitsLang(settings.promptLang, 'ja'));
  url.searchParams.set('text_split_method', pickGptSovitsSplitMethod(speechText));
  url.searchParams.set('batch_size', '1');
  url.searchParams.set('media_type', 'wav');
  url.searchParams.set('streaming_mode', 'false');
  url.searchParams.set('parallel_infer', 'true');
  return url.toString();
}

function roomSystemPrompt() {
  return [
    '你是月见八千代，回复应保持温柔、清澈、带一点神秘感。',
    '请严格只返回 JSON 对象，不要输出 Markdown、代码块或额外解释。',
    '返回格式必须是：{"reply":"给用户看的正文","live2d":{"emotion":"happy","expression":"smile","motion":"none","intensity":0.6}}。',
    'reply 只允许放自然对话正文，不能包含动作提示词、表情提示词、括号说明、舞台指令或标签。',
    'live2d 是可选控制信息；当前系统会优先使用 expression 控制表情，motion 仅作为未来扩展。',
    'emotion 可选值：happy、shy、sad、crying、angry、neutral。',
    'expression 可用值仅限 smile、bsmile、namida、tears、none；无法判断时返回 none 或省略 live2d。'
  ].join('\n');
}

function applyRoomAct(live2d) {
  if (!live2d) return;
  window.dispatchEvent(new CustomEvent('tsukuyomi:room-act', { detail: live2d }));
}

function pickReply(data) {
  return data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || data?.reply || '';
}

async function translateForJapaneseTts(text) {
  const source = cleanTtsText(text);
  if (!source) return '';
  const settings = readJson('roomLLMSettings', {});
  if (!settings.apiKey || !settings.apiUrl) {
    throw new Error('请先在 Room 设置中配置 LLM，用于把回复翻译成日文后再播放语音。');
  }
  const systemPrompt = [
    '你是给 TTS 使用的日文翻译器。',
    '把用户提供的文本翻译成自然、适合朗读的日文。',
    '只输出日文正文，不要解释，不要 Markdown，不要括号里的动作提示，不要舞台提示。',
    '如果原文含有动作、表情、姿态、语气、旁白提示，请彻底删除，只保留角色真正要说出口的话。'
  ].join('\n');

  if (settings.useProxy) {
    const result = await postJson('/api/chat', {
      message: source,
      conversation: [],
      apiKey: settings.apiKey,
      apiUrl: settings.apiUrl,
      model: settings.model,
      systemPrompt
    });
    return cleanTtsText(result.reply || '');
  }

  const response = await fetch(settings.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({
      model: settings.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: source }
      ],
      temperature: 0.2
    })
  });
  if (!response.ok) throw new Error(`日文翻译失败：LLM ${response.status}`);
  return cleanTtsText(pickReply(await response.json()));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Image read failed'));
    reader.readAsDataURL(file);
  });
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
  return result.data || {};
}

function fallbackReply(message, image) {
  if (image) return '\u6211\u6536\u5230\u56fe\u7247\u4e86\u3002\u5982\u679c\u5f53\u524d\u6a21\u578b\u6216 MCP \u8fd8\u4e0d\u80fd\u89e3\u6790\u5b83\uff0c\u6211\u4f1a\u5148\u628a\u8fd9\u6b21\u753b\u9762\u8bb0\u5728\u5bf9\u8bdd\u91cc\u3002';
  return message ? `\u6211\u542c\u89c1\u4e86\uff1a${message}` : '\u6211\u5728\u8fd9\u91cc\u3002';
}

function compactText(value, limit = 1200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function mcpToolAllowed(settings, toolName) {
  const allowlist = String(settings.toolAllowlist || '').split(',').map((item) => item.trim()).filter(Boolean);
  return !allowlist.length || allowlist.includes(toolName);
}

function makeMcpHeaders(settings) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const key = String(settings.apiKey || '').trim();
  const headerName = String(settings.authHeader || 'Authorization').trim();
  if (key && headerName) {
    headers[headerName] = /^Bearer\s+/i.test(key) || headerName.toLowerCase() !== 'authorization' ? key : `Bearer ${key}`;
  }
  return headers;
}

function mcpResultText(result) {
  if (!result) return '';
  if (typeof result === 'string') return compactText(result);
  if (Array.isArray(result.content)) {
    return compactText(result.content.map((item) => item.text || item.content || '').filter(Boolean).join('\n'));
  }
  if (result.structuredContent) return compactText(JSON.stringify(result.structuredContent));
  if (result.text) return compactText(result.text);
  return compactText(JSON.stringify(result));
}

async function callMcpTool(settings, name, args = {}) {
  if (!settings.enabled || !settings.endpoint || !mcpToolAllowed(settings, name)) return '';
  const response = await fetch(settings.endpoint, {
    method: 'POST',
    headers: makeMcpHeaders(settings),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name,
        arguments: args,
        meta: {
          auth: {
            api_key: settings.apiKey,
            api_host: settings.apiHost,
            base_path: settings.basePath,
            resource_mode: settings.resourceMode || 'url'
          }
        }
      }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data?.error?.message || `MCP ${response.status}`);
  return mcpResultText(data.result || data);
}

async function fetchRelevantMemories(message) {
  const memorySettings = readJson('roomMemorySettings', { enabled: true });
  if (memorySettings.enabled === false) return [];
  const token = localStorage.getItem('tsukuyomi_token') || '';
  if (!token || !String(message || '').trim()) return [];
  const params = new URLSearchParams({ q: String(message || '').trim(), limit: '5' });
  const response = await fetch(`/api/room/memory?${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) return [];
  return Array.isArray(result.data) ? result.data : [];
}

function readKnowledgeContext(message) {
  const settings = readJson('roomKnowledgeSettings', null);
  if (settings?.enabled === false) return '';
  const sourceEntries = Array.isArray(settings?.entries) && settings.entries.length
    ? settings.entries
    : defaultKnowledgeEntries();
  const query = String(message || '').toLowerCase();
  const entries = sourceEntries
    .filter((item) => item && item.enabled !== false && (item.title || item.content))
    .map((item) => ({ ...item, score: query && `${item.title || ''} ${item.tags || ''} ${item.content || ''}`.toLowerCase().includes(query) ? 2 : 1 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  if (!entries.length) return '';
  return [
    '\u89d2\u8272\u77e5\u8bc6\u5e93\uff1a',
    ...entries.map((item, index) => `${index + 1}. ${compactText(`${item.title || ''}\uff1a${item.content || ''}`, 260)}`)
  ].join('\n');
}

function memoryContext(memories) {
  if (!memories.length) return '';
  return [
    '\u4e0e\u5f53\u524d\u7528\u6237\u76f8\u5173\u7684\u957f\u671f\u8bb0\u5fc6\uff08\u53ea\u5728\u672c\u6b21\u56de\u590d\u4e2d\u4f5c\u4e3a\u80cc\u666f\uff09\uff1a',
    ...memories.map((item, index) => `${index + 1}. [${item.type || 'memory'}] ${compactText(item.summary || item.content || '', 220)}`)
  ].join('\n');
}

function shouldUseWebSearch(message) {
  return /(\u641c\u7d22|\u67e5\u627e|\u67e5\u4e00\u4e0b|\u6700\u65b0|\u65b0\u95fb|\u7f51\u9875|\u5b98\u7f51|web|search)/i.test(String(message || ''));
}

async function buildRoomContext(message, image, llmSettings) {
  const mcpSettings = readJson('roomMCPSettings', {});
  const context = [readKnowledgeContext(message)];
  const memories = await fetchRelevantMemories(message).catch(() => []);
  const memoryText = memoryContext(memories);
  if (memoryText) context.push(memoryText);

  if (mcpSettings.enabled && mcpSettings.endpoint) {
    if (image && (llmSettings.visionMode === 'mcp' || llmSettings.visionMode === 'auto')) {
      const imageText = await callMcpTool(mcpSettings, 'understand_image', {
        image_data: image.dataUrl,
        prompt: message || '\u8bf7\u63cf\u8ff0\u8fd9\u5f20\u56fe\u7247\uff0c\u5e76\u6307\u51fa\u548c\u5bf9\u8bdd\u76f8\u5173\u7684\u5185\u5bb9\u3002'
      }).catch(() => '');
      if (imageText) context.push(`MCP understand_image \u7ed3\u679c\uff1a\n${imageText}`);
    }
    if (!image && shouldUseWebSearch(message)) {
      const searchText = await callMcpTool(mcpSettings, 'web_search', { query: message }).catch(() => '');
      if (searchText) context.push(`MCP web_search \u7ed3\u679c\uff1a\n${searchText}`);
    }
  }

  return context.filter(Boolean).join('\n\n');
}

export function useRoomChat({ live2d, world }) {
  const messages = ref([]);
  const input = ref('');
  const sending = ref(false);
  const imageAttachment = ref(null);
  const messageListRef = ref(null);
  const ttsState = ref({ messageId: '', status: 'idle' });
  let ttsUrl = '';
  let currentAudio = null;
  let ttsRequestId = 0;

  function addMessage(role, content, options = {}) {
    messages.value.push({
      id: uid(),
      role,
      content: String(content || ''),
      speechText: String(options.speechText || content || ''),
      image: options.image || null,
      live2d: options.live2d || null,
      createdAt: Date.now()
    });
    nextTick(() => {
      if (messageListRef.value) messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
    });
  }

  function loadHistory() {
    const history = readJson('roomChatHistory', []);
    messages.value = [];
    addMessage('system', 'Live2D is ready');
    history.forEach((message) => addMessage(message.role, message.content));
  }

  async function attachImage(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      addMessage('system', '\u8bf7\u9009\u62e9\u56fe\u7247\u6587\u4ef6');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      addMessage('system', '\u56fe\u7247\u4e0d\u80fd\u8d85\u8fc7 4MB');
      return;
    }
    imageAttachment.value = { name: file.name || 'image', type: file.type, size: file.size, dataUrl: await fileToDataUrl(file) };
  }

  function clearImage() {
    imageAttachment.value = null;
  }

  async function send() {
    const message = input.value.trim();
    const image = imageAttachment.value;
    if (!message && !image) return;
    addMessage('user', message || '\u8bf7\u770b\u8fd9\u5f20\u56fe\u7247\u3002', { image });
    input.value = '';
    imageAttachment.value = null;
    sending.value = true;
    const typingId = uid();
    messages.value.push({ id: typingId, role: 'assistant', content: '\u6b63\u5728\u56de\u5e94...', pending: true, createdAt: Date.now() });

    try {
      const settings = readJson('roomLLMSettings', {});
      const conversation = readJson('roomChatHistory', []).slice(-12);
      const roomContext = await buildRoomContext(message, image, settings);
      const systemPrompt = [settings.systemPrompt || roomSystemPrompt(), roomContext].filter(Boolean).join('\n\n');
      const mcpEnhancedMessage = roomContext && image && (settings.visionMode === 'mcp' || settings.visionMode === 'auto')
        ? `${message || '\u8bf7\u770b\u8fd9\u5f20\u56fe\u7247\u3002'}\n\n\u4e0a\u4e0b\u6587\u5df2\u5305\u542b MCP \u5bf9\u56fe\u7247\u7684\u7406\u89e3\u7ed3\u679c\uff0c\u8bf7\u7ed3\u5408\u5b83\u56de\u7b54\u3002`
        : message;
      let result;
      if (settings.useProxy) {
        result = await postJson('/api/chat', {
          message: mcpEnhancedMessage || (image ? '\u8bf7\u770b\u8fd9\u5f20\u56fe\u7247\u3002' : ''),
          conversation,
          apiKey: settings.apiKey,
          apiUrl: settings.apiUrl,
          model: settings.model,
          systemPrompt,
          image: settings.visionMode === 'mcp' ? null : image
        });
      } else if (settings.apiKey && settings.apiUrl) {
        const response = await fetch(settings.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
          body: JSON.stringify({
            model: settings.model || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              ...conversation.map((item) => ({ role: item.role, content: String(item.content || '') })),
              { role: 'user', content: mcpEnhancedMessage || (image ? '\u8bf7\u63cf\u8ff0\u8fd9\u5f20\u56fe\u7247\u3002' : '') }
            ]
          })
        });
        if (!response.ok) throw new Error(`LLM ${response.status}`);
        result = { reply: pickReply(await response.json()) };
      } else {
        result = { reply: fallbackReply(message, image) };
      }
      const structured = parseAssistantPayload(result.reply || fallbackReply(message, image));
      const reply = structured.reply || fallbackReply(message, image);
      applyRoomAct(structured.live2d);
      messages.value = messages.value.filter((item) => item.id !== typingId);
      addMessage('assistant', reply, { speechText: reply, live2d: structured.live2d });
      const userContent = image ? `${message || '\u8bf7\u770b\u8fd9\u5f20\u56fe\u7247\u3002'}\n[image: ${image.name}]` : message;
      const nextHistory = [...conversation, { role: 'user', content: userContent }, { role: 'assistant', content: reply }].slice(-24);
      writeJson('roomChatHistory', nextHistory);
      remember(userContent, reply).catch(() => {});
    } catch (error) {
      messages.value = messages.value.filter((item) => item.id !== typingId);
      addMessage('system', `\u53d1\u9001\u5931\u8d25\uff1a${error.message}`);
    } finally {
      sending.value = false;
    }
  }

  async function remember(userMessage, assistantReply) {
    const memorySettings = readJson('roomMemorySettings', { enabled: true });
    if (memorySettings.enabled === false) return;
    const token = localStorage.getItem('tsukuyomi_token') || '';
    if (!token) return;
    await fetch('/api/room/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userMessage, assistantReply })
    });
  }

  function stopTTS() {
    ttsRequestId += 1;
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.onplay = null;
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio = null;
    }
    ttsState.value = { messageId: '', status: 'idle' };
  }

  async function playTTS(text, messageId = '') {
    const settings = readJson('roomTTSSettings', {});
    if (settings.provider === 'gpt-sovits') settings.useProxy = false;
    if (!settings.enabled) {
      addMessage('system', '\u8bf7\u5148\u5728 TTS \u8bbe\u7f6e\u4e2d\u542f\u7528\u8bed\u97f3\u5408\u6210');
      return;
    }
    const directLocalGptSovits = settings.provider === 'gpt-sovits' && !settings.useProxy;
    if (!settings.useProxy && !directLocalGptSovits) {
      addMessage('system', '\u5f53\u524d Vue \u7248 TTS \u5efa\u8bae\u5148\u5f00\u542f\u670d\u52a1\u5668\u4ee3\u7406\u4ee5\u89c4\u907f CORS');
      return;
    }
    stopTTS();
    const requestId = ttsRequestId + 1;
    ttsRequestId = requestId;
    ttsState.value = { messageId, status: 'loading' };
    try {
      if (directLocalGptSovits) {
        const ttsText = await translateForJapaneseTts(text);
        if (!ttsText) throw new Error('日文翻译结果为空，已取消语音播放。');
        await ensureGptSovitsWeights(settings);
        const audio = new Audio(buildGptSovitsAudioUrl(ttsText, { ...settings, textLang: 'ja', promptLang: settings.promptLang || 'ja' }));
        currentAudio = audio;
        audio.onplay = () => {
          ttsState.value = { messageId, status: 'playing' };
          live2d?.speak?.();
        };
        audio.onended = () => {
          if (currentAudio === audio) stopTTS();
        };
        audio.onerror = () => {
          if (currentAudio === audio) stopTTS();
          addMessage('system', 'TTS 播放失败：无法直接访问本机 GPT-SoVITS 9880 端口，请确认 API 已启动且浏览器允许访问本机服务。');
        };
        await audio.play();
        return;
      }
      const ttsText = cleanTtsText(text);
      if (!ttsText) throw new Error('TTS 文本为空，已取消语音播放。');
      const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...settings, text: ttsText, textLang: 'auto' })
        });
      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        let detail = '';
        if (contentType.includes('application/json')) {
          const payload = await response.json().catch(() => null);
          detail = payload?.message || payload?.error || '';
        } else {
          detail = await response.text().catch(() => '');
        }
        throw new Error(detail || `TTS ${response.status}`);
      }
      if (requestId !== ttsRequestId) return;
      if (ttsUrl) URL.revokeObjectURL(ttsUrl);
      ttsUrl = URL.createObjectURL(await response.blob());
      if (requestId !== ttsRequestId) {
        URL.revokeObjectURL(ttsUrl);
        ttsUrl = '';
        return;
      }
      const audio = new Audio(ttsUrl);
      currentAudio = audio;
      audio.onplay = () => {
        ttsState.value = { messageId, status: 'playing' };
        live2d?.speak?.();
      };
      audio.onended = () => {
        if (currentAudio === audio) stopTTS();
      };
      audio.onerror = () => {
        if (currentAudio === audio) stopTTS();
      };
      await audio.play();
    } catch (error) {
      if (requestId !== ttsRequestId) return;
      stopTTS();
      addMessage('system', `TTS \u64ad\u653e\u5931\u8d25\uff1a${error.message}`);
    }
  }

  function onDrop(event) {
    const file = [...event.dataTransfer?.files || []].find((item) => /^image\//.test(item.type));
    if (!file) return;
    event.preventDefault();
    attachImage(file);
  }

  function destroy() {
    stopTTS();
    if (ttsUrl) URL.revokeObjectURL(ttsUrl);
    ttsUrl = '';
  }

  loadHistory();

  return {
    messages,
    input,
    sending,
    ttsState,
    imageAttachment,
    messageListRef,
    addMessage,
    attachImage,
    clearImage,
    send,
    playTTS,
    stopTTS,
    onDrop,
    destroy,
    world
  };
}
