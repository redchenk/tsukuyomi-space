# 海外站官方 LLM

海外站使用现有国内主站的身份、钱包与官方 API 服务。将 `deploy/overseas-official-api.inc` 安装到 OpenResty 的 `conf.d/_tsukuyomi-official-api.inc`，在海外域名的 HTTPS server 内引用；不要在 HTTP 全局块直接引用。

`/official-api/` 通过验证证书和 SNI 的 HTTPS 连接到固定 `yachiyo.hk`，Cookie 由原身份校验器处理，个人或管理 Bearer 仍会拒绝。仅精确的 `https://tsukuyomi-space.com` Origin 转换到上游规范域名；外域、缺失写请求 Origin、跨站 Sec-Fetch-Site 不会被伪装成合法来源。没有重试已派发的付费请求，没有代理缓存和 SSE 缓冲。

两个站点读取同一模型与三类 Token 单价，管理页保存后一起生效；无需复制 OpenAI 密钥或建立另一份余额。`/payments` 补充为客户端页面路由。

变更前备份并校验现有配置哈希，仅插入目标 include，保留其他站点、游戏、OAuth、素材配置。执行 OpenResty `nginx -t` 后才 reload。验收两域名状态、支付页、无登录 401、外域/跨站 403、无 Origin POST 403，并确认流式相关头与上游故障响应不会缓存。登录用户聊天及账本收据需另外核对，公开 health 响应不能代替它。
