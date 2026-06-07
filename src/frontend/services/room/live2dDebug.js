export const ROOM_LIVE2D_DEBUG_EVENT = 'tsukuyomi:room-live2d-debug';
export const ROOM_LIVE2D_DEBUG_STATE_KEY = 'roomLive2DDebugState';

const BEHAVIOR_EVENT_LIMIT = 10;
const HISTORY_LIMIT = 12;
const PARAMETER_LIMIT = 28;

let debugStateCache = null;
const throttleMarks = new Map();

function nowTime() {
  return Date.now();
}

function roundDebugNumber(value, digits = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  const scale = 10 ** digits;
  return Math.round(numeric * scale) / scale;
}

function readStoredDebugState() {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(ROOM_LIVE2D_DEBUG_STATE_KEY) || '{}') || {};
  } catch (_) {
    return {};
  }
}

function serializableDebugValue(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number') return roundDebugNumber(value);
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'function') return undefined;
  if (depth >= 5) return '[Object]';
  if (value instanceof Map) return serializableDebugValue([...value.values()], depth + 1);
  if (Array.isArray(value)) {
    return value
      .slice(0, 40)
      .map((item) => serializableDebugValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value === 'object') {
    const output = {};
    for (const [key, entry] of Object.entries(value).slice(0, 80)) {
      const next = serializableDebugValue(entry, depth + 1);
      if (next !== undefined) output[key] = next;
    }
    return output;
  }
  return String(value);
}

function shouldSkipThrottle(key, throttleMs) {
  if (!key || !throttleMs) return false;
  const now = nowTime();
  const previous = throttleMarks.get(key) || 0;
  if (now - previous < throttleMs) return true;
  throttleMarks.set(key, now);
  return false;
}

function setWindowDebugState(state) {
  if (typeof window === 'undefined') return;
  window.__TSUKUYOMI_ROOM_LIVE2D_DEBUG_STATE__ = state;
}

export function readRoomLive2DDebugState() {
  if (debugStateCache) return debugStateCache;
  debugStateCache = readStoredDebugState();
  setWindowDebugState(debugStateCache);
  return debugStateCache;
}

export function publishRoomLive2DDebugState(patch = {}, options = {}) {
  if (shouldSkipThrottle(options.throttleKey, options.throttleMs)) return readRoomLive2DDebugState();
  const current = readRoomLive2DDebugState();
  const next = {
    ...current,
    ...serializableDebugValue(patch),
    updatedAt: nowTime()
  };
  debugStateCache = next;
  setWindowDebugState(next);
  if (typeof localStorage !== 'undefined' && options.persist !== false && !options.volatile) {
    localStorage.setItem(ROOM_LIVE2D_DEBUG_STATE_KEY, JSON.stringify(next));
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ROOM_LIVE2D_DEBUG_EVENT, { detail: next }));
  }
  return next;
}

export function appendRoomLive2DDebugEvent(type, detail = {}) {
  const current = readRoomLive2DDebugState();
  const event = {
    id: `evt-${nowTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    source: detail.source || detail.eventSource || '',
    emotion: detail.emotion || detail.expression || '',
    action: detail.action || detail.bodyPose || detail.motion || detail.pose || '',
    detail: serializableDebugValue(detail, 1),
    createdAt: nowTime()
  };
  const behaviorEvents = Array.isArray(current.behaviorEvents) ? current.behaviorEvents : [];
  const history = Array.isArray(current.history) ? current.history : [];
  return publishRoomLive2DDebugState({
    behaviorEvents: [event, ...behaviorEvents].slice(0, BEHAVIOR_EVENT_LIMIT),
    history: [event, ...history].slice(0, HISTORY_LIMIT)
  });
}

export function summarizeDebugParameters(parameters = [], limit = PARAMETER_LIMIT) {
  return (Array.isArray(parameters) ? parameters : [])
    .filter((item) => item?.id && Number.isFinite(Number(item.value)))
    .sort((left, right) => Math.abs(Number(right.value) || 0) - Math.abs(Number(left.value) || 0))
    .slice(0, limit)
    .map((item) => ({
      id: String(item.id),
      value: roundDebugNumber(item.value),
      weight: roundDebugNumber(item.weight ?? 1)
    }));
}

export function summarizeDebugAction(action = {}) {
  return {
    type: action.type || action.action || action.bodyPose || '',
    intensity: roundDebugNumber(action.intensity ?? action.energy ?? 0),
    delayMs: Math.round(Number(action.delayMs) || 0),
    durationMs: Math.round(Number(action.durationMs) || 0),
    priority: roundDebugNumber(action.priority ?? 0),
    variant: action.motionVariant ?? action.variant ?? undefined,
    speechStyle: action.speechStyle || action.speech_style || undefined
  };
}

export function summarizeDebugBehaviorPlan(plan, elapsedMs = 0) {
  if (!plan) return null;
  return {
    source: plan.source || '',
    expression: plan.expression || '',
    emotion: plan.emotion || '',
    durationMs: Math.round(Number(plan.durationMs) || 0),
    elapsedMs: Math.round(Number(elapsedMs) || 0),
    priority: roundDebugNumber(plan.priority ?? 0),
    suppressEyeOpen: Boolean(plan.suppressEyeOpen),
    interruptPolicy: serializableDebugValue(plan.interruptPolicy || null),
    actions: (Array.isArray(plan.actions) ? plan.actions : []).map(summarizeDebugAction)
  };
}

export function publishRoomLive2DPerformanceDebug(performanceFrame = {}, source = 'performance') {
  const character = performanceFrame.character || {};
  const behaviorPlan = summarizeDebugBehaviorPlan(performanceFrame.behaviorPlan, performanceFrame.elapsedMs);
  publishRoomLive2DDebugState({
    emotion: performanceFrame.expression || character.emotion || '',
    mouthEnergy: roundDebugNumber(character.mouthEnergy || 0),
    actionQueue: behaviorPlan?.actions || [],
    behaviorPlan,
    interruptPolicy: behaviorPlan?.interruptPolicy || null,
    activeSamples: (performanceFrame.samples || []).slice(0, 8).map((sample) => ({
      type: sample.action?.type || '',
      progress: roundDebugNumber(sample.progress || 0),
      energy: roundDebugNumber(sample.energy || 0),
      envelope: roundDebugNumber(sample.envelope || 0),
      outgoing: Boolean(sample.outgoing)
    })),
    performanceSource: source,
    performanceActive: Boolean(performanceFrame.active)
  }, {
    volatile: true,
    persist: false,
    throttleKey: 'performance',
    throttleMs: 120
  });
}
