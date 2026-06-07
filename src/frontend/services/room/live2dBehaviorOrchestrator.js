import { behaviorActionPriority } from '../../constants/room/behaviorActionRegistry';

function clamp(value, min, max, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
}

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  return Date.now();
}

const NATURAL_EYE_TIMING_ACTIONS = new Set(['blink', 'wink']);

function ease(value) {
  const t = clamp(value, 0, 1, 0);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function smoothBehaviorActionTimeline(actions = []) {
  let previousEnd = 0;
  let previousDuration = 0;
  return actions.map((action, index) => {
    const next = { ...action };
    const duration = Math.max(Number(next.durationMs) || 1000, 1);
    let delay = Math.max(0, Number(next.delayMs) || 0);

    if (index > 0) {
      const overlapMs = clamp(Math.min(previousDuration || duration, duration) * 0.24, 160, 340, 220);
      const desiredDelay = Math.max(0, previousEnd - overlapMs);
      const gapMs = delay - previousEnd;
      const startsAtOrAfterPreviousEnd = delay >= previousEnd - 24;

      if (startsAtOrAfterPreviousEnd && gapMs <= 900) {
        delay = Math.min(delay, desiredDelay);
      }
    }

    next.delayMs = Math.round(delay);
    previousDuration = duration;
    previousEnd = Math.max(previousEnd, next.delayMs + duration);
    return next;
  });
}

export function behaviorActionEnvelope(progress) {
  const t = clamp(progress, 0, 1, 0);
  if (t < 0.28) return ease(t / 0.28);
  if (t > 0.76) return ease((1 - t) / 0.24);
  return 1;
}

export function behaviorActionSideSign(action, fallback = 1) {
  if (action?.side === 'left') return -1;
  if (action?.side === 'right') return 1;
  return Number(action?.sideSign) || fallback;
}

export function behaviorActionVariant(action) {
  return Math.abs(Math.round(Number(action?.motionVariant) || 0)) % 4;
}

export function behaviorActionSecondarySign(action, fallback = -1) {
  const value = Number(action?.secondarySign);
  if (value < 0) return -1;
  if (value > 0) return 1;
  return fallback;
}

export function activeBehaviorSamples(actions, elapsedMs, options = {}) {
  const intensityScale = clamp(options.intensityScale, 1, 2.2, 1.7);
  return (Array.isArray(actions) ? actions : []).map((action) => {
    const started = Number(action.delayMs) || 0;
    const duration = Math.max(Number(action.durationMs) || 1000, 1);
    const progress = (elapsedMs - started) / duration;
    if (progress < 0 || progress > 1) return null;
    const envelope = behaviorActionEnvelope(progress);
    const handoffBlendInMs = Math.max(Number(action.handoffBlendInMs) || 0, 0);
    const handoffFade = handoffBlendInMs > 0
      ? ease(clamp((elapsedMs - started) / handoffBlendInMs, 0, 1, 0))
      : 1;
    const blendedEnvelope = envelope * handoffFade;
    const amplitude = clamp(action.amplitude, 0.72, 1.36, 1);
    const tempo = clamp(action.tempo, 0.82, 1.22, 1);
    const phaseOffset = Number(action.phaseOffset) || 0;
    const intensity = clamp((Number(action.intensity) || 0.92) * intensityScale * amplitude, 0.25, 1.9);
    return {
      action,
      progress,
      phase: progress * Math.PI * 2 * tempo + phaseOffset,
      envelope: blendedEnvelope,
      intensity,
      energy: blendedEnvelope * intensity,
      sign: behaviorActionSideSign(action, Number(action.sideSign) || 1)
    };
  }).filter(Boolean);
}

export function pickDominantMotion(samples) {
  return (Array.isArray(samples) ? samples : [])
    .filter((sample) => behaviorActionPriority(sample.action.type) > 0)
    .sort((left, right) => (
      behaviorActionPriority(right.action.type) * right.energy -
      behaviorActionPriority(left.action.type) * left.energy
    ))[0] || null;
}

export function enrichBehaviorActions(actions = [], options = {}) {
  const durationScale = clamp(options.durationScale, 0.65, 1.45, 1);
  const enriched = (Array.isArray(actions) ? actions : []).map((action, index) => {
    const keepNaturalEyeTiming = NATURAL_EYE_TIMING_ACTIONS.has(action.type);
    const baseDurationMs = Math.max(Number(action.durationMs) || 1000, 260);
    const sideSign = action.side === 'left'
      ? -1
      : action.side === 'right'
        ? 1
        : (Math.random() > 0.5 ? 1 : -1);
    const delayJitter = index > 0 ? Math.round((Math.random() - 0.5) * 90) : 0;
    return {
      ...action,
      sideSign,
      tempo: keepNaturalEyeTiming ? 1 : 0.9 + Math.random() * 0.22,
      amplitude: 0.92 + Math.random() * 0.26,
      motionVariant: Math.floor(Math.random() * 4),
      motionArc: (Math.random() - 0.5) * 2,
      secondarySign: Math.random() > 0.5 ? 1 : -1,
      phaseOffset: Math.random() * Math.PI * 2,
      durationMs: Math.round(baseDurationMs * (keepNaturalEyeTiming ? 1 : durationScale * (0.94 + Math.random() * 0.16))),
      delayMs: Math.max(0, Math.round((Number(action.delayMs) || 0) + delayJitter))
    };
  });
  return smoothBehaviorActionTimeline(enriched);
}

export function normalizeBehaviorPlanDuration(actions = [], durationMs, options = {}) {
  return Math.max(
    clamp(durationMs, options.minMs || 800, options.maxMs || 12000, options.fallbackMs || 2400),
    ...(Array.isArray(actions) ? actions : []).map((action) => (Number(action.delayMs) || 0) + (Number(action.durationMs) || 0)),
    options.floorMs || 900
  );
}

export function behaviorPlanPriority(actions = [], options = {}) {
  const explicit = Number(options.priority);
  if (Number.isFinite(explicit)) return clamp(explicit, 0, 10, explicit);
  const maxActionPriority = Math.max(
    0,
    ...(Array.isArray(actions) ? actions : []).map((action) => behaviorActionPriority(action.type))
  );
  const intensity = clamp(options.intensity, 0.05, 1, 0.72);
  const expressionBoost = options.expression && options.expression !== 'neutral' ? 0.4 : 0;
  return clamp(1 + maxActionPriority * 0.72 + intensity * 1.5 + expressionBoost, 0, 10, 2.2);
}

export function normalizeLive2DInterruptPolicy(value = null, fallback = {}) {
  const raw = typeof value === 'string' ? { mode: value } : (value && typeof value === 'object' ? value : {});
  const modeToken = String(raw.mode || raw.type || fallback.mode || 'blend').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const mode = ['blend', 'replace', 'queue', 'protect', 'ignore'].includes(modeToken) ? modeToken : 'blend';
  const priority = clamp(raw.priority ?? fallback.priority, 0, 10, fallback.priority ?? 3);
  const minHoldMs = clamp(raw.minHoldMs ?? raw.min_hold_ms ?? fallback.minHoldMs, 0, 5000, fallback.minHoldMs ?? 260);
  return {
    mode,
    priority,
    minHoldMs,
    blendInMs: clamp(raw.blendInMs ?? raw.blend_in_ms ?? fallback.blendInMs, 0, 1200, fallback.blendInMs ?? 300),
    blendOutMs: clamp(raw.blendOutMs ?? raw.blend_out_ms ?? fallback.blendOutMs, 0, 1200, fallback.blendOutMs ?? 520),
    canInterrupt: mode !== 'protect' && mode !== 'ignore',
    queue: mode === 'queue'
  };
}

export function createLive2DBehaviorPlan(actions = [], durationMs, options = {}) {
  const enrichedActions = enrichBehaviorActions(actions, options);
  const priority = behaviorPlanPriority(enrichedActions, options);
  const interruptPolicy = normalizeLive2DInterruptPolicy(options.interruptPolicy || options.interrupt, {
    priority,
    mode: options.interruptMode || 'blend',
    minHoldMs: 260
  });
  return {
    id: `behavior-${Math.round(options.now || nowMs()).toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    source: options.source || 'semantic',
    emotion: options.emotion || null,
    expression: options.expression || '',
    intensity: clamp(options.intensity, 0.05, 1, 0.72),
    actions: enrichedActions,
    durationMs: normalizeBehaviorPlanDuration(enrichedActions, durationMs),
    startedAt: Number(options.now) || nowMs(),
    priority,
    interruptPolicy,
    suppressEyeOpen: Boolean(options.suppressEyeOpen),
    speechStyle: options.speechStyle || null
  };
}

export function shouldInterruptLive2DBehaviorPlan(currentPlan, nextPlan, now = nowMs()) {
  if (!nextPlan) return false;
  if (!currentPlan) return true;
  const nextPolicy = nextPlan.interruptPolicy || normalizeLive2DInterruptPolicy();
  const currentPolicy = currentPlan.interruptPolicy || normalizeLive2DInterruptPolicy();
  if (nextPolicy.mode === 'ignore') return false;
  if (nextPolicy.mode === 'replace') return true;
  if (nextPolicy.mode === 'queue') return false;
  const elapsed = now - (Number(currentPlan.startedAt) || now);
  if (currentPolicy.mode === 'protect' && elapsed < currentPolicy.minHoldMs) return false;
  if (!currentPolicy.canInterrupt && elapsed < currentPolicy.minHoldMs) return false;
  if (elapsed >= Number(currentPlan.durationMs || 0) * 0.58) return true;
  return Number(nextPlan.priority || 0) >= Number(currentPlan.priority || 0);
}

export function behaviorPlanElapsedMs(plan, now = nowMs()) {
  return Math.max(0, now - (Number(plan?.startedAt) || now));
}

export function behaviorPlanCompleted(plan, now = nowMs()) {
  return !plan || behaviorPlanElapsedMs(plan, now) >= Number(plan.durationMs || 0);
}
