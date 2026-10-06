# Room LLM 与 Agent 协议

Room 保留现有模型、角色、聊天历史、长期记忆、TTS 和图片预览。参考 [AstrBot](https://github.com/astrbotdevs/astrbot/tree/a6265fa6c9471d499574c119edeba54a125db314/astrbot/core) 的 Provider 与 Agent 分层、工具循环和消息配对方式，独立实现共用协议适配器；不安装 AstrBot 服务、不引入新模型或常驻连接。

## 支持的模型线路

| 线路 | 流式与一次性响应 | 工具调用及结果 |
| --- | --- | --- |
| OpenAI Chat Completions 兼容 | SSE；读取 finish 后的 usage；UTF-8 与 CRLF 分片 | `tool_calls` → `tool_call_id`；拼接参数分片 |
| OpenAI / xAI Responses | SSE / JSON；检查 completed、incomplete、failed | `function_call.call_id` → `function_call_output.call_id`；保留当前轮 opaque reasoning，`store:false` |
| Anthropic Messages 兼容 | SSE / JSON；文本块与 thinking 分离 | `tool_use.id` → `tool_result.tool_use_id`；保留当前轮 thinking 签名 |
| 本机 Ollama 原生 `/api/chat` | NDJSON / JSON；保留 done 数据块中的最后文字 | 原生参数对象与 `tool_name` 结果 |

Gemini 等服务继续使用现有 OpenAI 兼容入口。没有新增原生 Gemini 协议。协议按端点判断，OpenRouter 上的 Claude / MiniMax 不会因为模型名字切换成 Anthropic 请求。

`shared/llm-protocol.cjs` 同时用于后端代理和浏览器聊天；`shared/agent-protocol.cjs` 负责固定工具定义、参数校验、调用 ID 配对、轮数和去重。推理字段、工具参数、签名和工具中间消息只留在当前轮内存中，不写入气泡、日记或长期记忆。完成后仍只保存一轮用户消息与最终可见回复；中断或失败不会把半句保存为完成回复。保持流式气泡，生成过程中不主动滚动聊天视角。

## 当前轮与历史资料

当前用户消息始终放在请求末尾。系统提示明确区分本轮请求与已结束的历史对话，保持八千代原作身份与自然短回复。短期历史按完整的问答轮次选择，最多 12 条、6,000 字（Ollama 4,000 字），长消息在预算内保留首尾，不把旧回复单独截出来当成待续写的问题。

云端向量检索、SQLite 备用检索和本地 IndexedDB 都排除当前轮的自动记忆，以及已经包含在短期历史中的轮次；用户手动编辑的独立记忆仍可参与。旧对话资料标记为 `completed_dialogue`，没有相关结果时返回空集合，不用最近的无关记忆填满上下文。

同一轮重新生成只在浏览器内存中保留一份参考资料快照，固定时间、资料选择和工具预读结果。每次重试仍向当前账号的权威存储核验所选记忆 ID 与版本：删除的记录不再注入，编辑和事实纠正使用新版本；索引刷新不改变原始摘录。新消息、账号／记忆来源／模型及相关设置变化会重新检索，新增的其他记忆在下一轮参与。刷新页面不会保存提示词快照，恢复后依然执行轮次排除。校验失败不能拿旧缓存冒充成功读取。

直连和后端代理共用采样参数策略：阿里云官方 Dashscope 端点上的 Qwen3.8 Flash / Max 使用 `temperature:0.6`，普通可见历史使用 `preserve_thinking:false`；当前轮工具接续时单独保留协议要求的 reasoning 字段。Kimi 沿用 `temperature:1`，已知 OpenAI 推理模型不发送不支持的温度参数，其他 Chat Completions 兼容线路沿用 `0.7`。不同时增加 `top_p`、seed 或回复长度限制。[Qwen 官方协议说明](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions)

不按字面重合判定答非所问，也不自动缓存整段流式回复、调用额外收费模型或静默重发。提交时的 `expectedUserMessage` / `expectedAssistantMessage` 是防止并发覆盖的校验，不是语义判定。回归使用模拟模型验证实际请求、连续重生成、记忆编辑删除与刷新恢复，不将模拟服务结果当作真实模型每次回答正确的保证。

## Agent 使用与边界

1. 在 `/room/settings` 配置聊天模型，打开「工具与扩展」。
2. 选择已有 MiniMax Token Plan 桥接，或配置自定义 MCP 端点与连接方式。
3. 允许列表为空时，只开放 `web_search` 和当前用户所附图片的 `understand_image`。填写列表可进一步缩小；工具发现结果不会增加权限。
4. 模型决定是否调用工具。调用后按稳定 ID 回传结果，再继续生成八千代的回复。现有关键词搜索及图片预读继续兼容。

自动循环不开放发帖、删除、系统配置、任意文件路径、Shell 或任意 MCP 工具。图片工具的图片来自本轮附件，模型只能提供分析问题；搜索参数最长 500 字，图片分析问题最长 2,000 字。工具结果是不可信资料，不得作为权限或角色指令。

每轮聊天最多 3 次模型请求、2 轮工具接续、4 次实际工具执行；执行串行，相同名称和参数在一轮中复用结果。每次返回最多 6 个调用。结果最多 4,000 字；中间上下文总计最多 512 KiB。超限、未知工具、非法参数、空结果和 MCP `isError` 都按失败处理，模型不能假称执行成功。取消会中止当前读取、工具和后续模型请求。

原有整轮 180 秒截止时间保留；后端模型读取也有有限截止时间，包括收到响应头后正文停滞。可见回复最多 256 KiB，单个 JSON / SSE 事件最多约 1 MiB，工具参数最多 32 KiB。截断、长度耗尽、损坏 JSON 和模型错误不会被当成成功。

## MCP 连接方式

- **REST 桥接（默认）**：兼容原有 JSON-RPC `tools/list` / `tools/call`。站内 `/api/mcp/token-plan` 使用正常账号鉴权、Origin / CSRF 保护；服务端固定可执行程序与工具名称，一次仅启动一个受控子进程。旧配置不用迁移。
- **Streamable HTTP**：远程 HTTPS 或本机 HTTP；执行 `initialize` → `notifications/initialized` → 工具请求，支持 JSON 和 SSE 响应、会话 ID、协议版本协商，最后尽力 DELETE 关闭会话。支持 2025-11-25、2025-06-18、2025-03-26。不是旧版独立 GET+SSE 传输。

自定义远程服务由浏览器直接访问，必须正确开放 CORS（包括 MCP 会话响应头）；HTTPS 网站访问本机 HTTP 仍受浏览器本地网络权限限制。自定义服务每次操作默认 8 秒、最高 15 秒，预算覆盖完整响应体；站内桥接沿用服务端 45 秒子进程预算，浏览器断开即终止子进程。stdio 可协商上述版本或旧服务的 2024-11-05，UTF-8 分片不会乱码，stderr 不进入错误消息或日志。

远程请求不携带网站 Cookie；鉴权头独立配置，不允许覆盖 Cookie、Origin、Host 或 MCP 会话头。不跟随重定向。HTTP 失败、RPC 错误、请求 ID 错配和工具 `isError` 分别拒绝。结果不明时不自动重新执行工具；404 会话失效后，下一次用户操作重新初始化。每次操作创建短会话，不持久化会话凭证、不轮询，也不宣称支持需要客户端采样 / elicitation 的服务器能力。

Fushi 的 MCP 2.0 事件、OAuth、专属账号与审核流程保持独立，不能把本页标准 MCP 工具客户端当作 dot 唤醒或授权接口。

## 验证与发布

```sh
npm run check:llm-agent
npm run test:llm-agent
npm test
PW_CHANNEL=chrome npx playwright test tests/e2e/room-turn-context.spec.js tests/e2e/room-agent-protocol.spec.js tests/e2e/room-chat-reliability.spec.js --project=chromium
npm run build:web
npm run build:web:overseas
```

测试包括四种模型线路、碎片化 UTF-8 / 参数、usage 尾帧、Opaque reasoning / thinking 签名、截断与超大响应、响应正文停滞、错误 / 重复工具、超限和取消、JSON / SSE MCP 握手、RPC ID 不符、错误版本、stdio 提前退出和错误脱敏。浏览器测试验证「模型调用工具→结果回传→最终气泡→刷新恢复」和失败结果不泄露到历史。本次协议完整回归 703 项与 8 项浏览器测试通过，国内 / 海外构建通过；补建 emoji 分片另有 10 项本地记忆回归通过。测试使用模拟服务，不消耗用户 API 配额；真实服务仍须具有工具调用能力与适当 CORS / 网络配置。

2026-10-06 轮次上下文修复验证：前端 312 项、记忆 31 项、协议与安全 58 项、API 274 项分别通过（各组含部分重叠安全用例），另有留言审核脚本与 23 项浏览器测试通过。浏览器覆盖移动／桌面、本地／账号记忆、连续重生成、删除记忆、降级读取、刷新恢复、图片预览、工具接续、流式阅读位置和日记记录。本次不重启记忆 worker，不修改索引或补建游标。

部署不新增依赖、环境变量、数据迁移或常驻服务。前端在本地构建；服务端使用现有受限内存代码发布流程，保留所有 Live2D / 音乐 / 上传资源和无关本地修改。回滚使用该次 release state 的 `safe-release.py rollback --state ...`；本次没有数据库结构变更。历史记忆索引与分析仍由原 worker 分批执行，沿用 SQLite 游标、低内存暂停和 640 MiB slice 限制；本次修复了 UTF-16 分片切断 emoji 导致分词失败的问题，worker 短暂重载后按原游标继续；仅重新排入受此问题影响的失败任务，不重建现有索引。

协议依据：[OpenAI 工具调用](https://developers.openai.com/api/docs/guides/function-calling)、[Responses reasoning](https://developers.openai.com/api/docs/guides/reasoning)、[MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)。
