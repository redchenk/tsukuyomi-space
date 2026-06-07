const EMOTION_PROFILES = {
  neutral: { smile: 0.56, brow: 0.54, eye: 0.92, arousal: 0.34 },
  smile: { smile: 0.68, brow: 0.58, eye: 0.9, arousal: 0.5 },
  happy: { smile: 0.7, brow: 0.6, eye: 0.9, arousal: 0.54 },
  bsmile: { smile: 0.72, brow: 0.62, eye: 0.86, arousal: 0.52 },
  shy: { smile: 0.68, brow: 0.64, eye: 0.84, arousal: 0.5 },
  smug: { smile: 0.76, brow: 0.6, eye: 0.84, arousal: 0.58 },
  surprised: { smile: 0.46, brow: 0.76, eye: 1, arousal: 0.72 },
  angry: { smile: 0.3, brow: 0.28, eye: 0.78, arousal: 0.68 },
  puff: { smile: 0.36, brow: 0.38, eye: 0.82, arousal: 0.56 },
  tongue: { smile: 0.74, brow: 0.58, eye: 0.84, arousal: 0.58 },
  dizzy: { smile: 0.38, brow: 0.44, eye: 0.68, arousal: 0.6 },
  fire: { smile: 0.26, brow: 0.22, eye: 0.76, arousal: 0.8 },
  sad: { smile: 0.34, brow: 0.34, eye: 0.82, arousal: 0.3 },
  namida: { smile: 0.32, brow: 0.32, eye: 0.8, arousal: 0.32 },
  tears: { smile: 0.28, brow: 0.28, eye: 0.76, arousal: 0.44 },
  crying: { smile: 0.28, brow: 0.28, eye: 0.76, arousal: 0.44 }
};

const MODE_PROFILES = {
  idle: { head: 1, body: 1, gaze: 1, smile: 0, brow: 0, arousal: 0 },
  listening: { head: 1.08, body: 1.04, gaze: 1.25, smile: 0.02, brow: 0.03, arousal: 0.08 },
  thinking: { head: 0.9, body: 0.86, gaze: 0.72, smile: -0.04, brow: 0.08, arousal: 0.12 },
  speaking: { head: 1.36, body: 1.32, gaze: 1.15, smile: 0.025, brow: 0.02, arousal: 0.18 },
  acting: { head: 1.28, body: 1.24, gaze: 1.16, smile: 0.02, brow: 0.04, arousal: 0.22 }
};

const IDLE_ACTION_RATIO = 0.9;
const ACTION_SPEED_SCALE = 0.99;
const SPEAKING_RELEASE_BLEND_MS = 920;
const SPEAKING_RELEASE_SETTLE_MS = 680;
const SPEAKING_RELEASE_GESTURE_DELAY_MS = 1320;
const IDLE_GESTURE_WEIGHTS = [
  { type: 'bob', weight: 0.34 },
  { type: 'nod', weight: 0.24 },
  { type: 'sway', weight: 0.18 },
  { type: 'tilt', weight: 0.16 },
  { type: 'perk', weight: 0.08 }
];

const SPEAKING_GESTURE_WEIGHTS = {
  neutral: [
    { type: 'nod', weight: 0.32 },
    { type: 'bob', weight: 0.28 },
    { type: 'sway', weight: 0.22 },
    { type: 'tilt', weight: 0.18 }
  ],
  smile: [
    { type: 'bob', weight: 0.34 },
    { type: 'nod', weight: 0.28 },
    { type: 'sway', weight: 0.2 },
    { type: 'perk', weight: 0.1 },
    { type: 'tilt', weight: 0.08 }
  ],
  happy: [
    { type: 'bob', weight: 0.36 },
    { type: 'nod', weight: 0.24 },
    { type: 'sway', weight: 0.18 },
    { type: 'perk', weight: 0.14 },
    { type: 'tilt', weight: 0.08 }
  ],
  bsmile: [
    { type: 'sway', weight: 0.28 },
    { type: 'tilt', weight: 0.24 },
    { type: 'bob', weight: 0.2 },
    { type: 'nod', weight: 0.18 },
    { type: 'perk', weight: 0.1 }
  ],
  shy: [
    { type: 'tilt', weight: 0.3 },
    { type: 'sway', weight: 0.24 },
    { type: 'bob', weight: 0.2 },
    { type: 'nod', weight: 0.18 },
    { type: 'lean', weight: 0.08 }
  ],
  smug: [
    { type: 'tilt', weight: 0.3 },
    { type: 'sway', weight: 0.24 },
    { type: 'lean', weight: 0.22 },
    { type: 'nod', weight: 0.14 },
    { type: 'bob', weight: 0.1 }
  ],
  surprised: [
    { type: 'perk', weight: 0.32 },
    { type: 'bob', weight: 0.28 },
    { type: 'nod', weight: 0.2 },
    { type: 'tilt', weight: 0.12 },
    { type: 'sway', weight: 0.08 }
  ],
  angry: [
    { type: 'lean', weight: 0.32 },
    { type: 'shake', weight: 0.24 },
    { type: 'nod', weight: 0.22 },
    { type: 'tilt', weight: 0.12 },
    { type: 'sway', weight: 0.1 }
  ],
  puff: [
    { type: 'shake', weight: 0.28 },
    { type: 'tilt', weight: 0.24 },
    { type: 'sway', weight: 0.22 },
    { type: 'nod', weight: 0.16 },
    { type: 'bob', weight: 0.1 }
  ],
  tongue: [
    { type: 'tilt', weight: 0.26 },
    { type: 'bob', weight: 0.24 },
    { type: 'sway', weight: 0.22 },
    { type: 'perk', weight: 0.16 },
    { type: 'lean', weight: 0.12 }
  ],
  dizzy: [
    { type: 'sway', weight: 0.34 },
    { type: 'shake', weight: 0.22 },
    { type: 'tilt', weight: 0.2 },
    { type: 'bob', weight: 0.14 },
    { type: 'nod', weight: 0.1 }
  ],
  sad: [
    { type: 'nod', weight: 0.34 },
    { type: 'sway', weight: 0.24 },
    { type: 'bob', weight: 0.18 },
    { type: 'tilt', weight: 0.16 },
    { type: 'lean', weight: 0.08 }
  ],
  namida: [
    { type: 'nod', weight: 0.34 },
    { type: 'sway', weight: 0.24 },
    { type: 'bob', weight: 0.18 },
    { type: 'tilt', weight: 0.16 },
    { type: 'lean', weight: 0.08 }
  ],
  tears: [
    { type: 'nod', weight: 0.3 },
    { type: 'sway', weight: 0.24 },
    { type: 'shake', weight: 0.2 },
    { type: 'bob', weight: 0.14 },
    { type: 'tilt', weight: 0.12 }
  ],
  crying: [
    { type: 'nod', weight: 0.3 },
    { type: 'sway', weight: 0.24 },
    { type: 'shake', weight: 0.2 },
    { type: 'bob', weight: 0.14 },
    { type: 'tilt', weight: 0.12 }
  ],
  fire: [
    { type: 'lean', weight: 0.34 },
    { type: 'nod', weight: 0.24 },
    { type: 'shake', weight: 0.2 },
    { type: 'perk', weight: 0.12 },
    { type: 'sway', weight: 0.1 }
  ]
};

function clamp(value, min, max, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizeEmotion(value) {
  const key = normalizeToken(value);
  const aliases = {
    joy: 'happy',
    cheerful: 'happy',
    playful: 'bsmile',
    blush: 'shy',
    embarrassed: 'shy',
    annoyed: 'angry',
    irritated: 'angry',
    surprise: 'surprised',
    shock: 'surprised',
    confused: 'dizzy',
    pout: 'puff',
    tongue_out: 'tongue',
    rage: 'fire',
    sorrow: 'sad',
    cry: 'crying'
  };
  return EMOTION_PROFILES[aliases[key] || key] ? (aliases[key] || key) : 'neutral';
}

function normalizeMode(value) {
  const key = normalizeToken(value);
  if (key === 'listen') return 'listening';
  if (key === 'speak') return 'speaking';
  if (MODE_PROFILES[key]) return key;
  return 'idle';
}

function isTearfulEmotion(emotion) {
  return ['sad', 'namida', 'tears', 'crying'].includes(normalizeEmotion(emotion));
}

function lerp(left, right, t) {
  return left + (right - left) * clamp(t, 0, 1);
}

function blendProfiles(left = {}, right = {}, t = 0) {
  const amount = clamp(t, 0, 1);
  return Object.fromEntries(
    Object.keys({ ...left, ...right }).map((key) => [
      key,
      lerp(Number(left[key]) || 0, Number(right[key]) || 0, amount)
    ])
  );
}

function actionMs(value) {
  return (Number(value) || 0) / ACTION_SPEED_SCALE;
}

function smoothNoise(seconds, a, b, c) {
  return (
    Math.sin(seconds * a) * 0.55 +
    Math.sin(seconds * b + 1.7) * 0.3 +
    Math.sin(seconds * c + 3.1) * 0.15
  );
}

function smoothStep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function springStep(value) {
  const t = clamp(value, 0, 1);
  return clamp(smoothStep(t) + Math.sin(Math.PI * t) * 0.08, 0, 1);
}

function responseAlpha(deltaMs, responseMs) {
  return 1 - Math.exp(-Math.max(deltaMs, 1) / Math.max(responseMs, 1));
}

function characterPoseResponseMs(key, pose) {
  const speaking = pose?.mode === 'speaking';
  const speakingTail = clamp(Math.max(Number(pose?.speakingBlend) || 0, Number(pose?.speakingSettleBlend) || 0), 0, 1);
  const speakingLike = speaking || speakingTail > 0.01;
  const vertical = key === 'faceY' || key === 'facePosY' || key === 'bodyY' || key === 'bodyPosY';
  if (speakingLike && vertical) {
    if (key === 'bodyPosY') return 390;
    if (key === 'bodyY') return 340;
    if (key === 'facePosY') return 320;
    return 280;
  }
  if (vertical) return key === 'bodyPosY' ? 300 : 240;
  if (key === 'browLeftY' || key === 'browRightY' || key === 'brows') return speakingLike ? 260 : 220;
  if (key === 'eyeX' || key === 'eyeY') return speakingLike ? 170 : 190;
  if (key === 'bodyX' || key === 'bodyZ' || key === 'bodyPosX') return speakingLike ? 240 : 210;
  if (key === 'faceX' || key === 'faceZ' || key === 'facePosX') return speakingLike ? 190 : 170;
  return 180;
}

function smoothCharacterPose(state, pose, deltaMs) {
  const previous = state.smoothedPose;
  if (!previous) {
    state.smoothedPose = { ...pose };
    return pose;
  }

  const smoothed = { ...pose };
  [
    'eyeX',
    'eyeY',
    'faceX',
    'faceY',
    'faceZ',
    'facePosX',
    'facePosY',
    'brows',
    'browLeftY',
    'browRightY',
    'bodyX',
    'bodyY',
    'bodyZ',
    'bodyPosX',
    'bodyPosY'
  ].forEach((key) => {
    const next = Number(pose[key]);
    const last = Number(previous[key]);
    if (!Number.isFinite(next) || !Number.isFinite(last)) return;
    smoothed[key] = lerp(last, next, responseAlpha(deltaMs, characterPoseResponseMs(key, pose)));
  });
  state.smoothedPose = { ...smoothed };
  return smoothed;
}

function speakingMotionValue(state, at, lagMs = 0) {
  const duration = Math.max(Number(state.motionDurationMs) || 4200, 1);
  const progress = clamp(((Number(at) || 0) - lagMs - state.motionStartedAt) / duration, 0, 1);
  return lerp(state.motionFrom, state.motionTo, springStep(progress));
}

function speakingReleaseBlend(state, at) {
  if (state.mode === 'speaking') return 1;
  if (!state.speakingReleaseAt || !state.speakingReleaseUntil || at >= state.speakingReleaseUntil) return 0;
  const progress = (at - state.speakingReleaseAt) / Math.max(state.speakingReleaseUntil - state.speakingReleaseAt, 1);
  return 1 - smoothStep(progress);
}

function speakingSettleBlend(state, at) {
  if (state.mode === 'speaking') return 1;
  if (!state.speakingReleaseUntil) return 0;
  const settleUntil = state.speakingReleaseUntil + SPEAKING_RELEASE_SETTLE_MS;
  if (at <= state.speakingReleaseUntil) return 1;
  if (at >= settleUntil) return 0;
  return 1 - smoothStep((at - state.speakingReleaseUntil) / SPEAKING_RELEASE_SETTLE_MS);
}

function startSpeakingMotionSegment(state, at, target = null, durationMs = 0) {
  const current = speakingMotionValue(state, at);
  const targetValue = target === null
    ? (Math.abs(current) > 0.18 && Math.random() < 0.32 ? 0 : (Math.random() - 0.5) * 2.6)
    : target;
  state.motionFrom = current;
  state.motionTo = targetValue;
  state.motionStartedAt = at;
  state.motionDurationMs = actionMs(durationMs || (720 + Math.random() * 760));
  state.motionHoldMs = Math.abs(targetValue) < 0.04
    ? actionMs(240 + Math.random() * 520)
    : actionMs(160 + Math.random() * 460);
}

function startIdleMotionSegment(state, at) {
  const current = speakingMotionValue(state, at);
  const targetValue = Math.abs(current) > 0.52 && Math.random() < 0.3
    ? (Math.random() - 0.5) * 0.42
    : (Math.random() - 0.5) * 1.5;
  state.motionFrom = current;
  state.motionTo = targetValue;
  state.motionStartedAt = at;
  state.motionDurationMs = actionMs(760 + Math.random() * 820);
  state.motionHoldMs = actionMs(80 + Math.random() * 240);
}

function weightedGestureType(options, excludeType = '') {
  const pool = (Array.isArray(options) ? options : []).filter((item) => item.type && item.type !== excludeType);
  const choices = pool.length ? pool : (Array.isArray(options) ? options : []);
  const total = choices.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * Math.max(total, 0.01);
  for (const item of choices) {
    roll -= item.weight;
    if (roll <= 0) return item.type;
  }
  return choices[choices.length - 1]?.type || 'nod';
}

function rememberSpeakingGesture(state, type, side) {
  state.speakingGestureRepeatCount = state.lastSpeakingGestureType === type
    ? state.speakingGestureRepeatCount + 1
    : 1;
  state.lastSpeakingGestureType = type;
  state.lastSpeakingGestureSide = side;
}

function pickSpeakingGestureType(state) {
  const weights = SPEAKING_GESTURE_WEIGHTS[normalizeEmotion(state.emotion)] || SPEAKING_GESTURE_WEIGHTS.neutral;
  let type = weightedGestureType(weights);
  if (type === state.lastSpeakingGestureType) {
    const shouldSwitch = state.speakingGestureRepeatCount >= 2 || Math.random() < 0.68;
    if (shouldSwitch) type = weightedGestureType(weights, type);
  }
  return type;
}

function pickGestureSide(state, type, lastSideKey = 'lastIdleGestureSide') {
  let side = Math.random() > 0.5 ? 1 : -1;
  if (['tilt', 'sway', 'lean', 'shake'].includes(type) && side === state[lastSideKey] && Math.random() < 0.72) {
    side *= -1;
  }
  return side;
}

function pickGestureFlavor() {
  return Math.floor(Math.random() * 4);
}

function pickGestureArc() {
  return (Math.random() - 0.5) * 2;
}

function startSpeakingGesture(state, at) {
  const type = pickSpeakingGestureType(state);
  const nodLike = ['nod', 'shake', 'perk'].includes(type);
  state.gestureType = type;
  state.gestureStartedAt = at;
  state.gestureDurationMs = nodLike
    ? actionMs(620 + Math.random() * 520)
    : actionMs(780 + Math.random() * 620);
  state.gestureAmount = nodLike
    ? 1.2 + Math.random() * 0.9
    : 0.95 + Math.random() * 0.82;
  state.gestureSide = pickGestureSide(state, type, 'lastSpeakingGestureSide');
  state.gestureFlavor = pickGestureFlavor();
  state.gestureArc = pickGestureArc();
  rememberSpeakingGesture(state, type, state.gestureSide);
  state.nextGestureAt = at + state.gestureDurationMs + actionMs(420 + Math.random() * 980);
}

function weightedIdleGestureType(excludeType = '') {
  return weightedGestureType(IDLE_GESTURE_WEIGHTS, excludeType);
}

function pickIdleGestureType(state) {
  let type = weightedIdleGestureType();
  if (type === state.lastIdleGestureType) {
    const shouldSwitch = state.idleGestureRepeatCount >= 2 || Math.random() < 0.78;
    if (shouldSwitch) type = weightedIdleGestureType(type);
  }
  return type;
}

function pickIdleGestureSide(state, type) {
  return pickGestureSide(state, type, 'lastIdleGestureSide');
}

function rememberIdleGesture(state, type, side) {
  state.idleGestureRepeatCount = state.lastIdleGestureType === type
    ? state.idleGestureRepeatCount + 1
    : 1;
  state.lastIdleGestureType = type;
  state.lastIdleGestureSide = side;
}

function startIdleGesture(state, at) {
  const type = pickIdleGestureType(state);
  const nod = type === 'nod';
  const bob = type === 'bob' || type === 'perk';
  state.gestureType = type;
  state.gestureStartedAt = at;
  state.gestureDurationMs = bob
    ? actionMs(700 + Math.random() * 680)
    : (nod ? actionMs(620 + Math.random() * 520) : actionMs(780 + Math.random() * 620));
  state.gestureAmount = bob
    ? 1.1 + Math.random() * 0.85
    : (nod ? 1.0 + Math.random() * 0.7 : 0.78 + Math.random() * 0.48);
  state.gestureSide = pickIdleGestureSide(state, type);
  state.gestureFlavor = pickGestureFlavor();
  state.gestureArc = pickGestureArc();
  rememberIdleGesture(state, type, state.gestureSide);
  state.nextGestureAt = at + state.gestureDurationMs + actionMs(80 + Math.random() * 260);
}

function speakingGestureValue(state, at) {
  if (!state.gestureStartedAt || state.gestureType === 'none') return { nod: 0, tilt: 0, lift: 0 };
  const progress = clamp((at - state.gestureStartedAt) / Math.max(state.gestureDurationMs, 1), 0, 1);
  const envelope = Math.sin(Math.PI * progress);
  const flavor = Math.abs(Math.round(Number(state.gestureFlavor) || 0)) % 4;
  const arc = clamp(Number(state.gestureArc) || 0, -1, 1, 0);
  const side = Number(state.gestureSide) || 1;
  const sideArc = side * (0.88 + Math.abs(arc) * 0.12);
  if (progress >= 1) return { nod: 0, tilt: 0, lift: 0 };
  if (state.gestureType === 'nod') {
    return {
      nod: state.gestureAmount * envelope,
      tilt: flavor === 1 ? sideArc * state.gestureAmount * 0.18 * envelope : (flavor === 2 ? side * state.gestureAmount * 0.1 * envelope : 0),
      lift: flavor === 3 ? state.gestureAmount * 0.18 * envelope : 0
    };
  }
  if (state.gestureType === 'bob') {
    return {
      nod: flavor === 2 ? -state.gestureAmount * 0.16 * envelope : (flavor === 3 ? state.gestureAmount * 0.1 * envelope : 0),
      tilt: flavor === 1 ? sideArc * state.gestureAmount * 0.14 * envelope : 0,
      lift: state.gestureAmount * envelope
    };
  }
  if (state.gestureType === 'perk') {
    return {
      nod: -state.gestureAmount * (flavor === 2 ? 0.34 : 0.45) * envelope,
      tilt: sideArc * state.gestureAmount * (flavor === 1 ? 0.28 : 0.18) * envelope,
      lift: state.gestureAmount * envelope
    };
  }
  if (state.gestureType === 'sway') {
    return {
      nod: flavor === 2 ? state.gestureAmount * 0.12 * envelope : 0,
      tilt: sideArc * state.gestureAmount * 0.68 * envelope,
      lift: state.gestureAmount * (flavor === 3 ? 0.42 : 0.32) * envelope
    };
  }
  if (state.gestureType === 'lean') {
    return {
      nod: -state.gestureAmount * (flavor === 1 ? 0.46 : 0.36) * envelope,
      tilt: sideArc * state.gestureAmount * 0.86 * envelope,
      lift: state.gestureAmount * (flavor === 3 ? 0.28 : 0.18) * envelope
    };
  }
  if (state.gestureType === 'shake') {
    const wave = Math.sin(Math.PI * progress * 2) * envelope;
    return {
      nod: state.gestureAmount * (flavor === 1 ? 0.2 : 0.12) * envelope,
      tilt: sideArc * state.gestureAmount * 0.78 * wave,
      lift: flavor === 3 ? state.gestureAmount * 0.12 * envelope : 0
    };
  }
  return {
    nod: flavor === 2 ? state.gestureAmount * 0.1 * envelope : 0,
    tilt: sideArc * state.gestureAmount * envelope,
    lift: flavor === 3 ? state.gestureAmount * 0.14 * envelope : 0
  };
}

function pickNextGazeTarget(state, now) {
  const seconds = now / 1000 + state.seed;
  const active = state.mode === 'speaking' || state.mode === 'acting';
  const sideGlance = active && Math.random() < 0.36;
  const span = state.mode === 'thinking' ? 0.18 : (active ? 0.52 : 0.34);
  state.gazeX = sideGlance
    ? (Math.random() > 0.5 ? 1 : -1) * (0.34 + Math.random() * 0.2)
    : clamp(smoothNoise(seconds, 0.43, 0.91, 1.37) * span, -0.62, 0.62);
  state.gazeY = clamp(-0.04 + smoothNoise(seconds, 0.32, 0.68, 1.11) * span * 0.68, -0.38, 0.34);
  state.nextGazeAt = now + (active ? 850 + Math.random() * 1700 : 1600 + Math.random() * 2600);
}

function emotionFromDetail(detail = {}) {
  const mix = Array.isArray(detail.expressionMix) ? detail.expressionMix : [];
  const mixed = mix
    .map((item) => ({
      expression: item?.expression || item?.key || item?.id,
      weight: Number(item?.weight)
    }))
    .filter((item) => item.expression && Number.isFinite(item.weight))
    .sort((left, right) => right.weight - left.weight)[0]?.expression;
  const raw = mixed || detail.expression || detail.emotion || detail.mood || '';
  return raw ? normalizeEmotion(raw) : '';
}

export function createLive2DCharacterStateMachine() {
  const state = {
    mode: 'idle',
    previousMode: 'idle',
    emotion: 'neutral',
    emotionUntil: 0,
    modeSince: nowMs(),
    modeUntil: 0,
    lastActAt: 0,
    lastMouthAt: 0,
    mouthEnergy: 0,
    speechMotionEnergy: 0,
    attention: 0.36,
    arousal: 0.34,
    gazeX: 0,
    gazeY: 0,
    currentGazeX: 0,
    currentGazeY: 0,
    nextGazeAt: 0,
    lastSampleAt: 0,
    motionStartedAt: 0,
    motionDurationMs: 4200,
    motionHoldMs: 1200,
    motionFrom: 0,
    motionTo: 0,
    nextGestureAt: 0,
    gestureType: 'none',
    gestureStartedAt: 0,
    gestureDurationMs: 0,
    gestureAmount: 0,
    gestureSide: 1,
    gestureFlavor: 0,
    gestureArc: 0,
    lastIdleGestureType: 'none',
    lastIdleGestureSide: 1,
    idleGestureRepeatCount: 0,
    lastSpeakingGestureType: 'none',
    lastSpeakingGestureSide: 1,
    speakingGestureRepeatCount: 0,
    speakingReleaseAt: 0,
    speakingReleaseUntil: 0,
    smoothedPose: null,
    seed: Math.random() * 1000
  };

  function setMode(mode, options = {}) {
    const at = Number(options.now) || nowMs();
    const nextMode = normalizeMode(mode);
    if (state.mode !== nextMode) {
      const leavingSpeaking = state.mode === 'speaking' && nextMode !== 'speaking';
      const enteringSpeaking = nextMode === 'speaking';
      state.previousMode = state.mode;
      state.mode = nextMode;
      state.modeSince = at;
      if (leavingSpeaking) {
        const currentMotion = speakingMotionValue(state, at);
        state.motionFrom = currentMotion;
        state.motionTo = currentMotion;
        state.motionStartedAt = at;
        state.motionDurationMs = actionMs(420);
        state.motionHoldMs = SPEAKING_RELEASE_BLEND_MS + actionMs(180);
        state.speakingReleaseAt = at;
        state.speakingReleaseUntil = at + SPEAKING_RELEASE_BLEND_MS;
        state.nextGestureAt = Math.max(Number(state.nextGestureAt) || 0, at + SPEAKING_RELEASE_GESTURE_DELAY_MS);
      } else if (enteringSpeaking) {
        state.speakingReleaseAt = 0;
        state.speakingReleaseUntil = 0;
      }
    } else if (nextMode === 'speaking') {
      state.speakingReleaseAt = 0;
      state.speakingReleaseUntil = 0;
    }
    const holdMs = Number(options.holdMs);
    state.modeUntil = Number.isFinite(holdMs) && holdMs > 0 ? at + holdMs : 0;
    if (options.emotion) {
      state.emotion = normalizeEmotion(options.emotion);
      const emotionHoldMs = Number(options.emotionHoldMs ?? options.holdMs);
      const holdDuration = clamp(emotionHoldMs, 900, 12000, 2600);
      state.emotionUntil = state.emotion === 'neutral' ? 0 : at + holdDuration;
    }
    state.attention = Math.max(state.attention, clamp(options.attention, 0, 1, 0));
    state.arousal = Math.max(state.arousal, clamp(options.arousal, 0, 1, 0));
  }

  function onRoomAct(detail = {}, at = nowMs()) {
    const durationMs = clamp(detail.durationMs || detail.duration, 800, 12000, 2600);
    const intensity = clamp(detail.intensity, 0, 1, 0.66);
    state.lastActAt = at;
    setMode('acting', {
      now: at,
      holdMs: durationMs + 450,
      emotionHoldMs: durationMs + 650,
      emotion: emotionFromDetail(detail),
      attention: 0.58 + intensity * 0.36,
      arousal: 0.48 + intensity * 0.34
    });
  }

  function onMouth(value, at = nowMs()) {
    const mouth = clamp(value, 0, 1, 0);
    const mouthBlend = mouth > state.mouthEnergy ? 0.34 : 0.12;
    state.mouthEnergy = clamp(lerp(state.mouthEnergy, mouth, mouthBlend), 0, 1);
    state.speechMotionEnergy = clamp(lerp(state.speechMotionEnergy, mouth, 0.12), 0, 1);
    if (mouth > 0.025) {
      state.lastMouthAt = at;
      setMode('speaking', {
        now: at,
        holdMs: 850,
        attention: 0.72,
        arousal: 0.58 + mouth * 0.22
      });
    }
  }

  function onExternalState(detail = {}, at = nowMs()) {
    setMode(detail.mode || detail.status || 'idle', {
      now: at,
      holdMs: detail.holdMs,
      emotionHoldMs: detail.emotionHoldMs || detail.durationMs || detail.duration || detail.holdMs,
      emotion: detail.emotion,
      attention: detail.attention,
      arousal: detail.arousal
    });
  }

  function update(at) {
    if (state.emotionUntil && at > state.emotionUntil) {
      state.emotion = 'neutral';
      state.emotionUntil = 0;
    }
    if (state.modeUntil && at > state.modeUntil && state.mode !== 'idle') {
      if (state.mode !== 'speaking' || at - state.lastMouthAt > 720) {
        setMode(state.attention > 0.48 ? 'listening' : 'idle', { now: at });
      }
    }
    if (state.mode === 'speaking' && at - state.lastMouthAt > 820 && (!state.modeUntil || at > state.modeUntil)) {
      setMode('listening', { now: at });
    }
    if (at >= state.nextGazeAt) pickNextGazeTarget(state, at);
    if (state.gestureStartedAt && at >= state.gestureStartedAt + state.gestureDurationMs) {
      state.gestureType = 'none';
      state.gestureStartedAt = 0;
    }
    if (state.mode === 'speaking') {
      if (!state.motionStartedAt || at >= state.motionStartedAt + state.motionDurationMs + state.motionHoldMs) {
        startSpeakingMotionSegment(state, at);
      }
      if (!state.nextGestureAt) state.nextGestureAt = at + 260 + Math.random() * 760;
      if (at >= state.nextGestureAt && !state.gestureStartedAt) startSpeakingGesture(state, at);
    } else {
      const idleFlow = ['idle', 'listening'].includes(state.mode);
      if (idleFlow) {
        if (!state.motionStartedAt || at >= state.motionStartedAt + state.motionDurationMs + state.motionHoldMs) {
          startIdleMotionSegment(state, at);
        }
        if (!state.nextGestureAt) state.nextGestureAt = at + actionMs(120 + Math.random() * 420);
        if (at >= state.nextGestureAt && !state.gestureStartedAt) startIdleGesture(state, at);
      } else {
        if (Math.abs(state.motionTo) > 0.01 && at >= state.motionStartedAt + state.motionDurationMs) {
          startSpeakingMotionSegment(state, at, 0, 1800);
        }
        state.nextGestureAt = 0;
        state.gestureType = 'none';
        state.gestureStartedAt = 0;
      }
    }

    state.mouthEnergy *= 0.9;
    state.speechMotionEnergy *= state.mode === 'speaking' ? 0.985 : lerp(0.9, 0.965, speakingReleaseBlend(state, at));
    state.attention = lerp(state.attention, state.mode === 'idle' ? 0.34 : 0.56, 0.018);
    state.arousal = lerp(state.arousal, EMOTION_PROFILES[state.emotion]?.arousal ?? 0.34, 0.014);
  }

  function sample(at = nowMs()) {
    update(at);
    const seconds = at / 1000 + state.seed;
    const baseModeProfile = MODE_PROFILES[state.mode] || MODE_PROFILES.idle;
    const emotionProfile = EMOTION_PROFILES[state.emotion] || EMOTION_PROFILES.neutral;
    const modeAge = Math.max(0, at - state.modeSince);
    const transition = clamp(modeAge / 520, 0, 1);
    const isSpeaking = state.mode === 'speaking';
    const speakingBlend = speakingReleaseBlend(state, at);
    const speakingSettle = speakingSettleBlend(state, at);
    const idleFlow = ['idle', 'listening'].includes(state.mode);
    const modeProfile = !isSpeaking && speakingBlend > 0
      ? blendProfiles(baseModeProfile, MODE_PROFILES.speaking, speakingBlend)
      : baseModeProfile;
    const motionSeconds = seconds * ACTION_SPEED_SCALE;
    const breath = Math.sin(motionSeconds * (1.28 + state.arousal * 0.18));
    const slowFloat = Math.sin(motionSeconds * 1.35 + state.seed * 0.13);
    const bodyFloat = Math.sin(motionSeconds * 1.08 + 1.4 + state.seed * 0.09);
    const livelyFloat = Math.sin(motionSeconds * 1.36 + 0.7 + state.seed * 0.07) * speakingBlend;
    const breathMotion = breath * lerp(1, 1.05, speakingBlend);
    const speakingDriftScale = lerp(1, 0.08, speakingBlend);
    const headDrift = smoothNoise(motionSeconds, 0.42, 0.77, 1.26) * speakingDriftScale;
    const bodyDrift = smoothNoise(motionSeconds + 2.4, 0.31, 0.58, 0.96) * speakingDriftScale;
    const speechMotionEnergy = state.speechMotionEnergy * lerp(0.35, 1, speakingBlend);
    const activeMotionEnergy = clamp(0.78 + speechMotionEnergy * 0.7, 0, 1.34);
    const passiveMotionEnergy = idleFlow ? IDLE_ACTION_RATIO * 0.82 : clamp(speechMotionEnergy * 0.7, 0, 0.5);
    const motionEnergy = lerp(passiveMotionEnergy, activeMotionEnergy, speakingBlend);
    const idleForwardLean = idleFlow ? IDLE_ACTION_RATIO : 0;
    const headMotion = speakingMotionValue(state, at, 0);
    const bodyMotion = speakingMotionValue(state, at, actionMs(420));
    const gesture = speakingGestureValue(state, at);
    const gestureStrength = lerp(state.gestureStartedAt ? 1 : 0, motionEnergy, speakingBlend);
    const speechNod = gesture.nod * gestureStrength;
    const speechTilt = gesture.tilt * gestureStrength;
    const speechLift = (gesture.lift || 0) * gestureStrength;
    const speechSway = motionEnergy * headMotion;
    const speechCounterSway = motionEnergy * bodyMotion;
    const speechHeadRoll = motionEnergy * (headMotion * 0.24 + bodyMotion * 0.12) + speechTilt;
    const thinkingNod = state.mode === 'thinking' ? Math.sin(motionSeconds * 1.9) * 0.7 : 0;
    const actingLift = state.mode === 'acting' ? Math.sin(motionSeconds * 2.4) * 0.7 : 0;
    const headScale = modeProfile.head * (0.78 + state.attention * 0.34 + state.arousal * 0.2);
    const bodyScale = modeProfile.body * (0.82 + state.arousal * 0.28);
    const gazeScale = modeProfile.gaze * (0.7 + state.attention * 0.44);
    const deltaMs = state.lastSampleAt ? clamp(at - state.lastSampleAt, 1, 80, 16.67) : 16.67;
    const gazeResponseMs = (speakingSettle > 0.08 || state.mode === 'acting') ? 180 : 260;
    const gazeAlpha = 1 - Math.exp(-deltaMs / gazeResponseMs);
    state.currentGazeX = lerp(state.currentGazeX, state.gazeX, gazeAlpha);
    state.currentGazeY = lerp(state.currentGazeY, state.gazeY, gazeAlpha);
    state.lastSampleAt = at;
    const activeSpeechEnergy = clamp(state.speechMotionEnergy * 0.72 + state.mouthEnergy * 0.28, 0, 1);
    const speechEnergy = lerp(state.mouthEnergy * 0.45, activeSpeechEnergy, speakingBlend);
    const speechEyeSmile = speechEnergy * 0.06 + Math.max(speechNod, 0) * 0.015;
    const mouthBase = emotionProfile.smile + modeProfile.smile;
    const mouthTarget = isTearfulEmotion(state.emotion) ? 0.42 : 0.64;
    const mouthSmile = clamp(
      lerp(mouthBase, Math.max(mouthBase, mouthTarget), speechEnergy * 0.38),
      0.18,
      0.84
    );
    const browBase = emotionProfile.brow + modeProfile.brow;
    const softBrow = clamp(lerp(browBase, 0.55, speechEnergy * 0.34), 0.18, 0.82);
    const speakingFaceY = -0.8 - 5.2 + breathMotion * 0.95 + slowFloat * 0.86 + livelyFloat * 0.32 - speechNod * 12 + thinkingNod + actingLift;
    const idleFaceY = -0.8 - idleForwardLean * 5.2 + breathMotion * (1.35 * IDLE_ACTION_RATIO) + slowFloat * (1.25 * IDLE_ACTION_RATIO) - speechNod * (12 * IDLE_ACTION_RATIO) + thinkingNod + actingLift;
    const speakingFacePosY = -0.2 * breathMotion + slowFloat * 0.28 + livelyFloat * 0.08 - speechNod * 0.78;
    const idleFacePosY = -0.3 * IDLE_ACTION_RATIO * breathMotion + slowFloat * (0.42 * IDLE_ACTION_RATIO) - speechNod * (0.86 * IDLE_ACTION_RATIO) - speechLift * (0.58 * IDLE_ACTION_RATIO);
    const speakingBodyY = -7.2 + breathMotion * 2.15 + bodyFloat * 2.2 + livelyFloat * 0.55 - speechNod * 7.4 + thinkingNod * 0.24;
    const idleBodyY = -idleForwardLean * 7.2 + breathMotion * (3.0 * IDLE_ACTION_RATIO) + bodyFloat * (3.2 * IDLE_ACTION_RATIO) - speechNod * (7.4 * IDLE_ACTION_RATIO) + thinkingNod * 0.24;
    const speakingBodyPosY = breathMotion * 0.014 + bodyFloat * 0.026 + livelyFloat * 0.004 + speechNod * 0.052;
    const idleBodyPosY = breathMotion * (0.025 * IDLE_ACTION_RATIO) + bodyFloat * (0.045 * IDLE_ACTION_RATIO) + speechNod * (0.07 * IDLE_ACTION_RATIO) + speechLift * (0.095 * IDLE_ACTION_RATIO);

    const rawPose = {
      mode: state.mode,
      previousMode: state.previousMode,
      emotion: state.emotion,
      transition,
      speakingBlend,
      speakingSettleBlend: speakingSettle,
      eyeOpen: clamp(emotionProfile.eye - speechEyeSmile, 0.66, 1),
      eyeX: clamp(state.currentGazeX * gazeScale - headDrift * 0.07, -0.72, 0.72),
      eyeY: clamp(state.currentGazeY * gazeScale - 0.02 - thinkingNod * 0.04 - speechNod * 0.018 - speechLift * 0.014, -0.48, 0.42),
      faceX: (headDrift * 2.8 + speechSway * 13.2) * headScale,
      faceY: lerp(idleFaceY, speakingFaceY, speakingBlend) * headScale,
      faceZ: (
        smoothNoise(motionSeconds + 0.9, 0.36, 0.66, 1.05) * 1.1 * speakingDriftScale +
        speechHeadRoll * 14.2
      ) * headScale,
      facePosX: (bodyDrift * 0.52 + speechSway * 4.4) * bodyScale,
      facePosY: lerp(idleFacePosY, speakingFacePosY, speakingBlend) * modeProfile.body,
      mouthSmile: clamp(mouthSmile + Math.max(speechNod, 0) * 0.018, 0.18, 0.84),
      brows: softBrow,
      browLeftY: clamp(softBrow + smoothNoise(motionSeconds, 0.83, 1.41, 2.2) * 0.012, 0.18, 0.84),
      browRightY: clamp(softBrow + smoothNoise(motionSeconds + 0.6, 0.79, 1.33, 2.08) * 0.012, 0.18, 0.84),
      bodyX: (bodyDrift * 0.72 + speechCounterSway * 7.2) * bodyScale,
      bodyY: lerp(idleBodyY, speakingBodyY, speakingBlend) * bodyScale,
      bodyZ: (
        smoothNoise(motionSeconds + 1.8, 0.28, 0.51, 0.88) * 0.95 * speakingDriftScale +
        speechCounterSway * 8.2 +
        speechTilt * 9.4
      ) * bodyScale,
      bodyPosX: (bodyDrift * 0.022 + speechCounterSway * 0.06) * bodyScale,
      bodyPosY: lerp(idleBodyPosY, speakingBodyPosY, speakingBlend) * bodyScale,
      energy: clamp(state.arousal + state.mouthEnergy * 0.3, 0, 1)
    };
    return smoothCharacterPose(state, rawPose, deltaMs);
  }

  return {
    sample,
    setMode,
    onRoomAct,
    onMouth,
    onExternalState,
    getState: () => ({ ...state })
  };
}
