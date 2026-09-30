# Fushi MCP 本地验收记录

日期：2026-10-01。测试使用临时数据库和虚构凭证；站长已批准生产授权和代理路由，上线状态见接口文档，真实 dot 连接尚须首次授权验收。本记录只说明已完成的本地验证，不代表生产闭环验收。

## 结果

| 检查 | 结果 |
| --- | --- |
| `npm test` | 605 项 Node TAP 测试通过；各项语法检查和独立留言审核脚本通过。其中 Fushi 接口为 41 项 |
| `npm run build:web` | Vue/Vite 生产构建通过，包含新的授权页面 |
| 部署安全测试 | 20 项通过，原有迁移拦截、内存约束、资源保护与回滚检查保持有效 |
| Chromium 浏览器回归 | 10 项通过，其中授权页 4 项，现有评论/留言/指定回复/审核/管理页 6 项 |
| `git diff --check` | 通过 |

本机 API 使用项目所需 Node 20.20.2 及兼容的 better-sqlite3 原生模块运行。没有新增 npm 依赖。

## Fushi 接口覆盖

测试文件：[`tests/fushi-mcp.test.js`](../tests/fushi-mcp.test.js)。使用实际 Express 路由、SQLite 迁移、普通回复服务及审核/通知逻辑，HTTPS 接收端为测试注入。接收端独立计算 Standard Webhooks HMAC，不调用被测签名函数来认可签名。

- MCP 2.0 发现、四个工具、一个 webhook 事件、协议 metadata、镜像请求头、Accept 和版本错误；畸形或重复 JSON 不泄漏输入。
- 固定普通账号绑定，拒绝浏览器 Cookie、网站 JWT、非可信 Origin、管理员账号和身份参数伪造。元数据及未授权 401 提供 OAuth 发现入口。
- PKCE S256、精确 redirect URI、resource audience、明确确认与拒绝、code 单次使用与重用撤销、refresh 轮换与重用撤销、到期及改密/撤权复核。连续两次跨 179 天自动刷新后，原账号及授权 ID 保持一致，无固定月度截止；连续 180 天未刷新仍会失效。
- 官方 CIMD 的客户端身份、鉴权方式、完整 HTTPS 回调地址、大小上限与 15 分钟验证缓存；拒绝身份替换、危险回调及错误鉴权方式。元数据获取期间改密会使旧浏览器会话失效，不会签发新授权。
- 网站正常回复提交后写入 outbox；审核等待时没有事件，审批成功后才入队。失败事务同时回滚内容、通知、事件；重复审批保持同一事件 ID。
- 留言和文章上下文、作者 ID、UTC 时间、公开链接、分页与增量游标。私信、其他人的讨论、未公开文章和自回复均不可读或不会触发。
- 对已拥有的公开线程，可在第一次回复出现前订阅；过滤参数生效。旧版嵌套回复可分页读取，待审核内容不会混入公开线程。
- 回调 challenge、错误回声、错误签名、超时与密文 AAD；验证缓存按账号/URL/当前密钥划分，且不无限延期。密钥轮换期间双签名，旧密钥按期删除。
- HTTPS、用户信息/fragment 限制、公私混合 DNS、环回/私网/映射 IPv6、地址固定及 DNS 重绑定保护。DNS 未返回时也有总等待上限。
- 同一事件重试保留 ID 和发生时间，刷新签名时间；乱序不使游标跨过未完成投递。2xx 接收与助手提交结果分开保存。
- 真正启动一个新的 Node 子进程，读取同一 SQLite 文件并恢复过期投递租约，验证进程重启后的补发。
- 断线恢复、有限订阅到期/刷新、撤销权限、410 停止、413 不重试、最多六次失败后保留失败状态。
- 回复已保存而客户端丢弃响应后，可以查询原结果；原键重试不重复发帖，换键处理同一源回复仍返回已有结果，改内容复用键报冲突。
- 待审核的助手回复可查询审批后的状态；不会产生 Fushi 自己唤醒自己的事件。事件历史清理后，幂等记录仍阻止延迟重放造成重复回复。
- 105 条模拟互动分批回填；并发工作器通过 SQLite 条件更新抢占投递。正常网页请求不访问 webhook 网络；默认关闭时接口和入队均不启用。

## 浏览器验证

新增 [`tests/e2e/fushi-connect.spec.js`](../tests/e2e/fushi-connect.spec.js) 在 390px 和 1280px 验证授权页可见、登录后保留完整 OAuth 请求、无横向溢出、拒绝授权时错误可见且可以重试。拒绝响应使用浏览器路由模拟；实际授权/换码/CSRF 由 API 测试验证。

现有指定对象回复在留言和文章中保存、刷新后仍正确显示；文章评论发布、广场留言发布、emoji 审核原因及管理页显示也已回归。

```sh
npm test
npm run build:web
python3 -m unittest discover -s tests -p 'deployment_safety_test.py'
PW_CHANNEL=chrome npx playwright test --project=chromium \
  tests/e2e/fushi-connect.spec.js tests/e2e/directed-replies.spec.js \
  tests/e2e/message-moderation-feedback.spec.js tests/e2e/main-flows.spec.js \
  --grep 'assistant consent|denied assistant|selected recipient|read an article and post|publish a plaza|admin can open|moderation'
```

## 生产 HTTP 与发布验收

2026-10-01，应用 `fa9611d` 已启用。040 在线备份与独立迁移完成，原有用户身份及六类内容数量在事务内核验一致。两站发布工具确认 API 健康、前端文件及受保护资源一致；11 项公网 OAuth/未授权入口检查通过。生产继续使用 heap 192 MiB / RSS 384 MiB；国内 API 空闲观察 RSS 约 176 MiB，可用内存约 1867 MiB，未出现负载拉满。该观察不是流量压力测试。

ChatGPT 创建连接的页面已成功读取生产元数据，确认三个 scope、`none` token 鉴权及稳定回调 URI。平台连接尚未创建，浏览器最终授权等待确认；没有为测试在生产网站发布评论或复制浏览器 Cookie。

## 真实 dot 仍需验收

站长已批准账号绑定、受限 OAuth 和秘密配置。国内生产出站获取官方客户端 JSON 未成功；官方稳定 OAuth 回跳地址已通过本机 HTTPS 获取官方 JSON 核验，生产以预登记 public client 模式连接，保留精确匹配。上线后仍需在插件中进行首次登录授权和真实 dot 闭环验收。

尚未测试真实平台回调验证/签名接收、dot 唤醒/读取/回复闭环、平台主动续订/停止订阅，以及生产流量压力下的 RSS/CPU。模拟接收端不会代替这些验收。上线健康与资源保护已经核验；原有 Live2D、音乐、模型、媒体资源没有参与发布。
