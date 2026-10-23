# QQ 登录与当前账号绑定

App 的 `QQOAuthTarget` 在绑定时只允许把当前站点会话交给同源授权入口。
主站为 `https://yachiyo.hk` 时，服务器的 `QQ_REDIRECT_URI` 和公开
`/api/settings` 中的 `qqOAuthStartUrl` 必须使用同一主域名，不能继续返回
`https://origin.yachiyo.hk`。不要通过放宽 App 的 Cookie 转发范围来绕过检查。

## 回调切换步骤

1. 在 QQ 互联现有网站应用中保留旧回调，并加入
   `https://yachiyo.hk/api/auth/oauth/qq/callback`。
2. 先检查真实 QQ 授权页面能接受新回调。HTTP 200 不足以证明成功；页面正文
   可能仍包含 `redirect uri is illegal` / `100010`。新旧回调都要检查。
3. QQ 接受主域名后，备份当前 PM2 配置，仅更新 `QQ_REDIRECT_URI`，重新加载
   `tsukuyomi-api` 并持久化 PM2 配置；不要修改其他服务或密钥。
4. 检查公网 `/api/settings`、QQ `/start` 的授权目标、`no-store` 和
   HttpOnly 浏览器绑定 Cookie。已安装 App 每次授权会重读设置，无需重装。
5. 实机在原账号已登录时授权一个未占用的 QQ，完成后验证账号 ID 不变且 QQ
   绑定状态更新。真实授权不能用模拟测试代替；不要为测试解绑真实账号。

`origin.yachiyo.hk` 是回源域名，不是可任意信任的 Cookie 接收方。
其他站点若没有登记对应回调，仍应保持绑定拒绝，不把主站会话转发过去。

## 服务端约束

- `action=bind` 必须有有效用户会话；旧客户端在登录状态发起授权时同样按绑定处理。
- 回调同时验证一次性 state、浏览器绑定 Cookie 和发起账号。
- 优先处理绑定，再处理匿名 QQ 登录；已有他人绑定时保留当前会话并返回冲突。
- 同一 QQ 重复授权可成功；不能替换当前账号已有的另一个 QQ。
- 每个新 state 保存实际使用的回调地址，换取 token 使用该地址，避免部署切换
  默认值破坏进行中的新流程。切换前由旧版本发起的流程若过期，需要重新开始。
- 新 QQ 登录仍要求邮箱验证；本次不改变支付、余额或原有邮箱认证。

## 验证

`node --test tests/qq-oauth-binding.test.js tests/github-oauth.test.js`
覆盖真实后端路由与隔离数据库，QQ 上游响应模拟，不使用真实 QQ 账号。
`tests/e2e/qq-binding.spec.js` 检查桌面/手机布局下错误反馈及会话保持。
