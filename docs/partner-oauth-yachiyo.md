# 月读空间对接第八千代 OAuth 接入规范

版本：0.4　日期：2026 年 10 月 16 日　提供方：月读空间　接入方：第八千代

**接口状态：月读端已部署至 `https://yachiyo.hk`，公网授权、换令牌、资料读取和撤销已通过临时客户端验证。第八千代可按本文开发；提供正式回调地址、由月读登记并交付客户端凭据后即可联调接入，无需再改月读代码。双方真实客户端联调仍待完成。**

本次接入用于“使用月读账号登录第八千代”。用户在月读页面完成登录和授权，第八千代后端取得该用户的稳定标识、昵称和头像，再建立第八千代自己的登录会话。作品、脚本、云空间及客户端由第八千代维护。

## 接入范围

采用 OAuth 2.0 授权码流程，强制使用 PKCE S256 和随机 `state`。首期接入对象为具有服务端的第八千代网站，由服务端保管客户端密钥、接收回调并交换令牌。

这是 OAuth 加专用用户资料接口的接入约定，首期不提供 OpenID Connect 的 `id_token`、`openid` 权限或 OIDC 自动发现。使用认证框架时，应按自定义 OAuth Provider 配置。

| 项目 | 首期约定 |
| --- | --- |
| 用户授权权限 | 仅 `profile.basic` |
| 用户资料 | 仅 `sub`、`nickname`、`avatar` |
| 授权类型 | `authorization_code` |
| PKCE | 仅 `S256` |
| 后端客户端认证 | `client_secret_basic` |
| 授权码 | 一次性，签发后 90 秒失效 |
| 访问令牌 | 不透明随机字符串，有效期 300 秒，仅可访问本合作资料接口 |
| 刷新令牌 | 首期不签发；需要再次取得资料时重新授权 |
| 对方登录保持 | 由第八千代自身会话管理，不依赖月读访问令牌持续有效 |

月读密码、密码哈希、验证码和站内登录 Cookie／JWT 均不传给第八千代。本权限不包含邮箱、手机号、角色、私信、文件或任何内容写入能力。“分享到月读”使用网页跳转，由用户在月读确认发布。

OAuth 的授权码流程见 [RFC 6749 第 4.1 节](https://www.rfc-editor.org/rfc/rfc6749.html#section-4.1)，PKCE 见 [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636.html)，安全要求参考 [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)。以上权限范围和时限为本次合作的实现约定。

## 双方需要提供的配置

第八千代提供以下信息，月读据此登记客户端：

| 配置项 | 第八千代填写 |
| --- | --- |
| 应用名称 | 第八千代 |
| 正式网站 | `https://yachiyo.potatoya.cn` |
| 正式回调地址 | 完整 HTTPS URL，包含实际路径 |
| 测试回调地址 | 如需测试环境，提供独立 HTTPS URL |
| 技术联系人 | 姓名及联系渠道 |
| 账号处理方式 | 新用户创建本地账号；已有账号是否提供手动绑定 |

回调地址必须精确登记，不接受通配符、查询参数、URL 片段、用户名密码或空白字符；最多登记 8 个地址。测试和正式环境使用独立客户端、密钥及账号映射，不混用授权码和令牌。

月读向第八千代提供 `client_id`、`client_secret`、批准的 `redirect_uri`、授权域名及开通状态。密钥通过双方约定的安全渠道交付，不写入本文件、前端代码或安装包。第八千代应具备服务端密钥更新能力，泄漏时联系月读停用并更换。

## 接口地址

本合作统一使用国内站 `https://yachiyo.hk` 作为授权域名，以下接口已部署；授权及令牌调用需要使用已登记客户端。`issuer` 不带末尾斜杠，各接口固定使用同一套配置，不随用户来源域名切换。

| 用途 | 方法 | 地址 | 调用方 |
| --- | --- | --- | --- |
| 授权服务标识 `issuer` | — | `https://yachiyo.hk` | 配置值，不是请求接口 |
| 用户登录及授权 | GET | `https://yachiyo.hk/oauth/authorize` | 浏览器顶层跳转 |
| 交换访问令牌 | POST | `https://yachiyo.hk/api/partner/oauth/token` | 第八千代后端 |
| 获取用户资料 | GET | `https://yachiyo.hk/api/partner/oauth/userinfo` | 第八千代后端 |
| 撤销访问令牌 | POST | `https://yachiyo.hk/api/partner/oauth/revoke` | 第八千代后端 |

所有请求使用 HTTPS。服务端 API 按固定地址调用，不跟随 HTTP 重定向，不向重定向目标转发凭据。后端请求不附带 Cookie、Origin、Sec-Fetch-Site 或查询参数；携带浏览器上下文的 API 请求会被拒绝。浏览器不直接调用令牌或资料接口，也不需要为此开放跨域 CORS。

现有 Fushi 接口及根路径下的 OAuth 元数据属于另一项集成，不能用作本合作接口的发现入口；`/api/auth/me` 也不是本合作的用户资料接口。

## 一次登录的完整流程

1. 用户在第八千代点击“使用月读账号登录”。
2. 第八千代后端创建一次登录事务，生成 `state`、`code_verifier` 和 `code_challenge`，保存事务后跳转月读授权页。
3. 月读完成本站登录，展示接入方名称及“稳定标识、昵称、头像”授权范围，用户选择同意或取消。
4. 月读将浏览器带回登记的第八千代回调地址，附带授权码或取消结果。
5. 第八千代后端校验回调，使用授权码、原始 `code_verifier` 和客户端密钥交换访问令牌。
6. 第八千代后端使用令牌读取用户资料，完成账号匹配或用户确认的绑定，建立自身会话，再跳转到不含授权参数的页面。

PC 和 Android 的网站登录可使用同一浏览器流程。原生客户端直接接入、应用唤起和回传原生会话需要另行约定；不得把这里的服务端密钥嵌入客户端。

## 发起授权

向授权地址发起浏览器 GET 跳转，以下参数全部必填，不重复发送，也不添加其他参数。`state` 最长 1024 字符，月读授权确认页的一次性凭据 10 分钟过期。

| 参数 | 值及说明 |
| --- | --- |
| `response_type` | 固定为 `code` |
| `client_id` | 月读分配的客户端标识 |
| `redirect_uri` | 与登记值完全一致，并与后续换令牌请求一致 |
| `scope` | 固定为 `profile.basic` |
| `state` | 每次随机生成，建议使用 32 字节安全随机数的 Base64URL 编码 |
| `code_challenge` | `BASE64URL(SHA256(code_verifier))`，无 `=` 填充 |
| `code_challenge_method` | 固定为 `S256` |

第八千代在服务端将 `state`、`code_verifier`、预期 `issuer`、`redirect_uri` 和“登录／绑定”意图绑定到当前浏览器会话。事务建议 10 分钟过期，一次有效回调后原子消费。`code_verifier` 保存在服务端，不能放入授权 URL 或 `state`。

下面是生成参数的 Node.js 示例。`CLIENT_ID` 和 `REDIRECT_URI` 从确认后的服务端配置读取；示例仅生成数据，不包含服务端事务存储或路由实现。

```js
import { randomBytes, createHash } from 'node:crypto';

const issuer = 'https://yachiyo.hk';
const clientId = process.env.CLIENT_ID;
const redirectUri = process.env.REDIRECT_URI;
if (!clientId || !redirectUri) throw new Error('OAuth 配置未完成');

const state = randomBytes(32).toString('base64url');
const codeVerifier = randomBytes(32).toString('base64url');
const codeChallenge = createHash('sha256')
  .update(codeVerifier, 'ascii')
  .digest('base64url');

const transaction = {
  state, codeVerifier, issuer, redirectUri,
  intent: 'login',
  expiresAt: Date.now() + 10 * 60 * 1000
};
// 必须先将 transaction 绑定到当前浏览器会话并写入服务端存储。
// 绑定账号流程还需保存当前本地用户 ID，并在回调时重新验证该会话。

const authorizationUrl = new URL('/oauth/authorize', issuer);
authorizationUrl.search = new URLSearchParams({
  response_type: 'code',
  client_id: clientId,
  redirect_uri: redirectUri,
  scope: 'profile.basic',
  state,
  code_challenge: codeChallenge,
  code_challenge_method: 'S256'
}).toString();
// 保存事务成功后，向浏览器发送 302 到 authorizationUrl。
```

## 接收回调

假设登记的回调地址为 `https://yachiyo.potatoya.cn/oauth/callback/tsukuyomi`。这条路径仅用于说明，第八千代需提供自己的实际路径并实现它。以下大写值均为占位符，不是真实凭据。

用户同意后，浏览器跳转到：

```text
https://yachiyo.potatoya.cn/oauth/callback/tsukuyomi?code=CODE_FROM_CALLBACK&state=ORIGINAL_STATE&iss=https%3A%2F%2Fyachiyo.hk
```

用户取消后，浏览器跳转到：

```text
https://yachiyo.potatoya.cn/oauth/callback/tsukuyomi?error=access_denied&state=ORIGINAL_STATE&iss=https%3A%2F%2Fyachiyo.hk
```

回调后端按以下顺序处理：

1. 拒绝重复的 `state`、`iss`、`code`、`error` 参数，以及同时包含 `code` 和 `error` 的响应。
2. 找到当前浏览器会话发起的未过期事务，校验 `state` 一致。未找到、缺失或不一致时结束流程。
3. 校验 URL 解码后的 `iss` 与事务中的预期 `issuer` 完全一致。本接入要求成功和错误响应都带 `iss`，缺失时拒绝处理。
4. 原子消费事务，防止同一回调并发执行。取消授权时显示“已取消登录”，不交换令牌、不创建账号。
5. 成功响应必须包含非空 `code`，随后由服务端换令牌。任何异常都不得回退为免校验登录。

`iss` 的校验方式参考 [RFC 9207 第 2.2 节](https://www.rfc-editor.org/rfc/rfc9207.html#section-2.2)。不要根据回调中的 `iss` 动态决定令牌接口地址。

回调页面不加载第三方统计或资源，设置 `Referrer-Policy: no-referrer` 和 `Cache-Control: no-store`，避免代理及应用日志记录授权查询参数。处理结束后立即跳转到干净 URL。登录后的返回位置保存在事务中，只允许第八千代站内路径。

请求参数、客户端或回调地址无效，以及确认页面过期时，月读在自身页面报告错误，不进行回调；只有用户主动取消会返回上述 `access_denied` 回调。

## 交换访问令牌

接口使用 `application/x-www-form-urlencoded` 请求体，不接受 JSON。客户端认证使用 HTTP Basic：先分别对 `client_id` 和 `client_secret` 进行表单编码，再用冒号连接，最后进行标准 Base64 编码。不是 Base64URL。详见 [RFC 6749 第 2.3.1 节](https://www.rfc-editor.org/rfc/rfc6749.html#section-2.3.1)。

```http
POST /api/partner/oauth/token HTTP/1.1
Host: yachiyo.hk
Authorization: Basic BASE64_OF_FORM_ENCODED_CLIENT_ID_COLON_SECRET
Content-Type: application/x-www-form-urlencoded
Accept: application/json

grant_type=authorization_code&code=FORM_ENCODED_CODE&redirect_uri=FORM_ENCODED_REGISTERED_CALLBACK&code_verifier=ORIGINAL_CODE_VERIFIER
```

| 请求体参数 | 说明 |
| --- | --- |
| `grant_type` | 固定 `authorization_code` |
| `code` | 本次回调收到的授权码 |
| `redirect_uri` | 本次授权使用的完整回调地址，表单编码后传输 |
| `code_verifier` | 本次事务保存的原始值，43 至 128 个字符，符合 PKCE 字符范围 |

不要在 URL、请求体或前端重复发送客户端密钥。月读校验客户端、回调地址、PKCE、授权状态及码有效期，并保证授权码只能成功兑换一次。

成功响应为 HTTP 200，包含 `Cache-Control: no-store` 和 `Pragma: no-cache`：

```json
{
  "access_token": "EXAMPLE_OPAQUE_ACCESS_TOKEN",
  "token_type": "Bearer",
  "expires_in": 300,
  "scope": "profile.basic"
}
```

第八千代检查响应类型、`token_type`、权限及有效期后继续获取资料。令牌是不透明字符串，不解码为 JWT，不将其视为用户 ID，不下发给浏览器。无 `refresh_token` 和 `id_token` 字段。

兑换超时、授权码过期或已使用时，让用户重新发起授权；不要重复兑换同一个授权码。使用正确客户端认证、回调地址和 PKCE 重放已用码时，先前由该码签发的令牌也会撤销。

## 获取用户资料

```http
GET /api/partner/oauth/userinfo HTTP/1.1
Host: yachiyo.hk
Authorization: Bearer ACCESS_TOKEN_FROM_TOKEN_RESPONSE
Accept: application/json
```

成功响应为 HTTP 200，并设置 `Cache-Control: no-store`：

```json
{
  "sub": "tsu_example_stable_subject",
  "nickname": "月读用户",
  "avatar": ""
}
```

| 字段 | 类型 | 约定 |
| --- | --- | --- |
| `sub` | string | 非空、不透明、不可变的用户标识；对同一客户端内的同一月读账号保持稳定，删除账号后不复用；按字符串原样保存 |
| `nickname` | string | 展示昵称，可以变化，也可以为空；不能用于唯一识别用户 |
| `avatar` | string | 可公开访问的 HTTPS 图片绝对地址，缺省为 `""`；不能用于唯一识别用户 |

资料对象直接位于 JSON 顶层，没有 `success` 或 `data` 包装。第八千代忽略未知字段，但不能缺少或接受空 `sub`。昵称按文本显示；头像为空或加载失败时使用默认头像。资料可以在下一次授权成功后更新。

服务端会校验令牌有效期、撤销状态、所属合作客户端、权限和用户状态。令牌只用于本接口，不能调用月读其他业务 API。

## 建立账号和本地会话

第八千代保存以下映射，并建立唯一约束：

```text
(issuer, client_id, sub) -> 第八千代本地 user_id
```

不同环境或客户端的 `sub` 不保证相同。更换 `client_id` 之前需约定账号迁移；仅更换密钥时保持原 `client_id`。

首次授权找不到映射时，按第八千代自己的注册流程创建账号，或提示用户登录已有第八千代账号后手动绑定。已有映射时进入对应账号。不要按昵称、头像或推测的邮箱自动合并账号。

绑定已有账号必须由已登录的本地用户明确发起；回调验证原绑定用户及会话，禁止将已绑定其他本地用户的月读身份直接转移。建立登录后轮换本地会话 ID，浏览器会话 Cookie 设置 `Secure`、`HttpOnly` 和适当的 `SameSite`；OAuth 跳转事务需允许顶层 GET 回调时恢复原会话，例如使用 `SameSite=Lax`。

只有用户资料成功获取且映射处理成功后才能创建登录会话。仅拿到授权码、访问令牌或昵称不足以完成登录。

## 撤销和退出登录

第八千代可以使用以下接口撤销自己持有的访问令牌。认证方式与换令牌接口相同，请求体使用表单编码。

```http
POST /api/partner/oauth/revoke HTTP/1.1
Host: yachiyo.hk
Authorization: Basic BASE64_OF_FORM_ENCODED_CLIENT_ID_COLON_SECRET
Content-Type: application/x-www-form-urlencoded

token=FORM_ENCODED_ACCESS_TOKEN&token_type_hint=access_token
```

客户端认证通过后，撤销成功、令牌不存在或已失效均返回 HTTP 200 空响应。不得撤销其他客户端的令牌；不属于本客户端的值同样不泄露存在性。客户端认证失败仍返回 HTTP 401。撤销响应约定参考 [RFC 7009 第 2.2 节](https://www.rfc-editor.org/rfc/rfc7009.html#section-2.2)。

| 操作 | 效果 |
| --- | --- |
| 调用撤销接口 | 本访问令牌失效，不删除用户账号或本地映射 |
| 用户在月读撤销合作授权 | 该授权下的码和令牌失效，旧确认页失效；再次授权保留原 `sub` |
| 用户修改月读密码 | 旧授权码及令牌失效，需重新登录授权 |
| 月读停用合作客户端或用户账号 | 对应授权和资料访问被拒绝 |
| 用户退出第八千代 | 第八千代清除自己的会话；如仍持有令牌，可同时撤销 |
| 用户退出月读 | 月读自身会话退出，第八千代已有会话不自动退出 |

用户可在月读用户中心的“账号安全 → 已授权应用”进入 `/oauth/connections` 撤销授权。第八千代完成本次资料读取后可撤销令牌并清除临时凭据。首期没有跨站退出通知或封禁推送，所以月读撤销授权也不会自动删除第八千代已有会话；第八千代自行规定会话期限及重新认证时机。解绑本地映射时还需提供可用的其他登录方式，防止用户失去账号访问能力。

## 错误处理

用户主动取消时通过已验证回调地址返回 `error=access_denied`；其他授权页错误留在月读页面。后端接口使用对应 HTTP 状态码和顶层 JSON 错误对象，不包装在 `data` 中。

```json
{
  "error": "invalid_grant"
}
```

| 场景 | 返回位置或状态码 | `error` | 第八千代处理 |
| --- | --- | --- | --- |
| 用户主动取消 | 授权回调 | `access_denied` | 结束本次登录，允许重新发起 |
| 参数缺失、格式错误 | 授权页或 API 400 | `invalid_request` | 修正请求 |
| 申请了未开放权限 | 授权页 400 | `invalid_scope` | 只申请 `profile.basic` |
| 不支持的授权响应类型 | 授权页 400 | `unsupported_response_type` | 使用 `response_type=code` |
| 客户端认证失败或被停用 | 令牌／撤销接口 401 | `invalid_client` | 核对配置或联系月读 |
| 授权码无效、过期、已使用，或 PKCE／回调不匹配 | 令牌接口 400 | `invalid_grant` | 重新发起授权；持续失败则排查参数 |
| 不支持的令牌授予类型 | 令牌接口 400 | `unsupported_grant_type` | 使用 `authorization_code` |
| 令牌失效或已撤销 | 资料接口 401 | `invalid_token` | 重新授权 |
| 浏览器上下文访问后端接口 | API 403 | `invalid_request` | 改为纯后端调用，不附带浏览器请求头 |
| 触发限流 | API 429 | `rate_limited` | 按 `Retry-After` 等待，不重复提交旧授权码 |
| 服务暂不可用 | API 503 | `temporarily_unavailable` | 展示稍后重试，保持未登录状态 |

`error_description` 可省略且文案可变，不作为程序分支依据。未知错误一律不创建会话。401 客户端认证错误带 Basic `WWW-Authenticate` 头；资料接口 401 带 Bearer `WWW-Authenticate` 头。所有敏感响应禁止缓存，日志只记录错误码和排查编号，不记录密钥、令牌、授权码或 `code_verifier`。

## 联调和上线验收

月读端提供自动化 HTTP 与浏览器测试；以下跨站账号、回调和客户端验收仍需双方在测试环境完成。

- 正常授权后取得的字段仅包含约定资料，并成功建立第八千代会话。
- 同一个月读账号多次授权，匹配同一第八千代账号；修改昵称或头像不产生新账号。
- 用户取消、`state` 不一致、`iss` 缺失或不一致、回调被重复访问时，均不创建新会话。
- 未登记回调地址被拒绝；错误 PKCE、过期码及授权码重放不能取得有效令牌。
- 错误客户端密钥、跨客户端兑换授权码或撤销令牌、测试与正式环境混用被拒绝；本合作令牌不能调用其他业务 API。
- 令牌过期、撤销授权、停用客户端或停用用户后，资料接口拒绝访问。
- 令牌接口或资料接口失败时，不产生已登录但身份未核实的账号。
- 已有账号手动绑定、绑定冲突及解绑后的其他登录方式符合双方确认的规则。
- PC、Android 浏览器均能恢复授权前会话，完成回调并清除地址栏授权参数。
- 浏览器存储、前端包、客户端安装包及双方日志中均无客户端密钥或访问令牌。

月读已部署授权页面、接口、授权记录、撤销能力及用户中心入口，并提供客户端登记工具。2026 年 10 月 16 日已用临时客户端在公网验证 Chrome 桌面及 WebKit 移动视口的同意、取消、回调请求、三字段资料读取、撤销和稳定标识；测试账号及凭据已删除。该验证不包含第八千代真实回调后端、账号绑定或实体 Android 设备。双方使用约定配置完成这些联调验收后，再由第八千代开启正式“使用月读账号登录”入口。
