# 合作方 OAuth 部署与开通

日期：2026 年 10 月 16 日。本文供月读运维使用；对方开发者使用 [接入规范](partner-oauth-yachiyo.md)。授权域名固定为 `https://yachiyo.hk`。

当前代码包含授权、换令牌、资料读取、撤销接口和用户中心入口。正式开通需要先部署，再登记对方确认的完整 HTTPS 回调地址。文档中的回调地址仅为示例，没有预先登记的正式客户端，也没有写入代码的真实密钥。

## 发布边界

- 数据库迁移 `044_create_partner_oauth` 只新增 5 张 `partner_oauth_*` 表，不修改用户、文章、评论或 Fushi 表。
- 站内登录沿用原机制；授权和撤销页为独立服务端页面。前端只增加跳转处理和用户中心“已授权应用”入口。
- 权限固定为 `profile.basic`；不新增作品存储、客户端运行、自动发布或跨站退出能力。
- 本次包含数据库迁移，现有 `deploy/safe-release.py` 会拒绝普通代码发布。这项保护保持有效，应按独立数据库迁移发布处理，不直接触发普通主分支部署。

## 部署顺序

1. 确认正在运行的服务目录、数据库绝对路径及环境变量。对当前 SQLite 数据库做一致性备份并校验备份的 `PRAGMA integrity_check`；使用 SQLite 备份 API 或 `.backup`，不要在写入中只复制主 `.db` 文件而遗漏 WAL。记录当前代码、代理配置和前端版本。
2. 在隔离副本上应用迁移，验证原业务数据仍可读。生产应用在启动时自动运行未应用迁移；需要提前单独迁移时，在同一服务环境内执行下面的 `runMigrations`。它不会创建默认账号或种子数据。先核对待应用迁移清单，避免顺带应用其他未确认迁移。
3. 发布本功能的后端文件与前端构建产物；确认服务环境中的 `PARTNER_OAUTH_ISSUER=https://yachiyo.hk`（不带末尾 `/`）。默认值相同；正式环境拒绝 HTTP issuer。数据库路径沿用原 `DB_PATH`。
4. 对实际生效的各层代理添加下面两个路径及专用头文件；先 `nginx -t`／`openresty -t`，成功后再重载。保留现有站点配置及不相关路由，不能直接用模板覆盖现场配置。
5. 验证健康检查、本站登录、文章读取和 Fushi 原有路由，再使用测试客户端跑完整授权。确认实际公网响应的安全头、缓存策略、跳转及限流行为后，登记正式客户端并交付凭据。

下列命令在目标代码目录、正确服务环境内运行；`DB_PATH` 必须已经指向现有数据库：

```sh
node -e 'if (!process.env.DB_PATH || !require("node:fs").existsSync(process.env.DB_PATH)) throw new Error("Existing DB_PATH required"); require("./backend/db/migrations/init").runMigrations(); require("./backend/db").close();'
```

数据库及其备份包含账号映射，按现有生产数据权限保存。`sub` 持久化在数据库内：恢复过旧备份会丢失后来建立的映射，因此回滚代码时优先保留新增表和数据，不删除授权身份表。

## 代理路径

`/oauth/` 与 `/api/partner/oauth/` 必须交给后端，不能落入 SPA、静态页面缓存或通用 API 跨域处理。仓库模板已经加入这两个 location：

| 层级 | 模板 | 专用头文件路径 |
| --- | --- | --- |
| 源站内部 Nginx | `deploy/nginx.conf` | `/var/www/tsukuyomi-space/deploy/partner-oauth-security-headers.inc` |
| 源站公开 OpenResty | `deploy/openresty-root-proxy.conf` | `/www/sites/yachiyo.hk/proxy/_tsukuyomi-partner-oauth-security-headers.inc` |
| 国内前端 OpenResty | `deploy/hk-frontend-openresty.conf` | `/usr/local/openresty/nginx/conf/conf.d/_tsukuyomi-partner-oauth-security-headers.inc` |
| 海外站 OpenResty | `deploy/overseas-openresty.conf` | `/usr/local/openresty/nginx/conf/conf.d/_tsukuyomi-partner-oauth-security-headers.inc` |

海外站 `/oauth/` 顶层跳转到国内授权域名，避免“已授权应用”落入 SPA 循环；海外站 `/api/partner/oauth/` 返回 400，不转发或重定向客户端凭据。实际未启用的代理层无需改动。

专用头文件源文件为 `deploy/partner-oauth-security-headers.inc`。公开源站文件对应宿主机 `/opt/1panel/www/sites/yachiyo.hk/proxy/`；前端文件对应宿主机 `/opt/1panel/www/conf.d/`。按现场挂载核实，先安装头文件，再启用引用它的 location。现有两个安装／同步脚本也包含该文件，但本功能的窄范围发布不需要运行整个站点同步或资源复制流程。

这些路径关闭缓存、访问日志和包含 URL 的错误日志，限制请求体 8 KiB，保留后端 `Content-Security-Policy`，并设置 `no-store`、`no-referrer` 和 `DENY`。各层代理必须保留真实 Host 为 `yachiyo.hk`、原始 `Origin`、`Sec-Fetch-Site`、Cookie 和 Authorization；不要把 Origin 改成受信任来源，也不要给后端客户端附加 Cookie。CDN 对这两个路径同样绕过缓存，不注入脚本或记录完整查询参数。

授权页的 CSP 仅允许本站表单和已登记回调源。专用代理策略与其叠加，允许授权 POST 的 303 最终跳转；不能套用普通站点仅 `form-action 'self'` 的策略。`proxy_pass_header` 的行为见 [Nginx 官方文档](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass_header)。隐藏来源信息可能让浏览器原生表单携带 `Origin: null`，后端仅在 `Sec-Fetch-Site: same-origin` 且一次性凭据绑定当前登录会话时接受；见 [Origin 请求头说明](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin#description)。

## 登记与交付

运维工具只在显式 `DB_PATH` 存在、迁移 044 完成时工作。服务端数据库仅保存客户端密钥的哈希。创建或轮换时，明文凭据仅写入一个新的绝对路径文件，权限为 `0600`，拒绝覆盖已有文件；标准输出不打印密钥。

从对方取得正式回调地址后设置 `PARTNER_CALLBACK`，并将 `PARTNER_DELIVERY` 设置为网站公开目录之外、仅运维可读目录下的新文件绝对路径。不要照抄规范中的示例回调。

```sh
export PARTNER_OAUTH_ISSUER='https://yachiyo.hk'
node scripts/partner-oauth-client.cjs create \
  --id eighth-generation \
  --name 第八千代 \
  --redirect "${PARTNER_CALLBACK:?填写对方已确认的完整 HTTPS 回调地址}" \
  --output "${PARTNER_DELIVERY:?填写新的私密凭据文件绝对路径}"
```

客户端 ID 是账号映射的一部分，应固定保存。测试环境使用不同的客户端 ID、回调、密钥和映射。回调必须 HTTPS、无查询参数或片段，不接受通配符；可重复 `--redirect` 登记最多 8 个精确地址。CLI 成功后立即生效，无需修改代码或重启服务。

凭据文件包含 issuer、客户端 ID、密钥、端点和权限。通过双方约定的安全渠道交付，不能进入 Git、网页、聊天日志或安装包；交付后按现有密钥管理规则保管或销毁交付副本。

```sh
# 查看不含密钥的登记清单
node scripts/partner-oauth-client.cjs list
# 紧急停用／恢复；均使之前签发的码和令牌保持失效
node scripts/partner-oauth-client.cjs disable --id eighth-generation
node scripts/partner-oauth-client.cjs enable --id eighth-generation
# 轮换密钥，输出到另一个新文件；原 sub 保持不变
node scripts/partner-oauth-client.cjs rotate --id eighth-generation \
  --output "${PARTNER_NEW_DELIVERY:?填写新的私密凭据文件绝对路径}"
# 替换完整回调白名单；多个地址需重复 --redirect
node scripts/partner-oauth-client.cjs redirects --id eighth-generation \
  --redirect "${PARTNER_CALLBACK:?填写确认后的回调地址}"
```

停用、恢复、轮换及回调修改都会提升客户端版本，使旧授权码和令牌失效；对方需重新发起授权。不要删除并重建客户端或修改身份表。

## 验证与回滚

```sh
node --test tests/partner-oauth.test.js tests/github-oauth.test.js tests/fushi-mcp.test.js tests/security-boundaries.test.js tests/security-hardening.test.js
npm run build:web
npx playwright test tests/e2e/partner-oauth.spec.js --workers=1
```

浏览器测试使用临时 SQLite、虚构客户端及拦截的回调页，覆盖登录返回、同意、取消、读取三项资料、用户中心跳转与撤销。在有系统 Chrome 而没有 Playwright Chromium 的环境中可设置 `PW_CHANNEL=chrome`。这些测试不能替代生产代理和合作方真实会话的联调。

开通前需从公网验证：未登记应用停留错误页、正确应用展示授权页、同意／取消返回登记地址、后端成功换取三字段资料、撤销后访问返回 401。实际代理配置须通过语法检查，授权页面不得包含普通站点的冲突 CSP，后台错误响应不得携带 CORS 许可；合作方还需验证 `state`、`iss`、账号绑定和回调重放处理。

异常时先停用客户端，再撤回本功能路由和前端入口、回滚后端代码；保留 044 表及身份映射。新增表不影响旧代码。只有发生数据库损坏并明确核算恢复点之后的业务写入时才恢复整个数据库备份，不因 OAuth 故障覆盖后续文章、评论或账号数据。
