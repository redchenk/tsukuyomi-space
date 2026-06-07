import {
  activeBehaviorSamples as sampleActiveBehaviorActions,
  createLive2DBehaviorPlan,
  pickDominantMotion,
  shouldInterruptLive2DBehaviorPlan
} from './live2dBehaviorOrchestrator';
import { createLive2DCharacterStateMachine } from './live2dCharacterStateMachine';
import { normalizeBehaviorBodyPose } from '../../constants/room/behaviorActionRegistry';
import {
  normalizeSemanticExpressionId,
  semanticExpressionFromEmotion
} from '../../constants/room/yachiyoExpressionPresetRegistry';
import {
  appendRoomLive2DDebugEvent,
  publishRoomLive2DPerformanceDebug,
  summarizeDebugBehaviorPlan
} from './live2dDebug';

let sharedPerformanceBrain = null;
const STREAMING_QUEUE_HANDOFF_GRACE_MS = 1200;
const STREAMING_QUEUE_HANDOFF_MIN_DELAY_MS = 120;
const STREAMING_QUEUE_HANDOFF_OVERLAP_MS = 260;
const STREAMING_QUEUE_HANDOFF_BLEND_IN_MS = 520;
const STREAMING_QUEUE_POSTURE_HOLD_MS = 1200;

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  return Date.now();
}

function clamp(value, min, max, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
}

function isStreamingSpeechSource(source) {
  return String(source || '').trim().toLowerCase() === 'streaming-speech';
}

function behaviorActionEndMs(action = {}) {
  return (Number(action.delayMs) || 0) + (Number(action.durationMs) || 0);
}

function resolveExpression(detail = {}) {
  return normalizeSemanticExpressionId(
    detail.expression ||
    detail.expressionMix?.[0]?.expression ||
    detail.emotion ||
    detail.mood
  ) || semanticExpressionFromEmotion(detail.emotion || detail.mood);
}

function resolveBehaviorActions(detail = {}) {
  const explicit = Array.isArray(detail.behaviorActions) ? detail.behaviorActions : [];
  if (explicit.length) return explicit;
  const pose = normalizeBehaviorBodyPose(detail.bodyPose || detail.pose || detail.posture || detail.motion || detail.action);
  if (!pose) return [];
  return [{
    type: pose,
    intensity: clamp(detail.intensity, 0.4, 1, 0.82),
    durationMs: clamp(detail.durationMs || detail.duration, 650, 8000, 2200),
    delayMs: 0
  }];
}

export function createLive2DPerformanceBrain() {
  const characterState = createLive2DCharacterStateMachine();
  let behaviorPlan = null;
  let outgoingPlan = null;
  let recentReleasedPlan = null;
  let cachedFrameKey = -1;
  let cachedFrame = null;
  let lastRoomActDetail = null;
  let lastRoomActAt = -Infinity;
  let lastRoomActResult = null;

  function invalidateFrameCache() {
    cachedFrameKey = -1;
    cachedFrame = null;
  }

  function releaseBehaviorPlan(plan, at, fadeOutMs = 0) {
    if (!plan) return;
    const elapsedAtRelease = Math.max(0, at - (Number(plan.startedAt) || at));
    recentReleasedPlan = {
      plan,
      releasedAt: at,
      elapsedAtRelease,
      expiresAt: at + STREAMING_QUEUE_HANDOFF_GRACE_MS
    };
    outgoingPlan = {
      plan,
      releasedAt: at,
      elapsedAtRelease,
      fadeOutMs: clamp(fadeOutMs || plan.interruptPolicy?.blendOutMs, 260, 1200, 520)
    };
    appendRoomLive2DDebugEvent('behavior-plan-release', {
      source: plan.source || 'performance',
      expression: plan.expression,
      behaviorPlan: summarizeDebugBehaviorPlan(plan, elapsedAtRelease),
      fadeOutMs: outgoingPlan.fadeOutMs
    });
  }

  function sampleOutgoingBehaviorActions(at, intensityScale) {
    if (!outgoingPlan) return [];
    const elapsedAfterRelease = Math.max(0, at - outgoingPlan.releasedAt);
    const fade = 1 - clamp(elapsedAfterRelease / Math.max(outgoingPlan.fadeOutMs, 1), 0, 1, 1);
    if (fade <= 0.001) {
      outgoingPlan = null;
      return [];
    }
    const samples = sampleActiveBehaviorActions(
      outgoingPlan.plan.actions,
      outgoingPlan.elapsedAtRelease + elapsedAfterRelease,
      { intensityScale }
    ).map((sample) => ({
      ...sample,
      envelope: sample.envelope * fade,
      intensity: sample.intensity * fade,
      energy: sample.energy * fade,
      outgoing: true
    }));
    if (!samples.length) outgoingPlan = null;
    return samples;
  }

  function shouldExtendStreamingBehaviorPlan(currentPlan, nextPlan, at) {
    if (!currentPlan || !nextPlan) return false;
    if (!isStreamingSpeechSource(currentPlan.source) || !isStreamingSpeechSource(nextPlan.source)) return false;
    const elapsed = Math.max(0, at - (Number(currentPlan.startedAt) || at));
    return elapsed <= Number(currentPlan.durationMs || 0) + 1200;
  }

  function recentStreamingHandoffPlan(nextPlan, at) {
    if (!recentReleasedPlan || !nextPlan) return null;
    if (at > Number(recentReleasedPlan.expiresAt || 0)) {
      recentReleasedPlan = null;
      return null;
    }
    return shouldExtendStreamingBehaviorPlan(recentReleasedPlan.plan, nextPlan, at)
      ? recentReleasedPlan.plan
      : null;
  }

  function streamingPostureHandoffActive(at) {
    if (!recentReleasedPlan || !isStreamingSpeechSource(recentReleasedPlan.plan?.source)) return false;
    const elapsedAfterRelease = Math.max(0, at - (Number(recentReleasedPlan.releasedAt) || at));
    return elapsedAfterRelease <= STREAMING_QUEUE_POSTURE_HOLD_MS;
  }

  function streamingAppendAt(currentPlan, elapsed) {
    const minimumStart = elapsed + STREAMING_QUEUE_HANDOFF_MIN_DELAY_MS;
    const nextActiveEnd = currentPlan.actions
      .map(behaviorActionEndMs)
      .filter((endMs) => endMs > minimumStart)
      .sort((left, right) => left - right)[0];
    if (!Number.isFinite(nextActiveEnd)) return minimumStart;
    return Math.max(minimumStart, nextActiveEnd - STREAMING_QUEUE_HANDOFF_OVERLAP_MS);
  }

  function extendStreamingBehaviorPlan(currentPlan, nextPlan, at, options = {}) {
    const elapsed = Math.max(0, at - (Number(currentPlan.startedAt) || at));
    const appendAt = Math.max(0, streamingAppendAt(currentPlan, elapsed));
    const retainAfter = Math.max(0, elapsed - 1500);
    const retainedActions = currentPlan.actions.filter((action) => behaviorActionEndMs(action) >= retainAfter);
    const appendedActions = nextPlan.actions.map((action) => ({
      ...action,
      handoffBlendInMs: Math.max(Number(action.handoffBlendInMs) || 0, STREAMING_QUEUE_HANDOFF_BLEND_IN_MS),
      delayMs: Math.round(appendAt + (Number(action.delayMs) || 0))
    }));
    const actions = [...retainedActions, ...appendedActions].slice(-18);
    const durationMs = Math.max(
      Number(currentPlan.durationMs) || 0,
      appendAt + Number(nextPlan.durationMs || 0),
      ...actions.map(behaviorActionEndMs),
      elapsed + 1400
    );
    behaviorPlan = {
      ...currentPlan,
      emotion: nextPlan.emotion || currentPlan.emotion,
      expression: nextPlan.expression || currentPlan.expression,
      intensity: Math.max(Number(currentPlan.intensity) || 0, Number(nextPlan.intensity) || 0) || currentPlan.intensity,
      priority: Math.max(Number(currentPlan.priority) || 0, Number(nextPlan.priority) || 0) || currentPlan.priority,
      actions,
      durationMs: clamp(durationMs, 900, 60000, durationMs),
      interruptPolicy: nextPlan.interruptPolicy || currentPlan.interruptPolicy,
      suppressEyeOpen: Boolean(currentPlan.suppressEyeOpen || nextPlan.suppressEyeOpen),
      speechStyle: nextPlan.speechStyle || currentPlan.speechStyle,
      extendedAt: at
    };
    invalidateFrameCache();
    characterState.setMode('speaking', {
      now: at,
      holdMs: behaviorPlan.durationMs - elapsed + 760,
      emotion: options.emotion || behaviorPlan.emotion || behaviorPlan.expression,
      emotionHoldMs: behaviorPlan.durationMs - elapsed + 960,
      attention: 0.88,
      arousal: options.emotion === 'sad' || options.emotion === 'crying' ? 0.5 : 0.68
    });
    appendRoomLive2DDebugEvent('behavior-plan-extend', {
      source: behaviorPlan.source || 'streaming-speech',
      expression: behaviorPlan.expression,
      emotion: options.emotion,
      behaviorPlan: summarizeDebugBehaviorPlan(behaviorPlan, elapsed),
      appendedActionCount: appendedActions.length
    });
    return behaviorPlan;
  }

  function startBehaviorPlan(actions, durationMs, options = {}) {
    if (!Array.isArray(actions) || !actions.length) return null;
    const now = Number(options.now) || nowMs();
    const expression = options.expression || '';
    const nextPlan = createLive2DBehaviorPlan(actions, durationMs, {
      now,
      expression,
      emotion: options.emotion,
      intensity: options.intensity,
      priority: options.priority,
      source: options.source || 'room-act',
      interruptPolicy: options.interruptPolicy || options.interrupt,
      suppressEyeOpen: Boolean(options.suppressEyeOpen),
      speechStyle: options.speechStyle
    });
    if (shouldExtendStreamingBehaviorPlan(behaviorPlan, nextPlan, now)) {
      return extendStreamingBehaviorPlan(behaviorPlan, nextPlan, now, options);
    }
    const handoffPlan = behaviorPlan ? null : recentStreamingHandoffPlan(nextPlan, now);
    if (handoffPlan) {
      outgoingPlan = null;
      recentReleasedPlan = null;
      return extendStreamingBehaviorPlan(handoffPlan, nextPlan, now, {
        ...options,
        source: options.source || 'streaming-speech'
      });
    }
    if (!shouldInterruptLive2DBehaviorPlan(behaviorPlan, nextPlan, now)) {
      appendRoomLive2DDebugEvent('behavior-plan-protected', {
        source: options.source || 'room-act',
        expression,
        behaviorPlan: summarizeDebugBehaviorPlan(behaviorPlan, now - (behaviorPlan?.startedAt || now)),
        nextPlan: summarizeDebugBehaviorPlan(nextPlan, 0)
      });
      return behaviorPlan;
    }
    if (behaviorPlan) {
      releaseBehaviorPlan(behaviorPlan, now, nextPlan.interruptPolicy?.blendInMs || behaviorPlan.interruptPolicy?.blendOutMs);
    }
    behaviorPlan = nextPlan;
    invalidateFrameCache();
    const speechSynchronized = isStreamingSpeechSource(nextPlan.source || options.source);
    characterState.setMode(speechSynchronized ? 'speaking' : 'acting', {
      now,
      holdMs: nextPlan.durationMs + (speechSynchronized ? 760 : 420),
      emotion: speechSynchronized ? (options.emotion || expression) : null,
      emotionHoldMs: speechSynchronized ? nextPlan.durationMs + 960 : null,
      attention: speechSynchronized ? 0.88 : 0.86,
      arousal: speechSynchronized ? 0.68 : 0.72
    });
    appendRoomLive2DDebugEvent('behavior-plan-start', {
      source: nextPlan.source || options.source || 'room-act',
      expression,
      emotion: options.emotion,
      behaviorPlan: summarizeDebugBehaviorPlan(nextPlan, 0),
      action: nextPlan.actions?.[0]?.type || ''
    });
    return behaviorPlan;
  }

  function onRoomAct(detail = {}, at = nowMs()) {
    if (
      detail &&
      typeof detail === 'object' &&
      detail === lastRoomActDetail &&
      Math.abs(at - lastRoomActAt) < 48
    ) {
      return lastRoomActResult;
    }
    invalidateFrameCache();
    const behaviorActions = resolveBehaviorActions(detail);
    const expression = resolveExpression(detail);
    const source = detail.source || 'room-act';
    const speechSynchronized = isStreamingSpeechSource(source);
    if (speechSynchronized) {
      const durationMs = clamp(detail.durationMs || detail.duration, 800, 12000, 2600);
      characterState.onExternalState({
        mode: 'speaking',
        holdMs: durationMs + 760,
        emotionHoldMs: durationMs + 960,
        emotion: detail.emotion || detail.mood || expression,
        attention: 0.88,
        arousal: detail.emotion === 'sad' || detail.emotion === 'crying' ? 0.5 : 0.68
      }, at);
    } else {
      characterState.onRoomAct(detail, at);
    }
    let nextPlan = null;
    if (behaviorActions.length) {
      nextPlan = startBehaviorPlan(behaviorActions, detail.durationMs || detail.duration, {
        now: at,
        expression,
        emotion: detail.emotion || detail.mood,
        intensity: detail.intensity,
        priority: detail.priority,
        source,
        interruptPolicy: detail.interruptPolicy || detail.interrupt,
        speechStyle: detail.speechStyle || detail.speech_style
      });
    }
    const result = {
      behaviorActions,
      behaviorPlan: nextPlan,
      expression,
      bodyPose: detail.bodyPose || detail.pose || detail.posture || detail.motion || detail.action || '',
      intensity: detail.intensity,
      priority: detail.priority,
      durationMs: detail.durationMs || detail.duration || 0
    };
    if (detail && typeof detail === 'object') {
      lastRoomActDetail = detail;
      lastRoomActAt = at;
      lastRoomActResult = result;
    }
    return result;
  }

  function onMouth(value, at = nowMs()) {
    invalidateFrameCache();
    characterState.onMouth(value, at);
  }

  function onExternalState(detail = {}, at = nowMs()) {
    invalidateFrameCache();
    characterState.onExternalState(detail, at);
  }

  function sample(now = nowMs(), options = {}) {
    const intensityScale = Number(options.intensityScale) || 1.62;
    const frameKey = `${Math.floor(Number(now) / 16)}:${intensityScale.toFixed(3)}`;
    if (cachedFrame && cachedFrameKey === frameKey) return cachedFrame;
    const currentPlan = behaviorPlan;
    if (recentReleasedPlan && now > Number(recentReleasedPlan.expiresAt || 0)) {
      recentReleasedPlan = null;
    }
    const elapsedMs = currentPlan ? now - currentPlan.startedAt : 0;
    if (currentPlan && elapsedMs >= currentPlan.durationMs) {
      releaseBehaviorPlan(currentPlan, now, currentPlan.interruptPolicy?.blendOutMs);
      behaviorPlan = null;
      characterState.setMode('listening', { now, holdMs: 1400, attention: 0.52 });
      appendRoomLive2DDebugEvent('behavior-plan-complete', {
        source: currentPlan.source || 'performance',
        expression: currentPlan.expression,
        behaviorPlan: summarizeDebugBehaviorPlan(currentPlan, currentPlan.durationMs)
      });
    }
    const activePlan = behaviorPlan;
    const activeElapsedMs = activePlan ? now - activePlan.startedAt : 0;
    const character = characterState.sample(now);
    const outgoingExpression = outgoingPlan?.plan?.expression;
    const trailingSamples = sampleOutgoingBehaviorActions(now, intensityScale);
    const activeSamples = activePlan ? sampleActiveBehaviorActions(activePlan.actions, activeElapsedMs, {
      intensityScale
    }) : [];
    const samples = [...trailingSamples, ...activeSamples];
    const handoffActive = !activePlan && !trailingSamples.length && streamingPostureHandoffActive(now);
    const dominant = activePlan
      ? pickDominantMotion(activeSamples.length ? activeSamples : samples)
      : pickDominantMotion(samples);
    cachedFrame = {
      character,
      behaviorPlan: activePlan,
      elapsedMs: activePlan ? activeElapsedMs : elapsedMs,
      samples,
      dominant,
      expression: activePlan?.expression || outgoingExpression || character.emotion,
      active: Boolean(activePlan || trailingSamples.length || handoffActive),
      handoffActive,
      completed: Boolean(currentPlan && !activePlan)
    };
    publishRoomLive2DPerformanceDebug(cachedFrame);
    cachedFrameKey = frameKey;
    return cachedFrame;
  }

  function getBehaviorPlan() {
    return behaviorPlan;
  }

  function getCharacterState() {
    return characterState;
  }

  function hasBehaviorPlan() {
    return Boolean(behaviorPlan || outgoingPlan);
  }

  return {
    characterState,
    startBehaviorPlan,
    onRoomAct,
    onMouth,
    onExternalState,
    sample,
    getBehaviorPlan,
    getCharacterState,
    hasBehaviorPlan
  };
}

export function getRoomLive2DPerformanceBrain() {
  if (!sharedPerformanceBrain) sharedPerformanceBrain = createLive2DPerformanceBrain();
  return sharedPerformanceBrain;
}
