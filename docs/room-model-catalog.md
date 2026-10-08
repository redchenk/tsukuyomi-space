# Room 服务商模型目录

进入 `/room/settings` 后，已配置密钥的云端服务商会自动获取自己的模型列表。填写或更换密钥后离开输入框、切换端点或地域、保存设置时也会检查缓存；“刷新模型”强制更新。刷新不会改写当前模型、聊天指令或保存未提交的设置。手动输入完整模型 ID 始终可用。

## 接口与适配

服务商由 HTTPS 端点的确切主机识别，与模型作者分开。例如 SiliconFlow 的 `deepseek-ai/…` 和 `Qwen/…` 保留完整 ID，不被认作 DeepSeek 或百炼。自定义代理地址不会根据模型名猜测服务商，也不会自动向代理或其他原厂发送密钥。

| 服务商 | 目录接口 | 特殊处理 |
| --- | --- | --- |
| OpenAI | `/v1/models` | 同时适用于 Chat / Responses 配置；目录并不保证每个模型兼容当前协议 |
| OpenRouter | `/api/v1/models/user` | 有密钥时使用账号偏好与限制后的目录；未填密钥时使用公开 `/api/v1/models` |
| DeepSeek | `/models` | 使用官方原始 ID |
| Kimi | `/v1/models` | 中国 / 国际主机分别请求 |
| SiliconFlow | `/v1/models?sub_type=chat` | 保留组织前缀 |
| Groq | `/openai/v1/models` | 排除停用与明确非聊天模型 |
| Mistral | `/v1/models` | 按 `completion_chat` 能力过滤 |
| Together | `/v1/models` | 按 `type=chat` 过滤，支持数组响应 |
| xAI | `/v1/models` | 保留所选地域主机 |
| Gemini | `/v1beta/models` | `x-goog-api-key` 请求头，不把密钥放在 URL；按 `generateContent` 过滤并跟随分页 |
| 百炼 | `/api/v1/models` | 按 `TG` 过滤并分页；北京 / 美国旧端点须在高级设置填写工作空间 ID，以构造同地域工作空间目录；工作空间专属端点直接复用其主机 |

智谱、MiniMax、MiMo、Perplexity 暂未接入已核验的模型列表接口，页面会提示使用预设示例或手动填写。火山方舟的接入点管理需要独立管理凭证，本功能不申请该权限；仍手动填写接入点 ID。Ollama 保持本机配置，不经云端目录转发。

目录中的模型不等于账号有余额、推理授权或当前协议兼容性。不会凭名称声称“最新最强”；建议保留当前选择并使用现有“测试连接”。目录未返回当前模型时只作提示，不自动替换或删除。

官方参考（2026-10-08 核对）：[OpenAI](https://developers.openai.com/api/reference/resources/models/methods/list)、[OpenRouter](https://openrouter.ai/docs/api/api-reference/models/list-models-filtered-by-user-provider-preferences-privacy-settings-and-guardrails)、[DeepSeek](https://api-docs.deepseek.com/api/list-models/)、[Kimi](https://platform.kimi.com/docs/api/list-models)、[SiliconFlow](https://api-docs.siliconflow.cn/docs/api/models-get)、[Groq](https://console.groq.com/docs/api-reference#models)、[Mistral](https://docs.mistral.ai/api/endpoint/models)、[Together](https://docs.together.ai/reference/models)、[xAI](https://docs.x.ai/developers/rest-api-reference/inference/models)、[Gemini](https://ai.google.dev/api/models)、[百炼](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/list-models)。

## 缓存、资源与安全

- 浏览器缓存有效 6 小时，过期时先展示缓存再更新；失败保留缓存与当前模型。无每秒轮询或后台定时任务。
- 缓存键包含服务商目录 URL、地域 / 工作空间和密钥的加盐 SHA-256 摘要，密钥不会进入缓存键或目录元数据。最多保留 8 份、1 MiB、7 天内的缓存。存储被禁用或配额不足不影响刷新成功。
- 更换服务商或地域主机时清空旧密钥，避免误发。输入密钥期间仅取消旧请求，离开输入框后请求；未结束或被取消的旧请求不能覆盖新配置。
- 优先浏览器直连；仅浏览器连接 / CORS 失败时调用 `POST /api/room/models/list`。该接口只接受 `apiUrl`、`apiKey`、`workspaceId`、`cursor`；服务器由注册表构造 GET 目录目标，不接受任意目标、请求头或方法。
- 转发沿用 Origin / CSRF 保护，并额外防止任意 Bearer 请求头绕过来源检查；只允许 HTTPS 官方主机，连接时验证全部 DNS 地址并钉扎，拒绝内网、环回、保留地址和重定向。TLS 校验保持启用。密钥仅用于当前请求，不写入数据库、服务器缓存或日志。
- 转发每 IP 每 10 分钟最多 24 次，全局并发最多 4；单请求体 4 KiB，单页响应 2 MiB，服务器完整请求预算 10 秒，浏览器整个刷新预算 15 秒。最多 8 页、2,000 模型，超出时说明条数限制。
- 接口明确区分密钥、权限、限流、缺少工作空间、无目录支持、格式、大小、超时和网络错误；不回传上游原始错误正文。旧 `GET /api/room/models/openrouter` 保留，公开数据使用 10 分钟缓存与合并请求。
- 不新增依赖、数据库迁移、长期凭证、Redis 或常驻进程；`/api/room/chat` 仍禁用，聊天与语音传输方式不变。

## 验证与发布

`npm run test:models` 验证目录与 API 安全边界；`tests/frontend-room-settings.test.js` 覆盖模型保留、并发刷新及密钥隔离；`tests/e2e/room-model-catalog.spec.js` 在 Chrome / WebKit、PC / 移动端验证自动刷新、缓存、失败保留与输入行为。共享出站防护未改动，仍运行安全与网络回归。

不使用真实用户密钥进行测试。真实账号的模型数量、区域授权和连接可用性由服务商返回，需用户填写自己的密钥后确认。

上线使用现有预构建轻量发布流程，同时更新国内后端与两站前端；不在服务器安装依赖或编译。发布前备份、保护美术 / Live2D / 音乐资源，发布后核对公共入口与静态文件哈希、API 和服务内存。回滚使用该次发布的 `safe-release.py rollback --state <release-state>`；无数据库变更，旧目录缓存不改，新增 v2 浏览器目录缓存可留存但旧代码不读取。
