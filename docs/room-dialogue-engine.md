# Room 对话行为与连续状态

2026-10-21。适用于网站 Room 与 Flutter 原生客户端。

## 行为

生成前增加一段应用自身编译的当轮引导：直接回答、自然接话、承接倾诉、回应好消息、表达看法、轻松调侃、收束话题。它们是表达倾向，不是必须按顺序轮换的剧本。复杂语义仍由现有聊天模型结合当前请求判断。

- 明确求助优先处理，不能因为包含烦躁词就只安慰。
- 明确不要建议、不要追问、不要玩笑时保留该要求；用户可以主动撤回。
- 过去请求过一次帮助不等于后续每轮都要安排方案。建议偏好允许为未知。
- 最近实际回复提过问题时，降低下一轮无必要追问的倾向；必要澄清仍允许。
- 轻松或安静语气可延续，严肃事件立即切换；超过 30 分钟的旧语气不继续携带。
- 近期出现重复应声、服务邀约、空泛共情或拔高结尾时，在下一轮提醒避免复用。
- 只对已完成的聊天重建状态，引用、假设、角色扮演文本不作为用户状态证据。
- 不增加模型调用，不在流式输出后裁句或二次改写，不追加固定回复示范。

这些规则采用有限的文字信号，可能漏判或误判，不是心理判断或完整的语义分类器。没有命中时保留自然回应，不强行诊断用户情绪。英文信号仅覆盖常见表达；其他语言仍由现有生成模型理解。

## 状态与来源

`shared/room-dialogue.cjs` 是无 I/O 的纯函数；`shared/room-dialogue-policy.json` 是规则和提示文字的唯一来源。

状态从现有账号隔离、可同步的最近 24 条消息（通常最多 12 轮）重建，不新增一份可漂移的状态数据库。每条分析文字最多读取 2000 个 UTF-16 代码单元。输入仍完整交给原聊天链路；这个限制只约束行为分析。

- 网站在 `send()` 中从排除本轮 turn ID 的已保存记录规划，`resolveRoomSystemPrompt()` 接收独立的 `dialoguePrompt`。
- Flutter 在 `LlmClient` 的普通聊天请求中应用相同策略。显式 `systemOverride` 和 JSON 工具任务不注入该段，日记等独立任务保留自己的提示。
- 已完成记录继续沿用原有 SQLite 同步与本地发件箱；刷新和另一设备同步后重建同一状态。未同步时只能依据当前设备已有记录，不宣称全局实时一致。
- 取消、失败、未结束的流不产生新状态；重生成排除被替换轮，保存成功后重建；编辑、清空与账号切换沿用已有来源管理。
- 云端历史仍是账号已同步对话的依据。访客和离线记录不新增上传。没有新增数据库迁移、状态写接口或模型凭据。

话题状态只记录有限话题类别、来自用户原话的未完成信号和来源 turn ID；完成或拒绝展开时撤回。它不是自动生成的事实摘要，也不会据此向 Mem0 另写推测。长期回忆继续使用现有带来源的检索，超出短期窗口的边界不保证保留。

## 信任与展示

动态指令仅由应用自有的枚举和固定指引编译，不将历史原文、用户自造标签、模型 JSON 或任意开头拼成指令。原话仍通过原有 conversation / 带来源参考资料进入模型。

`evaluateReply()` 读取实际回复的疑问标点、有限开头与表达模式，只影响后续规划，不修改正文。URL 与代码中的问号不计入提问信号。显示气泡、TTS、Live2D、分享和日记继续处理原始完整一轮。

## 两端同步与验证

网站：

```sh
npm run test:dialogue
npm run test:frontend
node --test tests/room-diary-conversation.test.js
npm run build:web
npx playwright test tests/e2e/room-dialogue.spec.js tests/e2e/room-chat-rhythm.spec.js --project=chromium
```

Flutter 仓库：

```sh
node tool/sync_room_reference.mjs ../tsukuyomi-space
node tool/sync_room_dialogue.mjs ../tsukuyomi-space
flutter analyze
flutter test test/room_dialogue_test.dart test/room_context_test.dart test/room_parity_test.dart test/room_controller_test.dart
```

30 组原创场景包含 15 组至少五轮的上下文。Node 校验人工指定的行为与边界；Flutter 对照相同案例的完整 JS 结果，约束引导文字、状态与优先级。另测取消、失败、重生成、来源更新、账号隔离、UTC 时效、有限预算及指令隔离。浏览器测试用受控模型流验证请求和交互，不把模拟台词算作真人感改进证据。

## 实际语言质量验收

同一模型、同一设置、同一段历史，分别使用原提示与加入当轮引导的提示。随机隐藏版本，人工比较以下方面；保留原始回复，不能先用另一模型改写再比较。

| 项目 | 观察内容 |
| --- | --- |
| 接话 | 是否回应了具体内容，是否误把倾诉当求方案 |
| 边界 | 拒绝展开后是否停止；用户转而求助时是否能回答 |
| 连续性 | 是否接得上前因后果，同时不编造共同经历 |
| 人格 | 是否保持八千代的个性，允许意见、犹豫和改口 |
| 重复 | 连续开头、固定反问、泛化安慰、总结金句是否减少 |
| 任务质量 | 事实和排错答案是否完整可靠 |
| 速度 | 首字延迟、总耗时和请求数是否退化 |

自动场景通过证明程序行为符合设计，不证明所有模型说话更自然。真实模型盲评和用户体验是独立验收，不能用固定测试流替代。

## 本次验证记录

2026-10-21，本机 Node 24.19.0、Flutter 3.47.5 / Dart 3.13.4：

- 前端回归 482 项通过；来源同步与对话状态相关的临时 SQLite / HTTP 验证通过。
- Flutter 完整回归 979 项通过、40 项按原条件跳过；最终重点复核 83 项通过，静态分析无问题。
- Chromium 的流式首字、分句、长回复、刷新连续状态与重生成共 4 项浏览器检查通过。
- 国内和海外 web 构建成功，macOS Debug App 构建成功；包内确认含当前策略版本和动态引导。
- 没有执行真实模型 A/B、实机安装或线上发布。模型请求采用受控测试响应，未读取或使用用户模型凭据。

## 回退

网站撤回 `roomDialogue` 导入与传给 `resolveRoomSystemPrompt()` 的 `dialoguePrompt`；Flutter 撤回普通聊天提示中的 `RoomDialogue.plan()`。已有聊天、长期记忆、用户设置和资源不受影响，无数据库恢复步骤。

实现独立编写。参考 [Eros 的决策分层](https://github.com/etherfunlab/eros-engine/blob/main/docs/architecture.md)、[SillyTavern 临时提示](https://docs.sillytavern.app/usage/core-concepts/authors-note/)与 [OpenSouls 的连续工作状态](https://github.com/opensouls/opensouls)，没有引入这些框架运行服务或复制其实现。
