import { normalizeBehaviorBodyPose } from '../../constants/room/behaviorActionRegistry';
import { getRoomLive2DPerformanceBrain } from './live2dPerformanceBrain';
import { readJson } from './roomStorage';

const ROOM_ACT_EVENT = 'tsukuyomi:room-act';
const STAGE_ACTUATOR_STATE_KEY = '__TSUKUYOMI_LIVE2D_STAGE_BODY_ACTUATOR_STATE__';
const DEFAULT_STAGE_MOTION_SCALE = 1.16;
const DEFAULT_STAGE_IDLE_SCALE = 1.18;
const STAGE_MOTION_FADE_OUT_MS = 620;
const STAGE_MOTION_RELEASE_PROGRESS = 0.86;
const STAGE_FRAME_INTERVAL_MS = 1000 / 60;
const STAGE_STATE_INTERVAL_MS = 250;
const STAGE_POSE_MAX_STEP = {
  x: 12,
  y: 7.8,
  rotate: 1.12,
  scale: 0.01
};
const STAGE_LERP_PROFILES = {
  idle: {
    x: 350,
    y: 430,
    rotate: 420,
    scale: 500
  },
  motion: {
    x: 285,
    y: 365,
    rotate: 360,
    scale: 440
  }
};
const BODY_PARAMETER_HINTS = [
  'ParamBodyInput_BodyX',
  'ParamBodyInput_BodyY',
  'ParamBodyInput_BodyZ',
  'ParamOutput_BodyX',
  'ParamOutput_BodyY',
  'ParamOutput_BodyZ',
  'ParamPhysicsRAM_BodyX',
  'ParamPhysicsRAM_BodyY',
  'ParamPhysicsRAM_BodyZ',
  'ParamPhysicsRAM_ChestZ',
  'ParamPhysicsRAM_HipZ',
  'ParamAngle_BodyX',
  'ParamAngle_BodyX2',
  'ParamAngle_BodyX3',
  'ParamAngle_BodyY',
  'ParamAngle_BodyY2',
  'ParamAngle_BodyZ',
  'ParamAngle_BodyZ2',
  'ParamAngle_ChestZ',
  'ParamAngle_HipZ',
  'ParamAngle_ShoulderL',
  'ParamAngle_ShoulderR',
  'ParamAngle_HipUp',
  'ParamAngle_HipDown',
  'ParamBodyAngleX',
  'ParamBodyAngleY',
  'ParamBodyAngleZ',
  'PositionZ',
  'ParamPosition_Z'
];

let lastStageActuatorStateAt = 0;

const BODY_POSES = new Set([
  'nod',
  'shake_head',
  'lean_in',
  'lean_left',
  'lean_right',
  'sway',
  'bounce',
  'emphasis'
]);

const DEFAULT_ROOM_MODEL_SETTINGS = {
  stageFloatEnabled: true,
  stageIdleScale: DEFAULT_STAGE_IDLE_SCALE,
  stageMotionScale: DEFAULT_STAGE_MOTION_SCALE,
  stageVerticalOffset: 0
};

const PARAMETER_WEIGHTS = {
  x: new Set([
    'parambodyinput_bodyx',
    'paramoutput_bodyx',
    'paramphysicsram_bodyx',
    'paramangle_bodyx',
    'paramangle_bodyx2',
    'paramangle_bodyx3',
    'parambodyanglex'
  ]),
  y: new Set([
    'parambodyinput_bodyy',
    'paramoutput_bodyy',
    'paramphysicsram_bodyy',
    'paramangle_bodyy',
    'paramangle_bodyy2',
    'paramangle_hipup',
    'paramangle_hipdown',
    'parambodyangley',
    'positionz',
    'paramposition_z'
  ]),
  z: new Set([
    'parambodyinput_bodyz',
    'paramoutput_bodyz',
    'paramphysicsram_bodyz',
    'paramphysicsram_chestz',
    'paramphysicsram_hipz',
    'paramangle_bodyz',
    'paramangle_bodyz2',
    'paramangle_chestz',
    'paramangle_hipz',
    'paramangle_shoulderl',
    'paramangle_shoulderr',
    'parambodyanglez',
    'paramanglez'
  ])
};

function clamp(value, min, max, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
}

function lerp(left, right, t) {
  return left + (right - left) * clamp(t, 0, 1);
}

function characterSpeakingBlend(character) {
  return clamp(character?.speakingBlend ?? (character?.mode === 'speaking' ? 1 : 0), 0, 1, 0);
}

function emptyStagePose() {
  return { x: 0, y: 0, rotate: 0, scale: 1 };
}

function normalizePose(value) {
  return normalizeBehaviorBodyPose(value);
}

function normalizeDuration(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 2200;
  return Math.min(Math.max(Math.round(numeric), 650), 8000);
}

function readModelStageSettings() {
  try {
    return {
      ...DEFAULT_ROOM_MODEL_SETTINGS,
      ...readJson('roomModelSettings', {})
    };
  } catch (_) {
    return DEFAULT_ROOM_MODEL_SETTINGS;
  }
}

function readStageMotionScale(settings = readModelStageSettings()) {
  if (typeof window === 'undefined') return DEFAULT_STAGE_MOTION_SCALE;
  if (Number.isFinite(Number(settings.stageMotionScale))) {
    return clamp(settings.stageMotionScale, 0, 3);
  }
  const globalValue = Number(window.TSUKUYOMI_LIVE2D_STAGE_MOTION_SCALE);
  if (Number.isFinite(globalValue)) return clamp(globalValue, 0, 3);
  try {
    const stored = Number(window.localStorage?.getItem('roomLive2DStageMotionScale'));
    if (Number.isFinite(stored)) return clamp(stored, 0, 3);
  } catch (_) {
    // ignore storage failures in WebView privacy modes
  }
  return DEFAULT_STAGE_MOTION_SCALE;
}

function readStageIdleScale(settings = readModelStageSettings()) {
  if (typeof window === 'undefined') return DEFAULT_STAGE_IDLE_SCALE;
  if (Number.isFinite(Number(settings.stageIdleScale))) {
    return clamp(settings.stageIdleScale, 0, 3);
  }
  const globalValue = Number(window.TSUKUYOMI_LIVE2D_STAGE_IDLE_SCALE);
  if (Number.isFinite(globalValue)) return clamp(globalValue, 0, 3);
  try {
    const stored = Number(window.localStorage?.getItem('roomLive2DStageIdleScale'));
    if (Number.isFinite(stored)) return clamp(stored, 0, 3);
  } catch (_) {
    // ignore storage failures in WebView privacy modes
  }
  return DEFAULT_STAGE_IDLE_SCALE;
}

function readStageVerticalOffset(settings = readModelStageSettings()) {
  return clamp(settings.stageVerticalOffset, -180, 180, 0);
}

function readStageFloatEnabled(settings = readModelStageSettings()) {
  return settings.stageFloatEnabled !== false;
}

function easeInOut(value) {
  const t = clamp(value, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function envelope(progress) {
  const t = clamp(progress, 0, 1);
  if (t < 0.18) return easeInOut(t / 0.18);
  if (t > 0.84) return easeInOut((1 - t) / 0.16);
  return 1;
}

function pulse(progress, cycles = 1) {
  return Math.sin(clamp(progress, 0, 1) * Math.PI * cycles);
}

function absPulse(progress, cycles = 1) {
  return Math.abs(pulse(progress, cycles));
}

function parameterAxes(parameters) {
  const axes = { x: 0, y: 0, z: 0, max: 0, count: 0 };
  for (const item of Array.isArray(parameters) ? parameters : []) {
    const id = String(item?.id || item?.parameterId || item?.param || '').trim();
    const key = id.toLowerCase();
    const value = Number(item?.value);
    if (!id || !Number.isFinite(value)) continue;
    if (!BODY_PARAMETER_HINTS.some((hint) => hint.toLowerCase() === key)) continue;
    const weighted = value * clamp(item?.weight ?? 0.85, 0.15, 1);
    if (PARAMETER_WEIGHTS.x.has(key)) axes.x += weighted;
    if (PARAMETER_WEIGHTS.y.has(key)) axes.y += weighted;
    if (PARAMETER_WEIGHTS.z.has(key)) axes.z += weighted;
    axes.max = Math.max(axes.max, Math.abs(weighted));
    axes.count += 1;
  }
  return axes;
}

function inferPoseFromParameters(parameters) {
  const axes = parameterAxes(parameters);
  if (axes.count < 2 || axes.max < 3.5) return null;
  const x = axes.x / Math.max(axes.count, 1);
  const y = axes.y / Math.max(axes.count, 1);
  const z = axes.z / Math.max(axes.count, 1);
  const intensity = clamp(axes.max / 22, 0.58, 1);
  if (Math.abs(z) >= Math.abs(x) && Math.abs(z) >= Math.abs(y) && Math.abs(z) > 1.2) {
    return {
      pose: z < 0 ? 'lean_left' : 'lean_right',
      intensity,
      source: 'parameters'
    };
  }
  if (Math.abs(x) >= Math.abs(y) && Math.abs(x) > 1.2) {
    return {
      pose: Math.abs(x) > 4 ? 'sway' : (x < 0 ? 'lean_left' : 'lean_right'),
      intensity,
      source: 'parameters'
    };
  }
  if (Math.abs(y) > 1.2) {
    return {
      pose: y > 0 ? 'bounce' : 'lean_in',
      intensity,
      source: 'parameters'
    };
  }
  return null;
}

function resolvePoseFromBehaviorActions(detail = {}) {
  const actions = Array.isArray(detail.behaviorActions)
    ? detail.behaviorActions
    : (Array.isArray(detail.actions) ? detail.actions : []);
  for (const action of actions) {
    const pose = normalizePose(action?.type || action?.motion || action?.pose || action?.action);
    if (pose && BODY_POSES.has(pose)) {
      return {
        pose,
        intensity: clamp(action?.intensity ?? detail.intensity, 0.5, 1, 0.68),
        durationMs: normalizeDuration(action?.durationMs || action?.duration || detail.durationMs || detail.duration),
        source: 'behaviorActions'
      };
    }
  }
  return null;
}

export function resolveLive2DStageMotion(detail = {}) {
  const actionMotion = resolvePoseFromBehaviorActions(detail);
  const explicitPose = normalizePose(detail.bodyPose || detail.pose || detail.posture || detail.motion || detail.action);
  const inferred = explicitPose || actionMotion ? null : inferPoseFromParameters(detail.parameters || detail.parameterTargets || detail.params);
  const pose = explicitPose || actionMotion?.pose || inferred?.pose || '';
  if (!pose) return null;
  const intensity = clamp(Math.max(Number(detail.intensity) || 0, actionMotion?.intensity || 0, inferred?.intensity || 0.62), 0.5, 1);
  return {
    pose,
    intensity,
    durationMs: normalizeDuration(actionMotion?.durationMs || detail.durationMs || detail.duration),
    source: explicitPose ? 'pose' : (actionMotion?.source || inferred.source)
  };
}

export function sampleLive2DStagePose(motion, progress, scale = DEFAULT_STAGE_MOTION_SCALE) {
  if (!motion) return emptyStagePose();
  const t = clamp(progress, 0, 1);
  const e = envelope(t) * clamp(motion.intensity, 0.5, 1) * clamp(scale, 0, 2.4);
  const fast = Math.sin(t * Math.PI * 4);
  const slow = Math.sin(t * Math.PI * 2);
  const beat = absPulse(t, 2);

  switch (motion.pose) {
    case 'nod':
      return {
        x: 0,
        y: 2.6 * beat * e,
        rotate: -0.22 * fast * e,
        scale: 1 + 0.002 * beat * e
      };
    case 'shake_head':
      return {
        x: 20 * fast * e,
        y: 0.8 * beat * e,
        rotate: 2.2 * fast * e,
        scale: 1
      };
    case 'lean_in':
      return {
        x: 0,
        y: -8 * e,
        rotate: 0.28 * slow * e,
        scale: 1 + 0.015 * e
      };
    case 'lean_left':
      return {
        x: -36 * e,
        y: 2 * e,
        rotate: -2.7 * e,
        scale: 1 + 0.005 * e
      };
    case 'lean_right':
      return {
        x: 36 * e,
        y: 2 * e,
        rotate: 2.7 * e,
        scale: 1 + 0.005 * e
      };
    case 'sway':
      return {
        x: 34 * slow * e,
        y: 1.4 * absPulse(t, 2) * e,
        rotate: 2.1 * slow * e,
        scale: 1 + 0.003 * Math.abs(slow) * e
      };
    case 'bounce':
      return {
        x: 5 * slow * e,
        y: -11 * beat * e,
        rotate: 0.58 * slow * e,
        scale: 1 + 0.009 * beat * e
      };
    case 'emphasis':
      return {
        x: 11 * slow * e,
        y: -7 * absPulse(t, 1) * e,
        rotate: -1.2 * slow * e,
        scale: 1 + 0.012 * absPulse(t, 1) * e
      };
    default:
      return emptyStagePose();
  }
}

export function sampleLive2DIdleStagePose(nowMs = performance.now(), scale = DEFAULT_STAGE_IDLE_SCALE) {
  const amount = clamp(scale, 0, 2.4);
  if (amount <= 0) return { x: 0, y: 0, rotate: 0, scale: 1 };
  const seconds = nowMs / 1000;
  const slow = Math.sin(seconds * 1.04);
  const drift = Math.sin(seconds * 0.47 + 1.35);
  const side = Math.sin(seconds * 0.36 + 0.8);
  return {
    x: 9.5 * side * amount,
    y: (9.5 * slow + 3.2 * drift) * amount,
    rotate: 0.22 * Math.sin(seconds * 0.43 + 2.1) * amount,
    scale: 1 + 0.003 * Math.sin(seconds * 0.72 + 0.4) * amount
  };
}

function stagePoseFromBehaviorActionType(type, sign = 1) {
  const pose = normalizePose(type);
  if (pose) return pose;
  if (type === 'head_tilt') return sign < 0 ? 'lean_left' : 'lean_right';
  if (type === 'look_at_chat' || type === 'dress_sway') return 'sway';
  if (type === 'smile' || type === 'ear_perk' || type === 'ear_wiggle' || type === 'wing_flutter') return 'bounce';
  if (type === 'smirk' || type === 'lean') return sign < 0 ? 'lean_left' : 'lean_right';
  return '';
}

function sampleBehaviorStagePose(sample, dominantSample, scale = DEFAULT_STAGE_MOTION_SCALE) {
  if (!sample?.action) return emptyStagePose();
  const sign = Number(sample.sign) || Number(sample.action?.sign) || 1;
  const pose = stagePoseFromBehaviorActionType(sample.action.type, sign);
  if (!pose || !BODY_POSES.has(pose)) return emptyStagePose();
  const dominant = sample === dominantSample;
  const actionScale = dominant ? 0.78 : 0.42;
  return scaleCanvasPose(
    sampleLive2DStagePose({
      pose,
      intensity: clamp(sample.intensity ?? sample.action.intensity, 0.42, 1, 0.64)
    }, sample.progress, scale),
    actionScale
  );
}

function sampleCharacterStagePose(character, now, scale = DEFAULT_STAGE_MOTION_SCALE) {
  if (!character) return emptyStagePose();
  const speakingBlend = characterSpeakingBlend(character);
  const acting = character.mode === 'acting';
  const activeBlend = Math.max(speakingBlend, acting ? 1 : 0);
  const amount = clamp(scale, 0, 2.4) * lerp(0.34, 0.82, activeBlend);
  const seconds = now / 1000;
  const slowFloat = Math.sin(seconds * 0.76 + 0.8);
  const x = (
    (Number(character.bodyPosX) || 0) * 78 +
    (Number(character.facePosX) || 0) * 0.62 +
    (Number(character.bodyZ) || 0) * 0.56
  ) * amount;
  const speakingY = ((Number(character.bodyPosY) || 0) * -12 + slowFloat * 1.4) * amount;
  const idleY = ((Number(character.bodyPosY) || 0) * -34 + (Number(character.bodyY) || 0) * 0.09 + slowFloat * 1.2) * amount;
  const y = lerp(idleY, speakingY, speakingBlend);
  const rotate = (
    (Number(character.bodyZ) || 0) * 0.12 +
    (Number(character.faceZ) || 0) * 0.035
  ) * amount;
  return {
    x: clamp(x, -38, 38),
    y: clamp(y, -16, 16),
    rotate: clamp(rotate, -2.4, 2.4),
    scale: 1 + clamp((Number(character.energy) || 0) * lerp(0.0015, 0.003, activeBlend), 0, 0.005)
  };
}

function samplePerformanceStagePose(performanceFrame, now, scale = DEFAULT_STAGE_MOTION_SCALE) {
  if (!performanceFrame) return emptyStagePose();
  let pose = sampleCharacterStagePose(performanceFrame.character, now, scale);
  for (const sample of Array.isArray(performanceFrame.samples) ? performanceFrame.samples : []) {
    pose = combineCanvasPoses(pose, sampleBehaviorStagePose(sample, performanceFrame.dominant, scale));
  }
  return pose;
}

function scaleCanvasPose(pose, amount) {
  const factor = clamp(amount, 0, 1, 1);
  return {
    x: (pose?.x || 0) * factor,
    y: (pose?.y || 0) * factor,
    rotate: (pose?.rotate || 0) * factor,
    scale: 1 + ((pose?.scale || 1) - 1) * factor
  };
}

function lerpAmount(deltaMs, responseMs) {
  return 1 - Math.exp(-Math.max(deltaMs, 1) / Math.max(responseMs, 1));
}

function smoothStageAxis(previous, target, maxStep, deltaMs, responseMs) {
  const deltaSeconds = clamp(deltaMs / 1000, 0.008, 0.05, 0.016);
  const rawStep = (target - previous) * lerpAmount(deltaMs, responseMs);
  const step = clamp(rawStep, -maxStep, maxStep, 0);
  const nextValue = previous + step;
  if (Math.abs(target - nextValue) < 0.01 && Math.abs(step) < 0.005) {
    return { value: target, velocity: 0 };
  }
  return { value: nextValue, velocity: step / deltaSeconds };
}

function smoothCanvasPose(previous, target, velocity, deltaMs = 1000 / 60, profile = STAGE_LERP_PROFILES.motion) {
  if (!previous) return target;
  const x = smoothStageAxis(previous.x || 0, target.x || 0, STAGE_POSE_MAX_STEP.x, deltaMs, profile.x);
  const y = smoothStageAxis(previous.y || 0, target.y || 0, STAGE_POSE_MAX_STEP.y, deltaMs, profile.y);
  const rotate = smoothStageAxis(previous.rotate || 0, target.rotate || 0, STAGE_POSE_MAX_STEP.rotate, deltaMs, profile.rotate);
  const scale = smoothStageAxis(previous.scale || 1, target.scale || 1, STAGE_POSE_MAX_STEP.scale, deltaMs, profile.scale);
  velocity.x = x.velocity;
  velocity.y = y.velocity;
  velocity.rotate = rotate.velocity;
  velocity.scale = scale.velocity;
  return {
    x: x.value,
    y: y.value,
    rotate: rotate.value,
    scale: scale.value
  };
}

function combineCanvasPoses(base, overlay) {
  return {
    x: (base?.x || 0) + (overlay?.x || 0),
    y: (base?.y || 0) + (overlay?.y || 0),
    rotate: (base?.rotate || 0) + (overlay?.rotate || 0),
    scale: (base?.scale || 1) * (overlay?.scale || 1)
  };
}

function clampCanvasPose(pose) {
  return {
    x: clamp(pose?.x || 0, -92, 92, 0),
    y: clamp(pose?.y || 0, -58, 58, 0),
    rotate: clamp(pose?.rotate || 0, -8, 8, 0),
    scale: clamp(pose?.scale || 1, 0.92, 1.08, 1)
  };
}

function selectStageLerpProfile(performanceFrame, activeMotion, outgoingMotion) {
  if (performanceFrame?.behaviorPlan || activeMotion || outgoingMotion) return STAGE_LERP_PROFILES.motion;
  const character = performanceFrame?.character;
  const mode = character?.mode;
  return characterSpeakingBlend(character) > 0.05 || mode === 'speaking' || mode === 'acting'
    ? STAGE_LERP_PROFILES.motion
    : STAGE_LERP_PROFILES.idle;
}

function setStageActuatorState(patch) {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (patch.pose && now - lastStageActuatorStateAt < STAGE_STATE_INTERVAL_MS) return;
  if (patch.pose) lastStageActuatorStateAt = now;
  window[STAGE_ACTUATOR_STATE_KEY] = {
    ...(window[STAGE_ACTUATOR_STATE_KEY] || {}),
    ...patch,
    updatedAt: Date.now()
  };
}

function findLive2DContainer(containerSelector) {
  const container = typeof containerSelector === 'string'
    ? document.querySelector(containerSelector)
    : containerSelector;
  return container || null;
}

function findLive2DCanvas(containerSelector) {
  const container = findLive2DContainer(containerSelector);
  return container?.querySelector?.('canvas') || null;
}

function applyModelContainerPose(container, pose, lastContainerTransform = '') {
  if (!container) return { applied: false, transform: '' };
  const containerTransform = [
    `translate3d(calc(-50% + ${pose.x.toFixed(2)}px), ${pose.y.toFixed(2)}px, 0)`,
    `rotate(${pose.rotate.toFixed(3)}deg)`,
    `scale(${pose.scale.toFixed(4)})`
  ].join(' ');
  if (containerTransform !== lastContainerTransform) {
    container.style.transform = containerTransform;
  }
  setStageActuatorState({
    mounted: true,
    output: 'model-container-transform',
    pose: {
      x: Number(pose.x.toFixed(2)),
      y: Number(pose.y.toFixed(2)),
      rotate: Number(pose.rotate.toFixed(3)),
      scale: Number(pose.scale.toFixed(4))
    }
  });
  return { applied: true, transform: containerTransform };
}

function applyCanvasPose(canvas, pose, lastCanvasTransform = '') {
  if (!canvas) return '';
  const canvasTransform = `translate3d(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px, 0) rotate(${pose.rotate.toFixed(3)}deg) scale(${pose.scale.toFixed(4)})`;
  if (canvasTransform !== lastCanvasTransform) {
    canvas.style.transform = canvasTransform;
  }
  setStageActuatorState({
    mounted: true,
    output: 'canvas-transform-fallback',
    pose: {
      x: Number(pose.x.toFixed(2)),
      y: Number(pose.y.toFixed(2)),
      rotate: Number(pose.rotate.toFixed(3)),
      scale: Number(pose.scale.toFixed(4))
    }
  });
  return canvasTransform;
}

function clearCanvasPose(canvas) {
  if (!canvas) return;
  canvas.style.transform = '';
  canvas.style.willChange = '';
}

function clearContainerPose(container) {
  if (!container) return;
  container.style.transform = '';
  container.style.willChange = '';
  container.style.removeProperty('--live2d-stage-x');
  container.style.removeProperty('--live2d-stage-y');
  container.style.removeProperty('--live2d-stage-rotate');
  container.style.removeProperty('--live2d-stage-scale');
}

function clearRuntimeStagePose() {
  if (typeof window !== 'undefined' && typeof window.setLive2DModelSettings === 'function') {
    window.setLive2DModelSettings(1, 0, 0);
  }
}

function prepareModelContainer(container) {
  if (!container) return;
  container.style.transformOrigin = '50% 84%';
  container.style.willChange = 'transform';
}

function prepareCanvas(canvas) {
  if (!canvas) return;
  canvas.style.transformOrigin = '50% 72%';
  canvas.style.willChange = 'transform';
}

export function mountLive2DStageBodyActuator(containerSelector = '#live2d-container', options = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  const externallyDriven = Boolean(options.externallyDriven);
  let activeMotion = null;
  let outgoingMotion = null;
  let startMs = 0;
  let frameId = 0;
  let lastCanvas = null;
  let lastContainer = null;
  let lastPose = null;
  let lastPoseVelocity = { x: 0, y: 0, rotate: 0, scale: 0 };
  let lastRenderAt = 0;
  let preparedContainer = null;
  let preparedCanvas = null;
  let usingContainerPose = false;
  let lastContainerTransform = '';
  let lastCanvasTransform = '';
  const performanceBrain = getRoomLive2DPerformanceBrain();
  const stageSettings = readModelStageSettings();
  const stageMotionScale = readStageMotionScale(stageSettings);
  const stageIdleScale = readStageIdleScale(stageSettings);
  const stageVerticalOffset = readStageVerticalOffset(stageSettings);
  const stageFloatEnabled = readStageFloatEnabled(stageSettings);

  function stopFrame() {
    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = 0;
  }

  function releaseActiveMotion(now, progress, fadeOutMs = STAGE_MOTION_FADE_OUT_MS) {
    if (!activeMotion) return;
    const progressAtRelease = clamp(progress, 0, 1, 0);
    outgoingMotion = {
      ...activeMotion,
      releasedAt: now,
      progressAtRelease,
      fadeOutMs,
      releasedPose: sampleLive2DStagePose(activeMotion, progressAtRelease, stageMotionScale)
    };
    activeMotion = null;
  }

  function render(now = performance.now()) {
    if (!externallyDriven) frameId = window.requestAnimationFrame(render);
    if (document.visibilityState === 'hidden') {
      lastRenderAt = 0;
      return;
    }
    const frameElapsed = lastRenderAt ? now - lastRenderAt : STAGE_FRAME_INTERVAL_MS;
    if (frameElapsed < STAGE_FRAME_INTERVAL_MS - 1) return;
    const deltaMs = lastRenderAt ? Math.min(Math.max(now - lastRenderAt, 8), 64) : 1000 / 60;
    lastRenderAt = frameElapsed >= STAGE_FRAME_INTERVAL_MS
      ? now - (frameElapsed % STAGE_FRAME_INTERVAL_MS)
      : now;
    const container = lastContainer?.isConnected
      ? lastContainer
      : findLive2DContainer(containerSelector);
    const canvas = lastCanvas?.isConnected && (!container || container.contains(lastCanvas))
      ? lastCanvas
      : container?.querySelector?.('canvas') || null;
    lastContainer = container || lastContainer;
    lastCanvas = canvas || lastCanvas;
    if (container && preparedContainer !== container) {
      prepareModelContainer(container);
      preparedContainer = container;
      lastContainerTransform = '';
    }
    if (canvas && preparedCanvas !== canvas) {
      prepareCanvas(canvas);
      preparedCanvas = canvas;
      lastCanvasTransform = '';
    }
    let pose = stageFloatEnabled
      ? sampleLive2DIdleStagePose(now, stageIdleScale)
      : emptyStagePose();
    const performanceFrame = performanceBrain.sample(now, { intensityScale: 1.62 });
    if (stageFloatEnabled) {
      pose = combineCanvasPoses(pose, samplePerformanceStagePose(performanceFrame, now, stageMotionScale));
    }
    const planDrivenMotion = Boolean(performanceFrame?.behaviorPlan);
    if (stageFloatEnabled && outgoingMotion && !planDrivenMotion) {
      const age = now - outgoingMotion.releasedAt;
      const fade = 1 - clamp(age / outgoingMotion.fadeOutMs, 0, 1, 1);
      if (fade <= 0.001) {
        outgoingMotion = null;
      } else {
        const progress = outgoingMotion.progressAtRelease + age / outgoingMotion.durationMs;
        const trailingPose = outgoingMotion.releasedPose ||
          sampleLive2DStagePose(outgoingMotion, progress, stageMotionScale);
        pose = combineCanvasPoses(
          pose,
          scaleCanvasPose(trailingPose, fade)
        );
      }
    }
    if (stageFloatEnabled && activeMotion && !planDrivenMotion) {
      const rawProgress = (now - startMs) / activeMotion.durationMs;
      const progress = clamp(rawProgress, 0, 1, 0);
      pose = combineCanvasPoses(pose, sampleLive2DStagePose(activeMotion, progress, stageMotionScale));
      if (rawProgress >= STAGE_MOTION_RELEASE_PROGRESS) {
        releaseActiveMotion(now, progress);
      }
    }
    pose = {
      ...pose,
      y: pose.y + stageVerticalOffset
    };
    pose = clampCanvasPose(pose);
    lastPose = smoothCanvasPose(
      lastPose,
      pose,
      lastPoseVelocity,
      deltaMs,
      selectStageLerpProfile(performanceFrame, activeMotion, outgoingMotion)
    );
    if (container) {
      if (!usingContainerPose) clearCanvasPose(canvas);
      const result = applyModelContainerPose(container, lastPose, lastContainerTransform);
      usingContainerPose = result.applied;
      lastContainerTransform = result.transform;
      lastCanvasTransform = '';
    } else {
      lastCanvasTransform = applyCanvasPose(canvas, lastPose, lastCanvasTransform);
      lastContainerTransform = '';
      usingContainerPose = false;
    }
  }

  function renderExternalFrame(_performanceFrame, now = performance.now()) {
    render(now);
  }

  function startMotion(motion) {
    const now = performance.now();
    if (activeMotion) {
      releaseActiveMotion(now, (now - startMs) / activeMotion.durationMs);
    }
    activeMotion = motion;
    startMs = now;
    stopFrame();
    if (!externallyDriven) frameId = window.requestAnimationFrame(render);
  }

  function onRoomAct(event) {
    const motion = resolveLive2DStageMotion(event.detail || {});
    if (motion) startMotion(motion);
  }

  window.addEventListener(ROOM_ACT_EVENT, onRoomAct);
  if (!externallyDriven) frameId = window.requestAnimationFrame(render);

  const cleanup = () => {
    window.removeEventListener(ROOM_ACT_EVENT, onRoomAct);
    activeMotion = null;
    outgoingMotion = null;
    lastPose = null;
    lastPoseVelocity = { x: 0, y: 0, rotate: 0, scale: 0 };
    lastRenderAt = 0;
    stopFrame();
    clearRuntimeStagePose();
    clearContainerPose(lastContainer || findLive2DContainer(containerSelector));
    clearCanvasPose(lastCanvas || findLive2DCanvas(containerSelector));
    lastContainer = null;
    lastCanvas = null;
    preparedContainer = null;
    preparedCanvas = null;
    usingContainerPose = false;
    lastContainerTransform = '';
    lastCanvasTransform = '';
    lastStageActuatorStateAt = 0;
    setStageActuatorState({ mounted: false, output: 'destroyed' });
  };
  cleanup.renderFrame = renderExternalFrame;
  return cleanup;
}
