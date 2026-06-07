const STREAMING_SPEECH_BOUNDARY_GRACE_MS = 1100;
const STREAMING_SPEECH_MIN_HOLD_MS = 1800;
const STREAMING_SPEECH_TRANSITION_HOLD_MS = 1500;
const STREAMING_LIVE2D_TAIL_MS = 760;
const STREAMING_LIVE2D_MIN_DURATION_MS = 1800;
const STREAMING_LIVE2D_MAX_DURATION_MS = 16000;

const STREAMING_INTERRUPT_POLICY = Object.freeze({
  mode: 'blend',
  minHoldMs: 420,
  blendInMs: 620,
  blendOutMs: 900
});

function clamp(value, min, max, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
}

function defaultSetTimer(callback, delayMs) {
  return globalThis.setTimeout?.(callback, delayMs);
}

function defaultClearTimer(timerId) {
  if (timerId) globalThis.clearTimeout?.(timerId);
}

export function streamingSpeechHoldMs(durationMs = 0) {
  return Math.max(Number(durationMs) || 0, STREAMING_SPEECH_MIN_HOLD_MS) + STREAMING_SPEECH_BOUNDARY_GRACE_MS;
}

export function behaviorActionEndMs(actions = []) {
  return Math.max(
    0,
    ...actions.map((action) => (Number(action.delayMs) || 0) + (Number(action.durationMs) || 0))
  );
}

export function stretchBehaviorActions(actions = [], targetDurationMs = 0) {
  const currentEndMs = behaviorActionEndMs(actions);
  if (!Array.isArray(actions) || !actions.length || !currentEndMs || !targetDurationMs) return actions;
  const scale = Math.min(Math.max(targetDurationMs / currentEndMs, 1), 3.2);
  if (scale <= 1.08) return actions;
  return actions.map((action) => ({
    ...action,
    delayMs: Math.round((Number(action.delayMs) || 0) * scale),
    durationMs: Math.round(Math.min(Math.max((Number(action.durationMs) || 1000) * scale, 420), 7200))
  }));
}

export function streamingInterruptPolicy(value = null) {
  const raw = typeof value === 'string'
    ? { mode: value }
    : (value && typeof value === 'object' ? value : {});
  const rawMode = String(raw.mode || raw.type || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const mode = ['protect', 'queue', 'ignore'].includes(rawMode) ? rawMode : STREAMING_INTERRUPT_POLICY.mode;
  return {
    ...STREAMING_INTERRUPT_POLICY,
    ...raw,
    mode,
    minHoldMs: Math.max(Number(raw.minHoldMs ?? raw.min_hold_ms) || 0, STREAMING_INTERRUPT_POLICY.minHoldMs),
    blendInMs: Math.max(Number(raw.blendInMs ?? raw.blend_in_ms) || 0, STREAMING_INTERRUPT_POLICY.blendInMs),
    blendOutMs: Math.max(Number(raw.blendOutMs ?? raw.blend_out_ms) || 0, STREAMING_INTERRUPT_POLICY.blendOutMs)
  };
}

export function alignLive2DIntentToStreamingSpeech(intent, speechDurationMs = 0) {
  if (!intent || typeof intent !== 'object') return intent;
  const currentEndMs = Math.max(
    Number(intent.durationMs) || 0,
    behaviorActionEndMs(intent.behaviorActions)
  );
  const targetDurationMs = clamp(
    Math.max(Number(speechDurationMs) || 0, currentEndMs, STREAMING_LIVE2D_MIN_DURATION_MS) + STREAMING_LIVE2D_TAIL_MS,
    STREAMING_LIVE2D_MIN_DURATION_MS,
    STREAMING_LIVE2D_MAX_DURATION_MS,
    STREAMING_LIVE2D_MIN_DURATION_MS
  );
  const alignStep = (step) => {
    if (!step || typeof step !== 'object') return step;
    const stepEndMs = Math.max(
      Number(step.durationMs) || 0,
      behaviorActionEndMs(step.behaviorActions)
    );
    const stepDurationMs = clamp(
      Math.max(targetDurationMs, stepEndMs),
      STREAMING_LIVE2D_MIN_DURATION_MS,
      STREAMING_LIVE2D_MAX_DURATION_MS,
      targetDurationMs
    );
    const behaviorActions = Array.isArray(step.behaviorActions)
      ? stretchBehaviorActions(step.behaviorActions, stepDurationMs)
      : step.behaviorActions;
    return {
      ...step,
      source: step.source || 'streaming-speech',
      durationMs: Math.max(Number(step.durationMs) || 0, stepDurationMs),
      interruptPolicy: streamingInterruptPolicy(step.interruptPolicy || step.interrupt),
      behaviorActions
    };
  };
  return {
    ...alignStep(intent),
    sequence: Array.isArray(intent.sequence) ? intent.sequence.map(alignStep) : intent.sequence
  };
}

export function createLive2DStreamingSpeechSession(options = {}) {
  const dispatchCharacterState = typeof options.dispatchCharacterState === 'function'
    ? options.dispatchCharacterState
    : () => {};
  const isLiveDirectorRunning = typeof options.isLiveDirectorRunning === 'function'
    ? options.isLiveDirectorRunning
    : () => false;
  const setTimer = typeof options.setTimer === 'function' ? options.setTimer : defaultSetTimer;
  const clearTimer = typeof options.clearTimer === 'function' ? options.clearTimer : defaultClearTimer;
  let active = false;
  let queuedLines = 0;
  let started = false;
  let finishTimer = 0;

  function clearFinishTimer() {
    if (!finishTimer) return;
    clearTimer(finishTimer);
    finishTimer = 0;
  }

  function dispatchSettleState() {
    dispatchCharacterState(isLiveDirectorRunning() ? 'listening' : 'idle', {
      holdMs: 1200,
      attention: isLiveDirectorRunning() ? 0.62 : 0.36,
      arousal: isLiveDirectorRunning() ? 0.42 : 0.3
    });
  }

  function scheduleFinish(delayMs = STREAMING_SPEECH_BOUNDARY_GRACE_MS) {
    if (!active || queuedLines > 0) return;
    clearFinishTimer();
    finishTimer = setTimer(() => {
      finishTimer = 0;
      if (!active || queuedLines > 0) return;
      active = false;
      started = false;
      dispatchSettleState();
    }, delayMs);
  }

  function dispatchSpeaking(durationMs = 0, detail = {}) {
    dispatchCharacterState('speaking', {
      holdMs: streamingSpeechHoldMs(durationMs),
      emotion: detail.emotion,
      emotionHoldMs: Math.max(Number(durationMs) || 0, STREAMING_SPEECH_MIN_HOLD_MS) + 980,
      attention: detail.attention ?? 0.88,
      arousal: detail.arousal ?? (detail.emotion === 'sad' || detail.emotion === 'crying' ? 0.5 : 0.72)
    });
  }

  return {
    begin() {
      active = true;
      queuedLines = 0;
      started = false;
      clearFinishTimer();
    },
    queueLine() {
      active = true;
      queuedLines += 1;
      clearFinishTimer();
    },
    lineStarted(detail = {}) {
      active = true;
      started = true;
      clearFinishTimer();
      dispatchSpeaking(detail.durationMs, detail);
    },
    lineSettled() {
      queuedLines = Math.max(0, queuedLines - 1);
      scheduleFinish();
    },
    finish(options = {}) {
      const delayMs = Number.isFinite(Number(options.delayMs))
        ? Number(options.delayMs)
        : STREAMING_SPEECH_BOUNDARY_GRACE_MS;
      queuedLines = 0;
      scheduleFinish(delayMs);
    },
    cancel(options = {}) {
      active = false;
      queuedLines = 0;
      started = false;
      clearFinishTimer();
      if (options.dispatchState) dispatchSettleState();
    },
    handleSpeechStatePatch(patch = {}) {
      const status = patch.status;
      if (!active) return false;
      if (status === 'loading' && started) {
        clearFinishTimer();
        dispatchCharacterState('speaking', {
          holdMs: STREAMING_SPEECH_TRANSITION_HOLD_MS,
          attention: 0.84,
          arousal: 0.62
        });
        return true;
      }
      if ((status === 'idle' || status === 'disabled') && (started || queuedLines > 0)) {
        scheduleFinish();
        return true;
      }
      return false;
    },
    getState() {
      return { active, queuedLines, started, finishing: Boolean(finishTimer) };
    }
  };
}
