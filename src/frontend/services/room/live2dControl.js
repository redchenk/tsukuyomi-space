import { roomLive2DManifest } from '../../constants/room/live2dManifest';
import {
  matchBehaviorActionsFromText,
  matchBehaviorBodyPoseFromText,
  normalizeBehaviorBodyPose,
  semanticActionPromptCatalog
} from '../../constants/room/behaviorActionRegistry';
import { normalizeBehaviorActions } from './live2dBehaviorController';
import {
  normalizeSemanticExpressionId,
  semanticExpressionBehaviorActions,
  semanticExpressionFromEmotion
} from '../../constants/room/yachiyoExpressionPresetRegistry';
import {
  appendRoomLive2DDebugEvent,
  publishRoomLive2DDebugState,
  readRoomLive2DDebugState as readSharedRoomLive2DDebugState
} from './live2dDebug';

export const ROOM_LIVE2D_PENDING_INTENT_KEY = 'roomLive2DPendingIntent';

let activeQueueTimers = [];

const motionAliases = {
  tap_body: 'tap_body',
  body_tap: 'tap_body',
  tapbody: 'tap_body',
  nod: 'tap_body',
  lean: 'tap_body',
  emphasis: 'tap_body'
};

const bodyPoseAliases = {
  none: '',
  null: '',
  tap_body: 'emphasis',
  body_tap: 'emphasis',
  tapbody: 'emphasis',
  nod: 'nod',
  agree: 'nod',
  yes: 'nod',
  shake: 'shake_head',
  shake_head: 'shake_head',
  no: 'shake_head',
  lean: 'lean_in',
  lean_in: 'lean_in',
  forward: 'lean_in',
  close: 'lean_in',
  lean_left: 'lean_left',
  left: 'lean_left',
  lean_right: 'lean_right',
  right: 'lean_right',
  sway: 'sway',
  bounce: 'bounce',
  excited: 'bounce',
  emphasis: 'emphasis',
  accent: 'emphasis'
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

function normalizeDelay(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(Math.max(Math.round(numeric), 0), 12000);
}

function normalizeParameterDuration(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 900;
  return Math.min(Math.max(Math.round(numeric), 250), 12000);
}

function readDebugState() {
  return readSharedRoomLive2DDebugState();
}

function writeDebugState(patch) {
  publishRoomLive2DDebugState(patch);
}

function appendDebugHistory(entry) {
  appendRoomLive2DDebugEvent(entry.source || 'dispatch', entry);
}

export function normalizeLive2DExpression(value, manifest = roomLive2DManifest) {
  const ids = manifestIds(manifest.expressions);
  const key = normalizeToken(value);
  const aliased = normalizeSemanticExpressionId(key) || key;
  return ids.has(aliased) ? aliased : '';
}

export function normalizeLive2DMotion(value, manifest = roomLive2DManifest) {
  const ids = manifestIds(manifest.motions);
  const key = normalizeToken(value);
  if (!key || key === 'none' || key === 'null') return '';
  const aliased = motionAliases[key] || key;
  return ids.has(aliased) ? aliased : '';
}

export function normalizeLive2DBodyPose(value, manifest = roomLive2DManifest) {
  const ids = manifestIds(manifest.motions);
  const normalized = normalizeBehaviorBodyPose(value);
  return normalized && ids.has(normalized) ? normalized : '';
}

function manifestParameterMap(manifest = roomLive2DManifest) {
  return new Map((manifest.parameterControls || []).map((item) => [String(item.id || '').trim().toLowerCase(), item]));
}

function normalizeLive2DParameterTargets(value, manifest = roomLive2DManifest) {
  const controlMap = manifestParameterMap(manifest);
  const rawTargets = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value).map(([id, target]) => (target && typeof target === 'object' ? { id, ...target } : { id, value: target }))
      : [];

  const merged = [];
  for (const target of rawTargets) {
    const key = String(target?.id || target?.parameterId || target?.param || target?.key || target?.name || '').trim().toLowerCase();
    const control = key ? controlMap.get(key) : null;
    if (!control) continue;
    const numericValue = Number(target?.value ?? target?.target ?? target?.amount ?? target?.to);
    if (!Number.isFinite(numericValue)) continue;
    const min = Number.isFinite(Number(control.min)) ? Number(control.min) : -1;
    const max = Number.isFinite(Number(control.max)) ? Number(control.max) : 1;
    merged.push({
      id: control.id,
      value: Math.min(Math.max(numericValue, min), max),
      weight: clamp01(target?.weight, 0.85),
      durationMs: normalizeParameterDuration(target?.durationMs || target?.duration || target?.timeMs || target?.time),
      delayMs: normalizeDelay(target?.delayMs || target?.delay || target?.offsetMs)
    });
  }

  return merged.slice(0, 18);
}

export function normalizeLive2DEmotion(value, manifest = roomLive2DManifest) {
  const aliased = semanticExpressionFromEmotion(value);
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

function bodyPoseScale(intensity) {
  return 1.1 + clamp01(intensity, 0.92) * 1.9;
}

function poseParameter(id, value, weight, durationMs, delayMs = 0) {
  return {
    id,
    value,
    weight,
    durationMs,
    delayMs
  };
}

const BODY_SWITCH_PARAMETER_IDS = [
  'ParamSwitchCtrl_BodyX',
  'ParamSwitchCtrl_BodyY',
  'ParamSwitchCtrl_BodyZ',
  'ParamSwitchCtrl_ChestZ',
  'ParamSwitchCtrl_HipZ'
];

function bodyPoseParameterTargets(bodyPose, intensity, durationMs, manifest) {
  const scale = bodyPoseScale(intensity);
  const baseDuration = Math.min(Math.max(Math.round(durationMs * 0.78), 750), 3200);
  const longDuration = Math.min(Math.max(Math.round(durationMs * 1.02), 1100), 5200);
  const subtleBreath = Math.min(1, 0.42 + scale * 0.22);
  const rawTargets = {
    nod: [
      poseParameter('ParamAngleY', 8 * scale, 0.84, baseDuration),
      poseParameter('ParamBodyAngleY', 3.8 * scale, 0.8, longDuration),
      poseParameter('ParamBodyInput_BodyY', 8.5 * scale, 0.88, longDuration),
      poseParameter('ParamOutput_BodyY', 6.8 * scale, 0.82, longDuration),
      poseParameter('ParamPhysicsRAM_BodyY', 7.2 * scale, 0.82, longDuration),
      poseParameter('ParamAngle_BodyY', 5.8 * scale, 0.82, longDuration),
      poseParameter('ParamAngle_BodyY2', 4.2 * scale, 0.68, longDuration),
      poseParameter('ParamAngle_HipUp', 3.6 * scale, 0.58, baseDuration),
      poseParameter('ParamHairFront', -3.4 * scale, 0.42, longDuration),
      poseParameter('ParamHairBack', 2.4 * scale, 0.34, longDuration),
      poseParameter('ParamBreath', subtleBreath, 0.44, longDuration),
      poseParameter('ParamBreath2', subtleBreath, 0.36, longDuration),
      poseParameter('ParamBreath3', Math.max(0.38, subtleBreath - 0.08), 0.32, longDuration)
    ],
    shake_head: [
      poseParameter('ParamAngleX', -9.5 * scale, 0.82, baseDuration),
      poseParameter('ParamAngleZ', 2.8 * scale, 0.5, baseDuration),
      poseParameter('ParamBodyAngleX', -3.2 * scale, 0.72, longDuration),
      poseParameter('ParamBodyInput_BodyX', -8.5 * scale, 0.88, longDuration),
      poseParameter('ParamOutput_BodyX', -6.8 * scale, 0.82, longDuration),
      poseParameter('ParamPhysicsRAM_BodyX', -7.4 * scale, 0.82, longDuration),
      poseParameter('ParamAngle_BodyX', -6.2 * scale, 0.82, longDuration),
      poseParameter('ParamAngle_BodyX2', -4.6 * scale, 0.68, longDuration),
      poseParameter('ParamAngle_BodyX3', -3.4 * scale, 0.56, longDuration),
      poseParameter('ParamHairSide', 4.6 * scale, 0.46, longDuration),
      poseParameter('ParamHairBack', -3.2 * scale, 0.38, longDuration),
      poseParameter('ParamEyeBallX', -0.26 * scale, 0.48, baseDuration)
    ],
    lean_in: [
      poseParameter('ParamAngleY', -5.4 * scale, 0.68, baseDuration),
      poseParameter('ParamBodyAngleY', 1.6 * scale, 0.58, longDuration),
      poseParameter('PositionZ', -2.2 * scale, 0.52, longDuration),
      poseParameter('ParamPosition_Z', -1.6 * scale, 0.46, longDuration),
      poseParameter('ParamBodyInput_BodyY', 3.2 * scale, 0.66, longDuration),
      poseParameter('ParamOutput_BodyY', 2.5 * scale, 0.58, longDuration),
      poseParameter('ParamPhysicsRAM_BodyY', 2.8 * scale, 0.58, longDuration),
      poseParameter('ParamAngle_BodyY', 2.1 * scale, 0.56, longDuration),
      poseParameter('ParamAngle_BodyY2', 1.4 * scale, 0.46, longDuration),
      poseParameter('ParamAngle_HipUp', 1.4 * scale, 0.38, baseDuration),
      poseParameter('ParamHairFront', -2.4 * scale, 0.38, longDuration),
      poseParameter('ParamHairBack', 1.7 * scale, 0.32, longDuration),
      poseParameter('ParamBreath2', 0.72, 0.36, longDuration),
      poseParameter('ParamBreath3', 0.58, 0.32, longDuration),
      poseParameter('ParamEyeBallY', -0.2 * scale, 0.54, baseDuration),
      poseParameter('ParamBrowLY', 0.12 * scale, 0.36, baseDuration),
      poseParameter('ParamBrowRY', 0.12 * scale, 0.36, baseDuration)
    ],
    lean_left: [
      poseParameter('ParamAngleZ', -5.4 * scale, 0.62, baseDuration),
      poseParameter('ParamBodyInput_BodyX', -9.5 * scale, 0.9, longDuration),
      poseParameter('ParamOutput_BodyX', -7.5 * scale, 0.84, longDuration),
      poseParameter('ParamPhysicsRAM_BodyX', -8.2 * scale, 0.84, longDuration),
      poseParameter('ParamAngle_BodyX', -6.8 * scale, 0.86, longDuration),
      poseParameter('ParamAngle_BodyX2', -5.2 * scale, 0.72, longDuration),
      poseParameter('ParamBodyInput_BodyZ', -6.8 * scale, 0.84, longDuration),
      poseParameter('ParamOutput_BodyZ', -5.3 * scale, 0.76, longDuration),
      poseParameter('ParamPhysicsRAM_BodyZ', -5.8 * scale, 0.76, longDuration),
      poseParameter('ParamBodyInput_ChestZ', -6.2 * scale, 0.82, longDuration),
      poseParameter('ParamPhysicsRAM_ChestZ', -6.5 * scale, 0.78, longDuration),
      poseParameter('ParamBodyInput_HipZ', 5.4 * scale, 0.76, longDuration),
      poseParameter('ParamPhysicsRAM_HipZ', 5.8 * scale, 0.72, longDuration),
      poseParameter('ParamAngle_ChestZ', -5.6 * scale, 0.76, longDuration),
      poseParameter('ParamAngle_HipZ', 4.8 * scale, 0.7, longDuration),
      poseParameter('ParamAngle_ShoulderL', -3.4 * scale, 0.48, baseDuration),
      poseParameter('ParamHairSide', 4.8 * scale, 0.44, longDuration),
      poseParameter('ParamHairBack', -3.6 * scale, 0.36, longDuration)
    ],
    lean_right: [
      poseParameter('ParamAngleZ', 5.4 * scale, 0.62, baseDuration),
      poseParameter('ParamBodyInput_BodyX', 9.5 * scale, 0.9, longDuration),
      poseParameter('ParamOutput_BodyX', 7.5 * scale, 0.84, longDuration),
      poseParameter('ParamPhysicsRAM_BodyX', 8.2 * scale, 0.84, longDuration),
      poseParameter('ParamAngle_BodyX', 6.8 * scale, 0.86, longDuration),
      poseParameter('ParamAngle_BodyX2', 5.2 * scale, 0.72, longDuration),
      poseParameter('ParamBodyInput_BodyZ', 6.8 * scale, 0.84, longDuration),
      poseParameter('ParamOutput_BodyZ', 5.3 * scale, 0.76, longDuration),
      poseParameter('ParamPhysicsRAM_BodyZ', 5.8 * scale, 0.76, longDuration),
      poseParameter('ParamBodyInput_ChestZ', 6.2 * scale, 0.82, longDuration),
      poseParameter('ParamPhysicsRAM_ChestZ', 6.5 * scale, 0.78, longDuration),
      poseParameter('ParamBodyInput_HipZ', -5.4 * scale, 0.76, longDuration),
      poseParameter('ParamPhysicsRAM_HipZ', -5.8 * scale, 0.72, longDuration),
      poseParameter('ParamAngle_ChestZ', 5.6 * scale, 0.76, longDuration),
      poseParameter('ParamAngle_HipZ', -4.8 * scale, 0.7, longDuration),
      poseParameter('ParamAngle_ShoulderR', -3.4 * scale, 0.48, baseDuration),
      poseParameter('ParamHairSide', -4.8 * scale, 0.44, longDuration),
      poseParameter('ParamHairBack', 3.6 * scale, 0.36, longDuration)
    ],
    sway: [
      poseParameter('ParamBodyInput_BodyX', 5.8 * scale, 0.68, longDuration),
      poseParameter('ParamOutput_BodyX', 4.8 * scale, 0.64, longDuration),
      poseParameter('ParamPhysicsRAM_BodyX', 5.6 * scale, 0.66, longDuration),
      poseParameter('ParamAngle_BodyX', 4.4 * scale, 0.62, longDuration),
      poseParameter('ParamAngle_BodyX2', 3.4 * scale, 0.5, longDuration),
      poseParameter('ParamBodyInput_BodyZ', 4.5 * scale, 0.66, longDuration),
      poseParameter('ParamOutput_BodyZ', 3.8 * scale, 0.58, longDuration),
      poseParameter('ParamPhysicsRAM_BodyZ', 4.6 * scale, 0.6, longDuration),
      poseParameter('ParamAngle_BodyZ', 3.5 * scale, 0.56, longDuration),
      poseParameter('ParamAngle_ChestZ', 3.2 * scale, 0.5, longDuration),
      poseParameter('ParamAngle_HipZ', -2.8 * scale, 0.46, longDuration),
      poseParameter('ParamAngle_ShoulderL', 2 * scale, 0.36, baseDuration),
      poseParameter('ParamAngle_ShoulderR', -1.8 * scale, 0.36, baseDuration),
      poseParameter('ParamHairSide', -3.6 * scale, 0.34, longDuration),
      poseParameter('ParamHairBack', 3.2 * scale, 0.3, longDuration),
      poseParameter('ParamBreath', subtleBreath, 0.44, longDuration),
      poseParameter('ParamBreath2', subtleBreath, 0.36, longDuration),
      poseParameter('ParamBreath3', Math.max(0.36, subtleBreath - 0.1), 0.32, longDuration)
    ],
    bounce: [
      poseParameter('ParamAngleY', 3.8 * scale, 0.56, baseDuration),
      poseParameter('ParamBodyAngleY', 5.4 * scale, 0.82, baseDuration),
      poseParameter('PositionZ', 5.5 * scale, 0.74, baseDuration),
      poseParameter('ParamPosition_Z', 4.6 * scale, 0.66, baseDuration),
      poseParameter('ParamBodyInput_BodyY', 9.5 * scale, 0.86, baseDuration),
      poseParameter('ParamOutput_BodyY', 7.6 * scale, 0.8, baseDuration),
      poseParameter('ParamPhysicsRAM_BodyY', 8.4 * scale, 0.8, baseDuration),
      poseParameter('ParamAngle_BodyY', 6.8 * scale, 0.78, baseDuration),
      poseParameter('ParamAngle_BodyY2', 5 * scale, 0.64, baseDuration),
      poseParameter('ParamAngle_HipUp', 5.5 * scale, 0.62, baseDuration),
      poseParameter('ParamAngle_HipDown', -3.8 * scale, 0.48, baseDuration),
      poseParameter('ParamHairFront', -5.2 * scale, 0.42, longDuration),
      poseParameter('ParamHairBack', 4.2 * scale, 0.36, longDuration),
      poseParameter('ParamMouthForm', 0.22 * scale, 0.38, baseDuration),
      poseParameter('ParamBreath', Math.min(1, 0.5 + scale * 0.22), 0.44, longDuration),
      poseParameter('ParamBreath2', Math.min(1, 0.48 + scale * 0.2), 0.36, longDuration),
      poseParameter('ParamBreath3', Math.min(1, 0.44 + scale * 0.18), 0.32, longDuration)
    ],
    emphasis: [
      poseParameter('ParamAngleZ', -6 * scale, 0.68, baseDuration),
      poseParameter('ParamBodyAngleY', -4 * scale, 0.72, baseDuration),
      poseParameter('ParamBodyInput_BodyY', -6 * scale, 0.78, baseDuration),
      poseParameter('ParamOutput_BodyY', -5 * scale, 0.7, baseDuration),
      poseParameter('ParamPhysicsRAM_BodyY', -5.8 * scale, 0.72, baseDuration),
      poseParameter('ParamBodyInput_BodyZ', -8 * scale, 0.84, baseDuration),
      poseParameter('ParamOutput_BodyZ', -6.5 * scale, 0.78, baseDuration),
      poseParameter('ParamPhysicsRAM_BodyZ', -7.2 * scale, 0.78, baseDuration),
      poseParameter('ParamAngle_BodyZ', -6 * scale, 0.78, baseDuration),
      poseParameter('ParamAngle_BodyZ2', -4.8 * scale, 0.62, baseDuration),
      poseParameter('ParamAngle_ChestZ', -6.4 * scale, 0.76, baseDuration),
      poseParameter('ParamPhysicsRAM_ChestZ', -6.6 * scale, 0.74, baseDuration),
      poseParameter('ParamAngle_HipZ', 5.4 * scale, 0.7, baseDuration),
      poseParameter('ParamPhysicsRAM_HipZ', 5.8 * scale, 0.68, baseDuration),
      poseParameter('ParamAngle_ShoulderL', -3.4 * scale, 0.48, baseDuration),
      poseParameter('ParamAngle_ShoulderR', 3.1 * scale, 0.48, baseDuration),
      poseParameter('ParamHairSide', 4.2 * scale, 0.34, longDuration),
      poseParameter('ParamHairBack', -3.2 * scale, 0.3, longDuration)
    ]
  }[bodyPose] || [];

  const switchTargets = BODY_SWITCH_PARAMETER_IDS.map((id) => poseParameter(id, 1, 1, longDuration));
  return normalizeLive2DParameterTargets([...switchTargets, ...rawTargets], manifest);
}

const bodyPoseWindupFactors = {
  nod: -0.68,
  shake_head: -1,
  lean_in: -0.62,
  lean_left: -0.68,
  lean_right: -0.68,
  sway: -1.02,
  bounce: -0.78,
  emphasis: -0.64
};

const bodyPosePeakFactors = {
  nod: 1.7,
  shake_head: 1.86,
  lean_in: 1.78,
  lean_left: 1.78,
  lean_right: 1.78,
  sway: 1.72,
  bounce: 1.92,
  emphasis: 1.9
};

function neutralParameterValue(id) {
  if (String(id || '').startsWith('ParamSwitchCtrl_')) return 0;
  if (id === 'ParamBreath' || id === 'ParamBreath2' || id === 'ParamBreath3') return 0.38;
  if (id === 'ParamEyeLOpen' || id === 'ParamEyeROpen') return 1;
  return 0;
}

function transformPoseValue(target, factor) {
  const id = String(target?.id || '');
  const value = Number(target?.value);
  if (!Number.isFinite(value)) return neutralParameterValue(id);
  if (id.startsWith('ParamSwitchCtrl_')) return factor === 0 ? 0 : 1;
  if (id === 'ParamBreath' || id === 'ParamBreath2' || id === 'ParamBreath3') {
    if (factor <= 0) return 0.34;
    return Math.min(1, Math.max(0.42, value * Math.min(factor, 1.15)));
  }
  if (id === 'ParamCheek') return factor > 0 ? value * Math.min(factor, 1.1) : 0;
  if (id === 'ParamEyeLOpen' || id === 'ParamEyeROpen') return factor > 0 ? value : 1;
  if (factor === 0) return neutralParameterValue(id);
  return value * factor;
}

function transformPoseTargets(targets, factor, durationMs, manifest, weightScale = 1) {
  return normalizeLive2DParameterTargets(
    (Array.isArray(targets) ? targets : []).map((target) => ({
      ...target,
      value: transformPoseValue(target, factor),
      weight: clamp01((Number(target?.weight) || 0.72) * weightScale, 0.72),
      durationMs,
      delayMs: 0
    })),
    manifest
  );
}

function bodyPosePerformanceSequence(baseStep, manifest) {
  if (!baseStep?.bodyPose) return baseStep ? [baseStep] : [];
  const intensity = Math.min(1, Math.max(Number(baseStep.intensity) || 0, 0.96));
  const totalDuration = normalizeDuration(baseStep.durationMs);
  const poseTargets = bodyPoseParameterTargets(baseStep.bodyPose, intensity, totalDuration, manifest);
  if (!poseTargets.length) return [baseStep];

  const windupDuration = Math.min(Math.max(Math.round(totalDuration * 0.16), 280), 640);
  const peakDuration = Math.min(Math.max(Math.round(totalDuration * 0.58), 1050), 2800);
  const settleDuration = Math.min(Math.max(Math.round(totalDuration * 0.22), 500), 1400);
  const windupFactor = bodyPoseWindupFactors[baseStep.bodyPose] ?? -0.32;
  const peakFactor = bodyPosePeakFactors[baseStep.bodyPose] ?? 1.16;

  const windup = normalizeLive2DStep({
    source: baseStep.source,
    speechStyle: baseStep.speechStyle,
    emotion: baseStep.emotion,
    expression: baseStep.expression,
    expressionMix: baseStep.expressionMix,
    parameters: transformPoseTargets(poseTargets, windupFactor, windupDuration, manifest, 1.02),
    intensity,
    durationMs: windupDuration,
    delayMs: baseStep.delayMs
  }, manifest);
  const peak = normalizeLive2DStep({
    ...baseStep,
    parameters: transformPoseTargets(baseStep.parameters, peakFactor, peakDuration, manifest, 1.24),
    intensity,
    durationMs: peakDuration,
    delayMs: 0
  }, manifest);
  const settle = normalizeLive2DStep({
    source: baseStep.source,
    speechStyle: baseStep.speechStyle,
    parameters: transformPoseTargets(poseTargets, 0, settleDuration, manifest, 0.72),
    intensity: 0.5,
    durationMs: settleDuration,
    delayMs: 0
  }, manifest);

  return [windup, peak, settle].filter(Boolean);
}

function mergeParameterTargets(explicitTargets, fallbackTargets) {
  const merged = [...explicitTargets];
  const seen = new Set(merged.map((item) => String(item.id || '').toLowerCase()));
  for (const target of fallbackTargets) {
    const key = String(target.id || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    merged.push(target);
    seen.add(key);
  }
  return merged.slice(0, 18);
}

function normalizeLive2DStep(input, manifest = roomLive2DManifest) {
  if (!input || typeof input !== 'object') return null;
  const rawExpression = input.expression || input.expressionId || input.face || input.mood || input.emotion || '';
  const expression = normalizeLive2DExpression(rawExpression, manifest) || normalizeLive2DEmotion(input.emotion || input.mood, manifest);
  const intensity = clamp01(input.intensity, 0.65);
  const durationMs = normalizeDuration(input.durationMs || input.duration);
  const rawBodyPose = normalizeLive2DBodyPose(input.bodyPose || input.pose || input.posture || input.motion || input.action, manifest);
  let behaviorActions = normalizeBehaviorActions(input.behaviorActions || input.actions, {
    intensity
  });
  if (rawBodyPose && !behaviorActions.length) {
    behaviorActions = normalizeBehaviorActions([{
      type: rawBodyPose,
      intensity,
      durationMs
    }], { intensity });
  }
  const presetActions = semanticExpressionBehaviorActions(expression || input.emotion || input.mood, {
    existingActions: behaviorActions,
    intensity,
    limit: Math.max(0, 5 - behaviorActions.length)
  });
  if (presetActions.length) {
    behaviorActions = normalizeBehaviorActions([...behaviorActions, ...presetActions], { intensity });
  }
  const motion = normalizeLive2DMotion(input.motion || input.action, manifest);
  const bodyPose = behaviorActions.length ? '' : rawBodyPose;
  const expressionMix = normalizeExpressionMix(input.expressionMix, expression, manifest);
  const explicitParameters = normalizeLive2DParameterTargets(input.parameters || input.parameterTargets || input.params, manifest);
  const parameters = mergeParameterTargets(
    explicitParameters,
    bodyPose ? bodyPoseParameterTargets(bodyPose, intensity, durationMs, manifest) : []
  );
  const primaryExpression = expressionMix[0]?.expression || expression;
  const hasControl = primaryExpression || motion || bodyPose || parameters.length || behaviorActions.length;
  if (!hasControl) return null;
  return {
    emotion: String(input.emotion || input.mood || '').trim() || null,
    expression: primaryExpression || null,
    expressionMix,
    motion: motion || null,
    bodyPose: bodyPose || null,
    parameters,
    behaviorActions,
    speechStyle: input.speechStyle || input.speech_style || null,
    source: String(input.source || input.origin || '').trim().slice(0, 64) || null,
    priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : null,
    interruptPolicy: input.interruptPolicy || input.interrupt || null,
    intensity,
    durationMs,
    delayMs: normalizeDelay(input.delayMs || input.delay)
  };
}

function normalizeSequence(input, manifest = roomLive2DManifest) {
  const rawSequence = Array.isArray(input?.sequence) ? input.sequence : [];
  return rawSequence
    .map((step) => normalizeLive2DStep(step, manifest))
    .filter(Boolean)
    .flatMap((step) => (step.bodyPose && !step.behaviorActions?.length ? bodyPosePerformanceSequence(step, manifest) : [step]))
    .slice(0, 12);
}

export function normalizeLive2DIntent(input, manifest = roomLive2DManifest) {
  if (!input || typeof input !== 'object') return null;
  const sequence = normalizeSequence(input, manifest);
  const baseStep = normalizeLive2DStep(input, manifest);
  const steps = sequence.length
    ? sequence
    : (baseStep?.bodyPose && !baseStep.behaviorActions?.length ? bodyPosePerformanceSequence(baseStep, manifest) : (baseStep ? [baseStep] : []));
  if (!steps.length) return null;
  const primary = baseStep || steps[0];
  return {
    ...primary,
    sequence: steps
  };
}

const textExpressionMatchers = [
  {
    expression: 'fire',
    pattern: /(\u71c3|\u7206\u53d1|\u7206\u767c|\u70ed\u8840|\u71b1\u8840|furious|rage|fired up|serious)/iu,
    emotion: 'fire'
  },
  {
    expression: 'angry',
    pattern: /(\u751f\u6c14|\u751f\u6c23|\u6124\u6012|\u61a4\u6012|\u607c\u706b|\u60f1\u706b|\u70e6|\u7169|angry|annoyed|irritated|mad|scold)/iu,
    emotion: 'angry'
  },
  {
    expression: 'surprised',
    pattern: /(\u60ca\u8bb6|\u9a5a\u8a1d|\u9707\u60ca|\u9a5a\u5446|\u5413|surpris|shock|startled|wow)/iu,
    emotion: 'surprised'
  },
  {
    expression: 'puff',
    pattern: /(\u9f13\u8138|\u5634\u8138|\u6485\u5634|\u751f\u95f7\u6c23|\u751f\u95f7\u6c14|pout|puff|sulk|cheek puff)/iu,
    emotion: 'puff'
  },
  {
    expression: 'tongue',
    pattern: /(\u5410\u820c|\u8c03\u76ae|\u8abf\u76ae|tongue|blep|cheeky|mischief|teasing)/iu,
    emotion: 'tongue'
  },
  {
    expression: 'dizzy',
    pattern: /(\u6655|\u56f0\u60d1|\u56f0\u60d1|\u614c|\u6655\u4e86|dizzy|confused|dazed|overwhelmed|panic)/iu,
    emotion: 'dizzy'
  },
  {
    expression: 'closed_smile',
    pattern: /(\u7b11\u54aa\u54aa|\u7b11\u772f\u772f|\u772f\u773c\u7b11|giggle|closed[- ]eye smile|smiling eyes)/iu,
    emotion: 'closed_smile'
  },
  {
    expression: 'closed_eyes',
    pattern: /(\u772f\u772f\u773c|\u772f\u773c|\u95ed\u773c|\u9589\u773c|content|satisfied|closed eyes|squint)/iu,
    emotion: 'closed_eyes'
  },
  {
    expression: 'tear_drop',
    pattern: /(\u6cea\u73e0|\u6dda\u73e0|single tear|teardrop|tear drop)/iu,
    emotion: 'tear_drop'
  },
  {
    expression: 'watery_eyes',
    pattern: /(\u6cea\u773c|\u6dda\u773c|\u6d99\u76ee|watery eyes|teary eyes)/iu,
    emotion: 'watery_eyes'
  },
  {
    expression: 'tears',
    pattern: /(\u5927\u54ed|\u54ed\u6ce3|\u6d41\u6cea|\u6d41\u6dda|\u75db\u54ed|crying|tears|sob|weeping|\u6ce3\u304f|\u6ce3\u3044\u3066)/iu,
    emotion: 'crying'
  },
  {
    expression: 'namida',
    pattern: /(\u96be\u8fc7|\u96e3\u904e|\u60b2\u4f24|\u60b2\u50b7|\u4f24\u5fc3|\u50b7\u5fc3|\u5bc2\u5bde|\u773c\u6cea|\u6d99|sad|sorrow|lonely|\u60b2\u3057\u3044)/iu,
    emotion: 'sad'
  },
  {
    expression: 'smug',
    pattern: /(\u5f97\u610f|\u574f\u7b11|\u5c0f\u574f|smug|smirk|sly|confident)/iu,
    emotion: 'smug'
  },
  {
    expression: 'shy',
    pattern: /(\u5bb3\u7f9e|\u8138\u7ea2|\u81c9\u7d05|shy|blush|embarrassed|bashful|flustered|\u7167\u308c)/iu,
    emotion: 'shy'
  },
  {
    expression: 'smile',
    pattern: /(\u5f00\u5fc3|\u958b\u5fc3|\u9ad8\u5174|\u9ad8\u8208|\u6109\u5feb|\u5fae\u7b11|\u7b11|happy|smile|joy|cheerful|\u5b09\u3057\u3044|\u512a\u3057\u3044)/iu,
    emotion: 'happy'
  }
];

function matchTextExpression(value) {
  return textExpressionMatchers.find((item) => item.pattern.test(value)) || null;
}

function inferActionLive2DIntent(text, manifest) {
  const value = String(text || '').toLowerCase();
  const expressionMatch = matchTextExpression(value);
  const bodyMatch = matchBehaviorBodyPoseFromText(value);
  const behaviorActions = matchBehaviorActionsFromText(value);
  if (!expressionMatch && !bodyMatch && !behaviorActions.length) return null;
  return normalizeLive2DIntent({
    emotion: expressionMatch?.emotion || null,
    expression: expressionMatch?.expression || null,
    bodyPose: bodyMatch?.bodyPose || null,
    behaviorActions,
    intensity: bodyMatch?.intensity || 0.55,
    durationMs: bodyMatch?.durationMs || 5000
  }, manifest);
}

export function inferLive2DIntentFromText(text, manifest = roomLive2DManifest) {
  const structured = inferActionLive2DIntent(text, manifest);
  if (structured) return structured;
  const value = String(text || '').toLowerCase();
  const matched = matchTextExpression(value);
  return matched
    ? normalizeLive2DIntent({ ...matched, intensity: 0.5, durationMs: 5000 }, manifest)
    : null;
}

export function dispatchRoomLive2D(intent) {
  const normalized = normalizeLive2DIntent(intent);
  if (!normalized) return null;
  const sequence = Array.isArray(normalized.sequence) && normalized.sequence.length
    ? normalized.sequence
    : [normalized];
  activeQueueTimers.forEach((timer) => window.clearTimeout(timer));
  activeQueueTimers = [];
  writeDebugState({
    status: 'queued',
    raw: intent,
    normalized,
    activeIndex: 0,
    total: sequence.length
  });
  appendDebugHistory({ source: 'dispatch', normalized });
  let elapsed = 0;
  sequence.forEach((step, index) => {
    elapsed += normalizeDelay(step.delayMs);
    const timer = window.setTimeout(() => {
      writeDebugState({
        status: 'playing',
        current: step,
        activeIndex: index + 1,
        total: sequence.length
      });
      window.dispatchEvent(new CustomEvent('tsukuyomi:room-act', { detail: step }));
      if (index === sequence.length - 1) {
        window.setTimeout(() => {
          writeDebugState({ status: 'idle', activeIndex: sequence.length, total: sequence.length });
        }, normalizeDuration(step.durationMs));
      }
    }, elapsed);
    activeQueueTimers.push(timer);
    elapsed += normalizeDuration(step.durationMs);
  });
  return normalized;
}

export function queueRoomLive2DForNextRoom(intent) {
  const normalized = normalizeLive2DIntent(intent);
  if (!normalized || typeof localStorage === 'undefined') return null;
  localStorage.setItem(ROOM_LIVE2D_PENDING_INTENT_KEY, JSON.stringify({
    intent: normalized,
    createdAt: Date.now()
  }));
  writeDebugState({
    status: 'pending',
    raw: intent,
    normalized,
    activeIndex: 0,
    total: normalized.sequence?.length || 1
  });
  appendDebugHistory({ source: 'pending', normalized });
  return normalized;
}

export function consumePendingRoomLive2DIntent(maxAgeMs = 120000) {
  if (typeof localStorage === 'undefined') return null;
  try {
    const payload = JSON.parse(localStorage.getItem(ROOM_LIVE2D_PENDING_INTENT_KEY) || 'null');
    localStorage.removeItem(ROOM_LIVE2D_PENDING_INTENT_KEY);
    if (!payload?.intent || Date.now() - Number(payload.createdAt || 0) > maxAgeMs) return null;
    return dispatchRoomLive2D(payload.intent);
  } catch (_) {
    localStorage.removeItem(ROOM_LIVE2D_PENDING_INTENT_KEY);
    return null;
  }
}

export function readRoomLive2DDebugState() {
  return readDebugState();
}

export function clearRoomLive2DQueue() {
  activeQueueTimers.forEach((timer) => window.clearTimeout(timer));
  activeQueueTimers = [];
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(ROOM_LIVE2D_PENDING_INTENT_KEY);
  }
  writeDebugState({ status: 'idle', current: null, activeIndex: 0, total: 0 });
}

export function live2DSemanticPromptCatalog() {
  return [
    semanticActionPromptCatalog(),
    'Output semantic actions only; the room runtime maps those actions through BehaviorPlan, local Cubism parameters, stage pose, blink, mouth, breath, and accessory physics.'
  ].join('\n');
}
