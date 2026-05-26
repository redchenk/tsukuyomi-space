import { live2DPromptCatalog } from '../../constants/room/live2dManifest';
import {
  inferLive2DIntentFromText,
  normalizeLive2DIntent
} from './live2dControl';
import { readJson, writeJson } from './roomStorage';

const HISTORY_KEY = 'live2dLLMControlHistory';

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
  return data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || data?.reply || '';
}

function extractJsonObject(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  const fenced = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  return start >= 0 && end > start ? value.slice(start, end + 1).trim() : value;
}

function cleanReply(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/(?:^|\n)\s*(?:动作|表情|姿态|语气|神态|Action|Expression)\s*[:：][^\n]{1,160}(?=\n|$)/giu, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parsePayload(rawText) {
  const jsonText = extractJsonObject(rawText);
  try {
    const data = JSON.parse(jsonText);
    const reply = cleanReply(data.reply || data.text || data.message || '');
    const live2d = normalizeLive2DIntent(data.live2d || data.act || data.pose || data);
    return {
      reply: reply || 'OK.',
      live2d: live2d || inferLive2DIntentFromText(reply),
      raw: data
    };
  } catch (_) {
    const reply = cleanReply(rawText) || 'OK.';
    return {
      reply,
      live2d: inferLive2DIntentFromText(reply),
      raw: rawText
    };
  }
}

function normalizeOpenAIUrl(apiUrl = '') {
  const url = String(apiUrl || '').trim();
  if (/(api\.openai\.com|api\.x\.ai)\/v1\/?$/i.test(url)) return `${url.replace(/\/$/, '')}/responses`;
  if (/(xiaomimimo\.com|token-plan-cn\.xiaomimimo\.com)\/v1\/?$/i.test(url)) return `${url.replace(/\/$/, '')}/chat/completions`;
  return url;
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

function openRouterHeaders(apiUrl = '') {
  if (!isOpenRouterApi(apiUrl)) return {};
  return {
    'HTTP-Referer': window.location.origin,
    'X-OpenRouter-Title': 'Tsukuyomi Space'
  };
}

function buildDirectRequestBody(settings, systemPrompt, history, message) {
  const apiUrl = normalizeOpenAIUrl(settings.apiUrl || '');
  const model = settings.model || 'gpt-4o-mini';
  if (isOpenAIResponsesApi(apiUrl)) {
    return {
      model: settings.model || 'gpt-5.5',
      instructions: systemPrompt,
      input: [
        ...history.map((item) => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: String(item.content || '') })),
        { role: 'user', content: String(message || '') }
      ],
      max_output_tokens: 320
    };
  }
  return {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...history.map((item) => ({ role: item.role, content: String(item.content || '') })),
      { role: 'user', content: String(message || '') }
    ],
    temperature: isKimiChatTarget(apiUrl, model) ? 1 : 0.4,
    max_tokens: 320
  };
}

export function live2DControlSystemPrompt() {
  return [
    'You are controlling a Live2D character named Yachiyo.',
    'Yachiyo is being tested as an autonomous AI VTuber streamer: keep her present, reactive, playful, and concise.',
    'Return exactly one JSON object. Do not use Markdown. Do not add prose outside JSON.',
    'JSON schema:',
    '{"reply":"short visible reply","live2d":{"emotion":"happy|shy|sad|crying|neutral","expression":"neutral|smile|bsmile|namida|tears","expressionMix":[{"expression":"smile","weight":1}],"bodyPose":"none|nod|shake_head|lean_in|lean_left|lean_right|sway|bounce|emphasis","intensity":0.6,"durationMs":4200,"sequence":[]}}',
    'The reply field must contain only natural dialogue. Never put stage directions, parenthesized action hints, or labels in reply.',
    'For live-stream turns, choose a visible bodyPose unless the line is intentionally quiet. Do not only change the face.',
    'Vary bodyPose across turns: nod for acknowledgement, lean_in for focus, sway for idle talk, bounce for excitement, shake_head for playful refusal, emphasis for punchlines.',
    'Use sequence only when a multi-step performance is clearly helpful. Keep sequence to 3 steps or fewer.',
    live2DPromptCatalog()
  ].join('\n');
}

export function readLive2DLLMHistory() {
  const history = readJson(HISTORY_KEY, []);
  return Array.isArray(history) ? history.filter((item) => item && ['user', 'assistant'].includes(item.role)).slice(-8) : [];
}

export function clearLive2DLLMHistory() {
  writeJson(HISTORY_KEY, []);
}

export async function requestLive2DControl(message) {
  const settings = readJson('roomLLMSettings', {});
  if (!settings.apiKey || !settings.apiUrl) {
    throw new Error('Missing Room LLM settings. Configure LLM in /room/settings first.');
  }

  const history = readLive2DLLMHistory();
  const systemPrompt = [settings.systemPrompt, live2DControlSystemPrompt()].filter(Boolean).join('\n\n');
  let rawReply = '';

  if (settings.useProxy) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        conversation: history,
        apiKey: settings.apiKey,
        apiUrl: settings.apiUrl,
        model: settings.model,
        systemPrompt
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.message || `LLM ${response.status}`);
    rawReply = result.data?.reply || '';
  } else {
    const apiUrl = normalizeOpenAIUrl(settings.apiUrl);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
        ...openRouterHeaders(apiUrl)
      },
      body: JSON.stringify(buildDirectRequestBody({ ...settings, apiUrl }, systemPrompt, history, message))
    });
    if (!response.ok) throw new Error(`LLM ${response.status}`);
    rawReply = pickReply(await response.json());
  }

  const parsed = parsePayload(rawReply);
  const nextHistory = [
    ...history,
    { role: 'user', content: String(message || '') },
    { role: 'assistant', content: parsed.reply }
  ].slice(-8);
  writeJson(HISTORY_KEY, nextHistory);
  return parsed;
}
