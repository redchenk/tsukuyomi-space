import { YACHIYO_MODEL_PARAMETER_RANGES } from '../../constants/room/yachiyoModelParameterRegistry';

const DEFAULT_RANGE = [-30, 30];

export const TRACKING_PARAMETER_RANGES = {
  FacePositionX: [-15, 15],
  FacePositionY: [-15, 15],
  FacePositionZ: [-10, 10],
  FaceAngleX: [-30, 30],
  FaceAngleY: [-30, 30],
  FaceAngleZ: [-90, 90],
  MouthSmile: [0, 1],
  MouthOpen: [0, 1],
  VoiceVolumePlusMouthOpen: [0, 1],
  VoiceVolume: [0, 1],
  MouthX: [-1, 1],
  TongueOut: [0, 1],
  JawOpen: [0, 1],
  MouthPucker: [-1, 1],
  CheekPuff: [0, 1],
  MouthFunnel: [0, 1],
  MouthPressLipOpen: [-1.3, 1.3],
  MouthShrug: [0, 1],
  Brows: [0, 1],
  BrowLeftY: [0, 1],
  BrowRightY: [0, 1],
  EyeOpenLeft: [0, 1],
  EyeOpenRight: [0, 1],
  EyeLeftX: [-1, 1],
  EyeLeftY: [-1, 1],
  EyeRightX: [-1, 1],
  EyeRightY: [-1, 1],
  MocopiConnected: [0, 1],
  MocopiAngleX: [-30, 30],
  MocopiAngleY: [-30, 30],
  MocopiAngleZ: [-30, 30],
  MocopiBodyAngleX: [-10, 10],
  MocopiBodyAngleY: [-10, 10],
  MocopiBodyAngleZ: [-10, 10],
  MocopiBodyPositionX: [-1, 1],
  MocopiBodyPositionY: [-1, 1],
  MocopiBodyPositionZ: [-1, 1]
};

const TRACKING_PARAMETER_IDS = new Set(Object.keys(TRACKING_PARAMETER_RANGES));

const DIRECT_PARAMETER_RANGES = {
  ParamAngleX: [-30, 30],
  ParamAngleY: [-30, 30],
  ParamAngleZ: [-30, 30],
  PositionX: [-15, 15],
  PositionY: [-15, 15],
  PositionZ: [-30, 30],
  ParamPosition_Z: [-30, 30],
  ParamBodyAngleX: [-30, 30],
  ParamBodyAngleY: [-30, 30],
  ParamBodyAngleZ: [-30, 30],
  ParamMouthForm: [-1, 1],
  ParamMouthOpenY: [0, 2.1],
  ParamMouthX: [-1, 1],
  ParamMouthX2: [-1, 1],
  ParamTongueOut: [0, 1],
  ParamTongueOut_BS: [0, 1],
  ParamJawOpen: [0, 1],
  ParamMouthPuckerWiden: [-1, 1],
  ParamCheekPuff: [0, 1],
  ParamCheekPuff2: [0, 1],
  ParamMouthFunnel: [0, 1],
  ParamMouthPressLipOpen: [-1, 1],
  ParamMouthShrug: [0, 1],
  ParamEyeLOpen: [0, 1.9],
  ParamEyeROpen: [0, 1.9],
  ParamEyeBallX: [-1, 1],
  ParamEyeBallY: [-1, 1],
  ParamEyeBallX2: [-1, 1],
  ParamEyeBallY2: [-1, 1],
  ParamBrowLY: [-1, 1],
  ParamBrowRY: [-1, 1],
  ParamBrowLAngle: [-1, 1],
  ParamBrowRAngle: [-1, 1],
  ParamCheek: [0, 1],
  ParamBreath: [0, 1],
  ParamBreath2: [0, 1],
  ParamBreath3: [0, 1]
};

const BODY_SWITCHES = [
  'ParamSwitchCtrl_BodyX',
  'ParamSwitchCtrl_BodyY',
  'ParamSwitchCtrl_BodyZ',
  'ParamSwitchCtrl_ChestZ',
  'ParamSwitchCtrl_HipZ'
];

const BODY_PRIORITY_IDS = [
  ...BODY_SWITCHES,
  'ParamBodyInput_BodyX',
  'ParamBodyInput_BodyY',
  'ParamBodyInput_BodyZ',
  'ParamBodyInput_ChestZ',
  'ParamBodyInput_HipZ',
  'ParamOutput_BodyX',
  'ParamOutput_BodyY',
  'ParamOutput_BodyZ',
  'ParamOutput_ChestZ',
  'ParamOutput_HipZ',
  'ParamPhysicsRAM_BodyX',
  'ParamPhysicsRAM_BodyY',
  'ParamPhysicsRAM_BodyZ',
  'ParamPhysicsRAM_ChestZ',
  'ParamPhysicsRAM_HipZ',
  'ParamBodyAngleX',
  'ParamBodyAngleY',
  'ParamBodyAngleZ',
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
  'PositionZ',
  'ParamPosition_Z'
];

const BODY_PRIORITY = new Map(BODY_PRIORITY_IDS.map((id, index) => [id, index]));

function clamp(value, min, max, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
}

function unitToSigned(value) {
  return clamp((Number(value) - 0.5) * 2, -1, 1, 0);
}

function mapRange(value, inMin, inMax, outMin, outMax, fallback = outMin) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || inMax === inMin) return fallback;
  const t = (numeric - inMin) / (inMax - inMin);
  return outMin + (outMax - outMin) * t;
}

function parameterRange(id) {
  if (TRACKING_PARAMETER_RANGES[id]) return TRACKING_PARAMETER_RANGES[id];
  if (DIRECT_PARAMETER_RANGES[id]) return DIRECT_PARAMETER_RANGES[id];
  if (YACHIYO_MODEL_PARAMETER_RANGES[id]) return YACHIYO_MODEL_PARAMETER_RANGES[id];
  if (String(id).startsWith('ParamEarShape')) return [-1, 1];
  if (String(id).startsWith('ParamSwitchCtrl_')) return [0, 1];
  if (String(id).startsWith('Param')) return [-30, 30];
  return DEFAULT_RANGE;
}

export function isTrackingParameterId(id) {
  return TRACKING_PARAMETER_IDS.has(String(id || ''));
}

function normalizeFrameItem(raw) {
  const id = String(raw?.id || raw?.parameterId || raw?.param || '').trim();
  const value = Number(raw?.value);
  const weight = Number(raw?.weight ?? 0.75);
  if (!id || !Number.isFinite(value)) return null;
  const [min, max] = parameterRange(id);
  return {
    id,
    value: clamp(value, min, max),
    weight: clamp(weight, 0.01, 1, 0.75)
  };
}

function putWeighted(target, id, value, weight = 0.75, mode = 'replace') {
  if (!id || !Number.isFinite(Number(value))) return;
  const [min, max] = parameterRange(id);
  const next = {
    id,
    value: clamp(value, min, max),
    weight: clamp(weight, 0.01, 1, 0.75)
  };
  const current = target.get(id);
  if (!current) {
    target.set(id, next);
    return;
  }
  if (mode === 'add') {
    const total = current.weight + next.weight;
    target.set(id, {
      id,
      value: clamp((current.value * current.weight + next.value * next.weight) / Math.max(total, 0.01), min, max),
      weight: clamp(total, 0.01, 1)
    });
    return;
  }
  if (next.weight >= current.weight) target.set(id, next);
}

function addMapped(target, id, value, weight = 0.75) {
  putWeighted(target, id, value, weight, 'replace');
}

function prioritizedParameters(target) {
  return [...target.values()].sort((left, right) => {
    const leftPriority = BODY_PRIORITY.has(left.id) ? BODY_PRIORITY.get(left.id) : BODY_PRIORITY.size + 1;
    const rightPriority = BODY_PRIORITY.has(right.id) ? BODY_PRIORITY.get(right.id) : BODY_PRIORITY.size + 1;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return 0;
  });
}

function preserveDirectParameter(target, item) {
  const id = item.id;
  if (TRACKING_PARAMETER_IDS.has(id)) return;
  if (id === 'fire' || id.startsWith('Param') || id.startsWith('Circle_') || id.startsWith('Ring_')) {
    putWeighted(target, id, item.value, item.weight, 'replace');
  }
}

function mapFaceTracking(target, tracking) {
  const x = tracking.FaceAngleX;
  const y = tracking.FaceAngleY;
  const z = tracking.FaceAngleZ;
  const posX = tracking.FacePositionX;
  const posY = tracking.FacePositionY;
  const posZ = tracking.FacePositionZ;

  if (x) {
    addMapped(target, 'ParamAngleX', x.value, x.weight);
    addMapped(target, 'ParamBodyAngleX', mapRange(x.value, -30, 30, -10, 10), x.weight * 0.52);
  }
  if (y) {
    addMapped(target, 'ParamAngleY', mapRange(y.value, -20, 20, -30, 30), y.weight);
    addMapped(target, 'ParamBodyAngleY', mapRange(y.value, -30, 30, -10, 10), y.weight * 0.5);
  }
  if (z) {
    addMapped(target, 'ParamAngleZ', clamp(z.value, -30, 30), z.weight);
    addMapped(target, 'ParamBodyAngleZ', mapRange(clamp(z.value, -30, 30), -30, 30, -10, 10), z.weight * 0.5);
  }
  if (posX) addMapped(target, 'PositionX', posX.value, posX.weight * 0.36);
  if (posY) {
    const verticalBody = clamp(-posY.value * 1.18, -30, 30);
    addMapped(target, 'PositionY', posY.value, posY.weight * 0.34);
    addMapped(target, 'ParamBodyInput_BodyY', verticalBody, posY.weight * 0.72);
    addMapped(target, 'ParamOutput_BodyY', verticalBody * 1.08, posY.weight * 0.6);
    addMapped(target, 'ParamPhysicsRAM_BodyY', verticalBody * 1.08, posY.weight * 0.48);
    addMapped(target, 'ParamAngle_BodyY', verticalBody * 1.18, posY.weight * 0.68);
    addMapped(target, 'ParamAngle_BodyY2', verticalBody * 0.92, posY.weight * 0.58);
    addMapped(target, 'ParamPosition_Z', verticalBody * 0.48, posY.weight * 0.38);
    addMapped(target, 'ParamAngle_HipUp', Math.max(0, verticalBody * 0.45), posY.weight * 0.45);
    addMapped(target, 'ParamAngle_HipDown', Math.min(0, verticalBody * 0.45), posY.weight * 0.45);
  }
  if (posZ) {
    addMapped(target, 'PositionZ', posZ.value, posZ.weight * 0.42);
    addMapped(target, 'ParamPosition_Z', posZ.value, posZ.weight * 0.36);
  }
}

function mapEyeTracking(target, tracking) {
  const eyeX = tracking.EyeRightX || tracking.EyeLeftX;
  const eyeY = tracking.EyeRightY || tracking.EyeLeftY;
  if (tracking.EyeOpenLeft) {
    addMapped(target, 'ParamEyeLOpen', mapRange(tracking.EyeOpenLeft.value, 0, 1, 0, 1.9), tracking.EyeOpenLeft.weight);
  }
  if (tracking.EyeOpenRight) {
    addMapped(target, 'ParamEyeROpen', mapRange(tracking.EyeOpenRight.value, 0, 1, 0, 1.9), tracking.EyeOpenRight.weight);
  }
  if (eyeX) {
    const x = mapRange(eyeX.value, -1, 1, 1, -1);
    addMapped(target, 'ParamEyeBallX', x, eyeX.weight);
    addMapped(target, 'ParamEyeBallX2', x * 0.72, eyeX.weight * 0.46);
  }
  if (eyeY) {
    addMapped(target, 'ParamEyeBallY', eyeY.value, eyeY.weight);
    addMapped(target, 'ParamEyeBallY2', eyeY.value * 0.72, eyeY.weight * 0.46);
  }
}

function mapMouthTracking(target, tracking) {
  const mouthOpen = tracking.VoiceVolumePlusMouthOpen || tracking.MouthOpen;
  const voice = tracking.VoiceVolume;
  const jawOpen = tracking.JawOpen;
  const smile = tracking.MouthSmile;
  const mouthAmount = Math.max(
    Number(mouthOpen?.value) || 0,
    Number(voice?.value) || 0,
    Number(jawOpen?.value) || 0
  );

  if (smile) {
    const form = mapRange(smile.value, 0, 1, -1, 1);
    addMapped(target, 'ParamMouthForm', form, smile.weight);
    addMapped(target, 'ParamMouthShape', clamp(form * 0.42, -1, 1), smile.weight * 0.28);
    addMapped(target, 'ParamCheek', clamp((smile.value - 0.5) * 0.42, 0, 0.36), smile.weight * 0.34);
  }
  if (mouthOpen || voice || jawOpen) {
    const weight = Math.max(mouthOpen?.weight || 0, voice?.weight || 0, jawOpen?.weight || 0, 0.5);
    addMapped(target, 'ParamMouthOpenY', mouthAmount * 2.1, weight * 0.72);
    addMapped(target, 'ParamJawOpen', Math.max(mouthAmount, Number(jawOpen?.value) || 0), weight);
  }
  if (tracking.MouthX) {
    addMapped(target, 'ParamMouthX', tracking.MouthX.value, tracking.MouthX.weight);
    addMapped(target, 'ParamMouthX2', tracking.MouthX.value * 0.72, tracking.MouthX.weight * 0.72);
  }
  if (tracking.TongueOut) {
    addMapped(target, 'ParamTongueOut', tracking.TongueOut.value, tracking.TongueOut.weight);
    addMapped(target, 'ParamTongueOut_BS', tracking.TongueOut.value, tracking.TongueOut.weight * 0.82);
  }
  if (tracking.MouthPucker) addMapped(target, 'ParamMouthPuckerWiden', tracking.MouthPucker.value, tracking.MouthPucker.weight);
  if (tracking.CheekPuff) {
    addMapped(target, 'ParamCheekPuff', tracking.CheekPuff.value, tracking.CheekPuff.weight);
    addMapped(target, 'ParamCheekPuff2', tracking.CheekPuff.value * 0.72, tracking.CheekPuff.weight * 0.72);
  }
  if (tracking.MouthFunnel) addMapped(target, 'ParamMouthFunnel', tracking.MouthFunnel.value, tracking.MouthFunnel.weight);
  if (tracking.MouthPressLipOpen) addMapped(target, 'ParamMouthPressLipOpen', tracking.MouthPressLipOpen.value, tracking.MouthPressLipOpen.weight);
  if (tracking.MouthShrug) addMapped(target, 'ParamMouthShrug', tracking.MouthShrug.value, tracking.MouthShrug.weight);
}

function mapBrowTracking(target, tracking) {
  const brows = tracking.Brows;
  const left = tracking.BrowLeftY || brows;
  const right = tracking.BrowRightY || brows;
  if (left) {
    const y = unitToSigned(left.value);
    addMapped(target, 'ParamBrowLY', y, left.weight);
    addMapped(target, 'ParamBrowLAngle', clamp(y * 0.34, -1, 1), left.weight * 0.38);
  }
  if (right) {
    const y = unitToSigned(right.value);
    addMapped(target, 'ParamBrowRY', y, right.weight);
    addMapped(target, 'ParamBrowRAngle', clamp(y * -0.34, -1, 1), right.weight * 0.38);
  }
}

function mapBodyTracking(target, tracking) {
  const connected = (tracking.MocopiConnected?.value ?? 1) > 0.1;
  if (connected) BODY_SWITCHES.forEach((id) => addMapped(target, id, 1, 1));

  const bodyX = tracking.MocopiBodyAngleX?.value ?? ((tracking.MocopiAngleX?.value || 0) / 2.8);
  const bodyY = tracking.MocopiBodyAngleY?.value ?? ((tracking.MocopiAngleY?.value || 0) / 2.8);
  const bodyZ = tracking.MocopiBodyAngleZ?.value ?? ((tracking.MocopiAngleZ?.value || 0) / 2.8);
  const posX = tracking.MocopiBodyPositionX?.value || 0;
  const posY = tracking.MocopiBodyPositionY?.value || 0;
  const hasBody = ['MocopiBodyAngleX', 'MocopiBodyAngleY', 'MocopiBodyAngleZ', 'MocopiAngleX', 'MocopiAngleY', 'MocopiAngleZ']
    .some((id) => tracking[id]);
  const weight = Math.max(
    tracking.MocopiBodyAngleX?.weight || 0,
    tracking.MocopiBodyAngleY?.weight || 0,
    tracking.MocopiBodyAngleZ?.weight || 0,
    tracking.MocopiAngleX?.weight || 0,
    tracking.MocopiAngleY?.weight || 0,
    tracking.MocopiAngleZ?.weight || 0,
    tracking.MocopiBodyPositionX?.weight || 0,
    tracking.MocopiBodyPositionY?.weight || 0,
    hasBody ? 0.7 : 0
  );

  if (!hasBody && !posX && !posY) return;

  const outputX = bodyX * 1.52 + posX * 10.5;
  const outputY = bodyY * 1.38 + posY * 18;
  const outputZ = bodyZ * 1.56 + posX * 5.5;
  const chestZ = bodyZ * 1.18 + bodyX * 0.28 + posX * 5.2;
  const hipZ = -bodyZ * 1.02 + bodyX * 0.18 - posX * 4.8;
  const depth = clamp(-bodyY * 1.1 + posY * 9.5, -30, 30);
  const lift = bodyY * 0.44 + posY * 20;
  const drop = bodyY * 0.34 - posY * 16;

  addMapped(target, 'ParamBodyInput_BodyX', bodyX * 1.35 + posX * 7.5, weight * 0.98);
  addMapped(target, 'ParamBodyInput_BodyY', bodyY * 1.28 + posY * 11.5, weight * 0.98);
  addMapped(target, 'ParamBodyInput_BodyZ', bodyZ * 1.36 + posX * 4.2, weight * 0.98);
  addMapped(target, 'ParamBodyInput_ChestZ', chestZ * 0.86, weight * 0.82);
  addMapped(target, 'ParamBodyInput_HipZ', hipZ * 0.78, weight * 0.76);
  addMapped(target, 'PositionZ', depth * 0.58, weight * 0.72);
  addMapped(target, 'ParamPosition_Z', depth * 0.66, weight * 0.62);

  addMapped(target, 'ParamOutput_BodyX', outputX, weight * 0.82);
  addMapped(target, 'ParamOutput_BodyY', outputY, weight * 0.86);
  addMapped(target, 'ParamOutput_BodyZ', outputZ, weight * 0.82);
  addMapped(target, 'ParamOutput_ChestZ', chestZ, weight * 0.78);
  addMapped(target, 'ParamOutput_HipZ', hipZ, weight * 0.72);
  addMapped(target, 'ParamPhysicsRAM_BodyX', outputX * 0.92, weight * 0.74);
  addMapped(target, 'ParamPhysicsRAM_BodyY', outputY * 0.94, weight * 0.78);
  addMapped(target, 'ParamPhysicsRAM_BodyZ', outputZ * 0.92, weight * 0.74);
  addMapped(target, 'ParamPhysicsRAM_ChestZ', chestZ * 0.9, weight * 0.68);
  addMapped(target, 'ParamPhysicsRAM_HipZ', hipZ * 0.86, weight * 0.64);

  addMapped(target, 'ParamBodyAngleX', bodyX * 0.62 + posX * 2.4, weight * 0.52);
  addMapped(target, 'ParamBodyAngleY', bodyY * 0.58 + posY * 4.2, weight * 0.58);
  addMapped(target, 'ParamBodyAngleZ', bodyZ * 0.62, weight * 0.52);
  addMapped(target, 'ParamAngle_BodyX', outputX * 0.96, weight * 0.82);
  addMapped(target, 'ParamAngle_BodyX2', outputX * 0.72 + outputZ * 0.12, weight * 0.68);
  addMapped(target, 'ParamAngle_BodyX3', outputX * 0.48, weight * 0.56);
  addMapped(target, 'ParamAngle_BodyY', outputY * 0.96, weight * 0.86);
  addMapped(target, 'ParamAngle_BodyY2', outputY * 0.72, weight * 0.7);
  addMapped(target, 'ParamAngle_BodyZ', outputZ * 0.94, weight * 0.82);
  addMapped(target, 'ParamAngle_BodyZ2', outputZ * 0.72 + chestZ * 0.16, weight * 0.68);
  addMapped(target, 'ParamAngle_ChestZ', chestZ * 0.88, weight * 0.72);
  addMapped(target, 'ParamAngle_HipZ', hipZ * 0.82, weight * 0.66);
  addMapped(target, 'ParamAngle_ShoulderL', -chestZ * 0.36 + posY * 6.2, weight * 0.58);
  addMapped(target, 'ParamAngle_ShoulderR', chestZ * 0.36 + posY * 6.2, weight * 0.58);
  addMapped(target, 'ParamAngle_HipUp', Math.max(0, lift), weight * 0.68);
  addMapped(target, 'ParamAngle_HipDown', Math.min(0, drop), weight * 0.6);
  addMapped(target, 'ParamHairFront', -outputY * 0.32 + outputZ * 0.12, weight * 0.42);
  addMapped(target, 'ParamHairSide', -outputX * 0.32 - outputZ * 0.24, weight * 0.42);
  addMapped(target, 'ParamHairBack', outputZ * 0.28 + outputY * 0.16, weight * 0.38);
}

function mapBreath(target, tracking) {
  if (tracking.ParamBreath) {
    addMapped(target, 'ParamBreath', tracking.ParamBreath.value, tracking.ParamBreath.weight);
    return;
  }
  if (tracking.MocopiBodyPositionY) {
    const breath = clamp(0.48 + tracking.MocopiBodyPositionY.value * 0.34, 0, 1);
    addMapped(target, 'ParamBreath', breath, tracking.MocopiBodyPositionY.weight * 0.28);
  }
}

export function mapTrackingFrameToYachiyoCubismParameters(frameItems = []) {
  const target = new Map();
  const tracking = {};

  for (const raw of Array.isArray(frameItems) ? frameItems : []) {
    const item = normalizeFrameItem(raw);
    if (!item) continue;
    if (TRACKING_PARAMETER_IDS.has(item.id)) tracking[item.id] = item;
    else preserveDirectParameter(target, item);
  }

  mapFaceTracking(target, tracking);
  mapEyeTracking(target, tracking);
  mapMouthTracking(target, tracking);
  mapBrowTracking(target, tracking);
  mapBodyTracking(target, tracking);
  mapBreath(target, tracking);

  return prioritizedParameters(target).slice(0, 180);
}
