# Google 登录

登录页、注册页及用户中心账号安全提供 Google 登录和绑定。沿用站内账号、邮箱验证、密码、权限和 Cookie 会话，不建立另一套用户数据。

首次授权后验证站内邮箱：已注册邮箱连接已有账号并保留其密码；新邮箱设置初始密码后创建账号。Google 的已验证邮箱仅预填表单，不自动合并账号。之后使用已绑定的 Google 身份可直接登录。手动绑定须保持发起授权时的登录账号，解绑须验证当前密码。

## Google Cloud 配置

在 Google Auth Platform 为网站新建独立项目，填写公开应用名称、支持邮箱及开发者联系方式，选择外部用户。创建“Web 应用”OAuth 客户端，精确添加回调：

- `https://yachiyo.hk/api/auth/oauth/google/callback`
- `https://tsukuyomi-space.com/api/auth/oauth/google/callback`

应用主页为 `https://yachiyo.hk`，隐私政策为 `https://yachiyo.hk/privacy`。品牌授权域名包含 `yachiyo.hk` 和 `tsukuyomi-space.com`。只申请 `openid email profile`，不申请离线访问或 Google 产品数据权限。上线前核对目标对象的发布状态及 Google 控制台显示的验证要求。

在 API 服务私有环境文件 `/etc/tsukuyomi-space/tsukuyomi-space.env` 配置，不把客户端密钥放到 Git、前端或聊天记录：

```dotenv
GOOGLE_CLIENT_ID=<Web 客户端 ID>
GOOGLE_CLIENT_SECRET=<Web 客户端密钥>
GOOGLE_REDIRECT_URI=https://yachiyo.hk/api/auth/oauth/google/callback
GOOGLE_ADDITIONAL_REDIRECT_URIS=https://tsukuyomi-space.com/api/auth/oauth/google/callback
```

仅两项客户端凭据均存在时，公开设置才启用 Google 按钮。两站 `/api/auth/oauth/google/*` 转发到同一账号后端，保留 Cookie、Set-Cookie 和查询参数；授权从回调所在站点发起。

## 服务端网络

API 必须能够访问 `oauth2.googleapis.com:443` 和 `www.googleapis.com:443`。本机直连受阻时可配置受限 SSH 出口，使用现有经过测试的帧协议与 TLS 传输组件，Google 有独立的并发限额：

```dotenv
GOOGLE_OAUTH_EGRESS_MODE=ssh
GOOGLE_OAUTH_EGRESS_SSH_HOST=<出口公网 IP>
GOOGLE_OAUTH_EGRESS_SSH_PORT=47388
GOOGLE_OAUTH_EGRESS_SSH_USER=<受限出口用户>
GOOGLE_OAUTH_EGRESS_SSH_IDENTITY=<API 进程拥有的私钥绝对路径>
GOOGLE_OAUTH_EGRESS_SSH_KNOWN_HOSTS=<经过验证的 known_hosts 绝对路径>
```

远端 forced command 的域名白名单需包含上述两个 Google 主机。沿用禁止内网地址、固定 443、禁止交互 shell 和端口转发的策略。TLS 从 API 进程直达 Google，出口只转发密文；不在海外保存 Google 客户端密钥，也不修改现有 Fushi 配置或并发额度。

## 验证与维护

使用随机 state、HttpOnly 浏览器绑定 Cookie、PKCE S256 与 nonce；服务端验证 Google RS256 签名、发行方、客户端、有效期和 nonce，以稳定 `sub` 识别身份。Google 签名密钥按缓存策略刷新，限定固定 HTTPS 地址。授权码、ID token、访问令牌和刷新令牌不持久保存，不送到前端。

`node --test tests/google-oauth.test.js tests/google-oauth-provider.test.js tests/github-oauth.test.js tests/qq-oauth-binding.test.js` 覆盖身份签名、账号隔离、邮箱验证、绑定冲突、停用账号、双站回调、解绑及重放。浏览器回归见 `tests/e2e/google-oauth.spec.js`。

自动化使用隔离数据库和模拟 Google。生产验收还需要实际用户完成 Google 授权及站内邮箱验证；不将授权码、令牌或邮件验证码写入验收记录。

参考：[Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)、[Google 登录按钮规范](https://developers.google.com/identity/branding-guidelines)。图标采用 Google 官方提供的品牌图片，本地托管。
