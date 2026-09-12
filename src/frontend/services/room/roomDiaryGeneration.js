import { readJson } from './roomStorage';
import { fetchWithLocalOllamaGuidance, normalizeLocalOllamaBaseUrl } from './localOllamaTransport';
import { activePersonaPrompt, diaryTimestampLabel } from './roomDiaryArchive';

/**
 * Turns one finished room conversation into a diary entry written in the
 * character's own first-person voice.
 *
 * The request reuses the same LLM settings the room chat already stores
 * (`roomLLMSettings`), including the local Ollama path, so no extra
 * configuration is required from the user.
 */

const DIARY_MAX_CONVERSATION_TURNS = 60;
const DIARY_MAX_CHARS_PER_MESSAGE = 1500;
const DIARY_MIN_CONTENT_LENGTH = 20;

function isOllamaApi(apiUrl = '') {
  try {
    const parsed = new URL(normalizeLocalOllamaBaseUrl(apiUrl));
    return ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname.toLowerCase())
      && (parsed.port || '11434') === '11434';
  } catch (_) {
    return false;
  }
}

function normalizeOllamaUrl(apiUrl = '') {
  const parsed = new URL(normalizeLocalOllamaBaseUrl(apiUrl || 'http://localhost:11434/api/chat'));
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

function isAnthropicChatApi(apiUrl = '', modelName = '') {
  return /api\.anthropic\.com|anthropic\.com\/v1\/messages|minimaxi\.com\/anthropic|\/anthropic\/v1\/messages|MiniMax-M2/i
    .test(`${apiUrl || ''} ${modelName || ''}`);
}

function isKimiChatTarget(apiUrl = '', modelName = '') {
  return /api\.moonshot\.cn|moonshot|kimi/i.test(`${apiUrl || ''} ${modelName || ''}`);
}

function isOpenRouterApi(apiUrl = '') {
  return /openrouter\.ai\/api\/v1\/chat\/completions\/?$/i.test(String(apiUrl || '').replace(/\/$/, ''));
}

function normalizeOpenAIUrl(apiUrl = '') {
  const url = normalizeLocalOllamaBaseUrl(apiUrl);
  if (isOllamaApi(url)) return normalizeOllamaUrl(url);
  if (/(api\.openai\.com|api\.x\.ai)\/v1\/?$/i.test(url)) return `${url.replace(/\/$/, '')}/responses`;
  if (/(xiaomimimo\.com|token-plan-cn\.xiaomimimo\.com)\/v1\/?$/i.test(url)) return `${url.replace(/\/$/, '')}/chat/completions`;
  return url;
}

function chatRequestHeaders(apiUrl = '', apiKey = '') {
  const normalized = normalizeOpenAIUrl(apiUrl);
  if (isOllamaApi(normalized)) return { 'Content-Type': 'application/json' };
  if (/api\.anthropic\.com/i.test(normalized)) {
    return {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
      'anthropic-version': '2023-06-01'
    };
  }
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...(isOpenRouterApi(normalized) && typeof window !== 'undefined'
      ? { 'HTTP-Referer': window.location.origin, 'X-OpenRouter-Title': 'Tsukuyomi Space' }
      : {})
  };
}

function chatTemperatureFor(apiUrl = '', modelName = '', fallback = null) {
  return isKimiChatTarget(apiUrl, modelName) ? 1 : fallback;
}

function pickReply(data) {
  if (data?.output_text) return String(data.output_text || '').trim();
  if (Array.isArray(data?.output)) {
    return data.output
      .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
      .filter((block) => block?.type === 'output_text' || block?.type === 'text')
      .map((block) => block.text || '')
      .join('\n')
      .trim();
  }
  if (Array.isArray(data?.content)) {
    return data.content
      .filter((block) => block?.type === 'text')
      .map((block) => block.text || '')
      .join('\n')
      .trim();
  }
  return data?.choices?.[0]?.message?.content
    || data?.choices?.[0]?.text
    || data?.message?.content
    || data?.response
    || data?.reply
    || '';
}

function compact(value, limit = DIARY_MAX_CHARS_PER_MESSAGE) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/**
 * Keeps only the turns produced during the finished session, dropping system
 * notices, pending placeholders and duplicate consecutive lines.
 */
export function normalizeDiaryConversation(messages) {
  if (!Array.isArray(messages)) return [];
  const turns = [];
  for (const message of messages) {
    if (!message || !['user', 'assistant'].includes(message.role)) continue;
    if (message.pending) continue;
    const content = compact(message.content);
    if (!content) continue;
    const previous = turns[turns.length - 1];
    if (previous && previous.role === message.role && previous.content === content) continue;
    turns.push({ role: message.role, content });
  }
  return turns.slice(-DIARY_MAX_CONVERSATION_TURNS * 2);
}

export function diaryConversationLength(turns) {
  return Array.isArray(turns) ? turns.length : 0;
}

export function buildDiarySystemPrompt(persona = activePersonaPrompt()) {
  const name = persona?.data?.name || '角色';
  const description = String(persona?.data?.description || '').trim();
  const personality = String(persona?.data?.personality || '').trim();
  const scenario = String(persona?.data?.scenario || '').trim();
  const notes = String(persona?.data?.creator_notes || '').trim();

  return [
    `你是「${name}」，请以「${name}」的第一人称，把刚刚结束的这段对话写成一篇私人日记。`,
    description ? `角色设定：${compact(description, 1600)}` : '',
    personality ? `性格与口吻：${compact(personality, 1200)}` : '',
    scenario ? `相处背景：${compact(scenario, 800)}` : '',
    notes ? `补充设定：${compact(notes, 1200)}` : '',
    '写作要求：',
    '1. 严格只输出日记正文，不要输出 JSON、Markdown 代码块、标题行、写作说明或额外解释。',
    '2. 用第一人称写，语气、称呼和说话习惯必须和角色设定一致。',
    '3. 只依据提供的对话内容来写，可以合理补足环境、动作与心理描写，但不要编造对话里不存在的重要事件或新角色。',
    '4. 篇幅以 400 到 900 字为宜，分成若干自然段；允许使用少量颜文字，不要每段都加。',
    '5. 不要在正文里写日期标题、时间戳或「日记书写时间」这类附加行，系统会统一补上。'
  ].filter(Boolean).join('\n');
}

export function buildDiaryUserPrompt(turns, { timestampLabel = '', personaName = '' } = {}) {
  const transcript = (Array.isArray(turns) ? turns : [])
    .map((turn) => `${turn.role === 'user' ? '对方' : (personaName || '我')}：${turn.content}`)
    .join('\n');
  return [
    '以下是刚刚结束的对话记录：',
    '<对话开始>',
    transcript,
    '<对话结束>',
    timestampLabel ? `\n现在是 ${timestampLabel}，请写这一天的日记。` : '',
    '请直接输出日记正文。'
  ].filter(Boolean).join('\n');
}

function makeDiaryRequestBody({ settings, apiUrl, model, systemPrompt, userPrompt }) {
  if (isOllamaNativeApi(apiUrl)) {
    return {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      stream: false,
      options: { temperature: 0.8 }
    };
  }
  if (isOpenAIResponsesApi(apiUrl)) {
    return {
      model,
      instructions: systemPrompt,
      input: userPrompt
    };
  }
  if (isAnthropicChatApi(apiUrl, model)) {
    return {
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 4096,
      temperature: 1,
      stream: false
    };
  }
  return {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    ...(isKimiChatTarget(apiUrl, model) ? { temperature: 1 } : {})
  };
}

function stripCodeFence(text) {
  const value = String(text || '').trim();
  const fenced = value.match(/^```(?:json|markdown|md|text)?\s*([\s\S]*?)\s*```$/i);
  const inner = fenced ? fenced[1] : value;
  // Some models still wrap the diary in a tiny JSON envelope even when asked not to.
  const jsonMatch = inner.trim().match(/^\{[\s\S]*\}$/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const candidate = parsed.diary || parsed.content || parsed.text || parsed.reply;
      if (typeof candidate === 'string' && candidate.trim()) return candidate;
    } catch (_) {
      // Not JSON after all; fall through to plain text.
    }
  }
  return inner;
}

/**
 * Removes model-added headers/footers so the stored entry body matches the
 * reference layout (`【日记】` then body then a blank-line separated时间行).
 */
export function cleanDiaryContent(text) {
  let value = stripCodeFence(text)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*(?:【日记】|日记[：:]\s*)\s*/u, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  value = value
    .replace(/\n*【日记书写时间为[^】]*】\s*$/u, '')
    .replace(/\n*(?:日记书写时间|书写时间)[：:][^\n]*$/u, '')
    .trim();
  return value;
}

export function composeDiaryBody(content, timestampLabel) {
  const body = String(content || '').trim();
  if (!body) return '';
  return `【日记】\n\n${body}\n\n\n\n【日记书写时间为${timestampLabel}】`;
}

export function diarySettings() {
  const settings = readJson('roomLLMSettings', {});
  const apiUrl = settings.apiUrl ? normalizeOpenAIUrl(settings.apiUrl) : '';
  const useLocalOllama = isOllamaApi(apiUrl);
  return {
    ...settings,
    apiUrl,
    model: settings.model || (useLocalOllama ? 'qwen2.5:7b' : 'gpt-4o-mini'),
    useLocalOllama
  };
}

export function isDiaryGenerationConfigured(settings = diarySettings()) {
  if (settings.useLocalOllama) return Boolean(settings.apiUrl);
  return Boolean(settings.apiUrl && settings.apiKey);
}

/**
 * Generates one diary entry body from the finished conversation.
 * Throws when the LLM is not configured or the reply is unusable, so the
 * caller can surface a concrete reason instead of saving an empty diary.
 */
export async function generateDiaryEntry(turns, {
  persona = activePersonaPrompt(),
  now = new Date(),
  fetchImpl = fetchWithLocalOllamaGuidance
} = {}) {
  const conversation = normalizeDiaryConversation(turns);
  if (!conversation.length) throw new Error('本次没有可记录的对话内容。');

  const settings = diarySettings();
  if (!isDiaryGenerationConfigured(settings)) {
    throw new Error('请先在 Room 设置中配置 LLM，然后才能生成日记。');
  }

  const personaName = persona?.data?.name || '角色';
  const timestampLabel = diaryTimestampLabel(now);
  const systemPrompt = buildDiarySystemPrompt(persona);
  const userPrompt = buildDiaryUserPrompt(conversation, { timestampLabel, personaName });

  let reply = '';
  if (settings.useProxy && !settings.useLocalOllama) {
    throw new Error('服务器代理模式暂不支持生成日记，请在 Room 设置中改用浏览器直连或本机 Ollama。');
  }

  const requestBody = makeDiaryRequestBody({
    settings,
    apiUrl: settings.apiUrl,
    model: settings.model,
    systemPrompt,
    userPrompt
  });
  const response = await fetchImpl(settings.apiUrl, {
    method: 'POST',
    headers: chatRequestHeaders(settings.apiUrl, settings.apiKey),
    body: JSON.stringify(requestBody)
  });
  if (!response.ok) throw new Error(`日记生成失败：LLM ${response.status}`);
  reply = pickReply(await response.json());

  const content = cleanDiaryContent(reply);
  if (content.length < DIARY_MIN_CONTENT_LENGTH) {
    throw new Error('日记生成结果过短，已取消保存，请重试。');
  }
  return {
    raw: String(reply || '').trim(),
    content,
    body: composeDiaryBody(content, timestampLabel),
    timestampLabel,
    personaName,
    conversationLength: diaryConversationLength(conversation),
    turns: conversation
  };
}

export const diaryGenerationConstants = {
  DIARY_MAX_CONVERSATION_TURNS,
  DIARY_MIN_CONTENT_LENGTH
};
