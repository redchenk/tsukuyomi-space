# GitHub 登录

登录页和注册页提供 GitHub 登录。首次授权后必须输入真实邮箱并验证站内验证码；GitHub 已验证邮箱只用于预填，不会自动创建或合并账号。邮箱已注册时连接已有账号并保留其密码；邮箱未注册时设置至少 8 位密码并创建账号。完成绑定后，下一次 GitHub 授权可直接登录。

已有用户在「用户中心 → 账号安全 → 绑定 GitHub」授权后连接当前账号。一名用户连接一个 GitHub 身份；已属于其他用户的 GitHub 不可转移。解绑需要当前密码，并保留邮箱登录方式。

## 配置

在 GitHub Settings → Developer settings → OAuth Apps 注册应用，主页填写 `https://yachiyo.hk`，添加以下精确回调地址：

- `https://yachiyo.hk/api/auth/oauth/github/callback`
- `https://tsukuyomi-space.com/api/auth/oauth/github/callback`

关闭通配匹配和 Device Flow，保留访问令牌过期设置。应用只申请 `read:user user:email`；服务端以不可变数字用户 ID 识别账号，使用随机 state、浏览器 HttpOnly cookie 和 S256 PKCE 防止混淆与重放。令牌只用于本次读取用户资料，不保存在用户资料、日志或前端。

当前生产 PM2 从 `/etc/tsukuyomi-space/tsukuyomi-space.env` 读取配置。仅在该服务端环境文件配置，密钥不要提交 Git：

```dotenv
GITHUB_CLIENT_ID=<GitHub 应用 Client ID>
GITHUB_CLIENT_SECRET=<GitHub 应用 Client Secret>
GITHUB_REDIRECT_URI=https://yachiyo.hk/api/auth/oauth/github/callback
GITHUB_ADDITIONAL_REDIRECT_URIS=https://tsukuyomi-space.com/api/auth/oauth/github/callback
```

两个域名的 `/api/auth/oauth/github/*` 必须转发到同一账号 API，并保留请求 Cookie、响应 Set-Cookie 和查询参数。前端从公开设置中选择当前站点的授权入口，确保授权和邮箱完成流程留在同一域名。共享已有 `user_oauth_accounts` 表，无新增数据库迁移或依赖。

## 验证

`npm test` 包含 GitHub OAuth 集成检查，覆盖邮箱验证、新账号密码、已有账号密码保留、手动关联、绑定冲突、停用账号、解绑、双站回调、PKCE 和状态重放。`npm run test:e2e -- tests/e2e/github-oauth.spec.js tests/e2e/search-password-forms.spec.js` 覆盖电脑和移动端交互，并回归 QQ 解绑和原有密码表单。

自动化测试使用模拟 GitHub 和模拟邮件验证码。真实验收需在浏览器授权并完成收到的站内邮件验证码；不要将真实授权码、令牌或验证码复制到报告。

协议参考：[GitHub OAuth web application flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)。
