export const roomLive2DManifest = {
  id: 'tsukimi-yachiyo',
  name: 'Tsukimi Yachiyo',
  modelJson: '/models/tsukimi-yachiyo/tsukimi-yachiyo.model3.json',
  expressions: [
    {
      id: 'neutral',
      label: 'Neutral',
      emotion: 'neutral',
      prompt: 'calm, attentive, listening, or no strong emotion'
    },
    {
      id: 'smile',
      label: 'Smile',
      emotion: 'happy',
      prompt: 'warm, happy, reassured, or gentle smile'
    },
    {
      id: 'bsmile',
      label: 'Shy smile',
      emotion: 'shy',
      prompt: 'shy, blushing, playful, smug, or mildly annoyed'
    },
    {
      id: 'namida',
      label: 'Tearful',
      emotion: 'sad',
      prompt: 'sad, lonely, moved, or eyes welling up'
    },
    {
      id: 'tears',
      label: 'Crying',
      emotion: 'crying',
      prompt: 'crying, strongly hurt, or clearly shedding tears'
    }
  ],
  motions: [
    {
      id: 'nod',
      label: 'Nod',
      prompt: 'agreeing, greeting, or acknowledging the audience'
    },
    {
      id: 'shake_head',
      label: 'Shake head',
      prompt: 'gentle refusal, surprise, or playful disagreement'
    },
    {
      id: 'lean_in',
      label: 'Lean in',
      prompt: 'curiosity, whispering, intimacy, or focusing on the audience'
    },
    {
      id: 'lean_left',
      label: 'Lean left',
      prompt: 'playful tilt or soft side movement'
    },
    {
      id: 'lean_right',
      label: 'Lean right',
      prompt: 'playful tilt or soft side movement'
    },
    {
      id: 'sway',
      label: 'Sway',
      prompt: 'idle rhythmic body movement or cheerful energy'
    },
    {
      id: 'bounce',
      label: 'Bounce',
      prompt: 'excited response or lively emphasis'
    },
    {
      id: 'emphasis',
      label: 'Emphasis',
      prompt: 'small body accent when stressing a line'
    }
  ],
  parameterControls: [
    {
      id: 'ParamMouthOpenY',
      label: 'Mouth open',
      prompt: 'reserved for TTS or later lip sync; LLM should not actively control it yet',
      min: 0,
      max: 1,
      experimental: true
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

  return [
    'Live2D control whitelist:',
    'Available expression ids:',
    expressions,
    'Available bodyPose ids:',
    motions,
    'Control rules: only use listed ids. Use bodyPose for posture/body movement. Use bodyPose none when no body movement is needed.'
  ].join('\n');
}
