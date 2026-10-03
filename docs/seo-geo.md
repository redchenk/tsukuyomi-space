# SEO / GEO：抓取、页面身份与发布通知

2026-10-03。目标是让搜索引擎和 AI 搜索读到真实公开内容，保持原有 Vue 页面、配色、圆角、导航与交互。

## Bing 报告与实测

截图没有给出逐条受影响 URL，不能据此声称已复核所有 26 个短简介页面。发布前的公开 HTTP 抽查发现了共因：浏览器和 ChatGPT-User 访问多个不同路径时取得同一份首页标题、简介、首页 canonical 和没有 H1 的 SPA 初始 HTML；Bing 的旧代理规则又只让部分爬虫读到完整页面。海外未知地址返回 HTTP 200，存在软 404。旧站点地图为静态页面每天编造 lastmod，并遗漏像素作品详情。

| 报告问题 | 本次处理 | 验收方式 |
| --- | --- | --- |
| 未采用 IndexNow | 持久发布队列、两域名所有权验证、批量通知及有限重试 | 核对验证文件、真实接收状态与队列 |
| 标头缺少说明 / 简介过短 / 标题过短 | 不同公开页面使用准确的独立标题、简介、canonical、OG 和 Twitter 元数据；文章根据真实摘要/正文生成简介 | 初始 HTML、切换路由后的 head、分页与跟踪参数 |
| 缺 H1 / 内容不足 | 所有访问者取得同样的公开内容摘要；无 JavaScript 时通过 noscript 阅读标题、文章、公开留言、词条、作品及真实链接 | 普通浏览器、Bing、OAI-SearchBot、ChatGPT-User 返回内容一致；正常浏览器只显示原有应用 |
| 入站链接不足 | 保留真实来源、版权声明和开源项目链接，改善站内发现路径 | 外部高质量入站链接需真实站点自愿引用，不能用代码伪造或承诺增长 |

这不是 Vue 整站 SSR / hydration 重写。启用 JavaScript 后应用仍按原方式启动，noscript 不显示；不增加可见营销段落，不改主舞台默认最新排序。第三方爬虫是否使用 JavaScript / noscript、是否收录与引用，需要其后续抓取确认。

## 页面与公开边界

- 页面身份覆盖中枢、主舞台、广场、房间介绍、图库、Wiki、友链、现实锚点、像素工坊、游戏、已发布文章及公开创作者主页。文章作者名称和公开主页可被关联。
- 主舞台 6 条分页提供真实前后页链接，`page>1` 有独立 canonical；搜索、分类和其他排序不作为重复页面收录。像素作品使用 `/pixel?art=ID` 的稳定身份。海外文章使用 `/articles/ID`，不依赖机器翻译后的标题 slug。
- Wiki 摘要从现有前端词条和资料解析器生成，保留事实、来源及核验日期。运行 `npm run build:wiki-seo` 更新快照；`npm run check:seo` 会检查快照是否过期。核验日期不冒充最近更新时间。
- JSON-LD 使用页面实际对应的 Article、WebPage/CollectionPage、WebSite、BreadcrumbList。没有虚构评分、FAQ、SearchAction 或未存在的功能。
- 私人聊天、长期记忆、日记、密钥、邮箱、草稿和待审核留言不进入公开文档或站点地图。账号中心、设置、后台、附件库等返回 noindex。robots 是抓取提示，不能替代现有鉴权。
- 无效文章、Wiki 词条、像素作品、用户主页和未知页面返回真实 404。资源、下载、模型、音乐及独立应用路由保留。
- Sitemap 使用真实内容日期；静态路由没有可信更新时间时不输出 lastmod。图片地图移除已废弃的 image:title / image:caption；公开 PNG 和图片代理仍可被抓取。RSS 保持可发现。

## IndexNow 运行与撤销

配置示例：

```dotenv
INDEXNOW_ENABLED=false
```

生产两站验证路由就绪后启用 `true`。运行时在现有 DATA_DIR 创建权限为 0600 的 `indexnow-key`，通过根目录 `/indexnow-<key>.txt` 验证域名所有权。这是公开验证值，不是网站登录或管理凭证；不要写入仓库或普通日志。不扩大 Fushi / OAuth / 管理权限。

Migration 042 创建 SQLite `seo_indexnow_outbox`。公开文章、像素画、审核通过的广场内容、图库及友链在同一数据库事务中登记变化；未提交事务不会产生通知。阅读数与点赞计数不触发提交。按 URL 和域名合并连续修改，每域名每批最多 50 条，后台每两分钟处理一次，网站写入请求不等待外部接口。

仅向固定 HTTPS IndexNow 官方接口提交预定义公开路径，禁止跟随重定向；10 秒请求预算。任务持久化、租约恢复、版本检查、最多六次指数退避；失败任务留待检查，成功记录七天后清理。HTTP 200/202 表示收到或待验证，不表示已收录或排名提升。可用聚合查询查看状态，禁止导出完整队列正文或验证值到日志。

停用：将 `INDEXNOW_ENABLED=false` 并按现有发布方式 reload API。旧公开验证文件路由即停止响应，队列保留。撤换验证值时先停用并删除 DATA_DIR 下的该验证文件，下次启用重新生成；不涉及账号密码或 OAuth 凭证轮换。

## 海外站低负载策略

翻译继续使用原有服务与模型，未增加模型或常驻进程。SEO 文档新鲜缓存直接返回，过期缓存由单个后台线程刷新，队列最多 32 项并去重、失败冷却；首次抓取先使用源站真实公开摘要，翻译随后完成。用户不等待正文机器翻译。缓存响应每次附加当前海外前端资源，避免旧缓存引用上一版 JavaScript。不存在的内容维持 404/410；独立 topic 页面保持原有独立显示。

常规 API 翻译和原有语言选择保持不变。冷缓存 HTML 正文短暂保留中文，待后台翻译后变成英文；不伪造译文。公开 HTML 无用户身份差异，不根据爬虫 UA 提供另一套内容。

## 部署与回滚

本地构建两个站点，服务器不运行 npm build、安装依赖或重建媒体资源。准备阶段继续使用现有 384 MiB / 512 MiB cgroup 限额。

Schema 单独分阶段发布：先备份 SQLite 和受保护资源指纹，核对差异仅为 042 迁移及其静态页面清单，ff-only 更新并在事务中应用迁移。随后通过现有 safe-release 发布普通代码和预构建资源。不要绕过 code-only 发布器对 migration 的拒绝检查。Nginx / OpenResty 和翻译脚本各自保留备份，配置测试通过再 reload；只修改月读空间相应路由块，保留共同托管应用。

回滚普通代码/前端使用对应发布 state；还原本次 Nginx 与翻译脚本备份。IndexNow 先停用。042 是额外队列及触发器，旧应用可保留它继续运行；彻底撤销时仅删除 sqlite_master 中 `seo_` 前缀的本次触发器、`seo_indexnow_outbox` 表和 schema_migrations 的 `042` 记录。先检查名称和备份，不能恢复旧全库覆盖发布后产生的用户数据。

## 测试与后续核验

```sh
npm run check:seo
npm run test:seo
npm run test:api
npm run test:frontend
python3 -B tests/deployment_safety_test.py
# 用已有翻译服务依赖运行真实 HTML 测试，不加载模型或访问网络：
python3 -B tests/overseas_seo_test.py
```

回归覆盖不同 UA 一致响应、标题/简介/H1/canonical、结构化 JSON、分页、私有数据排除、404、独立 topic 视图、中文作者名、过期缓存、资源版本更新、冷缓存不等待翻译、队列去重、回滚事务、响应丢失、进程租约恢复和版本竞争。真实 HTML 测试需要原有 beautifulsoup4；无此依赖时明确 skip，在海外 venv 或隔离测试环境补跑。

上线后在 Bing Webmaster 重新抓取 sitemap 与受影响 URL，观察报告刷新、索引覆盖和 AI Performance。未访问用户未提供的 Bing 后台，不能确认其诊断计数已消失。持续发布有明确作者、真实来源及原创价值的内容；不购买或制造外链，不添加不能验证的 AI 专用承诺。

官方依据：[IndexNow](https://www.indexnow.org/documentation)、[Google AI 搜索功能](https://developers.google.com/search/docs/appearance/ai-features)、[JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)、[图片地图](https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps)、[OpenAI 爬虫](https://developers.openai.com/api/docs/bots)。普通 SEO 基础同样适用于 AI 搜索；没有单独的 schema 或 llms.txt 必需项，也没有收录与引用保证。
