import { behaviorBodyPoseManifestItems } from './behaviorActionRegistry';
import { semanticExpressionManifestItems } from './yachiyoExpressionPresetRegistry';

export const roomLive2DManifest = {
  id: 'tsukimi-yachiyo',
  name: 'Tsukimi Yachiyo',
  modelJson: '/models/tsukimi-yachiyo/tsukimi-yachiyo.model3.json',
  expressions: semanticExpressionManifestItems(),
  motions: behaviorBodyPoseManifestItems(),
  parameterControls: [
    {
      id: 'ParamAngleX',
      label: 'Head yaw',
      prompt: 'small left-right head turns',
      min: -30,
      max: 30
    },
    {
      id: 'ParamAngleY',
      label: 'Head pitch',
      prompt: 'small up-down head motion or a subtle nod',
      min: -30,
      max: 30
    },
    {
      id: 'ParamAngleZ',
      label: 'Head roll',
      prompt: 'gentle head tilt or playful roll',
      min: -30,
      max: 30
    },
    {
      id: 'ParamAngle_HeadX',
      label: 'Yachiyo head X',
      prompt: 'model-specific head yaw used by the VTube Studio mapping',
      min: -30,
      max: 30
    },
    {
      id: 'ParamAngle_HeadY',
      label: 'Yachiyo head Y',
      prompt: 'model-specific head pitch used by the VTube Studio mapping',
      min: -30,
      max: 30
    },
    {
      id: 'ParamAngle_HeadZ',
      label: 'Yachiyo head Z',
      prompt: 'model-specific head roll used by the VTube Studio mapping',
      min: -30,
      max: 30
    },
    {
      id: 'ParamAngle_HeadZ2',
      label: 'Yachiyo head Z secondary',
      prompt: 'secondary head roll for smoother VTube Studio-style head movement',
      min: -30,
      max: 30
    },
    {
      id: 'ParamAngleModify_HeadX',
      label: 'Head X modifier',
      prompt: 'model-specific head yaw modifier for tracking-like nuance',
      min: -30,
      max: 30
    },
    {
      id: 'ParamAngleModify_HeadY',
      label: 'Head Y modifier',
      prompt: 'model-specific head pitch modifier for tracking-like nuance',
      min: -30,
      max: 30
    },
    {
      id: 'ParamBodyAngleX',
      label: 'Body lean',
      prompt: 'torso lean left-right',
      min: -10,
      max: 10
    },
    {
      id: 'ParamBodyAngleY',
      label: 'Body pitch',
      prompt: 'torso forward-back movement',
      min: -10,
      max: 10
    },
    {
      id: 'ParamBodyAngleZ',
      label: 'Body roll',
      prompt: 'torso twist or side sway',
      min: -10,
      max: 10
    },
    {
      id: 'PositionZ',
      label: 'Body depth input',
      prompt: 'physics input for leaning closer or pulling back from the viewer',
      min: -30,
      max: 30
    },
    {
      id: 'ParamPosition_Z',
      label: 'Body depth output',
      prompt: 'visible model depth response from forward-back movement',
      min: -30,
      max: 30
    },
    {
      id: 'ParamSwitchCtrl_BodyX',
      label: 'Body X switch',
      prompt: 'enable model-specific body X control before driving body X inputs and outputs',
      min: 0,
      max: 1
    },
    {
      id: 'ParamSwitchCtrl_BodyY',
      label: 'Body Y switch',
      prompt: 'enable model-specific body Y control before driving body Y inputs and outputs',
      min: 0,
      max: 1
    },
    {
      id: 'ParamSwitchCtrl_BodyZ',
      label: 'Body Z switch',
      prompt: 'enable model-specific body Z control before driving torso roll inputs and outputs',
      min: 0,
      max: 1
    },
    {
      id: 'ParamSwitchCtrl_ChestZ',
      label: 'Chest Z switch',
      prompt: 'enable model-specific chest counter-motion control',
      min: 0,
      max: 1
    },
    {
      id: 'ParamSwitchCtrl_HipZ',
      label: 'Hip Z switch',
      prompt: 'enable model-specific hip counter-motion control',
      min: 0,
      max: 1
    },
    {
      id: 'ParamBodyInput_BodyX',
      label: 'Body physics X input',
      prompt: 'physics input for broad left-right torso travel',
      min: -30,
      max: 30
    },
    {
      id: 'ParamBodyInput_BodyY',
      label: 'Body physics Y input',
      prompt: 'physics input for broad forward-back torso travel',
      min: -30,
      max: 30
    },
    {
      id: 'ParamBodyInput_BodyZ',
      label: 'Body physics Z input',
      prompt: 'physics input for broad torso roll and sway',
      min: -30,
      max: 30
    },
    {
      id: 'ParamBodyInput_ChestZ',
      label: 'Chest physics input',
      prompt: 'physics input for chest counter-rotation during body movement',
      min: -30,
      max: 30
    },
    {
      id: 'ParamBodyInput_HipZ',
      label: 'Hip physics input',
      prompt: 'physics input for hip counter-rotation during body movement',
      min: -30,
      max: 30
    },
    {
      id: 'ParamOutput_BodyX',
      label: 'Body physics X output',
      prompt: 'physics output that drives model-specific side body deformation',
      min: -30,
      max: 30
    },
    {
      id: 'ParamOutput_BodyY',
      label: 'Body physics Y output',
      prompt: 'physics output that drives model-specific forward-back body deformation',
      min: -30,
      max: 30
    },
    {
      id: 'ParamOutput_BodyZ',
      label: 'Body physics Z output',
      prompt: 'physics output that drives model-specific torso roll deformation',
      min: -30,
      max: 30
    },
    {
      id: 'ParamOutput_ChestZ',
      label: 'Chest physics output',
      prompt: 'physics output for chest sway and counter-rotation',
      min: -30,
      max: 30
    },
    {
      id: 'ParamOutput_HipZ',
      label: 'Hip physics output',
      prompt: 'physics output for hip sway and counter-rotation',
      min: -30,
      max: 30
    },
    {
      id: 'ParamPhysicsRAM_BodyX',
      label: 'Body inertia X',
      prompt: 'model-specific body inertia cache for stronger side travel and follow-through',
      min: -30,
      max: 30
    },
    {
      id: 'ParamPhysicsRAM_BodyY',
      label: 'Body inertia Y',
      prompt: 'model-specific body inertia cache for stronger forward-back travel and bounce',
      min: -30,
      max: 30
    },
    {
      id: 'ParamPhysicsRAM_BodyZ',
      label: 'Body inertia Z',
      prompt: 'model-specific body inertia cache for stronger torso roll',
      min: -30,
      max: 30
    },
    {
      id: 'ParamPhysicsRAM_ChestZ',
      label: 'Chest inertia Z',
      prompt: 'model-specific chest follow-through during torso motion',
      min: -30,
      max: 30
    },
    {
      id: 'ParamPhysicsRAM_HipZ',
      label: 'Hip inertia Z',
      prompt: 'model-specific hip follow-through during torso motion',
      min: -30,
      max: 30
    },
    {
      id: 'ParamAngle_BodyX',
      label: 'Yachiyo body X',
      prompt: 'model-specific torso side angle; stronger than generic body lean',
      min: -30,
      max: 30
    },
    {
      id: 'ParamAngle_BodyX2',
      label: 'Yachiyo body X secondary',
      prompt: 'secondary side body deformation for more visible torso motion',
      min: -30,
      max: 30
    },
    {
      id: 'ParamAngle_BodyX3',
      label: 'Yachiyo body X tertiary',
      prompt: 'additional side body deformation for lively body follow-through',
      min: -30,
      max: 30
    },
    {
      id: 'ParamAngle_BodyY',
      label: 'Yachiyo body Y',
      prompt: 'model-specific forward-back body angle',
      min: -30,
      max: 30
    },
    {
      id: 'ParamAngle_BodyY2',
      label: 'Yachiyo body Y secondary',
      prompt: 'secondary forward-back body deformation for nods and bounce',
      min: -30,
      max: 30
    },
    {
      id: 'ParamAngle_BodyZ',
      label: 'Yachiyo body Z',
      prompt: 'model-specific torso roll and side sway',
      min: -30,
      max: 30
    },
    {
      id: 'ParamAngle_BodyZ2',
      label: 'Yachiyo body Z secondary',
      prompt: 'secondary torso roll for stronger body sway',
      min: -30,
      max: 30
    },
    {
      id: 'ParamAngle_ChestZ',
      label: 'Chest Z',
      prompt: 'chest roll for split upper-body motion',
      min: -30,
      max: 30
    },
    {
      id: 'ParamAngle_HipZ',
      label: 'Hip Z',
      prompt: 'hip roll for lower-body counter-motion',
      min: -30,
      max: 30
    },
    {
      id: 'ParamAngle_ShoulderL',
      label: 'Left shoulder',
      prompt: 'left shoulder lift or drop for asymmetrical body acting',
      min: -30,
      max: 30
    },
    {
      id: 'ParamAngle_ShoulderR',
      label: 'Right shoulder',
      prompt: 'right shoulder lift or drop for asymmetrical body acting',
      min: -30,
      max: 30
    },
    {
      id: 'ParamAngle_HipUp',
      label: 'Hip up',
      prompt: 'hip lift accent for bounce, nod, and lively emphasis',
      min: -30,
      max: 30
    },
    {
      id: 'ParamAngle_HipDown',
      label: 'Hip down',
      prompt: 'hip drop accent for bounce recovery and body weight shifts',
      min: -30,
      max: 30
    },
    {
      id: 'ParamEyeBallX',
      label: 'Gaze X',
      prompt: 'look left-right without moving the whole head too much',
      min: -1,
      max: 1
    },
    {
      id: 'ParamEyeBallY',
      label: 'Gaze Y',
      prompt: 'look up-down without moving the whole head too much',
      min: -1,
      max: 1
    },
    {
      id: 'ParamEyeLOpen',
      label: 'Left eye open',
      prompt: 'temporary eye openness or a wink',
      min: 0,
      max: 1,
      experimental: true
    },
    {
      id: 'ParamEyeROpen',
      label: 'Right eye open',
      prompt: 'temporary eye openness or a wink',
      min: 0,
      max: 1,
      experimental: true
    },
    {
      id: 'ParamBrowLY',
      label: 'Left brow',
      prompt: 'left eyebrow raise, frown, or concern',
      min: -1,
      max: 1
    },
    {
      id: 'ParamBrowRY',
      label: 'Right brow',
      prompt: 'right eyebrow raise, frown, or concern',
      min: -1,
      max: 1
    },
    {
      id: 'ParamMouthForm',
      label: 'Mouth shape',
      prompt: 'smile or frown shape without forcing lip opening',
      min: -1,
      max: 1
    },
    {
      id: 'ParamCheek',
      label: 'Cheek',
      prompt: 'blush or cheek tension',
      min: 0,
      max: 1
    },
    {
      id: 'ParamEyeLSmile',
      label: 'Left eye smile',
      prompt: 'left happy eye curve for soft smile presets',
      min: 0,
      max: 1
    },
    {
      id: 'ParamEyeRSmile',
      label: 'Right eye smile',
      prompt: 'right happy eye curve for soft smile presets',
      min: 0,
      max: 1
    },
    {
      id: 'ParamEyeSmile_Happy_L',
      label: 'Left happy eye',
      prompt: 'model-specific happy eye expression on the left eye',
      min: 0,
      max: 1
    },
    {
      id: 'ParamEyeSmile_Happy_R',
      label: 'Right happy eye',
      prompt: 'model-specific happy eye expression on the right eye',
      min: 0,
      max: 1
    },
    {
      id: 'ParamEyeSmile_Angry_L',
      label: 'Left angry eye',
      prompt: 'model-specific angry eye expression on the left eye',
      min: 0,
      max: 1
    },
    {
      id: 'ParamEyeSmile_Angry_R',
      label: 'Right angry eye',
      prompt: 'model-specific angry eye expression on the right eye',
      min: 0,
      max: 1
    },
    {
      id: 'ParamBrowLAngle',
      label: 'Left brow angle',
      prompt: 'left brow angle for smug, angry, worried, or teasing presets',
      min: -1,
      max: 1
    },
    {
      id: 'ParamBrowRAngle',
      label: 'Right brow angle',
      prompt: 'right brow angle for smug, angry, worried, or teasing presets',
      min: -1,
      max: 1
    },
    {
      id: 'ParamMouthX',
      label: 'Mouth X',
      prompt: 'asymmetric mouth offset for smug or teasing presets',
      min: -1,
      max: 1
    },
    {
      id: 'ParamTongueOut',
      label: 'Tongue out',
      prompt: 'tongue-out control for playful presets',
      min: 0,
      max: 1
    },
    {
      id: 'ParamJawOpen',
      label: 'Jaw open',
      prompt: 'jaw opening for surprise without relying only on speech volume',
      min: 0,
      max: 1
    },
    {
      id: 'ParamMouthPuckerWiden',
      label: 'Mouth pucker',
      prompt: 'pucker or widen mouth shape for surprise and pout presets',
      min: -1,
      max: 1
    },
    {
      id: 'ParamCheekPuff',
      label: 'Cheek puff',
      prompt: 'cheek puff control for pouting presets',
      min: 0,
      max: 1
    },
    {
      id: 'ParamMouthFunnel',
      label: 'Mouth funnel',
      prompt: 'rounded mouth shape for surprise or dazed presets',
      min: 0,
      max: 1
    },
    {
      id: 'ParamMouthPressLipOpen',
      label: 'Pressed lip open',
      prompt: 'pressed lip opening for tense or hesitant presets',
      min: -1.3,
      max: 1.3
    },
    {
      id: 'ParamMouthShrug',
      label: 'Mouth shrug',
      prompt: 'mouth shrug for pout, doubt, or mild annoyance presets',
      min: 0,
      max: 1
    },
    {
      id: 'ParamEyeCircles',
      label: 'Dizzy eye circles',
      prompt: 'dizzy or overwhelmed eye effect',
      min: 0,
      max: 1
    },
    {
      id: 'ParamPupilQuake_L1',
      label: 'Left pupil quake',
      prompt: 'left pupil shake effect for panic or dizziness',
      min: 0,
      max: 1
    },
    {
      id: 'ParamPupilQuake_R1',
      label: 'Right pupil quake',
      prompt: 'right pupil shake effect for panic or dizziness',
      min: 0,
      max: 1
    },
    {
      id: 'fire',
      label: 'Fire effect',
      prompt: 'model-specific fire effect for intense angry or fired-up presets',
      min: 0,
      max: 1
    },
    {
      id: 'ParamHairFront',
      label: 'Front hair swing',
      prompt: 'front hair follow-through that makes body movement read more clearly',
      min: -30,
      max: 30
    },
    {
      id: 'ParamHairSide',
      label: 'Side hair swing',
      prompt: 'side hair follow-through for turns, leans, and sway',
      min: -30,
      max: 30
    },
    {
      id: 'ParamHairBack',
      label: 'Back hair swing',
      prompt: 'back hair follow-through for body motion and bounce recovery',
      min: -30,
      max: 30
    },
    {
      id: 'ParamBreath',
      label: 'Breath',
      prompt: 'subtle idle breathing',
      min: 0,
      max: 1
    },
    {
      id: 'ParamBreath2',
      label: 'Breath follow 1',
      prompt: 'secondary breath channel for visible chest presence',
      min: 0,
      max: 1
    },
    {
      id: 'ParamBreath3',
      label: 'Breath follow 2',
      prompt: 'secondary breath channel for smooth body follow-through',
      min: 0,
      max: 1
    }
  ]
};

export function live2DPromptCatalog(manifest = roomLive2DManifest) {
  const expressions = manifest.expressions
    .map((item) => `- ${item.id}: ${item.label}; use for ${item.prompt}`)
    .join('\n');
  const motions = manifest.motions
    .map((item) => `- ${item.id}: ${item.label}; use for ${item.prompt}`)
    .join('\n');
  const parameters = manifest.parameterControls
    .map((item) => `- ${item.id}: ${item.label}; use for ${item.prompt}; range ${item.min}..${item.max}${item.experimental ? '; experimental' : ''}`)
    .join('\n');

  return [
    'Live2D control whitelist:',
    'Available expression ids:',
    expressions,
    'Available bodyPose ids:',
    motions,
    'Available fine parameter ids:',
    parameters,
    'Control rules: only use listed ids. Use bodyPose for posture/body movement. Pair visible bodyPose choices with precise head, torso, chest, hip, shoulder, body-physics, inertia, hair-follow, and breath targets. For VTube Studio-style head tracking, prefer ParamAngle_HeadX, ParamAngle_HeadY, ParamAngle_HeadZ, and ParamAngle_HeadZ2 together with ParamAngleX/Y/Z. For visible Yachiyo body movement, enable ParamSwitchCtrl_BodyX, ParamSwitchCtrl_BodyY, ParamSwitchCtrl_BodyZ, ParamSwitchCtrl_ChestZ, and ParamSwitchCtrl_HipZ at value 1, then drive the model-specific chain ParamBodyInput_BodyX, ParamBodyInput_BodyY, ParamBodyInput_BodyZ, ParamOutput_BodyX, ParamOutput_BodyY, ParamOutput_BodyZ, ParamPhysicsRAM_BodyX, ParamPhysicsRAM_BodyY, ParamPhysicsRAM_BodyZ, ParamAngle_BodyX, ParamAngle_BodyY, ParamAngle_BodyZ, ParamAngle_ChestZ, ParamAngle_HipZ, PositionZ, and ParamPosition_Z instead of relying only on generic ParamBodyAngleX/Y/Z. Use ParamHairFront, ParamHairSide, ParamHairBack, ParamBreath2, and ParamBreath3 as follow-through accents. Use parameters for gaze, head, torso, brow, mouth-shape, cheek, and breathing changes. Use bodyPose none when no body movement is needed.'
  ].join('\n');
}
