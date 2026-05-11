export const roomLive2DManifest = {
  id: 'tsukimi-yachiyo',
  name: '月见八千代',
  modelJson: '/models/tsukimi-yachiyo/tsukimi-yachiyo.model3.json',
  expressions: [
    {
      id: 'neutral',
      label: '平静',
      emotion: 'neutral',
      prompt: '默认、平静、认真倾听、没有明显情绪'
    },
    {
      id: 'smile',
      label: '微笑',
      emotion: 'happy',
      prompt: '温柔、开心、安心、轻轻微笑'
    },
    {
      id: 'bsmile',
      label: '羞怯微笑',
      emotion: 'shy',
      prompt: '害羞、脸红、调皮、略带得意或小小生气'
    },
    {
      id: 'namida',
      label: '含泪',
      emotion: 'sad',
      prompt: '难过、寂寞、被触动、眼眶含泪'
    },
    {
      id: 'tears',
      label: '落泪',
      emotion: 'crying',
      prompt: '哭泣、强烈悲伤、泪水明显流下'
    }
  ],
  motions: [
    {
      id: 'tap_body',
      label: '轻微身体动作',
      prompt: '轻轻点头、靠近、回应触碰或强调一句话'
    }
  ],
  parameterControls: [
    {
      id: 'ParamMouthOpenY',
      label: '口型开合',
      prompt: '仅供 TTS 或后续口型同步使用，当前不要由 LLM 主动控制',
      min: 0,
      max: 1,
      experimental: true
    }
  ]
};

export function live2DPromptCatalog(manifest = roomLive2DManifest) {
  const expressions = manifest.expressions
    .map((item) => `- ${item.id}: ${item.label}，适合：${item.prompt}`)
    .join('\n');
  const motions = manifest.motions
    .map((item) => `- ${item.id}: ${item.label}，适合：${item.prompt}`)
    .join('\n');

  return [
    'Live2D 控制能力白名单：',
    '可用 expression：',
    expressions,
    '可用 motion：',
    motions,
    '控制规则：只能使用上面列出的 id；无法判断时 expression 使用 neutral 或省略 live2d；motion 无需动作时使用 none。'
  ].join('\n');
}
