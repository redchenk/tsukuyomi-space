function parameter(id, value, weight = 0.7, durationMs = 900, delayMs = 0) {
  return { id, value, weight, durationMs, delayMs };
}

function sideSign(side, fallback = 1) {
  if (side === 'left') return -1;
  if (side === 'right') return 1;
  return fallback;
}

export function normalizeBehaviorToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export const BEHAVIOR_ACTION_DEFINITIONS = [
  {
    id: 'look_at_chat',
    label: 'Look at chat',
    prompt: 're-establish eye contact with the audience',
    aliases: ['look', 'look_at_user', 'look_at_viewer', 'glance', 'eye_contact'],
    defaultDurationMs: 1200,
    fallbackPattern: /(look(?:s|ing)?(?:\s|-|_)?(?:at)?(?:\s|-|_)?(?:chat|viewer|audience)|glance|eye contact)/i,
    fallbackActions: [{ type: 'look_at_chat', duration: 1.0 }],
    vtsPriority: 4,
    parameters(action) {
      const amount = action.intensity;
      return [
        parameter('ParamAngle_HeadX', 3.6 * amount, 0.5, action.durationMs, action.delayMs),
        parameter('ParamAngle_HeadY', -1.4 * amount, 0.42, action.durationMs, action.delayMs),
        parameter('ParamEyeBallX', -0.14 * amount, 0.72, action.durationMs, action.delayMs),
        parameter('ParamEyeBallY', -0.1 * amount, 0.62, action.durationMs, action.delayMs)
      ];
    }
  },
  {
    id: 'smirk',
    label: 'Smirk',
    prompt: 'smug or teasing smile',
    aliases: ['smug', 'grin'],
    defaultDurationMs: 1400,
    fallbackPattern: /(smug|smirk|teas|playful)/i,
    fallbackActions: [
      { type: 'look_at_chat', duration: 1.0 },
      { type: 'smirk', duration: 1.5, delay: 0.1 },
      { type: 'head_tilt', side: 'right', duration: 1.2, delay: 0.2 }
    ],
    parameters(action) {
      const amount = action.intensity;
      return [
        parameter('ParamMouthForm', 0.7, 0.78, action.durationMs, action.delayMs),
        parameter('ParamBrowLY', 0.18 * amount, 0.46, action.durationMs, action.delayMs),
        parameter('ParamBrowRY', 0.08 * amount, 0.42, action.durationMs, action.delayMs),
        parameter('ParamCheek', 0.16 * amount, 0.36, action.durationMs, action.delayMs)
      ];
    }
  },
  {
    id: 'smile',
    label: 'Smile',
    prompt: 'warm smile',
    aliases: ['happy', 'joy', 'cheerful'],
    defaultDurationMs: 1400,
    fallbackPattern: /(happy|smile|joy|cheerful)/i,
    fallbackActions: [
      { type: 'look_at_chat', duration: 1.0 },
      { type: 'smile', duration: 1.6, delay: 0.1 },
      { type: 'nod', duration: 1.2, delay: 0.2 }
    ],
    parameters(action) {
      const amount = action.intensity;
      return [
        parameter('ParamMouthForm', 0.48, 0.78, action.durationMs, action.delayMs),
        parameter('ParamBrowLY', 0.08 * amount, 0.46, action.durationMs, action.delayMs),
        parameter('ParamBrowRY', 0.08 * amount, 0.42, action.durationMs, action.delayMs),
        parameter('ParamCheek', 0.1 * amount, 0.36, action.durationMs, action.delayMs)
      ];
    }
  },
  {
    id: 'blink',
    label: 'Blink',
    prompt: 'natural blink',
    aliases: [],
    defaultDurationMs: 360,
    blocksAutoBlink: true,
    fallbackPattern: /(blink(?:s|ing)?)/i,
    fallbackActions: [{ type: 'blink', duration: 0.36 }],
    parameters(action) {
      return [
        parameter('ParamEyeLOpen', 0.04, 0.82, action.durationMs, action.delayMs),
        parameter('ParamEyeROpen', 0.04, 0.82, action.durationMs, action.delayMs)
      ];
    }
  },
  {
    id: 'wink',
    label: 'Wink',
    prompt: 'playful one-eye wink, side left/right',
    aliases: [],
    defaultDurationMs: 520,
    blocksAutoBlink: true,
    fallbackPattern: /(wink(?:s|ing)?)/i,
    fallbackActions: [{ type: 'wink', side: 'right', duration: 0.52 }],
    parameters(action) {
      return [parameter(action.side === 'left' ? 'ParamEyeLOpen' : 'ParamEyeROpen', 0.05, 0.82, action.durationMs, action.delayMs)];
    }
  },
  {
    id: 'nod',
    label: 'Nod',
    buttonLabel: 'Nod',
    motionLabel: 'Nod',
    prompt: 'agreement or acknowledgement',
    motionPrompt: 'agreeing, greeting, or acknowledging the audience',
    aliases: ['agree', 'yes'],
    bodyPose: 'nod',
    defaultDurationMs: 1200,
    inferredIntensity: 0.88,
    inferredDurationMs: 2400,
    fallbackPattern: /(nod|nodd?ing|agree|yes)/i,
    fallbackActions: [{ type: 'nod', duration: 1.5 }],
    vtsPriority: 7
  },
  {
    id: 'shake_head',
    label: 'Shake head',
    buttonLabel: 'Shake',
    motionLabel: 'Shake head',
    prompt: 'playful refusal or disbelief',
    motionPrompt: 'gentle refusal, surprise, or playful disagreement',
    aliases: ['shake', 'no'],
    bodyPose: 'shake_head',
    defaultDurationMs: 1200,
    inferredIntensity: 0.9,
    inferredDurationMs: 2600,
    fallbackPattern: /(shake(?:s|ing)?(?:\s|-|_)?head|headshake|nope|shake|no)/i,
    fallbackActions: [{ type: 'shake_head', duration: 1.5 }],
    vtsPriority: 7
  },
  {
    id: 'head_tilt',
    label: 'Head tilt',
    prompt: 'tilt head, side left/right',
    aliases: ['tilt'],
    defaultDurationMs: 1200,
    defaultSide: 'right',
    fallbackPattern: /(tilt(?:s|ing)?(?:\s|-|_)?head|head(?:\s|-|_)?tilt|tilt)/i,
    fallbackActions: [{ type: 'head_tilt', side: 'right', duration: 1.2 }],
    vtsPriority: 7.6,
    parameters(action) {
      const sign = sideSign(action.side);
      const amount = action.intensity;
      return [
        parameter('ParamAngle_HeadZ', sign * 9 * amount, 0.82, action.durationMs, action.delayMs),
        parameter('ParamAngle_HeadZ2', sign * 5 * amount, 0.48, action.durationMs, action.delayMs),
        parameter('ParamAngle_BodyZ', sign * 4.5 * amount, 0.44, action.durationMs, action.delayMs)
      ];
    }
  },
  {
    id: 'lean_in',
    label: 'Lean in',
    buttonLabel: 'Lean',
    motionLabel: 'Lean in',
    prompt: 'move closer for focus or teasing',
    motionPrompt: 'curiosity, whispering, intimacy, or focusing on the audience',
    aliases: ['lean', 'forward', 'close'],
    bodyPose: 'lean_in',
    defaultDurationMs: 1400,
    inferredIntensity: 0.92,
    inferredDurationMs: 3200,
    fallbackPattern: /(lean(?:s|ing)?(?:\s|-|_)?(?:in|forward)|closer)/i,
    fallbackActions: [{ type: 'lean_in', duration: 1.5 }],
    vtsPriority: 8
  },
  {
    id: 'lean_left',
    label: 'Lean left',
    buttonLabel: 'Left',
    motionLabel: 'Lean left',
    prompt: 'side lean to the left',
    motionPrompt: 'playful tilt or soft side movement',
    aliases: ['left', 'tilt_left'],
    bodyPose: 'lean_left',
    defaultDurationMs: 1400,
    inferredIntensity: 0.86,
    inferredDurationMs: 3200,
    fallbackPattern: /(lean(?:s|ing)?(?:\s|-|_)?left|tilt(?:s|ing)?(?:\s|-|_)?left)/i,
    fallbackActions: [{ type: 'lean_left', duration: 1.5 }],
    vtsPriority: 7.8
  },
  {
    id: 'lean_right',
    label: 'Lean right',
    buttonLabel: 'Right',
    motionLabel: 'Lean right',
    prompt: 'side lean to the right',
    motionPrompt: 'playful tilt or soft side movement',
    aliases: ['right', 'tilt_right'],
    bodyPose: 'lean_right',
    defaultDurationMs: 1400,
    inferredIntensity: 0.86,
    inferredDurationMs: 3200,
    fallbackPattern: /(lean(?:s|ing)?(?:\s|-|_)?right|tilt(?:s|ing)?(?:\s|-|_)?right)/i,
    fallbackActions: [{ type: 'lean_right', duration: 1.5 }],
    vtsPriority: 7.8
  },
  {
    id: 'sway',
    label: 'Sway',
    buttonLabel: 'Sway',
    motionLabel: 'Sway',
    prompt: 'relaxed idle streamer motion',
    motionPrompt: 'idle rhythmic body movement or cheerful energy',
    aliases: ['swing'],
    bodyPose: 'sway',
    defaultDurationMs: 1800,
    inferredIntensity: 0.82,
    inferredDurationMs: 3600,
    fallbackPattern: /(sway|swing)/i,
    fallbackActions: [{ type: 'sway', duration: 2.0 }],
    vtsPriority: 5.4
  },
  {
    id: 'bounce',
    label: 'Bounce',
    buttonLabel: 'Bounce',
    motionLabel: 'Bounce',
    prompt: 'excited vertical accent',
    motionPrompt: 'excited response or lively emphasis',
    aliases: ['jump', 'excited'],
    bodyPose: 'bounce',
    defaultDurationMs: 1400,
    inferredIntensity: 0.96,
    inferredDurationMs: 2800,
    fallbackPattern: /(bounce|jump|excited)/i,
    fallbackActions: [{ type: 'bounce', duration: 1.4 }],
    vtsPriority: 8.4
  },
  {
    id: 'shiver',
    label: 'Shiver',
    prompt: 'small embarrassed or excited tremble',
    aliases: ['tremble'],
    bodyPose: 'sway',
    defaultDurationMs: 1200,
    fallbackPattern: /(shiver|tremble)/i,
    fallbackActions: [
      { type: 'look_at_chat', duration: 1.0 },
      { type: 'shiver', duration: 1.2, delay: 0.2 }
    ],
    vtsPriority: 5.8
  },
  {
    id: 'surprised',
    label: 'Surprised',
    prompt: 'widened eyes and small mouth opening',
    aliases: ['surprise'],
    defaultDurationMs: 1000,
    blocksAutoBlink: true,
    fallbackPattern: /(surpris|surprise)/i,
    fallbackActions: [
      { type: 'surprised', duration: 1.2 },
      { type: 'lean_in', duration: 1.2, delay: 0.2 }
    ],
    parameters(action) {
      return [
        parameter('ParamEyeLOpen', 1, 0.86, action.durationMs, action.delayMs),
        parameter('ParamEyeROpen', 1, 0.86, action.durationMs, action.delayMs),
        parameter('ParamMouthOpenY', 0.28, 0.38, action.durationMs, action.delayMs),
        parameter('ParamBrowLY', 0.34, 0.64, action.durationMs, action.delayMs),
        parameter('ParamBrowRY', 0.34, 0.64, action.durationMs, action.delayMs)
      ];
    }
  },
  {
    id: 'tongue_out',
    label: 'Tongue out',
    prompt: 'brief playful tongue-out/blep accent; use for cheeky jokes and teasing',
    aliases: ['tongue', 'blep', 'tongueout', 'cheeky', 'mischief'],
    defaultDurationMs: 760,
    fallbackPattern: /(\u5410\u820c|\u8210\u820c|\u820c\u5934|\u820c\u982d|tongue|blep|cheeky|mischief|teasing)/iu,
    fallbackActions: [
      { type: 'look_at_chat', duration: 0.8 },
      { type: 'tongue_out', duration: 0.76, delay: 0.08 },
      { type: 'ear_wiggle', duration: 1.1, delay: 0.12 },
      { type: 'smirk', duration: 1.1, delay: 0.16 }
    ],
    parameters(action) {
      const amount = action.intensity;
      return [
        parameter('TongueOut', 1, 0.88, action.durationMs, action.delayMs),
        parameter('ParamTongueOut_BS', 1, 0.82, action.durationMs, action.delayMs),
        parameter('ParamTonguePhysics_X1', 8 * sideSign(action.side, 1) * amount, 0.52, action.durationMs, action.delayMs),
        parameter('ParamTonguePhysics_X2', 5 * sideSign(action.side, 1) * amount, 0.42, action.durationMs, action.delayMs),
        parameter('ParamTonguePhysics_Y1', -7 * amount, 0.46, action.durationMs, action.delayMs),
        parameter('ParamTonguePhysics_Y2', -4 * amount, 0.38, action.durationMs, action.delayMs),
        parameter('MouthSmile', 0.82, 0.58, action.durationMs, action.delayMs),
        parameter('MouthOpen', 0.18, 0.28, action.durationMs, action.delayMs)
      ];
    }
  },
  {
    id: 'ear_wiggle',
    label: 'Ear wiggle',
    prompt: 'animal ears twitch or wiggle in a lively way',
    aliases: ['ears_wiggle', 'ear_twitch', 'twitch_ears', 'kemonomimi_wiggle'],
    defaultDurationMs: 1150,
    fallbackPattern: /(\u8033\u6735\u52a8|\u8033\u6735\u52d5|\u52a8\u8033\u6735|\u52d5\u8033\u6735|\u8033\u6735\u6296|\u8033\u6735\u6643|\u517d\u8033\u52a8|\u7378\u8033\u52d5|ear(?:s)?\s*(?:wiggle|twitch|move)|wiggle(?:s|ing)?\s*ear)/iu,
    fallbackActions: [
      { type: 'ear_wiggle', duration: 1.25 },
      { type: 'smile', duration: 1.15, delay: 0.08 },
      { type: 'sway', duration: 1.25, delay: 0.18, intensity: 0.58 }
    ],
    parameters(action) {
      const amount = action.intensity;
      const sign = sideSign(action.side, 1);
      return [
        parameter('ParamEarShape_L1', 0.62 * amount, 0.64, action.durationMs, action.delayMs),
        parameter('ParamEarShape_R1', 0.54 * amount, 0.64, action.durationMs, action.delayMs),
        parameter('ParamEarPhysics_L1', (18 + 5 * sign) * amount, 0.46, action.durationMs, action.delayMs),
        parameter('ParamEarPhysics_R1', (-18 + 5 * sign) * amount, 0.46, action.durationMs, action.delayMs),
        parameter('ParamEarPhysicsBS_L1', 14 * amount, 0.4, action.durationMs, action.delayMs),
        parameter('ParamEarPhysicsBS_R1', 14 * amount, 0.4, action.durationMs, action.delayMs)
      ];
    }
  },
  {
    id: 'ear_perk',
    label: 'Ear perk',
    prompt: 'animal ears perk up for curiosity, excitement, or sudden attention',
    aliases: ['animal_ears', 'beast_ears', 'ears_up', 'perk_ears', 'kemonomimi'],
    defaultDurationMs: 1200,
    fallbackPattern: /(\u517d\u8033|\u7378\u8033|\u732b\u8033|\u8033\u6735\u7ad6|\u7ad6\u8033|animal ears|beast ears|cat ears|kemonomimi|ear(?:s)?\s*perk)/iu,
    fallbackActions: [
      { type: 'ear_perk', duration: 1.25 },
      { type: 'look_at_chat', duration: 0.9, delay: 0.12 },
      { type: 'smile', duration: 1.2, delay: 0.2 }
    ],
    parameters(action) {
      const amount = action.intensity;
      return [
        parameter('ParamEarShape_L1', 0.72 * amount, 0.68, action.durationMs, action.delayMs),
        parameter('ParamEarShape_R1', 0.72 * amount, 0.68, action.durationMs, action.delayMs),
        parameter('ParamEarShape_L2', 0.48 * amount, 0.54, action.durationMs, action.delayMs),
        parameter('ParamEarShape_R2', 0.48 * amount, 0.54, action.durationMs, action.delayMs),
        parameter('ParamEarPhysicsBS_L1', 16 * amount, 0.42, action.durationMs, action.delayMs),
        parameter('ParamEarPhysicsBS_R1', 16 * amount, 0.42, action.durationMs, action.delayMs)
      ];
    }
  },
  {
    id: 'hat_ear_wiggle',
    label: 'Hat ear wiggle',
    prompt: 'hat ears flap or wiggle, separate from the animal ears',
    aliases: ['hat_ears', 'hat_ear', 'hat_wiggle'],
    defaultDurationMs: 1200,
    fallbackPattern: /(\u5e3d\u5b50\u8033\u6735|\u5e3d\u8033|\u5e3d\u5b50\u52a8|\u5e3d\u5b50\u52d5|hat ears?|hat ear wiggle|hat wiggle)/iu,
    fallbackActions: [
      { type: 'hat_ear_wiggle', duration: 1.25 },
      { type: 'head_tilt', side: 'random', duration: 1.05, delay: 0.14, intensity: 0.52 },
      { type: 'smile', duration: 1.1, delay: 0.22 }
    ],
    parameters(action) {
      const amount = action.intensity;
      const sign = sideSign(action.side, 1);
      return [
        parameter('ParamHatEar_L1', (15 + 5 * sign) * amount, 0.48, action.durationMs, action.delayMs),
        parameter('ParamHatEar_R1', (-15 + 5 * sign) * amount, 0.48, action.durationMs, action.delayMs),
        parameter('ParamHatPhysics_X1', 9 * sign * amount, 0.42, action.durationMs, action.delayMs),
        parameter('ParamHatPhysics_Y1', -7 * amount, 0.38, action.durationMs, action.delayMs)
      ];
    }
  },
  {
    id: 'wing_flutter',
    label: 'Wing flutter',
    prompt: 'small wing flutter for excitement, surprise, or magical emphasis',
    aliases: ['wings', 'wing', 'flutter_wings'],
    defaultDurationMs: 1250,
    fallbackPattern: /(\u7fc5\u8180|\u7ffc|wing(?:s)?|flutter(?:s|ing)?)/iu,
    fallbackActions: [
      { type: 'wing_flutter', duration: 1.25 },
      { type: 'bounce', duration: 1.05, delay: 0.12, intensity: 0.56 },
      { type: 'smile', duration: 1.1, delay: 0.2 }
    ],
    parameters(action) {
      const amount = action.intensity;
      return [
        parameter('ParamWingPhysics_L1', 20 * amount, 0.44, action.durationMs, action.delayMs),
        parameter('ParamWingPhysics_R1', -20 * amount, 0.44, action.durationMs, action.delayMs),
        parameter('ParamWingPhysics_L2', 13 * amount, 0.36, action.durationMs, action.delayMs),
        parameter('ParamWingPhysics_R2', -13 * amount, 0.36, action.durationMs, action.delayMs)
      ];
    }
  },
  {
    id: 'dress_sway',
    label: 'Dress sway',
    prompt: 'qipao/cheongsam cloth sways with the body',
    aliases: ['cheongsam_sway', 'qipao_sway', 'cloth_sway'],
    defaultDurationMs: 1300,
    fallbackPattern: /(\u65d7\u888d|\u88d9\u6446|\u8863\u6446|cheongsam|qipao|dress sway|cloth sway)/iu,
    fallbackActions: [
      { type: 'dress_sway', duration: 1.3 },
      { type: 'sway', duration: 1.3, delay: 0.1, intensity: 0.55 }
    ],
    parameters(action) {
      const amount = action.intensity;
      const sign = sideSign(action.side, 1);
      return [
        parameter('ParamCheongsamPhysics_X1', 12 * sign * amount, 0.42, action.durationMs, action.delayMs),
        parameter('ParamCheongsamPhysics_X2', 8 * sign * amount, 0.36, action.durationMs, action.delayMs),
        parameter('ParamCheongsamPhysics_X3', 5 * sign * amount, 0.32, action.durationMs, action.delayMs)
      ];
    }
  },
  {
    id: 'emphasis',
    label: 'Emphasis',
    buttonLabel: 'Hit',
    motionLabel: 'Emphasis',
    prompt: 'punchline/body accent',
    motionPrompt: 'small body accent when stressing a line',
    aliases: ['hit', 'accent', 'tap_body', 'body_tap', 'tapbody'],
    bodyPose: 'emphasis',
    defaultDurationMs: 1100,
    inferredIntensity: 0.9,
    inferredDurationMs: 2200,
    fallbackPattern: /(emphasis|accent|punchline|hit)/i,
    fallbackActions: [{ type: 'emphasis', duration: 1.2 }],
    vtsPriority: 9
  },
  {
    id: 'breathe',
    label: 'Breathe',
    prompt: 'calm idle breath',
    aliases: ['idle', 'breath'],
    defaultDurationMs: 1800,
    fallbackActions: [{ type: 'breathe', duration: 1.8 }],
    vtsPriority: 1
  },
  {
    id: 'reset',
    label: 'Reset',
    prompt: 'return to neutral tracking',
    aliases: ['reset'],
    defaultDurationMs: 800
  }
];

const DEFINITIONS_BY_ID = new Map(BEHAVIOR_ACTION_DEFINITIONS.map((definition) => [definition.id, definition]));
const ALIASES = new Map();

for (const definition of BEHAVIOR_ACTION_DEFINITIONS) {
  ALIASES.set(normalizeBehaviorToken(definition.id), definition.id);
  for (const alias of definition.aliases || []) {
    ALIASES.set(normalizeBehaviorToken(alias), definition.id);
  }
}

function cloneActions(actions = []) {
  return actions.map((action) => ({ ...action }));
}

export function behaviorActionDefinition(type) {
  return DEFINITIONS_BY_ID.get(normalizeBehaviorActionType(type)) || null;
}

export function normalizeBehaviorActionType(value) {
  const key = normalizeBehaviorToken(value);
  return ALIASES.get(key) || '';
}

export function isKnownBehaviorActionType(type) {
  return DEFINITIONS_BY_ID.has(type);
}

export function behaviorActionDefaultDurationMs(type) {
  return behaviorActionDefinition(type)?.defaultDurationMs || 1200;
}

export function behaviorActionDefaultSide(type) {
  return behaviorActionDefinition(type)?.defaultSide || '';
}

export function behaviorActionBodyPose(type) {
  return behaviorActionDefinition(type)?.bodyPose || '';
}

export function behaviorActionPriority(type) {
  return Number(behaviorActionDefinition(type)?.vtsPriority) || 0;
}

export function behaviorActionBlocksAutoBlink(type) {
  return Boolean(behaviorActionDefinition(type)?.blocksAutoBlink);
}

export function behaviorActionParameterTargets(action) {
  const definition = behaviorActionDefinition(action?.type);
  return definition?.parameters ? definition.parameters(action) : [];
}

export function matchBehaviorActionsFromText(text) {
  const value = String(text || '').toLowerCase();
  for (const definition of BEHAVIOR_ACTION_DEFINITIONS) {
    if (definition.fallbackPattern?.test(value) && definition.fallbackActions?.length) {
      return cloneActions(definition.fallbackActions);
    }
  }
  return [];
}

export function fallbackBehaviorActionsForText(text) {
  const matched = matchBehaviorActionsFromText(text);
  if (matched.length) return matched;
  return [{ type: 'look_at_chat', duration: 1.0 }, { type: 'breathe', duration: 1.8, delay: 0.1 }];
}

export function matchBehaviorBodyPoseFromText(text) {
  const value = String(text || '').toLowerCase();
  for (const definition of BEHAVIOR_ACTION_DEFINITIONS) {
    if (!definition.bodyPose || !definition.fallbackPattern?.test(value)) continue;
    return {
      actionType: definition.id,
      bodyPose: definition.bodyPose,
      intensity: definition.inferredIntensity || 0.86,
      durationMs: definition.inferredDurationMs || 2600
    };
  }
  return null;
}

export function normalizeBehaviorBodyPose(value) {
  const type = normalizeBehaviorActionType(value);
  return type ? behaviorActionBodyPose(type) : '';
}

export function behaviorBodyPoseManifestItems() {
  return BEHAVIOR_ACTION_DEFINITIONS
    .filter((definition) => definition.bodyPose && definition.bodyPose === definition.id && definition.motionLabel)
    .map((definition) => ({
      id: definition.bodyPose,
      label: definition.motionLabel,
      prompt: definition.motionPrompt || definition.prompt
    }));
}

export function behaviorBodyActionButtons() {
  return BEHAVIOR_ACTION_DEFINITIONS
    .filter((definition) => definition.bodyPose && definition.bodyPose === definition.id && definition.buttonLabel)
    .map((definition) => ({
      label: definition.buttonLabel,
      bodyPose: definition.bodyPose
    }));
}

export function behaviorActionComboPrompt() {
  return 'happy: bounce + smile + nod + ear_wiggle; shy/smug: smirk + sway/head_tilt + lean_in; playful: tongue_out + smirk + ear_wiggle/hat_ear_wiggle; angry/fire: lean_in + emphasis/shake_head; sad: breathe + nod + sway; surprised: lean_in + bounce + blink + ear_perk. Vary the order and pick actions that match the emotion';
}

export function semanticActionPromptCatalog() {
  return [
    'Semantic action ids for the actions array:',
    ...BEHAVIOR_ACTION_DEFINITIONS
      .filter((definition) => definition.prompt && definition.id !== 'reset')
      .map((definition) => `- ${definition.id}: ${definition.prompt}`)
  ].join('\n');
}
