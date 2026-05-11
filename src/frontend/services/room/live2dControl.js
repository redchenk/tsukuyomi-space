import { roomLive2DManifest } from '../../constants/room/live2dManifest';

const expressionAliases = {
  neutral: 'neutral',
  none: 'neutral',
  normal: 'neutral',
  calm: 'neutral',
  default: 'neutral',
  happy: 'smile',
  joy: 'smile',
  cheerful: 'smile',
  smile: 'smile',
  gentle: 'smile',
  warm: 'smile',
  开心: 'smile',
  高兴: 'smile',
  愉快: 'smile',
  微笑: 'smile',
  笑: 'smile',
  嬉しい: 'smile',
  優しい: 'smile',
  shy: 'bsmile',
  blush: 'bsmile',
  embarrassed: 'bsmile',
  playful: 'bsmile',
  bsmile: 'bsmile',
  annoyed: 'bsmile',
  angry: 'bsmile',
  害羞: 'bsmile',
  脸红: 'bsmile',
  調皮: 'bsmile',
  生气: 'bsmile',
  愤怒: 'bsmile',
  照れ: 'bsmile',
  sad: 'namida',
  sorrow: 'namida',
  namida: 'namida',
  难过: 'namida',
  悲伤: 'namida',
  伤心: 'namida',
  眼泪: 'namida',
  涙: 'namida',
  悲しい: 'namida',
  tears: 'tears',
  crying: 'tears',
  cry: 'tears',
  哭: 'tears',
  哭泣: 'tears',
  流泪: 'tears',
  大哭: 'tears',
  泣く: 'tears'
};

const motionAliases = {
  tap_body: 'tap_body',
  body_tap: 'tap_body',
  tapbody: 'tap_body',
  nod: 'tap_body',
  lean: 'tap_body',
  emphasis: 'tap_body',
  点头: 'tap_body',
  靠近: 'tap_body',
  轻动: 'tap_body'
};

const emotionAliases = {
  happy: 'smile',
  joy: 'smile',
  cheerful: 'smile',
  smile: 'smile',
  warm: 'smile',
  开心: 'smile',
  高兴: 'smile',
  愉快: 'smile',
  微笑: 'smile',
  shy: 'bsmile',
  blush: 'bsmile',
  embarrassed: 'bsmile',
  playful: 'bsmile',
  angry: 'bsmile',
  annoyed: 'bsmile',
  害羞: 'bsmile',
  脸红: 'bsmile',
  调皮: 'bsmile',
  生气: 'bsmile',
  愤怒: 'bsmile',
  sad: 'namida',
  sorrow: 'namida',
  难过: 'namida',
  悲伤: 'namida',
  伤心: 'namida',
  眼泪: 'namida',
  crying: 'tears',
  cry: 'tears',
  tears: 'tears',
  哭泣: 'tears',
  流泪: 'tears',
  大哭: 'tears',
  neutral: 'neutral',
  calm: 'neutral',
  default: 'neutral'
};

function manifestIds(items) {
  return new Set(items.map((item) => item.id));
}

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function clamp01(value, fallback = 0.65) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, 0), 1);
}

function normalizeDuration(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 5000;
  return Math.min(Math.max(Math.round(numeric), 800), 12000);
}

export function normalizeLive2DExpression(value, manifest = roomLive2DManifest) {
  const ids = manifestIds(manifest.expressions);
  const key = normalizeToken(value);
  const aliased = expressionAliases[key] || key;
  return ids.has(aliased) ? aliased : '';
}

export function normalizeLive2DMotion(value, manifest = roomLive2DManifest) {
  const ids = manifestIds(manifest.motions);
  const key = normalizeToken(value);
  if (!key || key === 'none' || key === 'null') return '';
  const aliased = motionAliases[key] || key;
  return ids.has(aliased) ? aliased : '';
}

export function normalizeLive2DEmotion(value, manifest = roomLive2DManifest) {
  const key = normalizeToken(value);
  const aliased = emotionAliases[key] || key;
  return normalizeLive2DExpression(aliased, manifest);
}

function normalizeExpressionMix(value, fallbackExpression, manifest) {
  const rawLayers = Array.isArray(value) ? value : [];
  const merged = new Map();
  for (const layer of rawLayers) {
    const expression = normalizeLive2DExpression(
      layer?.expression || layer?.key || layer?.id,
      manifest
    );
    if (!expression) continue;
    const weight = clamp01(layer?.weight, expression === fallbackExpression ? 1 : 0.5);
    if (weight <= 0.02) continue;
    merged.set(expression, Math.min(1, (merged.get(expression) || 0) + weight));
  }
  const layers = [...merged.entries()]
    .map(([expression, weight]) => ({ expression, weight }))
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 3);
  if (layers.length) return layers;
  return fallbackExpression ? [{ expression: fallbackExpression, weight: 1 }] : [];
}

export function normalizeLive2DIntent(input, manifest = roomLive2DManifest) {
  if (!input || typeof input !== 'object') return null;
  const rawExpression = input.expression || input.expressionId || input.face || input.mood || input.emotion || '';
  const expression = normalizeLive2DExpression(rawExpression, manifest) || normalizeLive2DEmotion(input.emotion || input.mood, manifest);
  const motion = normalizeLive2DMotion(input.motion || input.action, manifest);
  const expressionMix = normalizeExpressionMix(input.expressionMix, expression, manifest);
  const primaryExpression = expressionMix[0]?.expression || expression;
  const hasControl = primaryExpression || motion;
  if (!hasControl) return null;
  return {
    emotion: String(input.emotion || input.mood || '').trim() || null,
    expression: primaryExpression || null,
    expressionMix,
    motion: motion || null,
    intensity: clamp01(input.intensity, 0.65),
    durationMs: normalizeDuration(input.durationMs || input.duration)
  };
}

export function inferLive2DIntentFromText(text, manifest = roomLive2DManifest) {
  const value = String(text || '').toLowerCase();
  const matchers = [
    { expression: 'tears', pattern: /(大哭|哭泣|流泪|崩溃|crying|tears|泣く)/u, emotion: 'crying' },
    { expression: 'namida', pattern: /(难过|悲伤|伤心|寂寞|眼泪|sad|sorrow|悲しい)/u, emotion: 'sad' },
    { expression: 'bsmile', pattern: /(害羞|脸红|调皮|生气|愤怒|shy|blush|angry|annoyed|照れ)/u, emotion: 'shy' },
    { expression: 'smile', pattern: /(开心|高兴|愉快|微笑|笑|happy|smile|joy|嬉しい|優しい)/u, emotion: 'happy' }
  ];
  const matched = matchers.find((item) => item.pattern.test(value));
  return matched
    ? normalizeLive2DIntent({ ...matched, intensity: 0.5, durationMs: 5000 }, manifest)
    : null;
}

export function dispatchRoomLive2D(intent) {
  const normalized = normalizeLive2DIntent(intent);
  if (!normalized) return null;
  window.dispatchEvent(new CustomEvent('tsukuyomi:room-act', { detail: normalized }));
  return normalized;
}
