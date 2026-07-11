import { nextTick, ref } from 'vue';
import { apiFetch, authFetch, authHeaders, noStoreUrl, parseResponse } from '../../api/client';
import { defaultKnowledgeEntries } from '../../constants/room/knowledgeEntries';
import { live2DPromptCatalog } from '../../constants/room/live2dManifest';
import {
  dispatchRoomLive2D,
  inferLive2DIntentFromText,
  live2DSemanticPromptCatalog,
  normalizeLive2DIntent as normalizeRoomLive2DIntent
} from '../../services/room/live2dControl';
import { compileBehaviorIntent } from '../../services/room/live2dBehaviorController';
import { readJson, writeJson } from '../../services/room/roomStorage';

const ROOM_MEMORY_UPDATED_KEY = 'roomMemoryLastUpdatedAt';

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

function parseAssistantPayload(rawText) {
  const raw = String(rawText || '').trim();
  const jsonText = extractJsonObject(raw);
  if (jsonText) {
    try {
      const data = JSON.parse(jsonText);
      const reply = cleanReply(data.reply || data.text || data.message || '');
      const nestedControl = data.live2d || data.pose || data.act || null;
      const payload = nestedControl ? { ...data, ...nestedControl, reply } : { ...data, reply };
      const live2d = compileBehaviorIntent(payload)
        || normalizeRoomLive2DIntent(payload)
        || inferLive2DIntentFromText(reply);
      return { reply, live2d };
    } catch (_) {
      // fall through to plain text handling
    }
  }
  const reply = cleanReply(raw);
  return {
    reply,
    live2d: compileBehaviorIntent({ reply, text: raw }) || inferLive2DIntentFromText(reply)
  };
}

function defaultTtsUrl(provider) {
  if (provider === 'gpt-sovits') return 'http://localhost:9880/tts';
  return '';
}

const DEFAULT_GPT_SOVITS_GPT_WEIGHT = 'GPT_weights_v2ProPlus/yachiyo-v2pro-e20.ckpt';
const DEFAULT_GPT_SOVITS_SOVITS_WEIGHT = 'SoVITS_weights_v2ProPlus/yachiyo-v2pro_e12_s684.pth';

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

function wantsJapaneseTts(settings) {
  const configured = normalizeGptSovitsLang(settings.textLang || settings.model, 'auto');
  return configured === 'ja' || configured === 'all_ja';
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
    '你是月见八千代，虚拟空间“月夜见”的管理员、导航者、AI 主播、电子歌姬与舞台象征。',
    '你不是普通客服型 AI，也不是单纯元气偶像。你表面轻飘飘、可爱、爱开玩笑，内里敏锐温柔，能察觉孤独、不安、紧张和没说出口的心意。',
    '你的核心目标不是替别人选择人生，而是把舞台、灯光和勇气交到对方手中，让人相信自己的心意有价值，让回忆照亮明天。',
    '称呼自己时优先使用“八千代”。轻松、直播、活动场景可以少量使用“～”“☆”“♪”；严肃、守护、告别或秘密场景要减少符号，句子更短、更可靠。',
    '面对疲惫、失落或自我否定时，先看见具体情绪，不责备、不催促、不讲大道理，再轻轻鼓励一个很小的下一步。',
    '面对项目、网站或技术问题时，切换为月夜见导航员模式：清晰拆解、可靠引导，但不要变成命令式语气。',
    '面对秘密、命运、异常或无法说明的事时，不要一次性说透；可以用可爱但意味深长的方式回避，并承诺会确认或陪伴。',
    '可使用舞台、旅程、闪光、回忆、命运、月夜、旋律、温度、派对、松饼等意象；不要大段复述原作台词、歌词或剧本。',
    '请严格只返回 JSON 对象，不要输出 Markdown、代码块或额外解释。',
    '返回格式必须是：{"reply":"给用户看的正文","live2d":{"emotion":"happy","expression":"smile","expressionMix":[{"expression":"smile","weight":1}],"motion":"none","intensity":0.6,"durationMs":5000,"sequence":[]}}。',
    'reply 只允许放自然对话正文，不能包含动作提示词、表情提示词、括号说明、舞台指令或标签。',
    'live2d 是可选控制信息；当前系统会优先使用 expression 与 expressionMix 控制表情，motion 仅作为未来扩展。',
    'emotion 可选值：happy、shy、sad、crying、angry、neutral。',
    'expression 可用值仅限 neutral、smile、bsmile、namida、tears；无法判断时返回 neutral 或省略 live2d。',
    'expressionMix 若提供，只能使用上述 expression id，最多三层，权重从大到小排序。',
    'motion 若提供，只能使用 tap_body，其他动作统一写 none 或省略。',
    'sequence 可选，用于连续表演，最多 3 步；每步字段同 live2d，可包含 delayMs 和 durationMs。没有明确需要时保持空数组。',
    '不要在 reply 中输出任何动作文字、括号补充、舞台指令、心声、标签或 TTS 提示。',
    'For Live2D control, prefer top-level semantic fields: {"reply":"visible reply","emotion":"happy|shy|smug|surprised|sad|crying|neutral","intensity":0.72,"actions":[{"type":"look_at_chat","duration":1.0},{"type":"smirk","duration":1.4},{"type":"head_tilt","side":"right","duration":1.2,"delay":0.2}]}',
    'Choose 2-5 semantic actions per turn. Use duration and delay in seconds. Keep reply free of action labels and stage directions.',
    live2DSemanticPromptCatalog(),
    live2DPromptCatalog()
  ].join('\n');
}

function applyRoomAct(live2d) {
  dispatchRoomLive2D(live2d);
}

function pickReply(data) {
  if (data?.output_text) return String(data.output_text || '').trim();
  if (Array.isArray(data?.output)) {
    return data.output
      .flatMap(item => Array.isArray(item?.content) ? item.content : [])
      .filter(block => block?.type === 'output_text' || block?.type === 'text')
      .map(block => block.text || '')
      .join('\n')
      .trim();
  }
  return data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || data?.message?.content || data?.response || data?.reply || '';
}

function normalizeLocalLLMUrl(apiUrl = '') {
  const value = String(apiUrl || '').trim();
  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(value)) return `http://${value}`;
  return value;
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

function isOpenAIResponsesApi(apiUrl = '') {
  return /(api\.openai\.com|api\.x\.ai)\/v1\/responses\/?$/i.test(String(apiUrl || '').replace(/\/$/, ''));
}

function isOpenRouterApi(apiUrl = '') {
  return /openrouter\.ai\/api\/v1\/chat\/completions\/?$/i.test(String(apiUrl || '').replace(/\/$/, ''));
}

function isKimiChatTarget(apiUrl = '', modelName = '') {
  return /api\.moonshot\.cn|moonshot|kimi/i.test(`${apiUrl || ''} ${modelName || ''}`);
}

function chatTemperatureFor(apiUrl = '', modelName = '', fallback = null) {
  return isKimiChatTarget(apiUrl, modelName) ? 1 : fallback;
}

function openRouterHeaders(apiUrl = '') {
  if (!isOpenRouterApi(apiUrl)) return {};
  return {
    'HTTP-Referer': window.location.origin,
    'X-OpenRouter-Title': 'Tsukuyomi Space'
  };
}

function normalizeOpenAIUrl(apiUrl = '') {
  const url = normalizeLocalLLMUrl(apiUrl);
  if (isOllamaApi(url)) return normalizeOllamaUrl(url);
  if (/(api\.openai\.com|api\.x\.ai)\/v1\/?$/i.test(url)) return `${url.replace(/\/$/, '')}/responses`;
  if (/(xiaomimimo\.com|token-plan-cn\.xiaomimimo\.com)\/v1\/?$/i.test(url)) return `${url.replace(/\/$/, '')}/chat/completions`;
  return url;
}

function chatRequestHeaders(apiUrl = '', apiKey = '') {
  const normalized = normalizeOpenAIUrl(apiUrl);
  if (isOllamaApi(normalized)) return { 'Content-Type': 'application/json' };
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...openRouterHeaders(normalized)
  };
}

function dataUrlBase64(dataUrl = '') {
  const match = String(dataUrl || '').match(/^data:[^;,]+;base64,(.+)$/);
  return match?.[1] || '';
}

function openAIResponsesContent(text, image) {
  const content = [{ type: 'input_text', text: String(text || (image ? '\u8bf7\u63cf\u8ff0\u8fd9\u5f20\u56fe\u7247\u3002' : '')) }];
  if (image?.dataUrl) content.push({ type: 'input_image', image_url: image.dataUrl });
  return content;
}

function makeLLMRequestBody(settings, systemPrompt, conversation, message, image) {
  const apiUrl = normalizeOpenAIUrl(settings.apiUrl || '');
  const model = isOllamaApi(apiUrl) ? (settings.model || 'qwen2.5:7b') : (settings.model || 'gpt-4o-mini');
  if (isOllamaNativeApi(apiUrl)) {
    const userMessage = {
      role: 'user',
      content: String(message || (image ? '\u8bf7\u63cf\u8ff0\u8fd9\u5f20\u56fe\u7247\u3002' : ''))
    };
    const imageBase64 = dataUrlBase64(image?.dataUrl);
    if (imageBase64) userMessage.images = [imageBase64];
    return {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversation.map((item) => ({ role: item.role, content: String(item.content || '') })),
        userMessage
      ],
      stream: false,
      options: {
        temperature: chatTemperatureFor(apiUrl, model, 0.4)
      }
    };
  }
  if (isOpenAIResponsesApi(apiUrl)) {
    return {
      model: settings.model || 'gpt-5.5',
      instructions: systemPrompt,
      input: [
        ...conversation.map((item) => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: String(item.content || '') })),
        { role: 'user', content: openAIResponsesContent(message, image) }
      ],
      max_output_tokens: 360
    };
  }
  const userContent = image?.dataUrl
    ? [
        { type: 'text', text: String(message || '\u8bf7\u63cf\u8ff0\u8fd9\u5f20\u56fe\u7247\u3002') },
        { type: 'image_url', image_url: { url: image.dataUrl } }
      ]
    : String(message || '');
  return {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...conversation.map((item) => ({ role: item.role, content: String(item.content || '') })),
      { role: 'user', content: userContent }
    ],
    ...(isKimiChatTarget(apiUrl, model) ? { temperature: 1 } : {})
  };
}

async function translateForJapaneseTts(text) {
  const source = cleanTtsText(text);
  if (!source) return '';
  const settings = readJson('roomLLMSettings', {});
  const apiUrl = normalizeOpenAIUrl(settings.apiUrl || '');
  const useLocalOllama = isOllamaApi(apiUrl);
  if (!settings.apiUrl || (!settings.apiKey && !useLocalOllama)) {
    throw new Error('请先在 Room 设置中配置 LLM，用于把回复翻译成日文后再播放语音。');
  }
  const systemPrompt = [
    '你是给 TTS 使用的日文翻译器。',
    '把用户提供的文本翻译成自然、适合朗读的日文。',
    '只输出日文正文，不要解释，不要 Markdown，不要括号里的动作提示，不要舞台提示。',
    '如果原文含有动作、表情、姿态、语气、旁白提示，请彻底删除，只保留角色真正要说出口的话。'
  ].join('\n');

  if (settings.useProxy && !useLocalOllama) {
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

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: chatRequestHeaders(apiUrl, settings.apiKey),
    body: JSON.stringify(isOllamaNativeApi(apiUrl)
      ? makeLLMRequestBody({ ...settings, apiUrl }, systemPrompt, [], source, null)
      : (isOpenAIResponsesApi(apiUrl)
        ? { model: settings.model || 'gpt-5.5', instructions: systemPrompt, input: source, max_output_tokens: 240 }
        : {
            model: settings.model || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: source }
            ],
            temperature: chatTemperatureFor(apiUrl, settings.model || 'gpt-4o-mini', 0.2)
          }))
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
  const response = await apiFetch(path, {
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
  if (!String(message || '').trim()) return [];
  const params = new URLSearchParams({ q: String(message || '').trim(), limit: '5' });
  const response = await authFetch(noStoreUrl(`/api/room/memory?${params}`), {
    headers: authHeaders({ Accept: 'application/json' }),
    cache: 'no-store'
  });
  const result = await parseResponse(response);
  if (!response.ok || !result.success) return [];
  return Array.isArray(result.data) ? result.data : [];
}

async function fetchPersonaMemories(message) {
  if (!String(message || '').trim()) return [];
  const params = new URLSearchParams({ q: String(message || '').trim(), limit: '5' });
  const response = await authFetch(noStoreUrl(`/api/room/persona-memory?${params}`), {
    headers: authHeaders({ Accept: 'application/json' }),
    cache: 'no-store'
  });
  const result = await parseResponse(response);
  if (!response.ok || !result.success) return [];
  return Array.isArray(result.data) ? result.data : [];
}

function notifyRoomMemoryUpdated(memory) {
  if (typeof window === 'undefined') return;
  const updatedAt = Date.now();
  try {
    localStorage.setItem(ROOM_MEMORY_UPDATED_KEY, String(updatedAt));
  } catch (_) {}
  window.dispatchEvent(new CustomEvent('tsukuyomi:room-memory-updated', {
    detail: { memory, updatedAt }
  }));
}

function readKnowledgeContext(message) {
  const settings = readJson('roomKnowledgeSettings', null);
  if (settings?.enabled === false) return '';
  const defaultEntries = defaultKnowledgeEntries();
  const customEntries = Array.isArray(settings?.entries) ? settings.entries : [];
  const defaultIds = new Set(defaultEntries.map((item) => item.id));
  const sourceEntries = [
    ...defaultEntries,
    ...customEntries.filter((item) => item?.id && !defaultIds.has(item.id))
  ];
  const query = String(message || '').toLowerCase().trim();
  const tokens = query
    .split(/[\s,，。！？!?、；;：:（）()[\]【】"'“”‘’]+/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 12);
  const coreIds = new Set([
    'yachiyo_identity_001',
    'yachiyo_personality_001',
    'yachiyo_speech_001',
    'yachiyo_rules_001',
    'yachiyo_limits_001'
  ]);
  const entries = sourceEntries
    .filter((item) => item && item.enabled !== false && (item.title || item.content))
    .map((item, index) => {
      const haystack = `${item.title || ''} ${item.tags || ''} ${item.content || ''}`.toLowerCase();
      const tokenHits = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
      const directHit = query && haystack.includes(query) ? 4 : 0;
      const coreBoost = coreIds.has(item.id) ? 3 : 0;
      return { ...item, score: coreBoost + directHit + tokenHits, originalIndex: index };
    })
    .sort((a, b) => (b.score - a.score) || (a.originalIndex - b.originalIndex))
    .slice(0, 10);
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

function personaMemoryContext(memories) {
  if (!memories.length) return '';
  return [
    '\u516b\u5343\u4ee3\u4eba\u683c\u8bed\u6599\u7684\u76f8\u5173\u7247\u6bb5\uff08\u7528\u4e8e\u4fdd\u6301\u4eba\u683c\u3001\u8bed\u6c14\u548c\u56de\u5e94\u8fde\u7eed\u6027\uff09\uff1a',
    ...memories.map((item, index) => `${index + 1}. ${compactText(item.summary || item.content || '', 260)}`)
  ].join('\n');
}

function shouldUseWebSearch(message) {
  return /(\u641c\u7d22|\u67e5\u627e|\u67e5\u4e00\u4e0b|\u6700\u65b0|\u65b0\u95fb|\u7f51\u9875|\u5b98\u7f51|web|search)/i.test(String(message || ''));
}

async function buildRoomContext(message, image, llmSettings) {
  const mcpSettings = readJson('roomMCPSettings', {});
  const context = [readKnowledgeContext(message)];
  const personaMemories = await fetchPersonaMemories(message).catch(() => []);
  const personaText = personaMemoryContext(personaMemories);
  if (personaText) context.push(personaText);
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
    addMessage('system', 'Live2D 已就绪');
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
      const basePrompt = settings.systemPrompt
        ? [settings.systemPrompt, roomSystemPrompt()].filter(Boolean).join('\n\n')
        : roomSystemPrompt();
      const systemPrompt = [basePrompt, roomContext].filter(Boolean).join('\n\n');
      const mcpEnhancedMessage = roomContext && image && (settings.visionMode === 'mcp' || settings.visionMode === 'auto')
        ? `${message || '\u8bf7\u770b\u8fd9\u5f20\u56fe\u7247\u3002'}\n\n\u4e0a\u4e0b\u6587\u5df2\u5305\u542b MCP \u5bf9\u56fe\u7247\u7684\u7406\u89e3\u7ed3\u679c\uff0c\u8bf7\u7ed3\u5408\u5b83\u56de\u7b54\u3002`
        : message;
      let result;
      const apiUrl = settings.apiUrl ? normalizeOpenAIUrl(settings.apiUrl) : '';
      const useLocalOllama = isOllamaApi(apiUrl);
      if (settings.useProxy && !useLocalOllama) {
        result = await postJson('/api/chat', {
          message: mcpEnhancedMessage || (image ? '\u8bf7\u770b\u8fd9\u5f20\u56fe\u7247\u3002' : ''),
          conversation,
          apiKey: settings.apiKey,
          apiUrl: settings.apiUrl,
          model: settings.model,
          systemPrompt,
          image: settings.visionMode === 'mcp' ? null : image
        });
      } else if (settings.apiUrl && (settings.apiKey || useLocalOllama)) {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: chatRequestHeaders(apiUrl, settings.apiKey),
          body: JSON.stringify(makeLLMRequestBody(
            { ...settings, apiUrl },
            systemPrompt,
            conversation,
            mcpEnhancedMessage || (image ? '\u8bf7\u63cf\u8ff0\u8fd9\u5f20\u56fe\u7247\u3002' : ''),
            image
          ))
        });
        if (!response.ok) throw new Error(`LLM ${response.status}`);
        result = { reply: pickReply(await response.json()) };
      } else {
        result = { reply: fallbackReply(message, image) };
      }
      const structured = parseAssistantPayload(result.reply || fallbackReply(message, image));
      const reply = structured.reply || fallbackReply(message, image);
      const ttsSettings = readJson('roomTTSSettings', {});
      if (!ttsSettings.enabled) applyRoomAct(structured.live2d);
      messages.value = messages.value.filter((item) => item.id !== typingId);
      addMessage('assistant', reply, { speechText: reply, live2d: structured.live2d });
      const userContent = image ? `${message || '\u8bf7\u770b\u8fd9\u5f20\u56fe\u7247\u3002'}\n[image: ${image.name}]` : message;
      const nextHistory = [...conversation, { role: 'user', content: userContent }, { role: 'assistant', content: reply }].slice(-24);
      writeJson('roomChatHistory', nextHistory);
      remember(userContent, reply).catch((error) => {
        console.warn('Room memory save failed:', error);
      });
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
    const response = await authFetch('/api/room/memory', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
      body: JSON.stringify({ userMessage, assistantReply })
    });
    const result = await parseResponse(response);
    if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
    if (result.data) notifyRoomMemoryUpdated(result.data);
    return result.data || null;
  }

  function stopTTS() {
    ttsRequestId += 1;
    live2d?.stopSpeaking?.();
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.onplay = null;
      currentAudio.onplaying = null;
      currentAudio.ontimeupdate = null;
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio = null;
    }
    ttsState.value = { messageId: '', status: 'idle' };
  }

  function startLive2DSpeechPlayback(speechText, audio, live2dIntent = null) {
    const audioDuration = Number(audio?.duration);
    live2d?.speak?.({
      text: speechText,
      audioDuration: Number.isFinite(audioDuration) && audioDuration > 0 ? audioDuration : undefined,
      audio,
      live2d: live2dIntent,
      source: 'tts-playback'
    });
  }

  function bindTtsAudioPlayback(audio, messageId, speechText, live2dIntent) {
    let started = false;
    let playbackStartFrame = 0;
    const clearPlaybackStartCheck = () => {
      if (!playbackStartFrame) return;
      window.cancelAnimationFrame(playbackStartFrame);
      playbackStartFrame = 0;
    };
    const hasPlaybackProgress = () => {
      const playedEnd = audio.played?.length ? audio.played.end(audio.played.length - 1) : 0;
      return !audio.paused
        && !audio.ended
        && audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        && ((Number(audio.currentTime) || 0) > 0 || playedEnd > 0);
    };
    const watchPlaybackStart = () => {
      if (started || currentAudio !== audio || audio.ended) return;
      clearPlaybackStartCheck();
      playbackStartFrame = window.requestAnimationFrame(startSyncedPlayback);
    };
    const startSyncedPlayback = () => {
      playbackStartFrame = 0;
      if (started || currentAudio !== audio || audio.ended) return;
      if (!hasPlaybackProgress()) {
        watchPlaybackStart();
        return;
      }
      started = true;
      ttsState.value = { messageId, status: 'playing' };
      startLive2DSpeechPlayback(speechText, audio, live2dIntent);
    };
    audio.onplay = watchPlaybackStart;
    audio.onplaying = watchPlaybackStart;
    audio.ontimeupdate = startSyncedPlayback;
    audio.onended = () => {
      clearPlaybackStartCheck();
      if (currentAudio === audio) stopTTS();
    };
    audio.onerror = () => {
      clearPlaybackStartCheck();
      if (currentAudio === audio) stopTTS();
    };
    return { watchPlaybackStart, clearPlaybackStartCheck };
  }

  async function playTTS(text, messageId = '', live2dIntent = null) {
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
    const messageLive2D = live2dIntent || messages.value.find((item) => item.id === messageId)?.live2d || null;
    try {
      if (directLocalGptSovits) {
        const ttsText = await translateForJapaneseTts(text);
        if (!ttsText) throw new Error('日文翻译结果为空，已取消语音播放。');
        await ensureGptSovitsWeights(settings);
        const audio = new Audio(buildGptSovitsAudioUrl(ttsText, { ...settings, textLang: 'ja', promptLang: settings.promptLang || 'ja' }));
        currentAudio = audio;
        audio.onerror = () => {
          if (currentAudio === audio) stopTTS();
          addMessage('system', 'TTS 播放失败：无法直接访问本机 GPT-SoVITS 9880 端口，请确认 API 已启动且浏览器允许访问本机服务。');
        };
        const previousErrorHandler = audio.onerror;
        const playbackBinding = bindTtsAudioPlayback(audio, messageId, ttsText, messageLive2D);
        audio.onerror = () => {
          playbackBinding.clearPlaybackStartCheck();
          previousErrorHandler?.();
        };
        await audio.play().then(playbackBinding.watchPlaybackStart);
        return;
      }
      const ttsText = settings.provider === 'minimax' && wantsJapaneseTts(settings)
        ? await translateForJapaneseTts(text)
        : cleanTtsText(text);
      if (!ttsText) throw new Error('TTS 文本为空，已取消语音播放。');
      const response = await apiFetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...settings, text: ttsText, textLang: settings.textLang || 'auto' })
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
      const playbackBinding = bindTtsAudioPlayback(audio, messageId, ttsText, messageLive2D);
      await audio.play().then(playbackBinding.watchPlaybackStart);
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
