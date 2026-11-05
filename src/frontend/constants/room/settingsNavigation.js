// IDs are persisted/deep-linked. Display labels may evolve independently.
export const roomSettingsNavigation = [
  { id: 'llm', label: '聊天模型', icon: 'message', group: '基础与陪伴', summary: '服务、模型与连接', keywords: 'LLM API 密钥 模型 端点 代理 图片 补充指令 Ollama' },
  { id: 'tts', label: '语音与朗读', icon: 'audioLines', group: '基础与陪伴', summary: '音源、音色与情感', keywords: 'TTS Fish Audio 日语 GPT SoVITS 语言 权重' },
  { id: 'knowledge', label: '角色与对话', icon: 'book', group: '基础与陪伴', summary: '角色卡、世界书与设定', keywords: 'SillyTavern 八千代 人格 知识库 条目 注入' },
  { id: 'memory', label: '长期记忆', icon: 'bookmark', group: '基础与陪伴', summary: '检索、编辑与同步', keywords: 'Mem0 偏好' },
  { id: 'model', label: '外观与布局', icon: 'layers', group: '房间个性化', summary: '角色大小与房间布局', keywords: '位置 浮窗 缩放' },
  { id: 'diary', label: '日记与存档', icon: 'fileText', group: '房间个性化', summary: '日记同步与备份', keywords: '人设 导入 导出 好感度' },
  { id: 'mcp', label: '工具与扩展', icon: 'grid', group: '进阶功能', summary: 'MCP 与外部工具', keywords: '搜索 白名单 鉴权 MiniMax' },
  { id: 'debug', label: 'Live2D 调试', icon: 'code', group: '进阶功能', summary: '表情、动作与诊断', keywords: '队列 JSON' }
];

// Targets are existing real controls, never a second set of settings.
export const roomSettingsSearch = [
  { section: 'llm', label: 'API 密钥与服务', selector: '[name="room-setting-llm-apikey"]', words: 'LLM OpenAI DeepSeek Ollama 模型 连接 端点' },
  { section: 'llm', label: '模型能力与参数', selector: '.runtime-panel', words: 'temperature thinking 温度 推理 图片 工具' },
  { section: 'tts', label: '语音服务与 Fish Audio', selector: '[name="room-setting-tts-provider"]', words: '官方 站内直供 GPT SoVITS TTS API' },
  { section: 'tts', label: '音色与朗读语言', selector: '[name="room-setting-tts-voice"]', words: 'Voice ID 日语 ja Fish 翻译' },
  { section: 'tts', label: '朗读语气', selector: '[name="room-setting-fish-style"]', words: 'Fish 情感 emotion 表情' },
  { section: 'tts', label: '语音高级设置', selector: '.settings-disclosure', words: '权重 参考音频 代理 端点 GPT SoVITS' },
  { section: 'knowledge', label: '角色卡与世界书', selector: '.room-dialogue-settings', words: 'SillyTavern 导入 导出 人格 场景 剧透' },
  { section: 'knowledge', label: '知识条目与站内资料', selector: '[data-settings-target="knowledge-enabled"]', words: 'RAG 知识库 教程 百科 添加 编辑' },
  { section: 'memory', label: '记忆检索与管理', selector: '.settings-toggle-row', words: 'Mem0 记忆 来源 同步 删除 编辑' },
  { section: 'model', label: '角色大小与位置', selector: 'input', words: '布局 缩放 浮窗 外观' },
  { section: 'diary', label: '日记同步与存档', selector: '.room-card-head', words: '备份 导入 导出 人设 好感度' },
  { section: 'mcp', label: 'MCP 工具与权限', selector: '[name="room-setting-mcp-endpoint"]', words: 'MiniMax 搜索 鉴权 白名单 密钥 端点' },
  { section: 'debug', label: 'Live2D 表情与动作', selector: '.room-card-head', words: '调试 队列 JSON 诊断' }
];
