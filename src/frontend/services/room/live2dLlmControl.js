import { live2DPromptCatalog } from '../../constants/room/live2dManifest';
import {
  inferLive2DIntentFromText,
  live2DSemanticPromptCatalog,
  normalizeLive2DIntent
} from './live2dControl';
import { compileBehaviorIntent } from './live2dBehaviorController';
import { readJson, writeJson } from './roomStorage';

const HISTORY_KEY = 'live2dLLMControlHistory';
const HARD_SENTENCE_END_PATTERN = /[\u3002\uff01\uff1f.!?\u2026]/u;
const SOFT_SENTENCE_END_PATTERN = /[\uff0c\u3001,;\uff1b\n]/u;
const SENTENCE_TRAILING_PATTERN = /[\s"'\u201d\u2019\uff09)\]\u3011\u300b\u300d\u300f]+/u;
const FIRST_TTS_CHUNK_UNIT_LIMIT = 8;
const FOLLOWUP_TTS_CHUNK_UNIT_LIMIT = 20;
const FIRST_SOFT_CHUNK_UNIT_LIMIT = 12;
const FOLLOWUP_SOFT_CHUNK_UNIT_LIMIT = 30;
const FIRST_MAX_CHUNK_UNIT_LIMIT = 16;
const FOLLOWUP_MAX_CHUNK_UNIT_LIMIT = 42;
const SPEECH_STYLE_BY_EMOTION = {
  happy: { speed: 1.08, pitch: 0.08, pause: 'bright' },
  smile: { speed: 1.06, pitch: 0.07, pause: 'warm' },
  smug: { speed: 1.04, pitch: 0.05, pause: 'teasing' },
  shy: { speed: 0.96, pitch: 0.07, pause: 'soft' },
  surprised: { speed: 1.12, pitch: 0.11, pause: 'startled' },
  angry: { speed: 1.08, pitch: -0.02, pause: 'firm' },
  puff: { speed: 1.02, pitch: 0.03, pause: 'pouting' },
  tongue: { speed: 1.07, pitch: 0.08, pause: 'playful' },
  dizzy: { speed: 0.92, pitch: -0.02, pause: 'confused' },
  sad: { speed: 0.9, pitch: -0.06, pause: 'tender' },
  crying: { speed: 0.88, pitch: -0.08, pause: 'tearful' },
  fire: { speed: 1.12, pitch: 0.02, pause: 'energetic' },
  neutral: { speed: 1, pitch: 0, pause: 'natural' }
};
const SENTENCE_EMOTION_RULES = [
  { emotion: 'fire', pattern: /(\u71c3|\u7206\u53d1|\u7206\u767c|\u70ed\u8840|\u71b1\u8840|furious|rage|fired up|serious)/iu },
  { emotion: 'angry', pattern: /(\u751f\u6c14|\u751f\u6c23|\u6124\u6012|\u61a4\u6012|\u607c\u706b|\u60f1\u706b|angry|annoyed|irritated|mad|scold)/iu },
  { emotion: 'surprised', pattern: /(\u60ca\u8bb6|\u9a5a\u8a1d|\u9707\u60ca|\u9a5a\u5446|\u5413|wow|surpris|shock|startled|really\?)/iu },
  { emotion: 'puff', pattern: /(\u9f13\u8138|\u5634\u8138|\u6485\u5634|\u4e0d\u670d|pout|puff|sulk|cheek puff)/iu },
  { emotion: 'tongue', pattern: /(\u5410\u820c|\u8c03\u76ae|\u8abf\u76ae|tongue|blep|cheeky|mischief|teasing)/iu },
  { emotion: 'dizzy', pattern: /(\u6655|\u56f0\u60d1|\u614c|dizzy|confused|dazed|overwhelmed|panic)/iu },
  { emotion: 'crying', pattern: /(\u5927\u54ed|\u54ed\u6ce3|\u6d41\u6cea|\u6d41\u6dda|crying|tears|sob|weeping)/iu },
  { emotion: 'sad', pattern: /(\u96be\u8fc7|\u96e3\u904e|\u60b2\u4f24|\u60b2\u50b7|\u4f24\u5fc3|\u50b7\u5fc3|sad|sorrow|lonely)/iu },
  { emotion: 'smug', pattern: /(\u5f97\u610f|\u574f\u7b11|\u5c0f\u574f|smug|smirk|sly|confident)/iu },
  { emotion: 'shy', pattern: /(\u5bb3\u7f9e|\u8138\u7ea2|\u81c9\u7d05|shy|blush|embarrassed|bashful|flustered)/iu },
  { emotion: 'happy', pattern: /(\u5f00\u5fc3|\u958b\u5fc3|\u9ad8\u5174|\u9ad8\u8208|\u6109\u5feb|\u5fae\u7b11|\u7b11|happy|smile|joy|cheerful)/iu }
];
const SENTENCE_ACTIONS_BY_EMOTION = {
  happy: [{ type: 'smile', duration: 1.2 }, { type: 'bounce', duration: 1.1, delay: 0.1 }, { type: 'nod', duration: 1.15, delay: 0.22 }],
  smile: [{ type: 'smile', duration: 1.25 }, { type: 'sway', duration: 1.25, delay: 0.12 }, { type: 'look_at_chat', duration: 0.9, delay: 0.28 }],
  smug: [{ type: 'smirk', duration: 1.25 }, { type: 'lean_in', duration: 1.2, delay: 0.12 }, { type: 'head_tilt', side: 'random', duration: 1.1, delay: 0.22 }],
  shy: [{ type: 'smile', duration: 1.1 }, { type: 'blink', duration: 0.34, delay: 0.1 }, { type: 'sway', duration: 1.25, delay: 0.24 }],
  surprised: [{ type: 'surprised', duration: 0.95 }, { type: 'lean_in', duration: 1.1, delay: 0.08 }, { type: 'bounce', duration: 1, delay: 0.22 }],
  angry: [{ type: 'lean_in', duration: 1.2 }, { type: 'emphasis', duration: 0.95, delay: 0.12 }, { type: 'shake_head', duration: 1.05, delay: 0.28 }],
  puff: [{ type: 'shake_head', duration: 0.95 }, { type: 'sway', duration: 1.2, delay: 0.12 }, { type: 'look_at_chat', duration: 0.9, delay: 0.26 }],
  tongue: [{ type: 'tongue_out', duration: 0.72 }, { type: 'smirk', duration: 1.1, delay: 0.08 }, { type: 'wink', side: 'random', duration: 0.52, delay: 0.18 }],
  dizzy: [{ type: 'shake_head', duration: 1.05 }, { type: 'sway', duration: 1.25, delay: 0.12 }, { type: 'blink', duration: 0.34, delay: 0.5 }],
  sad: [{ type: 'breathe', duration: 1.4 }, { type: 'nod', duration: 1.15, delay: 0.16 }, { type: 'look_at_chat', duration: 0.9, delay: 0.34 }],
  crying: [{ type: 'shiver', duration: 1.05 }, { type: 'breathe', duration: 1.25, delay: 0.2 }, { type: 'nod', duration: 1.1, delay: 0.36 }],
  fire: [{ type: 'lean_in', duration: 1.15 }, { type: 'emphasis', duration: 0.95, delay: 0.12 }, { type: 'bounce', duration: 0.95, delay: 0.28 }],
  neutral: [{ type: 'look_at_chat', duration: 0.95 }, { type: 'breathe', duration: 1.35, delay: 0.1 }]
};

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

function extractJsonObject(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  const fenced = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  return start >= 0 && end > start ? value.slice(start, end + 1).trim() : value;
}

function escapeRegExp(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractLabeledJsonObject(text, labels = ['CONTROL', 'JSON', 'LIVE2D_CONTROL']) {
  const value = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '');
  let startIndex = -1;
  for (const label of labels) {
    const match = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(label)}\\s*[:\\uFF1A]`, 'i').exec(value);
    if (!match) continue;
    startIndex = match.index + match[0].length;
  }
  return startIndex >= 0 ? extractJsonObject(value.slice(startIndex)) : '';
}

function decodeJsonEscape(char, tail) {
  if (char === 'n') return ['\n', 0];
  if (char === 'r') return ['\r', 0];
  if (char === 't') return ['\t', 0];
  if (char === 'b') return ['\b', 0];
  if (char === 'f') return ['\f', 0];
  if (char === 'u') {
    const hex = tail.slice(0, 4);
    if (/^[0-9a-f]{4}$/i.test(hex)) return [String.fromCharCode(parseInt(hex, 16)), 4];
    return ['', -1];
  }
  return [char, 0];
}

function readJsonStringFieldProgress(text, fieldName) {
  const value = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '');
  const marker = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*"`, 'i').exec(value);
  if (!marker) return { value: '', complete: false, found: false };

  let result = '';
  let index = marker.index + marker[0].length;
  while (index < value.length) {
    const char = value[index];
    if (char === '"') return { value: result, complete: true, found: true };
    if (char === '\\') {
      const next = value[index + 1];
      if (!next) break;
      const [decoded, consumed] = decodeJsonEscape(next, value.slice(index + 2));
      if (consumed < 0) break;
      result += decoded;
      index += 2 + consumed;
      continue;
    }
    result += char;
    index += 1;
  }
  return { value: result, complete: false, found: true };
}

function readReplyFieldProgress(text) {
  for (const fieldName of ['reply', 'text', 'message']) {
    const field = readJsonStringFieldProgress(text, fieldName);
    if (field.found) return field;
  }
  return { value: '', complete: false, found: false };
}

function readStreamingSpeechProgress(text) {
  const value = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '');
  const beforeControl = value.split(/\n\s*(?:CONTROL|JSON|LIVE2D_CONTROL)\s*[:\uFF1A]/i)[0] || '';
  const pieces = [];
  beforeControl.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*(?:SAY|SPEECH|VOICE|LINE)\s*[:\uFF1A]\s*(.*)$/i);
    if (match) pieces.push(match[1]);
  });
  return pieces.join('\n').trim();
}

function parseStreamingBeatLine(line) {
  const match = String(line || '').match(/^\s*(?:BEAT|EMOTION_BEAT|ACTION_BEAT)\s*[:\uFF1A]\s*(.*)$/i);
  if (!match) return null;
  const source = extractJsonObject(match[1]);
  if (!source || !source.startsWith('{')) return null;
  try {
    const data = JSON.parse(source);
    return data && typeof data === 'object' ? data : null;
  } catch (_) {
    return null;
  }
}

function readStreamingBeatsProgress(text) {
  const value = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '');
  const beforeControl = value.split(/\n\s*(?:CONTROL|JSON|LIVE2D_CONTROL)\s*[:\uFF1A]/i)[0] || '';
  return beforeControl
    .split(/\r?\n/)
    .map((line) => parseStreamingBeatLine(line))
    .filter(Boolean);
}

function cleanReply(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/(?:^|\n)\s*(?:动作|表情|姿态|语气|神态|Action|Expression)\s*[:：][^\n]{1,160}(?=\n|$)/giu, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanReplyForSpeech(text) {
  return cleanReply(text)
    .replace(/^\s*(?:SAY|SPEECH|VOICE|LINE)\s*[:\uFF1A]\s*/i, '')
    .trim();
}

function normalizeEmotion(value, fallback = 'neutral') {
  const token = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (token === 'smile') return 'happy';
  if (token === 'tears' || token === 'namida') return token === 'namida' ? 'sad' : 'crying';
  return SPEECH_STYLE_BY_EMOTION[token] ? token : fallback;
}

function speechStyleForEmotion(emotion, overrides = null) {
  return {
    ...(SPEECH_STYLE_BY_EMOTION[normalizeEmotion(emotion)] || SPEECH_STYLE_BY_EMOTION.neutral),
    ...(overrides && typeof overrides === 'object' ? overrides : {})
  };
}

function speakableUnitLength(text) {
  return String(text || '')
    .replace(/[\s"'`()[\]{}<>.,;:!?~\-\u3001\u3002\uff0c\uff01\uff1f\uff1b\uff1a\u201c\u201d\u2018\u2019\uff08\uff09\u3010\u3011\u300a\u300b\u2026]/g, '')
    .length;
}

function chunkProfileFor(text, chunkIndex = 0) {
  const value = String(text || '');
  const hasCjk = /[\u3040-\u30ff\u3400-\u9fff]/u.test(value);
  const first = chunkIndex < 1;
  return {
    min: hasCjk ? (first ? FIRST_TTS_CHUNK_UNIT_LIMIT : FOLLOWUP_TTS_CHUNK_UNIT_LIMIT) : (first ? 18 : 58),
    soft: hasCjk ? (first ? FIRST_SOFT_CHUNK_UNIT_LIMIT : FOLLOWUP_SOFT_CHUNK_UNIT_LIMIT) : (first ? 28 : 86),
    max: hasCjk ? (first ? FIRST_MAX_CHUNK_UNIT_LIMIT : FOLLOWUP_MAX_CHUNK_UNIT_LIMIT) : (first ? 42 : 130)
  };
}

function consumeTrailing(text, startIndex) {
  let endIndex = startIndex;
  while (endIndex < text.length && SENTENCE_TRAILING_PATTERN.test(text[endIndex])) endIndex += 1;
  return endIndex;
}

function findSoftChunkCutIndex(text, chunkIndex = 0) {
  const value = String(text || '');
  const hasCjk = /[\u3040-\u30ff\u3400-\u9fff]/u.test(value);
  const profile = chunkProfileFor(value, chunkIndex);
  let units = 0;
  let lastWhitespace = -1;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (/\s/u.test(char)) {
      if (units >= profile.min) lastWhitespace = index + 1;
      continue;
    }
    if (speakableUnitLength(char) < 1) continue;
    units += 1;
    if (SOFT_SENTENCE_END_PATTERN.test(char) && units >= profile.min) return consumeTrailing(value, index + 1);
    if (units < profile.soft) continue;
    if (!hasCjk && lastWhitespace > 0) return lastWhitespace;
    if (hasCjk || units >= profile.max) return index + 1;
  }
  return -1;
}

function findSentenceCutIndex(text, chunkIndex = 0, flush = false) {
  const profile = chunkProfileFor(text, chunkIndex);
  let units = 0;
  let lastWhitespace = -1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/\s/u.test(char)) {
      if (units >= profile.min) lastWhitespace = index + 1;
    } else if (speakableUnitLength(char) > 0) {
      units += 1;
    }
    if (HARD_SENTENCE_END_PATTERN.test(char)) {
      if (flush || units >= profile.min) return consumeTrailing(text, index + 1);
      continue;
    }
    if (SOFT_SENTENCE_END_PATTERN.test(char) && units >= profile.min) return consumeTrailing(text, index + 1);
    if (!flush && units >= profile.max) return lastWhitespace > 0 ? lastWhitespace : index + 1;
  }
  return -1;
}

function splitCompletedSentences(buffer, flush = false, emittedCount = 0) {
  const sentences = [];
  let rest = String(buffer || '');
  while (rest) {
    const chunkIndex = emittedCount + sentences.length;
    const cutIndex = findSentenceCutIndex(rest, chunkIndex, flush);
    const softCutIndex = cutIndex < 0 && !flush ? findSoftChunkCutIndex(rest, chunkIndex) : -1;
    if (cutIndex < 0 && softCutIndex < 0) break;
    const endIndex = cutIndex >= 0 ? cutIndex : softCutIndex;
    const sentence = rest.slice(0, endIndex).trim();
    if (sentence) sentences.push(sentence);
    rest = rest.slice(endIndex);
  }
  if (flush && rest.trim()) {
    sentences.push(rest.trim());
    rest = '';
  }
  return { sentences, rest };
}

function shouldJoinSpeechChunksWithSpace(left, right) {
  return /[A-Za-z0-9]$/.test(String(left || '').trim()) && /^[A-Za-z0-9]/.test(String(right || '').trim());
}

function joinSpeechChunks(left, right) {
  const previous = cleanReplyForSpeech(left);
  const next = cleanReplyForSpeech(right);
  if (!previous) return next;
  if (!next) return previous;
  return `${previous}${shouldJoinSpeechChunksWithSpace(previous, next) ? ' ' : ''}${next}`;
}

function sentenceActionsForEmotion(emotion) {
  const actions = SENTENCE_ACTIONS_BY_EMOTION[normalizeEmotion(emotion)] || SENTENCE_ACTIONS_BY_EMOTION.neutral;
  return actions.map((action) => ({ ...action }));
}

function analyzeLive2DSentenceEmotion(text, fallbackEmotion = 'neutral') {
  const value = String(text || '').trim();
  const rule = SENTENCE_EMOTION_RULES.find((item) => item.pattern.test(value));
  const inferred = inferLive2DIntentFromText(value);
  const emotion = normalizeEmotion(rule?.emotion || inferred?.emotion || inferred?.expression, normalizeEmotion(fallbackEmotion));
  return {
    emotion,
    speechStyle: speechStyleForEmotion(emotion)
  };
}

function mergeParameterTargets(primary = [], fallback = []) {
  const merged = Array.isArray(primary) ? [...primary] : [];
  const seen = new Set(merged.map((item) => String(item?.id || '').toLowerCase()).filter(Boolean));
  for (const target of Array.isArray(fallback) ? fallback : []) {
    const key = String(target?.id || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    merged.push(target);
    seen.add(key);
  }
  return merged;
}

function mergeBehaviorActions(primary = [], secondary = []) {
  const merged = [];
  const seen = new Set();
  for (const action of [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(secondary) ? secondary : [])]) {
    const type = String(action?.type || action?.action || action?.name || '').trim();
    if (!type) continue;
    const key = `${type}:${action?.side || action?.direction || ''}`;
    if (seen.has(key)) continue;
    merged.push({ ...action });
    seen.add(key);
  }
  return merged.slice(0, 8);
}

function mergeBehaviorAndExplicitIntent(behaviorIntent, explicitIntent) {
  if (!behaviorIntent) return explicitIntent;
  if (!explicitIntent) return normalizeLive2DIntent(behaviorIntent);
  return normalizeLive2DIntent({
    ...explicitIntent,
    emotion: explicitIntent.emotion || behaviorIntent.emotion,
    expression: explicitIntent.expression || behaviorIntent.expression,
    expressionMix: explicitIntent.expressionMix?.length ? explicitIntent.expressionMix : behaviorIntent.expressionMix,
    bodyPose: explicitIntent.bodyPose || behaviorIntent.bodyPose,
    intensity: Math.max(Number(explicitIntent.intensity) || 0, Number(behaviorIntent.intensity) || 0) || behaviorIntent.intensity,
    durationMs: Math.max(Number(explicitIntent.durationMs) || 0, Number(behaviorIntent.durationMs) || 0) || behaviorIntent.durationMs,
    priority: Math.max(Number(explicitIntent.priority) || 0, Number(behaviorIntent.priority) || 0) || behaviorIntent.priority,
    interruptPolicy: explicitIntent.interruptPolicy || behaviorIntent.interruptPolicy,
    parameters: mergeParameterTargets(behaviorIntent.parameters, explicitIntent.parameters),
    behaviorActions: mergeBehaviorActions(explicitIntent.behaviorActions, behaviorIntent.behaviorActions),
    speechStyle: behaviorIntent.speechStyle || explicitIntent.speechStyle || null
  });
}

function normalizeStreamingBeat(rawBeat = {}, sentence = '', fallbackEmotion = 'neutral', fallbackSpeechStyle = null) {
  const beat = rawBeat && typeof rawBeat === 'object' ? rawBeat : {};
  const nested = beat.live2d && typeof beat.live2d === 'object' ? beat.live2d : {};
  const emotion = normalizeEmotion(
    beat.emotion || beat.mood || beat.expression || nested.emotion || nested.mood || nested.expression,
    fallbackEmotion
  );
  const rawActions = beat.actions || beat.behaviorActions || nested.actions || nested.behaviorActions || [];
  const actions = Array.isArray(rawActions) ? rawActions : (rawActions ? [{ type: rawActions }] : []);
  const speechStyle = beat.speech_style || beat.speechStyle || nested.speech_style || nested.speechStyle || fallbackSpeechStyle || null;

  return {
    reply: sentence,
    text: sentence,
    emotion,
    mood: emotion,
    intensity: beat.intensity ?? nested.intensity ?? (emotion === 'neutral' ? 0.58 : 0.72),
    priority: beat.priority ?? nested.priority,
    interruptPolicy: beat.interruptPolicy || beat.interrupt || nested.interruptPolicy || nested.interrupt || null,
    actions,
    speech_style: speechStyleForEmotion(emotion, speechStyle)
  };
}

function buildSentenceLive2DIntent(text, emotion, speechStyle = null) {
  const analyzedEmotion = normalizeEmotion(emotion);
  const behaviorIntent = compileBehaviorIntent({
    reply: text,
    emotion: analyzedEmotion,
    intensity: analyzedEmotion === 'neutral' ? 0.58 : 0.72,
    actions: sentenceActionsForEmotion(analyzedEmotion),
    speech_style: speechStyle || speechStyleForEmotion(analyzedEmotion)
  });
  const inferredIntent = inferLive2DIntentFromText(text);
  return mergeBehaviorAndExplicitIntent(behaviorIntent, inferredIntent) || behaviorIntent || inferredIntent;
}

function buildBeatLive2DIntent(sentence, beat, fallbackEmotion = 'neutral', fallbackSpeechStyle = null) {
  const payload = normalizeStreamingBeat(beat, sentence, fallbackEmotion, fallbackSpeechStyle);
  const behaviorIntent = compileBehaviorIntent(payload);
  const inferredIntent = inferLive2DIntentFromText(sentence);
  return mergeBehaviorAndExplicitIntent(behaviorIntent, inferredIntent) || behaviorIntent || inferredIntent;
}

function createReplySentenceEmitter(handlers = {}) {
  let seenReply = '';
  let sentenceBuffer = '';
  let pendingShortSentence = '';
  let seenBeatCount = 0;
  const pendingBeats = [];
  let emittedCount = 0;

  const dispatchSentence = (text) => {
    const sentence = cleanReplyForSpeech(text);
    if (!sentence || speakableUnitLength(sentence) < 2) return;
    const analysis = analyzeLive2DSentenceEmotion(sentence);
    const beat = pendingBeats.shift() || null;
    const speechStyle = beat
      ? speechStyleForEmotion(normalizeEmotion(beat.emotion || beat.mood || beat.expression, analysis.emotion), beat.speech_style || beat.speechStyle || null)
      : analysis.speechStyle;
    const live2d = beat
      ? buildBeatLive2DIntent(sentence, beat, analysis.emotion, analysis.speechStyle)
      : buildSentenceLive2DIntent(sentence, analysis.emotion, analysis.speechStyle);
    const emotion = live2d?.emotion || live2d?.expression || analysis.emotion;
    emittedCount += 1;
    handlers.onSentence?.({
      index: emittedCount,
      text: sentence,
      emotion,
      speechStyle: live2d?.speechStyle || speechStyle,
      live2d,
      beat
    });
  };

  const emitSentence = (text, options = {}) => {
    let sentence = cleanReplyForSpeech(text);
    if (pendingShortSentence) {
      sentence = joinSpeechChunks(pendingShortSentence, sentence);
      pendingShortSentence = '';
    }
    if (!sentence) return;
    const minUnits = emittedCount < 1 ? FIRST_TTS_CHUNK_UNIT_LIMIT : FOLLOWUP_TTS_CHUNK_UNIT_LIMIT;
    if (options.allowHold !== false && speakableUnitLength(sentence) < minUnits) {
      pendingShortSentence = sentence;
      return;
    }
    dispatchSentence(sentence);
  };

  const flushPendingSentence = () => {
    if (!pendingShortSentence) return;
    const sentence = pendingShortSentence;
    pendingShortSentence = '';
    dispatchSentence(sentence);
  };

  const pushReply = (reply, options = {}) => {
    const current = String(reply || '');
    if (current.length > seenReply.length) {
      sentenceBuffer += current.slice(seenReply.length);
      seenReply = current;
    }
    const split = splitCompletedSentences(sentenceBuffer, Boolean(options.flush), emittedCount);
    sentenceBuffer = split.rest;
    split.sentences.forEach((sentence) => emitSentence(sentence, { allowHold: true }));
    if (options.flush) flushPendingSentence();
  };

  return {
    pushRaw(rawText, options = {}) {
      const beats = readStreamingBeatsProgress(rawText);
      if (beats.length > seenBeatCount) {
        pendingBeats.push(...beats.slice(seenBeatCount));
        seenBeatCount = beats.length;
      }
      const streamingSpeech = readStreamingSpeechProgress(rawText);
      if (streamingSpeech) {
        pushReply(streamingSpeech, { flush: options.flush });
        return;
      }
      const field = readReplyFieldProgress(rawText);
      if (!field.found) return;
      pushReply(field.value, { flush: options.flush || field.complete });
    },
    flushReply(reply) {
      pushReply(reply, { flush: true });
    },
    get emittedCount() {
      return emittedCount;
    }
  };
}

function parsePayload(rawText) {
  const jsonText = extractLabeledJsonObject(rawText) || extractJsonObject(rawText);
  try {
    const data = JSON.parse(jsonText);
    const reply = cleanReply(data.reply || data.text || data.message || '');
    const nestedControl = data.live2d || data.act || data.pose || null;
    const payload = nestedControl ? { ...data, ...nestedControl, reply } : { ...data, reply };
    const live2d = mergeBehaviorAndExplicitIntent(
      compileBehaviorIntent(payload),
      normalizeLive2DIntent(payload)
    );
    return {
      reply: reply || 'OK.',
      live2d: live2d || inferLive2DIntentFromText(reply),
      raw: data
    };
  } catch (_) {
    const streamingSpeech = readStreamingSpeechProgress(rawText);
    const reply = cleanReply(streamingSpeech || rawText) || 'OK.';
    return {
      reply,
      live2d: mergeBehaviorAndExplicitIntent(
        compileBehaviorIntent({ reply, text: rawText }),
        inferLive2DIntentFromText(reply)
      ),
      raw: rawText
    };
  }
}

function normalizeOpenAIUrl(apiUrl = '') {
  const url = normalizeLocalLLMUrl(apiUrl);
  if (isOllamaApi(url)) return normalizeOllamaUrl(url);
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

function chatRequestHeaders(apiUrl = '', apiKey = '') {
  const normalized = normalizeOpenAIUrl(apiUrl);
  if (isOllamaApi(normalized)) return { 'Content-Type': 'application/json' };
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...openRouterHeaders(normalized)
  };
}

function buildDirectRequestBody(settings, systemPrompt, history, message) {
  const apiUrl = normalizeOpenAIUrl(settings.apiUrl || '');
  const model = isOllamaApi(apiUrl) ? (settings.model || 'qwen2.5:7b') : (settings.model || 'gpt-4o-mini');
  if (isOllamaNativeApi(apiUrl)) {
    return {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history.map((item) => ({ role: item.role, content: String(item.content || '') })),
        { role: 'user', content: String(message || '') }
      ],
      stream: false,
      options: {
        temperature: isKimiChatTarget(apiUrl, model) ? 1 : 0.4
      }
    };
  }
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

function buildStreamingDirectRequestBody(settings, systemPrompt, history, message) {
  return {
    ...buildDirectRequestBody(settings, systemPrompt, history, message),
    stream: true
  };
}

function parseSsePacket(packet) {
  const lines = String(packet || '').split(/\r?\n/);
  let event = 'message';
  const dataLines = [];
  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim() || 'message';
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  return { event, data: dataLines.join('\n') };
}

function pickStreamDelta(data) {
  if (!data || typeof data !== 'object') return '';
  if (typeof data.delta === 'string') return data.delta;
  if (typeof data.text === 'string' && /delta/i.test(String(data.type || ''))) return data.text;
  if (typeof data.output_text_delta === 'string') return data.output_text_delta;
  if (Array.isArray(data.choices)) {
    return data.choices
      .map((choice) => choice?.delta?.content || choice?.delta?.text || choice?.text || choice?.message?.content || '')
      .join('');
  }
  return pickReply(data);
}

async function readStreamingTextResponse(response, handlers = {}) {
  const contentType = response.headers?.get?.('content-type') || '';
  if (!/event-stream|stream/i.test(contentType)) {
    const data = await response.json().catch(() => null);
    const text = pickReply(data);
    if (text) handlers.onText?.(text, text, data);
    return text;
  }

  if (!response.body?.getReader) {
    const data = await response.json().catch(() => null);
    return pickReply(data);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let packetBuffer = '';
  let rawText = '';

  const handlePacket = (packet) => {
    const { event, data } = parseSsePacket(packet);
    if (!data || data === '[DONE]') return;
    let payload = null;
    try {
      payload = JSON.parse(data);
    } catch (_) {
      rawText += data;
      handlers.onEvent?.({ event, payload: null, delta: data, rawText });
      handlers.onText?.(data, rawText);
      return;
    }
    if (event === 'error' || payload?.success === false) {
      throw new Error(payload?.message || payload?.error?.message || 'LLM stream failed');
    }
    const delta = pickStreamDelta(payload);
    handlers.onEvent?.({ event, payload, delta, rawText });
    if (!delta) return;
    rawText += delta;
    handlers.onText?.(delta, rawText, payload);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    packetBuffer += decoder.decode(value, { stream: true });
    const packets = packetBuffer.split(/\r?\n\r?\n/);
    packetBuffer = packets.pop() || '';
    for (const packet of packets) handlePacket(packet);
  }
  packetBuffer += decoder.decode();
  if (packetBuffer.trim()) handlePacket(packetBuffer);
  return rawText;
}

export function live2DControlSystemPrompt() {
  return [
    'You are controlling a Live2D character named Yachiyo.',
    'Yachiyo is being tested as an autonomous AI VTuber streamer: keep her present, reactive, playful, and concise.',
    'Return exactly one JSON object. Do not use Markdown. Do not add prose outside JSON.',
    'JSON schema:',
    '{"reply":"short visible reply","emotion":"happy|shy|smug|surprised|sad|crying|neutral","intensity":0.72,"actions":[{"type":"look_at_chat","duration":1.0},{"type":"smirk","duration":1.4,"side":"right"},{"type":"head_tilt","duration":1.2,"delay":0.2}],"live2d":{"expression":"smile","bodyPose":"none","sequence":[]}}',
    'The reply field must contain only natural dialogue. Never put stage directions, parenthesized action hints, or labels in reply.',
    'Choose 2-5 semantic actions per turn. If the moment is calm, use look_at_chat + breathe.',
    'Vary action combos between turns. Do not repeat the same body action unless the dialogue specifically calls for it.',
    'Use duration and delay in seconds. Actions may overlap by using similar delay values.',
    'Use sequence only when a multi-step performance is clearly helpful. Keep sequence to 3 steps or fewer.',
    live2DSemanticPromptCatalog(),
    live2DPromptCatalog()
  ].join('\n');
}

export function live2DStreamingControlSystemPrompt() {
  return [
    'You are controlling a Live2D character named Yachiyo.',
    'This is a low-latency streaming turn. Output one compact semantic BEAT before each spoken VOICE line, then output final CONTROL JSON at the end.',
    'Output format must be exactly:',
    'BEAT: {"emotion":"happy","intensity":0.68,"actions":[{"type":"look_at_chat","duration":0.9},{"type":"smile","duration":1.2}],"speech_style":{"speed":1.06,"pitch":0.06,"pause":"bright"}}',
    'VOICE: a natural short spoken phrase or sentence.',
    'BEAT: {"emotion":"smug","intensity":0.72,"actions":[{"type":"smirk","duration":1.1},{"type":"lean_in","duration":1.0,"delay":0.08}],"speech_style":{"speed":1.04,"pitch":0.05,"pause":"teasing"}}',
    'VOICE: the next natural phrase or sentence.',
    'CONTROL: {"reply":"same spoken text without VOICE labels","emotion":"happy|shy|smug|surprised|sad|crying|neutral","intensity":0.72,"actions":[{"type":"look_at_chat","duration":1.2},{"type":"smirk","duration":2.0}],"interruptPolicy":{"mode":"blend","priority":4},"speech_style":{"speed":1.05,"pitch":0.08,"pause":"playful"}}',
    'Each BEAT must be a single-line JSON object and must appear immediately before the VOICE it controls.',
    'The VOICE lines must come before CONTROL. Emit the first BEAT and VOICE before planning the full answer. Do not wait for CONTROL before speaking.',
    'VOICE lines must contain only natural dialogue. Never put BEAT JSON, stage directions, parenthesized action hints, asterisk actions, action labels, pose descriptions, or JSON in VOICE.',
    'CONTROL must be one JSON object after the CONTROL label. The reply field must match the spoken VOICE text.',
    'Use only semantic emotions and semantic actions. Do not output raw Live2D parameters, VTube Studio parameter ids, expression file names, or pose descriptions.',
    'Choose 2-5 semantic actions across the turn that match the spoken meaning and mood. Per-BEAT actions may be 1-3 concise semantic actions.',
    'Use duration and delay in seconds. Use intensity 0.45-0.85 for normal talking, 0.85-1.0 for punchlines or surprise.',
    live2DSemanticPromptCatalog(),
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
  const apiUrl = settings.apiUrl ? normalizeOpenAIUrl(settings.apiUrl) : '';
  const useLocalOllama = isOllamaApi(apiUrl);
  if (!settings.apiUrl || (!settings.apiKey && !useLocalOllama)) {
    throw new Error('Missing Room LLM settings. Configure LLM in /room/settings first.');
  }

  const history = readLive2DLLMHistory();
  const systemPrompt = [settings.systemPrompt, live2DControlSystemPrompt()].filter(Boolean).join('\n\n');
  let rawReply = '';

  if (settings.useProxy && !useLocalOllama) {
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
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: chatRequestHeaders(apiUrl, settings.apiKey),
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

export async function requestLive2DControlStream(message, handlers = {}) {
  const settings = readJson('roomLLMSettings', {});
  const apiUrl = settings.apiUrl ? normalizeOpenAIUrl(settings.apiUrl) : '';
  const useLocalOllama = isOllamaApi(apiUrl);
  if (!settings.apiUrl || (!settings.apiKey && !useLocalOllama)) {
    throw new Error('Missing Room LLM settings. Configure LLM in /room/settings first.');
  }

  if (useLocalOllama) {
    const sentenceEmitter = createReplySentenceEmitter(handlers);
    const fallback = await requestLive2DControl(message);
    sentenceEmitter.flushReply(fallback.reply);
    handlers.onDone?.(fallback);
    return fallback;
  }

  const history = readLive2DLLMHistory();
  const systemPrompt = [settings.systemPrompt, live2DStreamingControlSystemPrompt()].filter(Boolean).join('\n\n');
  const sentenceEmitter = createReplySentenceEmitter(handlers);
  let rawReply = '';

  if (settings.useProxy) {
    const response = await fetch('/api/chat/stream', {
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
    if (!response.ok) {
      if ([404, 405, 410].includes(response.status)) {
        const fallback = await requestLive2DControl(message);
        sentenceEmitter.flushReply(fallback.reply);
        handlers.onDone?.(fallback);
        return fallback;
      }
      const result = await response.json().catch(() => ({}));
      throw new Error(result.message || `LLM ${response.status}`);
    }
    rawReply = await readStreamingTextResponse(response, {
      onText: (delta, accumulated) => {
        sentenceEmitter.pushRaw(accumulated);
        handlers.onDelta?.({ delta, raw: accumulated });
      },
      onEvent: (event) => handlers.onEvent?.(event)
    });
  } else {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: chatRequestHeaders(apiUrl, settings.apiKey),
      body: JSON.stringify(buildStreamingDirectRequestBody({ ...settings, apiUrl }, systemPrompt, history, message))
    });
    if (!response.ok) throw new Error(`LLM ${response.status}`);
    rawReply = await readStreamingTextResponse(response, {
      onText: (delta, accumulated) => {
        sentenceEmitter.pushRaw(accumulated);
        handlers.onDelta?.({ delta, raw: accumulated });
      },
      onEvent: (event) => handlers.onEvent?.(event)
    });
  }

  sentenceEmitter.pushRaw(rawReply, { flush: true });
  const parsed = parsePayload(rawReply);
  if (sentenceEmitter.emittedCount < 1) sentenceEmitter.flushReply(parsed.reply);
  const nextHistory = [
    ...history,
    { role: 'user', content: String(message || '') },
    { role: 'assistant', content: parsed.reply }
  ].slice(-8);
  writeJson(HISTORY_KEY, nextHistory);
  handlers.onDone?.(parsed);
  return parsed;
}
