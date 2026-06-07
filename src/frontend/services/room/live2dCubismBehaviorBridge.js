import { behaviorActionBlocksAutoBlink } from '../../constants/room/behaviorActionRegistry';
import {
  normalizeSemanticExpressionId,
  semanticExpressionFromEmotion,
  semanticExpressionVTSOverlay
} from '../../constants/room/yachiyoExpressionPresetRegistry';
import {
  mapTrackingFrameToYachiyoCubismParameters,
  TRACKING_PARAMETER_RANGES
} from './live2dTrackingFrameMapper';
import { getRoomLive2DPerformanceBrain } from './live2dPerformanceBrain';
import { naturalAutoBlinkOpen } from './live2dBlinkTiming';

const ROOM_ACT_EVENT = 'tsukuyomi:room-act';
const FACE_CAPTURE_EVENT = 'tsukuyomi:live2d-face';
const MOUTH_EVENT = 'tsukuyomi:live2d-mouth';
const CHARACTER_STATE_EVENT = 'tsukuyomi:live2d-character-state';
const LOCAL_CUBISM_ACTION_INTENSITY_SCALE = 1.86;

const EYE_OWNING_EXPRESSIONS = new Set([
  'angry',
  'bsmile',
  'closed_eyes',
  'closed_smile',
  'crying',
  'dizzy',
  'fire',
  'namida',
  'shy',
  'smile',
  'smug',
  'surprised',
  'tears',
  'tongue'
]);

const MOMENTARY_EXPRESSION_IDS = new Set(['tongue']);
const MOMENTARY_PULSE_MS = 620;
const CLOSED_SMILE_EYE_SHAPE = {
  happySmile: 0.92,
  eyeSmile: 0.82,
  hideOpenEye: 0.9,
  cheek: 0.3
};
const EXPRESSION_EYE_OPEN_GUARDS = new Map([
  ['smile', 0.015],
  ['closed_smile', 0.015],
  ['closed_eyes', 0.015]
]);
const EXPRESSION_CUBISM_EYE_SHAPES = new Map([
  ['smile', CLOSED_SMILE_EYE_SHAPE],
  ['closed_smile', CLOSED_SMILE_EYE_SHAPE],
  ['closed_eyes', {
    happySmile: 0.64,
    eyeSmile: 0.72,
    hideOpenEye: 0.86,
    cheek: 0.1
  }]
]);

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

function isSoftTakeoverFrameId(id) {
  const value = String(id || '');
  return (
    value.startsWith('FaceAngle') ||
    value.startsWith('FacePosition') ||
    value.startsWith('Mocopi') ||
    value === 'EyeLeftX' ||
    value === 'EyeLeftY' ||
    value === 'EyeRightX' ||
    value === 'EyeRightY' ||
    value.startsWith('ParamEarPhysics') ||
    value.startsWith('ParamHatPhysics') ||
    value.startsWith('ParamHatEar') ||
    value.startsWith('ParamWingPhysics') ||
    value.startsWith('ParamCheongsamPhysics') ||
    value.startsWith('ParamDollEarPhysics') ||
    value.startsWith('ParamTonguePhysics')
  );
}

function normalizeExpression(value) {
  return normalizeSemanticExpressionId(value) || semanticExpressionFromEmotion(value) || '';
}

function expressionOwnsEyeOpen(value) {
  const expression = normalizeExpression(value);
  return expression && EYE_OWNING_EXPRESSIONS.has(expression);
}

function isMomentaryExpression(value) {
  return MOMENTARY_EXPRESSION_IDS.has(normalizeExpression(value));
}

function setFrameValue(frame, id, value, weight = 0.72) {
  if (!id || !Number.isFinite(Number(value))) return;
  const range = TRACKING_PARAMETER_RANGES[id];
  const nextValue = range ? clamp(value, range[0], range[1], range[0]) : Number(value);
  const nextWeight = clamp(weight, 0.01, 1, 0.72);
  const current = frame.get(id);
  if (
    current &&
    isSoftTakeoverFrameId(id) &&
    nextWeight < current.weight &&
    nextWeight >= current.weight * 0.45
  ) {
    const amount = clamp((nextWeight / Math.max(current.weight, 0.01)) * 0.74, 0.18, 0.78, 0.42);
    frame.set(id, {
      id,
      value: current.value + (nextValue - current.value) * amount,
      weight: current.weight
    });
    return;
  }
  if (!current || nextWeight >= current.weight) {
    frame.set(id, {
      id,
      value: nextValue,
      weight: nextWeight
    });
  }
}

function addFrameValue(frame, id, value, weight = 0.72) {
  if (!id || !Number.isFinite(Number(value))) return;
  const range = TRACKING_PARAMETER_RANGES[id];
  const current = frame.get(id);
  const nextValue = (current?.value || 0) + Number(value || 0);
  frame.set(id, {
    id,
    value: range ? clamp(nextValue, range[0], range[1], range[0]) : nextValue,
    weight: clamp(Math.max(current?.weight || 0, weight), 0.01, 1, 0.72)
  });
}

function setEyes(frame, x = 0, y = 0, weight = 0.78) {
  const trackingX = -clamp(x, -1, 1, 0);
  const trackingY = clamp(y, -1, 1, 0);
  setFrameValue(frame, 'EyeLeftX', trackingX, weight);
  setFrameValue(frame, 'EyeRightX', trackingX, weight);
  setFrameValue(frame, 'EyeLeftY', trackingY, weight);
  setFrameValue(frame, 'EyeRightY', trackingY, weight);
}

function setEyeOpen(frame, left, right = left, weight = 0.9) {
  setFrameValue(frame, 'EyeOpenLeft', clamp(left, 0, 1, 0.92), weight);
  setFrameValue(frame, 'EyeOpenRight', clamp(right, 0, 1, 0.92), weight);
}

function setMouthSmile(frame, value, weight = 0.66) {
  setFrameValue(frame, 'MouthSmile', clamp(value, 0, 1, 0.56), weight);
}

function setBrows(frame, left, right = left, weight = 0.54) {
  const leftValue = clamp(left, 0, 1, 0.54);
  const rightValue = clamp(right, 0, 1, 0.54);
  setFrameValue(frame, 'Brows', (leftValue + rightValue) / 2, weight * 0.7);
  setFrameValue(frame, 'BrowLeftY', leftValue, weight);
  setFrameValue(frame, 'BrowRightY', rightValue, weight);
}

function setHead(frame, pose = {}, weight = 0.86) {
  const x = Number(pose.x) || 0;
  const y = Number(pose.y) || 0;
  const z = Number(pose.z) || 0;

  setFrameValue(frame, 'FaceAngleX', x, weight * 0.98);
  setFrameValue(frame, 'FaceAngleY', y, weight * 0.96);
  setFrameValue(frame, 'FaceAngleZ', z, weight * 0.94);
}

function setFacePosition(frame, pose = {}, weight = 0.64) {
  const x = Number(pose.x) || 0;
  const y = Number(pose.y) || 0;
  const z = Number(pose.z) || 0;
  setFrameValue(frame, 'FacePositionX', x, weight);
  setFrameValue(frame, 'FacePositionY', y, weight);
  if (z) setFrameValue(frame, 'FacePositionZ', z, weight * 0.7);
}

function setBodySwitches(frame, weight = 1) {
  [
    'ParamSwitchCtrl_BodyX',
    'ParamSwitchCtrl_BodyY',
    'ParamSwitchCtrl_BodyZ',
    'ParamSwitchCtrl_ChestZ',
    'ParamSwitchCtrl_HipZ'
  ].forEach((id) => setFrameValue(frame, id, 1, weight));
}

function setBody(frame, pose = {}, weight = 0.84) {
  const x = Number(pose.x) || 0;
  const y = Number(pose.y) || 0;
  const z = Number(pose.z) || 0;
  const posX = Number(pose.posX) || 0;
  const posY = Number(pose.posY) || 0;

  setBodySwitches(frame, 1);
  setFrameValue(frame, 'MocopiConnected', 1, 1);
  setFrameValue(frame, 'MocopiAngleX', x * 2.8, weight * 0.72);
  setFrameValue(frame, 'MocopiAngleY', y * 2.8, weight * 0.72);
  setFrameValue(frame, 'MocopiAngleZ', z * 2.8, weight * 0.72);
  setFrameValue(frame, 'MocopiBodyAngleX', x, weight);
  setFrameValue(frame, 'MocopiBodyAngleY', y, weight);
  setFrameValue(frame, 'MocopiBodyAngleZ', z, weight);
  setFrameValue(frame, 'MocopiBodyPositionX', posX, weight * 0.74);
  setFrameValue(frame, 'MocopiBodyPositionY', posY, weight * 0.74);
  addFrameValue(frame, 'FaceAngleY', y * 0.58 + posY * 7.5, weight * 0.48);
  addFrameValue(frame, 'FacePositionY', y * 0.34 + posY * 11.5, weight * 0.52);
  addFrameValue(frame, 'FacePositionX', x * 0.1 + posX * 5.8, weight * 0.38);

  addAccessoryFollow(frame, { x, y, z, posX, posY }, weight);
}

function addAccessoryFollow(frame, pose = {}, weight = 0.74, character = {}) {
  const x = Number(pose.x) || 0;
  const y = Number(pose.y) || 0;
  const z = Number(pose.z) || 0;
  const energy = clamp(character.energy, 0, 1, 0.36);
  const emotion = normalizeExpression(character.emotion) || 'neutral';
  const lively = ['smile', 'shy', 'smug', 'surprised', 'tongue', 'fire'].includes(emotion) ? 1 : 0;
  const droop = ['namida', 'tears', 'crying', 'dizzy'].includes(emotion) ? 1 : 0;
  const alert = ['surprised', 'fire'].includes(emotion) ? 1 : 0;
  const earBase = clamp(0.08 + energy * 0.3 + lively * 0.12 + alert * 0.1 - droop * 0.22 - y * 0.006, -0.42, 0.82);
  const earLean = clamp(z * 0.018 - x * 0.008, -0.32, 0.32);
  const earLift = clamp(-y * 0.01 + alert * 0.1 - droop * 0.08, -0.24, 0.24);

  setFrameValue(frame, 'ParamEarShape_L1', earBase + earLean, weight * 0.66);
  setFrameValue(frame, 'ParamEarShape_R1', earBase - earLean, weight * 0.66);
  setFrameValue(frame, 'ParamEarShape_L2', earBase * 0.68 + earLift, weight * 0.52);
  setFrameValue(frame, 'ParamEarShape_R2', earBase * 0.68 + earLift, weight * 0.52);
  setFrameValue(frame, 'ParamEarShape_L3', earBase * 0.42 - earLift * 0.5 + earLean * 0.35, weight * 0.44);
  setFrameValue(frame, 'ParamEarShape_R3', earBase * 0.42 - earLift * 0.5 - earLean * 0.35, weight * 0.44);

  for (let index = 1; index <= 4; index += 1) {
    const falloff = 1 / index;
    setFrameValue(frame, `ParamEarPhysics_L${index}`, (z * 0.22 - x * 0.12 + y * 0.08) * falloff, weight * 0.3);
    setFrameValue(frame, `ParamEarPhysics_R${index}`, (-z * 0.22 - x * 0.12 + y * 0.08) * falloff, weight * 0.3);
  }
  setFrameValue(frame, 'ParamEarPhysicsBS_L1', earLift + z * 0.08, weight * 0.28);
  setFrameValue(frame, 'ParamEarPhysicsBS_R1', earLift - z * 0.08, weight * 0.28);
  setFrameValue(frame, 'ParamEarPhysicsBS_L2', earBase * 0.22 + x * 0.04, weight * 0.24);
  setFrameValue(frame, 'ParamEarPhysicsBS_R2', earBase * 0.22 - x * 0.04, weight * 0.24);

  for (let index = 1; index <= 4; index += 1) {
    const falloff = 1 / index;
    setFrameValue(frame, `ParamWingPhysics_L${index}`, (z * 0.38 + x * 0.2 - y * 0.08) * falloff, weight * 0.28);
    setFrameValue(frame, `ParamWingPhysics_R${index}`, (z * 0.38 - x * 0.2 - y * 0.08) * falloff, weight * 0.28);
  }

  for (let index = 1; index <= 5; index += 1) {
    const falloff = 1 / index;
    setFrameValue(frame, `ParamCheongsamPhysics_X${index}`, (x * 0.58 + z * 0.36) * falloff, weight * 0.24);
  }
}

function createFrame(options = {}) {
  const frame = new Map();
  setHead(frame, {}, 0.4);
  setEyes(frame, 0, 0, 0.38);
  if (!options.suppressEyeOpen) setEyeOpen(frame, 0.92, 0.92, 0.58);
  setMouthSmile(frame, 0.56, 0.42);
  setBrows(frame, 0.54, 0.54, 0.3);
  setFrameValue(frame, 'ParamCheek', 0.02, 0.24);
  setBody(frame, {}, 0.28);
  setFrameValue(frame, 'ParamBreath', 0.46, 0.34);
  setFrameValue(frame, 'ParamBreath2', 0.43, 0.28);
  setFrameValue(frame, 'ParamBreath3', 0.41, 0.24);
  return frame;
}

function applyVtsOverlayToCubism(frame, item, strength = 1) {
  const id = String(item?.id || '').trim();
  const value = Number(item?.value);
  if (!id || !Number.isFinite(value)) return;
  const amount = clamp(strength, 0, 1, 1);
  const weight = clamp(item.weight, 0.01, 1, 0.55) * amount;

  switch (id) {
    case 'MouthSmile':
      setMouthSmile(frame, value, weight);
      break;
    case 'Brows':
      setBrows(frame, value, value, weight);
      break;
    case 'BrowLeftY':
      setFrameValue(frame, 'BrowLeftY', value, weight);
      break;
    case 'BrowRightY':
      setFrameValue(frame, 'BrowRightY', value, weight);
      break;
    case 'EyeOpenLeft':
      setFrameValue(frame, 'EyeOpenLeft', value, weight);
      break;
    case 'EyeOpenRight':
      setFrameValue(frame, 'EyeOpenRight', value, weight);
      break;
    case 'EyeLeftX':
    case 'EyeRightX':
      setFrameValue(frame, 'EyeLeftX', value, weight);
      setFrameValue(frame, 'EyeRightX', value, weight);
      break;
    case 'EyeLeftY':
    case 'EyeRightY':
      setFrameValue(frame, 'EyeLeftY', value, weight);
      setFrameValue(frame, 'EyeRightY', value, weight);
      break;
    case 'MouthOpen':
    case 'VoiceVolumePlusMouthOpen':
    case 'JawOpen':
      setFrameValue(frame, id, value, weight);
      break;
    case 'TongueOut':
      setFrameValue(frame, 'TongueOut', value, weight);
      break;
    case 'MouthX':
      setFrameValue(frame, 'MouthX', value, weight);
      break;
    case 'CheekPuff':
      setFrameValue(frame, 'CheekPuff', value, weight);
      break;
    case 'MouthFunnel':
      setFrameValue(frame, 'MouthFunnel', value, weight);
      break;
    case 'MouthShrug':
      setFrameValue(frame, 'MouthShrug', value, weight);
      break;
    case 'MouthPucker':
      setFrameValue(frame, 'MouthPucker', value, weight);
      break;
    case 'MouthPressLipOpen':
      setFrameValue(frame, 'MouthPressLipOpen', value, weight);
      break;
    default:
      if (id === 'fire' || id.startsWith('Param')) setFrameValue(frame, id, value, weight);
      break;
  }
}

function applySemanticOverlay(frame, expression, strength = 1, options = {}) {
  const overlay = semanticExpressionVTSOverlay(expression);
  for (const item of overlay) {
    if (!options.includeMomentary && item.id === 'TongueOut' && isMomentaryExpression(expression)) continue;
    applyVtsOverlayToCubism(frame, item, strength);
  }
}

function applyExpressionEyeGuard(frame, expression) {
  const normalized = normalizeExpression(expression);
  const open = EXPRESSION_EYE_OPEN_GUARDS.get(normalized);
  if (open === undefined) return;
  setEyeOpen(frame, open, open, 1);
  const shape = EXPRESSION_CUBISM_EYE_SHAPES.get(normalized);
  if (!shape) return;
  setFrameValue(frame, 'ParamEyeSmile_Happy_L', shape.happySmile, 0.96);
  setFrameValue(frame, 'ParamEyeSmile_Happy_R', shape.happySmile, 0.96);
  setFrameValue(frame, 'ParamEyeLSmile', shape.eyeSmile, 0.94);
  setFrameValue(frame, 'ParamEyeRSmile', shape.eyeSmile, 0.94);
  setFrameValue(frame, 'ParamHide_EyesL1', shape.hideOpenEye, 0.9);
  setFrameValue(frame, 'ParamHighLightHide_EyesL1', shape.hideOpenEye, 0.86);
  setFrameValue(frame, 'ParamHide_EyeSocket', shape.hideOpenEye, 0.84);
  setFrameValue(frame, 'ParamHide_EyeSocket2', shape.hideOpenEye, 0.84);
  if (shape.cheek) setFrameValue(frame, 'ParamCheek', shape.cheek, 0.46);
}

function applyMomentaryPulse(frame, pulse) {
  if (!pulse) return;
  const now = performance.now();
  const progress = (now - pulse.startedAt) / pulse.durationMs;
  if (progress < 0 || progress > 1) return;
  const value = Math.sin(Math.PI * progress);
  setFrameValue(frame, 'TongueOut', value, 0.94);
  setMouthSmile(frame, 0.78, 0.56);
}

function actionVariant(action) {
  return Math.abs(Math.round(Number(action?.motionVariant) || 0)) % 4;
}

function actionSecondarySign(action, fallback = -1) {
  const value = Number(action?.secondarySign);
  if (value < 0) return -1;
  if (value > 0) return 1;
  return fallback;
}

function applyAction(frame, sample, options = {}) {
  if (!sample) return;
  const { action, progress: t, phase, energy: e, sign } = sample;
  const dominant = Boolean(options.dominant);
  const variant = actionVariant(action);
  const secondarySign = actionSecondarySign(action, -sign);
  const fast = Math.sin(phase * 2);
  const slow = Math.sin(phase);

  switch (action.type) {
    case 'look_at_chat': {
      const x = 14 * slow * e;
      const z = (8 * Math.sin(phase * 0.5) + (variant === 1 ? 1.8 * sign * Math.abs(slow) : 0)) * e;
      const y = (3 * Math.sin(phase * 0.7) - (variant === 2 ? 1.4 * Math.abs(slow) : 0)) * e;
      setHead(frame, { x, y, z }, dominant ? 1 : 0.72);
      setEyes(frame, -x / 30, -0.12 * e, 0.82);
      setBody(frame, { x: x / 7.5, z: z / 4.8 }, dominant ? 0.9 : 0.62);
      break;
    }
    case 'smile':
      setHead(frame, {
        y: (-0.9 * Math.sin(Math.PI * t) - 0.35 * Math.abs(slow)) * e,
        z: sign * 1.3 * Math.sin(Math.PI * t) * e
      }, 0.58);
      setBody(frame, {
        y: 1.2 * Math.sin(Math.PI * t) * e,
        z: sign * 1.4 * Math.sin(Math.PI * t) * e,
        posY: 0.045 * Math.sin(Math.PI * t) * e
      }, 0.48);
      setMouthSmile(frame, 0.74 + 0.16 * e, 0.84);
      setBrows(frame, 0.56 + 0.08 * e, 0.56 + 0.08 * e, 0.58);
      setFrameValue(frame, 'ParamCheek', 0.08 + 0.16 * e, 0.42);
      break;
    case 'smirk':
      setMouthSmile(frame, 0.8 + 0.12 * e, 0.9);
      addFrameValue(frame, 'FaceAngleZ', 3.8 * sign * e, 0.78);
      setBrows(frame, sign < 0 ? 0.72 : 0.54, sign > 0 ? 0.72 : 0.54, 0.66);
      setFrameValue(frame, 'MouthX', -0.22 * sign * e, 0.36);
      break;
    case 'blink': {
      if (options.suppressEyeOpen) break;
      const close = Math.sin(Math.PI * t) * e;
      const open = clamp(0.92 - close, 0.015, 1, 0.92);
      setEyeOpen(frame, open, open, 0.98);
      break;
    }
    case 'wink': {
      if (options.suppressEyeOpen) break;
      const close = Math.sin(Math.PI * t) * e;
      const open = clamp(0.92 - close, 0.015, 1, 0.92);
      setFrameValue(frame, action.side === 'left' ? 'EyeOpenLeft' : 'EyeOpenRight', open, 0.98);
      setMouthSmile(frame, 0.76, 0.62);
      break;
    }
    case 'nod': {
      const dip = Math.sin(Math.PI * t) * e;
      const rebound = Math.sin(Math.PI * 2 * t) * e;
      setHead(frame, {
        y: -4.8 * dip + 1.2 * rebound,
        z: variant === 2 ? sign * 1.8 * dip : 0
      }, 1);
      setFacePosition(frame, { y: -2.2 * dip + 0.45 * rebound }, 0.72);
      setBody(frame, {
        y: 4.4 * dip - 0.7 * rebound,
        z: variant === 2 ? sign * 1.2 * dip : 0,
        posY: 0.16 * dip
      }, 0.96);
      break;
    }
    case 'shake_head':
      setHead(frame, { x: 15 * fast * e, z: (6 * fast + (variant === 1 ? 1.4 * slow * secondarySign : 0)) * e }, 1);
      setEyes(frame, -0.28 * fast * e, 0, 0.72);
      setBody(frame, { x: 4.8 * fast * e, z: 2.4 * fast * e }, 0.86);
      break;
    case 'head_tilt':
      setHead(frame, { x: (5 * sign + (variant === 2 ? 1.4 * secondarySign * slow : 0)) * e, z: 16 * sign * e }, 1);
      setEyes(frame, -0.18 * sign * e, 0, 0.7);
      setBody(frame, { z: 8 * sign * e, posX: 0.32 * sign * e }, 0.96);
      break;
    case 'lean_in':
      setHead(frame, { y: (-5.8 - (variant === 1 ? 0.7 * Math.abs(slow) : 0)) * e, z: variant === 2 ? 2.1 * sign * slow * e : 0 }, 0.9);
      setFacePosition(frame, { y: -3.2 * e }, 0.78);
      setEyes(frame, 0, -0.16 * e, 0.72);
      setBody(frame, {
        y: -5.4 * e,
        z: variant === 2 ? 1.2 * sign * slow * e : 0,
        posY: 0.02 * e
      }, 0.82);
      break;
    case 'lean_left':
    case 'lean_right': {
      const leanSign = action.type === 'lean_left' ? -1 : 1;
      setHead(frame, { x: 5 * leanSign * e, z: 16 * leanSign * e, y: variant === 1 ? -1.4 * e : 0 }, 1);
      setEyes(frame, -0.35 * leanSign * e, 0, 0.8);
      setBody(frame, { z: 8 * leanSign * e, posX: 0.38 * leanSign * e, y: variant === 1 ? -1.1 * e : 0 }, 1);
      break;
    }
    case 'sway': {
      const side = slow * e;
      const lift = variant === 1 ? 1.2 * Math.abs(slow) * e : 0;
      setHead(frame, { x: 5.5 * side, z: 9 * side, y: -lift * 0.2 }, 0.9);
      setEyes(frame, -0.18 * side, 0, 0.76);
      setBody(frame, { x: 3.2 * side, y: lift * 0.72, z: 6.8 * side, posX: 0.25 * side }, 0.96);
      break;
    }
    case 'bounce': {
      const lift = Math.sin(Math.PI * t) * e;
      const rebound = Math.sin(Math.PI * 2 * t) * e;
      const sideLean = variant ? sign * (1 + Math.abs(Number(action.motionArc) || 0) * 0.42) * lift : 0;
      setHead(frame, { y: 3.2 * lift - 0.7 * rebound, z: sideLean * 0.92 }, 0.9);
      setFacePosition(frame, { y: -5.2 * lift + 0.8 * rebound }, 0.86);
      setMouthSmile(frame, 0.78, 0.8);
      setBrows(frame, 0.62, 0.62, 0.55);
      setBody(frame, {
        y: 6.2 * lift - 0.9 * rebound,
        z: sideLean * 0.52,
        posY: 0.26 * lift
      }, 1);
      break;
    }
    case 'shiver': {
      const jitter = Math.sin(phase * (variant === 2 ? 5 : 6)) * e;
      setHead(frame, { x: 4.2 * jitter, z: 3.2 * Math.sin(phase * 7) * e }, 0.86);
      setBody(frame, { x: 1.8 * jitter, z: 3.5 * Math.sin(phase * 6.6) * e }, 0.82);
      break;
    }
    case 'surprised':
      if (!options.suppressEyeOpen) setEyeOpen(frame, 1, 1, 0.98);
      setMouthSmile(frame, 0.48, 0.54);
      setBrows(frame, 0.78, 0.78, 0.78);
      setFrameValue(frame, 'JawOpen', 0.34, 0.45);
      setFrameValue(frame, 'MouthFunnel', 0.34, 0.42);
      break;
    case 'tongue_out': {
      const pulse = clamp(Math.sin(Math.PI * t) * (0.74 + sample.intensity * 0.18), 0, 1, 0);
      const tongueSway = Math.sin(phase * 0.9) * pulse * sign;
      setFrameValue(frame, 'TongueOut', pulse, 0.96);
      setFrameValue(frame, 'ParamTongueOut_BS', pulse, 0.88);
      setFrameValue(frame, 'ParamTonguePhysics_X1', 9 * tongueSway, 0.54);
      setFrameValue(frame, 'ParamTonguePhysics_X2', 5.5 * tongueSway, 0.42);
      setFrameValue(frame, 'ParamTonguePhysics_Y1', -8 * pulse, 0.52);
      setFrameValue(frame, 'ParamTonguePhysics_Y2', -4.5 * pulse, 0.4);
      setMouthSmile(frame, 0.82, 0.62);
      break;
    }
    case 'ear_perk':
    case 'ear_wiggle': {
      const wiggle = Math.sin(phase * 1.35) * e;
      const perk = action.type === 'ear_perk' ? e * 1.05 : e * 0.92;
      setFrameValue(frame, 'ParamEarShape_L1', clamp(0.42 + 0.28 * perk + 0.08 * wiggle, -0.35, 0.92, 0), 0.72);
      setFrameValue(frame, 'ParamEarShape_R1', clamp(0.42 + 0.28 * perk - 0.08 * wiggle, -0.35, 0.92, 0), 0.72);
      setFrameValue(frame, 'ParamEarShape_L2', clamp(0.3 + 0.22 * perk + 0.05 * wiggle, -0.35, 0.86, 0), 0.58);
      setFrameValue(frame, 'ParamEarShape_R2', clamp(0.3 + 0.22 * perk - 0.05 * wiggle, -0.35, 0.86, 0), 0.58);
      for (let index = 1; index <= 4; index += 1) {
        setFrameValue(frame, `ParamEarPhysics_L${index}`, (18 * sign + 14 * wiggle) / index, 0.48);
        setFrameValue(frame, `ParamEarPhysics_R${index}`, (-18 * sign - 14 * wiggle) / index, 0.48);
      }
      setFrameValue(frame, 'ParamEarPhysicsBS_L1', 18 * perk + 8 * wiggle, 0.44);
      setFrameValue(frame, 'ParamEarPhysicsBS_R1', 18 * perk - 8 * wiggle, 0.44);
      break;
    }
    case 'hat_ear_wiggle': {
      const flap = Math.sin(phase * 1.5) * e;
      const lift = Math.sin(Math.PI * t) * e;
      for (let index = 1; index <= 3; index += 1) {
        setFrameValue(frame, `ParamHatEar_L${index}`, (18 * sign * lift + 15 * flap) / index, 0.54);
        setFrameValue(frame, `ParamHatEar_R${index}`, (-18 * sign * lift - 15 * flap) / index, 0.54);
      }
      for (let index = 1; index <= 4; index += 1) {
        setFrameValue(frame, `ParamHatPhysics_X${index}`, (12 * sign * lift + 9 * flap) / index, 0.42);
        setFrameValue(frame, `ParamHatPhysics_Y${index}`, (-10 * lift + 5 * Math.abs(flap)) / index, 0.38);
      }
      break;
    }
    case 'wing_flutter': {
      const flutter = Math.sin(phase * 2.2) * e;
      const lift = Math.sin(Math.PI * t) * e;
      for (let index = 1; index <= 4; index += 1) {
        setFrameValue(frame, `ParamWingPhysics_L${index}`, (24 * flutter + 12 * sign * lift) / index, 0.44);
        setFrameValue(frame, `ParamWingPhysics_R${index}`, (-24 * flutter + 12 * sign * lift) / index, 0.44);
      }
      break;
    }
    case 'dress_sway':
      for (let index = 1; index <= 5; index += 1) {
        setFrameValue(frame, `ParamCheongsamPhysics_X${index}`, (16 * sign * slow * e) / index, 0.4);
      }
      break;
    case 'emphasis': {
      const hit = Math.sin(Math.PI * t) * e;
      const rebound = Math.sin(Math.PI * 2 * t) * e;
      const side = sign * (0.9 * hit + 0.35 * rebound);
      setHead(frame, { y: -5.8 * hit + 1.1 * rebound, z: 3.2 * side }, 0.94);
      setFacePosition(frame, { y: -5.6 * hit + 0.8 * rebound, x: 0.9 * side }, 0.84);
      setBody(frame, {
        y: -4.6 * hit + 0.45 * rebound,
        z: 3.8 * side,
        posX: 0.045 * side,
        posY: 0.06 * hit
      }, 1);
      break;
    }
    case 'breathe':
      setBody(frame, { y: 1.8 * Math.sin(phase) * e, posY: 0.07 * Math.sin(phase) * e }, 0.45);
      break;
    case 'reset':
      setHead(frame, {}, 1);
      setBody(frame, {}, 1);
      setMouthSmile(frame, 0.56, 0.8);
      setBrows(frame, 0.52, 0.52, 0.55);
      break;
    default:
      break;
  }
}

function autoBlinkOpen(nowMs, baseOpen = 0.92) {
  return naturalAutoBlinkOpen(nowMs, baseOpen);
}

function applyAutoBlink(frame, samples, nowMs, baseOpen = 0.92, options = {}) {
  if (options.suppressEyeOpen) return;
  if (samples.some((sample) => behaviorActionBlocksAutoBlink(sample.action.type))) return;
  const open = autoBlinkOpen(nowMs, baseOpen);
  setEyeOpen(frame, open, open, 0.94);
}

function applyCharacterState(frame, character, strength = 1, options = {}) {
  if (!character) return;
  const amount = clamp(strength, 0, 1, 1);
  const speakingBlend = characterSpeakingBlend(character);
  const horizontalAmount = amount * lerp(1, 1.08, speakingBlend);
  const faceVerticalAmount = amount * lerp(1, 0.46, speakingBlend);
  const bodyVerticalAmount = amount * lerp(1, 0.22, speakingBlend);
  const bodyPositionVerticalAmount = amount * lerp(1, 0.08, speakingBlend);
  const bodyWeight = lerp(0.8, 0.84, speakingBlend);
  setHead(frame, {
    x: character.faceX * horizontalAmount,
    y: character.faceY * faceVerticalAmount,
    z: character.faceZ * horizontalAmount
  }, 0.88);
  setFacePosition(frame, {
    x: character.facePosX * horizontalAmount,
    y: character.facePosY * faceVerticalAmount
  }, lerp(0.64, 0.78, speakingBlend));
  setEyes(frame, character.eyeX * horizontalAmount, character.eyeY * amount, 0.78);
  if (!options.suppressEyeOpen) setEyeOpen(frame, character.eyeOpen, character.eyeOpen, 0.72);
  setMouthSmile(frame, character.mouthSmile, 0.72);
  setBrows(frame, character.browLeftY, character.browRightY, 0.54);
  setFrameValue(frame, 'ParamCheek', clamp((character.mouthSmile - 0.58) * 0.45 + character.energy * 0.05, 0, 0.35, 0.02), 0.32);
  setBody(frame, {
    x: character.bodyX * horizontalAmount,
    y: character.bodyY * bodyVerticalAmount,
    z: character.bodyZ * horizontalAmount,
    posX: character.bodyPosX * horizontalAmount,
    posY: character.bodyPosY * bodyPositionVerticalAmount
  }, bodyWeight);
  addAccessoryFollow(frame, {
    x: character.bodyX * horizontalAmount,
    y: character.bodyY * bodyVerticalAmount,
    z: character.bodyZ * horizontalAmount,
    posX: character.bodyPosX * horizontalAmount,
    posY: character.bodyPosY * bodyPositionVerticalAmount
  }, bodyWeight, character);
}

function finalizeFrame(frame) {
  return mapTrackingFrameToYachiyoCubismParameters([...frame.values()]);
}

function behaviorFrameIsMotionActive(performanceFrame, samples) {
  return Boolean(
    performanceFrame?.active ||
    performanceFrame?.behaviorPlan ||
    (Array.isArray(samples) && samples.length)
  );
}

export function sampleCubismBehaviorFrame(performanceFrame = {}, now = performance.now(), options = {}) {
  const { behaviorPlan, character, dominant, samples = [] } = performanceFrame || {};
  const expression = performanceFrame?.expression;
  const suppressEyeOpen = expressionOwnsEyeOpen(expression);
  const frame = createFrame({ suppressEyeOpen });
  const speakingBlend = characterSpeakingBlend(character);
  const motionActive = behaviorFrameIsMotionActive(performanceFrame, samples);
  const characterStrength = motionActive
    ? lerp(0.66, 0.42, speakingBlend)
    : lerp(1, 0.82, speakingBlend);

  applyCharacterState(frame, character, characterStrength, { suppressEyeOpen });
  applySemanticOverlay(frame, expression, behaviorPlan ? 0.76 : 0.48, { suppressEyeOpen });
  samples.forEach((sample) => applyAction(frame, sample, { dominant: sample === dominant, suppressEyeOpen }));
  applyMomentaryPulse(frame, options.momentaryPulse);
  applyAutoBlink(frame, samples, now, character?.eyeOpen, { suppressEyeOpen });
  applyExpressionEyeGuard(frame, expression);

  return finalizeFrame(frame);
}

export function mountCubismBehaviorBridge(options = {}) {
  if (typeof window === 'undefined') return () => {};

  window.TSUKUYOMI_CUBISM_BEHAVIOR_BRIDGE = true;
  const performanceBrain = getRoomLive2DPerformanceBrain();
  const frameSink = typeof options.onFrame === 'function' ? options.onFrame : null;
  const frameSource = String(options.source || 'cubism-behavior');
  let frameId = 0;
  let momentaryPulse = null;

  function dispatchFrame(parameters) {
    if (frameSink) {
      frameSink(parameters);
      return;
    }
    window.dispatchEvent(new CustomEvent(FACE_CAPTURE_EVENT, {
      detail: { source: frameSource, parameters }
    }));
  }

  function sample(now = performance.now()) {
    const performanceFrame = performanceBrain.sample(now, { intensityScale: LOCAL_CUBISM_ACTION_INTENSITY_SCALE });
    if (momentaryPulse && now - momentaryPulse.startedAt > momentaryPulse.durationMs) {
      momentaryPulse = null;
    }

    return sampleCubismBehaviorFrame(performanceFrame, now, { momentaryPulse });
  }

  function tick(now = performance.now()) {
    dispatchFrame(sample(now));
    frameId = window.requestAnimationFrame(tick);
  }

  function onRoomAct(event) {
    const detail = event.detail || {};
    const { expression } = performanceBrain.onRoomAct(detail);
    if (isMomentaryExpression(expression)) {
      momentaryPulse = {
        startedAt: performance.now() + 80,
        durationMs: MOMENTARY_PULSE_MS
      };
    }
  }

  function onMouth(event) {
    performanceBrain.onMouth(event.detail?.value);
  }

  function onCharacterState(event) {
    performanceBrain.onExternalState(event.detail || {});
  }

  window.addEventListener(ROOM_ACT_EVENT, onRoomAct);
  window.addEventListener(MOUTH_EVENT, onMouth);
  window.addEventListener(CHARACTER_STATE_EVENT, onCharacterState);
  frameId = window.requestAnimationFrame(tick);

  return () => {
    window.removeEventListener(ROOM_ACT_EVENT, onRoomAct);
    window.removeEventListener(MOUTH_EVENT, onMouth);
    window.removeEventListener(CHARACTER_STATE_EVENT, onCharacterState);
    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = 0;
    momentaryPulse = null;
    if (window.TSUKUYOMI_CUBISM_BEHAVIOR_BRIDGE) delete window.TSUKUYOMI_CUBISM_BEHAVIOR_BRIDGE;
  };
}
