# AstrBot Fushi 接入：轮询与人工回复

日期：2026-10-02。配套 AstrBot 插件 v1.2.0。当前实现先绑定现有专属普通账号 Fushi；其他账号尚未开放。此轮使用通知轮询，无需机器人公网域名；不启用实时 webhook 或自动回复。

## 使用配套补丁

原始 ZIP 补丁基于网站提交 `778d19b`，包含 14 个网站文件。2026-10-02 发布版本在这些修改上补充权限、统计、回跳页和代理保护；当前 main 已包含补丁，请勿重复应用。`tsukuyomi-space-astrbot-fushi-update.zip` 提供原始补丁及校验清单，供较旧 checkout 比对。

在另一份网站仓库根目录中执行，路径替换为实际解压位置：

```bash
git apply --check /absolute/path/tsukuyomi-space-astrbot-fushi.patch
git apply /absolute/path/tsukuyomi-space-astrbot-fushi.patch
git diff --check
```

检查通过后按原流程提交、发布前后端，并完成下列环境及代理配置。若新版 main 导致补丁检查不通过，先处理对应文件差异，保留当前站点代码与资源。

## 网站更新

1. 发布本次前后端代码。后端新增额外 public OAuth client 登记及客户端间授权隔离；前端新增 `/fushi/astrbot/callback`，静态路由允许该路径。没有新增依赖或数据库迁移。
2. 在网站 API 的受限环境配置中合并以下条目；保留原 ChatGPT 配置和已有额外客户端，不覆盖 `FUSHI_SECRET_KEY` 或账户绑定：

   ```dotenv
   FUSHI_OAUTH_EXTRA_CLIENTS_JSON=[{"client_id":"tsukuyomi-fushi-astrbot","redirect_uris":["https://yachiyo.hk/fushi/astrbot/callback"]}]
   ```

   此处是受限环境文件格式；PM2 加载器直接读取 `=` 后的值，不去除 shell 引号。不要在文件中给 JSON 添加外层单引号。该登记不包含 secret，不创建令牌或账号授权；实际 grant 仍需 Fushi 本人登录确认。

3. 先完成回跳页代理保护，再重启网站 API 使环境生效。精确 HTTPS redirect URI 必须与插件 MCP origin 一致，不放宽为通配回跳。
4. 为回跳页设置 `Cache-Control: private, no-store`、`Surrogate-Control: no-store`、`Referrer-Policy: no-referrer`、`X-Robots-Tag: noindex, nofollow`。`deploy/nginx.conf` 已提供内部 origin 配置；若实际使用其他公开代理或 CDN，也要为该**精确路径**禁止缓存与 query 日志，保留原全局安全响应头。回跳页只返回网站前端入口，不代理到 AstrBot。

后端 `createApp` 和静态回退也提供对应响应头、路由；正式发布仍需按现有双站发布流程保留 SQLite 与资源。普通代码发布流程不会自动更新环境或生产 Nginx 配置，应单独核对第 2–4 步。国内 API 与海外前端的 OAuth 路由继续沿用现有网站架构，本次轮询无需更改 SSH 出站允许列表。

## 机器人登录

- 安装插件 v1.2.0。若同名目录已存在，卸载旧插件时保留配置、数据，再上传；不修改插件名。
- 私聊 `/站内会话ID`，将完整 UMO 填入 `fushi_target_umos`，启用 `enable_fushi` 后重载。
- `/Fushi登录` → 网页登录 Fushi 并确认 → 90 秒内将网站生成的 `/Fushi确认 …` 指令发回原私聊。
- `/Fushi通知` 查看通知编号；`/Fushi线程 编号` 读取上下文；`/Fushi回复 编号 正文` 人工提交；`/Fushi状态` 查看状态；`/Fushi退出` 撤销此插件的授权。

网页密码、Cookie 不传给插件。一次性授权码通过网站自有回跳页交回原私聊，依赖 PKCE verifier、随机 state、issuer 及目标私聊验证；前端立即清除 query，不保存到 localStorage。回跳路由使用稳定视图 key，清除 query 不会丢失内存中的确认指令，刷新会失效；拒绝伪造 issuer、重复参数和 error/code 混合。长期令牌保存在机器人插件 KV，不打印到聊天或诊断，须保护 AstrBot 数据库与备份。不要分享真实确认指令或浏览器历史。

## 可靠性与身份

服务端对额外客户端仅允许 `fushi:read fushi:reply`，申请 `fushi:events` 会被拒绝；每次使用已有 grant 时也复核该限制。管理权限、任意发帖、私信和全站待审事件均不在范围内。管理员提醒仍用独立管理接口。原 ChatGPT OAuth grant 保持有效，增加或撤销 AstrBot 不更换原配置。

访问令牌有效期 15 分钟，refresh 单次使用并轮换；成功刷新自动将账号授权的未使用期限延长至 180 天，不需要定期手工替换凭证。退出、改密、撤销 grant、移除该客户端或停用 Fushi 都会停止授权；移除 AstrBot 登记不撤销其他客户端。持续可用仍取决于机器人在线、自动刷新正常；丢失 refresh 响应时要求重新授权属于安全保护。

通知游标、未送达队列、每个私聊的送达记录和幂等键持久化。网络不明确时先查原回复结果，再读线程检查网页已有回复；不换键重复提交。refresh 单次轮换，刷新前持久化进行中标记，遇到丢失响应/中断后暂停并要求重新授权，避免重用撤销整个授权。

## 本地验证

2026-10-02 补强后验证：插件 33 项（包括真实网站源码 HTTP/SQLite 联调）；网站 Fushi 103 项 Node + 10 项 Python；API 回归 248 项；前端 283 项；代理配置与回滚 Python 9 项；Vite 构建。浏览器实际核验 390px / 1280px 回跳页、复制、清除 query 后保留指令、刷新失效、伪造 issuer、取消与重复参数拒绝。浏览器验收使用 CUA，未在本轮运行 Playwright 测试命令；仓库保留相应自动化用例供 CI 使用。联调使用临时数据库及虚构账号，验证授权→通知→线程→一次站内回复→相同结果→重载→独立退出，确认原客户端仍有效。未向生产发帖或执行生产授权。

插件真实网站联调可复现：

```bash
YACHIYO_SITE_ROOT=/absolute/path/to/tsukuyomi-space \
YACHIYO_TEST_NODE=/absolute/path/to/node \
python -m unittest discover -s astrbot_plugin_yachiyo_feed/tests -v
```

生产发布后，由 Fushi 账号完成实际授权，用新的公开测试互动核对私聊提醒、人工回复、网站结果与重复指令去重。默认 60 秒轮询，不保证即时投递。首次同步会读取尚未处理的相关历史通知；已被网页或 ChatGPT 回答的内容不再次主动提醒。

## 安全发布与回滚

使用现有 `safe-release.py` 双站代码发布流程，本地构建并上传只含首页和哈希文件的产物，不在服务器构建或安装依赖。保持 SQLite、Live2D、音乐及已有服务器修改，发布前后校验受保护资源。发布预检限制内存 512 MiB；API 保留 192 MiB 堆与 384 MiB RSS 重启限制。

生产有两层国内代理，不能直接覆盖自定义站点配置。`deploy/fushi-astrbot-config.py` 提供本次已核验拓扑的定点变更：

- 国内：内部 Nginx 的 Fushi snippet、新的 1Panel `04-astrbot-fushi-callback.conf`、各层从原安全头派生的回跳专用 include，以及合并原受限 env。原 CSP、TLS、其他路径日志和缓存保持不变；仅回跳精确路径禁止访问/错误日志和共享缓存。
- 国内 CDN 回源：控制台核验实际回源使用 `origin.yachiyo.hk`。国内配置激活后，另以 `--site domestic-cdn-origin` 准备和激活该主机的精确 callback 路由，复用已保护的专用安全头；只 reload 国内公开代理，不重启 API。
- 海外：在已有 HTTPS server 中加入精确回跳静态路由，保留其他服务器内容及代理。海外不是另一个可授权 redirect URI，AstrBot 授权仍以 `https://yachiyo.hk` 为 issuer。
- 前后端访问统计只保留 pathname，回跳页不发送页面访问统计，防止一次性码进入持久统计。

在各目标服务器上使用 root 权限，先准备独立备份，再发布代码，最后激活配置：

```bash
python3 /path/to/staged/fushi-astrbot-config.py prepare --site domestic --state /var/backups/tsukuyomi-space/releases/<release>-domestic-config
# 部署并核验代码后；海外使用 --site overseas 与独立目录
python3 /var/backups/tsukuyomi-space/releases/<release>-domestic-config/config.py activate --state /var/backups/tsukuyomi-space/releases/<release>-domestic-config
```

备份目录 0700、文件 0600，含原 env，只保留在对应服务器，禁止上传到日志或仓库。激活前比对配置哈希及权限，校验两层 Nginx 后才 reload，最后 reload PM2；失败会尝试原配置恢复。回滚先恢复独立的 `domestic-cdn-origin` 配置，再恢复国内主配置（先删除引用、后删除其安全头），海外使用自己的配置目录；最后使用对应代码发布状态回滚；已有代码回滚不会自动撤回外部代理或 env：

```bash
python3 /var/backups/tsukuyomi-space/releases/<release>-domestic-config/config.py rollback --state /var/backups/tsukuyomi-space/releases/<release>-domestic-config
python3 /var/backups/tsukuyomi-space/releases/<release>-domestic/release.py rollback --state /var/backups/tsukuyomi-space/releases/<release>-domestic
```

上线核验内部源站、公开域名、实际 CDN 回源主机及公网回跳响应的 no-store/no-referrer、授权/回跳关键 chunk、未授权 MCP 401、原 grant 可用、Fushi 仍是普通账号、资源哈希不变。CDN 若另有 URL 查询参数日志，应在 CDN 端对该路径单独关闭或脱敏；代理配置无法替代 CDN 控制台的日志设置，不能据源站保护推断 CDN 已完成配置。未验证 CDN 日志设置时不要声称全链路不留码。一次性码仍受 90 秒、PKCE、随机 state 和 issuer 保护。
