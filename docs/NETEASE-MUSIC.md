# 网易云音乐播放器

全站沿用同一个音频播放器，保持现有底部入口、主题配色和圆角。默认播放 `/assets/music/` 中的固定曲目；打开播放器 → 网易云 → 扫码登录，使用网易云 App 扫描并确认后，即可搜索歌名／歌手、打开自己的歌单并点歌。点歌时，已加载的当前页曲目成为播放队列，从所点歌曲开始续播；分页查看其他曲目不会改变正在播放的队列，不批量抓取整个歌单。队列上限 100 首，接口每页最多 20 首。切回「网站曲目」或退出账号会停止网易云音频并恢复固定曲目。

「播放顺序」提供顺序播放（播完最后一首停止）、列表循环（默认，末尾回到首曲）、随机播放（每轮不重复，上一曲返回实际播放历史）和单曲循环。手动上一曲／下一曲始终可以切歌；选择保存在当前浏览器，适用于两种音乐来源。播完自动续播独立于音频暂停事件，远程切歌等待期间也可暂停，迟到的音频地址不会擅自开始播放。不可用歌曲停止并显示原因，避免自动无限重试。展开／收起只在操作时测量和执行短动画，尊重系统减少动态效果设置，没有播放期间的动画轮询。

不会自动播放登录后的音乐，也不会持久化带时效的音频地址。刷新页面后固定曲目继续作为默认队列，网易云账号保留，可重新点歌。会员、版权、地区限制由网易云决定；受限歌曲显示原因，试听片段有提示。音频和封面由浏览器直接访问网易云 HTTPS CDN，服务器不代理、不下载或缓存整首歌曲。

## 配置与隐私

`MUSIC_NETEASE_ENABLED=true`（默认启用）；设为 `false` 可关闭新功能，固定曲目始终可用。无需另装网易云 API 服务、Redis 或新依赖，也不需要全站共享的网易云账号。只开放扫码授权、读取账号名称、搜索、读取歌单与播放地址，没有密码登录、Cookie 导入、修改歌单或版权解锁接口。

登录后生成 256 位随机的浏览器会话 Cookie，HttpOnly、SameSite=Strict、生产环境 Secure、仅 `/api/music` 路径、无 Domain 属性。每个会话绑定当前网站用户；游客会话只属于持有该 Cookie 的浏览器，不会与其他游客共享。切换网站账号会立即清除旧账号的播放器界面和队列，旧授权不能以新身份读取。每台设备需分别扫码，不同步网易云凭证。

`DATA_DIR/music-private/sessions.sqlite` 为独立、惰性创建的小型 SQLite：目录权限 0700、文件权限 0600，使用 512 KiB SQLite 页缓存。原站数据库及迁移不变。数据库仅保存浏览器令牌的 SHA-256 摘要，以及 AES-256-GCM 加密的网易云 Cookie、二维码状态和必要账号资料。加密密钥通过用途隔离从项目现有 `MAIL_CREDENTIAL_KEY` 派生（项目未设置时沿用现有 `JWT_SECRET` 回退）。请维持既有生产密钥配置；更换该密钥会要求音乐用户重新扫码。不会在接口响应、日志、localStorage、代码或文档中保存网易云 Cookie。

二维码最多保留 3 分钟，授权后令牌轮换；登录会话最多 30 天，网易云撤销或失效时提前要求重登。点击「退出」删除本站加密会话并使浏览器 Cookie 失效，不会退出网易云 App 中的账号。取消、过期或替换后的二维码不会被迟到的确认请求重新激活。过期记录按小时在请求中清理，总会话上限约 2,000 条。

## 安全与资源预算

复用网站 Origin、CSRF 和鉴权机制，额外要求可信浏览器上下文，Bearer 参数不能绕过音乐会话保护；不能由参数指定账号身份。请求体最大 8 KiB，普通音乐请求每 IP 每分钟 45 次，二维码创建每 IP 每 10 分钟 10 次。二维码仅在播放器打开、页面可见且未过期时每 3 秒查询，网络异常时退至 6 秒；关闭播放器或切后台即停止。

服务器最多同时请求 4 个网易云接口，每个请求的 DNS、连接、TLS、响应头和完整正文共用 10 秒预算，单个响应最大 2 MiB。域名固定为网易云接口，保留公开地址校验、DNS 钉扎、TLS 验证及禁止重定向；不允许配置任意上游 URL。每页最多 20 首／20 个歌单，分页范围有上限。无常驻轮询进程、整首音乐缓存或新增模型。4 个最大响应正文及合并缓冲区约 16 MiB，另有少量 JSON 对象和网络缓冲；保留现有 API 进程内存限制。

## 接口

所有响应不可缓存，成功含 `success: true`；失败含脱敏 `code` 和用户可见 `message`。请求须携带现有网站会话（游客可无）与音乐 HttpOnly Cookie，以及 `X-Requested-With: XMLHttpRequest`，遵守现有可信 Origin 检查。

| 方法与路径 | 用途 |
| --- | --- |
| `GET /api/music/status` | 功能开关、当前浏览器绑定账号的必要资料 |
| `POST /api/music/qr` | 生成本次登录二维码 URL、非上游的 `qrId`、过期时间 |
| `POST /api/music/qr/check` | body: `{ "qrId": "本次响应值" }`；waiting／scanned／authorized／expired |
| `POST /api/music/logout` | 取消二维码或删除本浏览器音乐授权 |
| `GET /api/music/search?q=...&offset=0` | 单曲搜索，20 首／页 |
| `GET /api/music/playlists?offset=0` | 当前授权网易云账号的歌单，20 个／页 |
| `GET /api/music/playlists/:id?offset=0` | 歌单曲目，20 首／页 |
| `GET /api/music/tracks/:id/playback` | HTTPS 音频 URL、短期有效时长、试听标志 |

不开放通用代理、任意 Cookie 或用户 ID 参数。过期／拒绝登录返回 401；无播放权限返回 422；网络错误、正文异常和超时返回各自的 MUSIC_* 代码。失败响应不包含上游正文、Cookie 或网络私密信息。

## 验证、上线与回滚

运行 `npm run check:music`、`npm run test:music`、`npm run build:web` 与 `npm run build:web:overseas`。浏览器回归：`npx playwright test tests/e2e/netease-music.spec.js --project=chromium`。隔离用例覆盖加密持久化、身份隔离、到期与撤销、取消登录竞态、重复查询、可信 Origin、错误／超大／分段 JSON、响应正文停滞、受限歌曲、试听和关闭轮询。浏览器用本地模拟账号与 WAV 音频验证 QR 图像、搜索、歌单、实际 Audio 播放和固定曲目回退，不代表真实账号授权验收。

服务器的真实上游验收可生成二维码、查看未扫码状态、搜索并取得公开歌曲的 HTTPS 地址，不需要真实账号。完整个人歌单／会员权限仍需用户在自己的网易云 App 中扫描授权；不可使用他人的密码或 Cookie 代验。

按 `deploy/safe-release.py` 仅发布代码和本地编译产物，不变更现有 Live2D、音乐、上传资源、数据库或服务内存限制。无需安装依赖或数据库迁移。回滚使用此次发布的 safe-release 状态恢复前一版代码；新独立的加密会话库留在 DATA_DIR，旧版忽略它。需要紧急关闭网易云功能时可由管理员设置上述开关；不要删除旧音乐资源。

## 来源

- [firefly20041001/Yachiyo](https://github.com/firefly20041001/Yachiyo)，Apache-2.0，参考提交 `7a81a7f393cb578d8ec6313d41a1505d0a116443` 的账号／流媒体流程。网页实现没有移植 Electron 登录窗口或绕过 TLS 验证。
- [api-enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced)，MIT，参考提交 `2db6684453297ee86dec0492842f2320b08182d9` 的 QR、WEAPI/EAPI 协议；用 Node 内置 crypto 实现有限的只读接口，许可证见 `docs/licenses/netease-api-enhanced.txt`。
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)，MIT，固定提交 `83b7e8fe3fddd3b0368dbafd6ce56995bd25e3c8` 的 JS 模块与原许可证保留于 `src/frontend/vendor/qrcode/`，仅在生成二维码时动态加载。
