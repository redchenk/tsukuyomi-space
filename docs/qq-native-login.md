# Android QQ 原生登录

QQ 互联移动应用 `1905926637` 于 2026-10-24 创建，Android 包名为
`space.tsukuyomi.tsukuyomi_space_app`，发行证书 MD5 为
`5870574F60B40E270CB4C9979B5FFD19`，与 App ICP 备案一致。
创建后状态为审核中；平台提示七个工作日，审核期间禁止修改调试 QQ。
网页应用 `1904951941` 的配置保留，不能把其 AppID 当作移动应用使用。

2026-10-26，维护者确认上述移动应用审核通过。已发布的 Android App
预置了该 AppID、发行签名对应的包名和原生回调；启用配套服务端后，
客户端会在用户点击登录时重新读取 `qqNativeAppId`，不需要仅为审核状态
变化重发安装包。服务端接口验证与 K90 上的真实 QQ 唤起、授权及回跳
分别记录，不能把审核通过视为已完成真机登录验收。

客户端只有用户选择 QQ 登录并单独同意后才初始化官方 Android SDK。
客户端调用同源 `POST /api/auth/oauth/qq/native/start` 获取一次性 state 和
HttpOnly 绑定 Cookie，通过 SDK 获取临时 access token，再调用同源
`POST /api/auth/oauth/qq/native/complete`。服务端向腾讯 `/oauth2.0/me`
验证 AppID 和 OpenID，并查询用户资料。缺少或不匹配身份、失效 token、
换账号、丢失 Cookie、重复回调均拒绝；腾讯凭据不写入资料或日志。

公开配置只返回 `qqNativeAppId`。AppKey 不需要下发到客户端；该流程通过
腾讯验证 SDK 返回的 token。`QQ_NATIVE_APP_ID` 未设置或为空时关闭原生入口。
完成平台审核和真机授权验收后，显式设置已登记的移动 AppID 才启用。
其他部署必须配置自己的移动应用，不能复用网站 AppID。

QQ OpenID 按应用分配。数据库中网站身份继续使用原 ID，移动身份使用
`mobile:<AppID>:<OpenID>`，同一个站内账号允许各应用分别绑定一条身份。
不通过昵称、头像或未经验证的 unionId 自动合并账号。新移动身份复用原生
邮箱验证/已有账号验证表单；已有网站 QQ 绑定的用户可先登录本站再绑定。
原有 QQ 解绑会清除该站内账号的网站及移动绑定。

验证：`node --test tests/qq-native.test.js tests/qq-oauth-binding.test.js
tests/github-oauth.test.js tests/security-boundaries.test.js`。测试使用临时数据库
及模拟腾讯响应，不代表腾讯审核或真机授权已经通过。发布前确认审核状态、
真实 QQ 拉起与回调，以及 App 的 `/me` 身份一致。
