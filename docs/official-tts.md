# 官方语音直供

入口为 Room 设置 → 语音与朗读 → 官方直供；充值和语音账单仍在 `/payments`。
每次成功合成一条语音固定 ¥0.05，价格快照 `official-voice-cny-005-v1`。
使用主站既有钱包及流水，不发行新余额、不新增支付入口。超级管理员沿用主站免扣余额权限。

## 服务配置

在主站 `DATA_DIR/official-tts.json` 写入服务配置，文件所有者必须为后端进程运行用户，权限必须为 0600。文件不入库、不对浏览器公开。
也支持同名环境变量；文件配置优先，可实时关闭，不必重启。配置失败时保持离线。

```json
{
  "OFFICIAL_TTS_ENABLED": true,
  "OFFICIAL_TTS_PROTOCOL": "gpt-sovits",
  "OFFICIAL_TTS_URL": "https://your-compute.example/tts",
  "OFFICIAL_TTS_LANGUAGE": "ja",
  "OFFICIAL_TTS_REF_AUDIO_PATH": "E:\\visualstudio\\cankao.wav",
  "OFFICIAL_TTS_PROMPT_TEXT": "八千年分の知識と経験で、どんなお悩み相談もお任せあれ。",
  "OFFICIAL_TTS_PROMPT_LANG": "ja",
  "OFFICIAL_TTS_GPT_WEIGHT_PATH": "GPT_weights_v2ProPlus/yachiyo-new-e20.ckpt",
  "OFFICIAL_TTS_SOVITS_WEIGHT_PATH": "SoVITS_weights_v2ProPlus/yachiyo-new_e12_s684.pth"
}
```

远程优先使用 HTTPS 或回环隧道。站长指定的公网 HTTP 服务需显式设置 `OFFICIAL_TTS_ALLOW_HTTP: true`；禁止通过公网 HTTP 发送鉴权密钥。
如上游有鉴权，在服务器文件添加 `OFFICIAL_TTS_API_KEY`，转为 Bearer 头。上线的算力端口应限制为主站出口 IP；网站只能阻止绕过站内代理扣费，无法阻止他人直接访问一个无鉴权的公网 GPT-SoVITS。

GPT-SoVITS [api_v2 协议](https://github.com/RVC-Boss/GPT-SoVITS/blob/main/api_v2.py)没有通用 readiness 端点：默认使用指定权重、参考音频合成固定短句检测就绪，健康结果缓存 60 秒，失败缓存 10 秒；检测费用不进入用户账单。页面每 15 秒读取状态，也可手动检测。实际合成成功也刷新健康状态。检测与用户合成互斥，避免切换权重冲突。
若自行提供健康接口，设置同源 `OFFICIAL_TTS_HEALTH_URL`；只接受 JSON `{ "ready": true }`，不能用 `/docs` 的 HTTP 200 代替。

## 计费与故障语义

- POST `/api/tts/official/jobs`：主站登录验证、账号绑定、同源校验，接收 `text` 和 `requestKey`，不接受客户端价格、权重、地址或赞助标记。
- 每条最多 1,000 个 Unicode 字符；单算力同时处理一条用户任务。忙碌或余额不足时不发起生成、不预留资金。
- 原子预留 0.05 元后立即返回任务编号；浏览器轮询任务，避免长请求穿过代理造成 504。超时为 90 秒。
- 音频写入私有缓存并落盘后，音频状态和扣款在同一数据库事务提交；失败则释放金额，由站点承担可能发生的上游计算成本。
- 进程异常后，超过 150 秒仍未形成可领取音频的任务按失败释放；后台每 30 秒恢复。该规则仅适用于按成品计费的语音，不能释放模型 Token 请求的冻结资金。
- 请求编号关联账号与文本，重复提交只返回原任务。页面会话内保存音频任务编号，同一原文重播不重新翻译、合成或收费。已失败或缓存过期的请求会明确提示，下次点击才新建任务。
- 音频仅本人可领取，所有接口禁止缓存。私有音频最长缓存 24 小时，缓存总量上限约 128 MiB，超额时优先清理最旧文件。保留账单及任务编号用于审计，不保存合成正文。
- 中文朗读沿用当前聊天模型翻译为日语，翻译费用遵循聊天模型计费；设置页明确提示。试听使用固定日文，不发起翻译。

关闭 `OFFICIAL_TTS_ENABLED` 仅停止新合成，已付费的有效缓存仍可领取。原来的一键包浏览器直连、自带供应商 API 不变；旧代理拒绝回环地址和官方算力地址，防止绕过收费。

## 验证

`node --test tests/official-tts.test.js tests/payments.test.js tests/tts-gpt-sovits.test.js tests/frontend-tts-transport.test.js tests/frontend-room-settings.test.js`

`node node_modules/@playwright/test/cli.js test tests/e2e/official-tts.spec.js --project=chromium --project=webkit-iphone11`

数据库测试使用隔离 SQLite 和模拟上游，覆盖准确扣费、并发重放、越权、失败退款、原有支付、恢复和真实音频形状检测；浏览器使用模拟音频验证交互。模拟通过不等于实际 GPU、支付或物理手机验收。
