# 月读空间 · Tsukuyomi Space

[简体中文](README.md) | [English](README_EN.md)

**给日常留一点月光。与八千代聊天，读故事、看创作，遇见同频的人。**

围绕《超时空辉夜姬！》世界观构建的非盈利同人社区，以 Vue 3 + Express 连接 Live2D AI 陪伴、内容创作、社区互动与作品百科。

[国内站 · 中文 / 日语](https://yachiyo.hk) · [海外站 · English](https://tsukuyomi-space.com) · [部署指南](docs/DEPLOY.md) · [问题反馈](https://github.com/redchenk/tsukuyomi-space/issues)

[项目预览](#项目预览) · [核心体验](#核心体验) · [快速开始](#快速开始) · [部署与配置](#部署与配置) · [开发文档](#开发文档) · [支持项目](#支持项目)

[![月读空间新版首页：月光主题、私人居所入口与月下新鲜事](assets/images/readme/hub.jpg)](https://yachiyo.hk/hub)

## 项目预览

以下截图采集于 **2026-09-16**，来自国内站公开页面，使用 1440 × 960 桌面视口、未登录状态。站点内容与时间、天气场景会持续变化。

| Live2D AI 私人居所 | 主舞台 · 文章与创作 |
| --- | --- |
| [![Live2D AI 私人居所](assets/images/readme/room.jpg)](https://yachiyo.hk/room) | [![主舞台文章列表](assets/images/readme/stage.jpg)](https://yachiyo.hk/stage) |
| **192 × 108 像素工坊** | **超时空辉夜姬 Wiki** |
| [![像素工坊画布与绘画工具](assets/images/readme/pixel.jpg)](https://yachiyo.hk/pixel) | [![超时空辉夜姬百科首页](assets/images/readme/wiki.jpg)](https://yachiyo.hk/wiki) |

## 核心体验

- **与八千代相伴**：Live2D 角色、聊天、表情、TTS、音乐和天气场景组合成私人居所；可连接云端 LLM 或本机 Ollama，并通过 MCP 扩展工具。
- **让对话延续**：登录后的会话与长期记忆按账号隔离、跨设备同步；支持记忆管理、角色知识库，以及角色日记和人设备份导入。
- **创作与交流**：在主舞台阅读文章，在月读广场留言，在图库分享作品，或用固定 192 × 108 画布绘制、发布和导出像素画。
- **探索作品世界**：公开 Wiki 汇集角色、世界观、音乐与制作资料；节奏跑酷游戏提供键盘、触控和全屏游玩。
- **记录每天的相遇**：月契成长中心包含签到、每日任务、连续奖励与邀请成长；站内通知帮助追踪互动。
- **统一的月光界面**：深色 / 浅色主题、响应式导航与共享设计变量贯穿主要页面，国内站支持中文 / 日语，海外站提供英文入口。

## 快速开始

使用 **Node.js 22.12+**；当前 Vite 也支持 Node.js 20.19+。在仓库根目录安装依赖即可，无需在 `backend/` 重复安装。

```bash
git clone https://github.com/redchenk/tsukuyomi-space.git
cd tsukuyomi-space
npm ci
npm run dev
```

开发命令会同时启动前端与 API：

| 服务 | 地址 |
| --- | --- |
| Vite 前端 | http://localhost:5173/ |
| API 健康检查 | http://localhost:3000/api/health |

开发环境默认使用本地 SQLite，数据库迁移会在 API 启动时自动执行。Redis、Milvus、SMTP 和第三方 AI 服务按需配置；聊天与语音能力需要在房间设置中配置相应服务。额外音乐、视频背景等大资源需单独准备，详见[部署指南](docs/DEPLOY.md)。

### 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 同时启动 API 与前端 |
| `npm run dev:api` / `npm run dev:web` | 单独启动 API / 前端 |
| `npm run build:web` | 构建前端到 `dist/frontend/` |
| `npm run build:web:overseas` | 使用海外环境配置构建英文站 |
| `npm run build:live2d` | 重新构建 Live2D 房间运行时 |
| `npm run dev:live2d-studio` | 启动 Live2D Studio 开发服务 |
| `npm test` | 运行语法检查、API 与前端回归测试 |
| `npm run test:api` / `npm run test:frontend` | 单独运行 API / 前端回归测试 |
| `npm run test:e2e` | 运行 Playwright 端到端测试 |

运行端到端测试前，先执行 `npm run build:web`，并通过 `npx playwright install chromium` 安装浏览器；也可用 `E2E_BASE_URL` 指向已有测试服务。

## 部署与配置

新环境可使用 Docker Compose：

```bash
cp .env.docker.example .env.docker
# 编辑 .env.docker，替换密钥、管理员密码与站点域名
docker compose up -d --build
curl http://127.0.0.1:3280/api/health
```

默认端口绑定到服务器回环地址 `127.0.0.1:3280`，对外访问需配置反向代理与 HTTPS。SQLite 与上传文件分别持久化到 `tsukuyomi-data` 和 `tsukuyomi-uploads` 命名卷。

| 配置 | 说明 |
| --- | --- |
| `JWT_SECRET` | 生产必填，至少 32 字符；可用 `openssl rand -base64 48` 生成 |
| `ADMIN_PASSWORD` | 首次创建生产管理员时必填，请替换示例密码 |
| `CORS_ORIGINS` | 允许访问 API 的线上域名 |
| `MAIL_CREDENTIAL_KEY` | 聚合邮箱凭据加密密钥，建议独立生成并保持稳定 |
| `DATA_DIR` / `DB_PATH` | SQLite 持久化路径；Docker 默认使用 `/data` |
| `REDIS_URL` | 可选，用于验证码、限流、天气缓存及 token 黑名单 |
| `ROOM_MEMORY_VECTOR_BACKEND` | 默认使用 SQLite 本地向量检索，可选接入 Milvus |

完整配置见 [`.env.example`](.env.example) 与 [`.env.docker.example`](.env.docker.example)。真实环境文件、密码和 API Key 不应提交到仓库。

- **Docker 更新**：`bash deploy/docker-deploy.sh`。
- **PM2 + Nginx / OpenResty**：支持现有服务器部署，步骤见[部署指南](docs/DEPLOY.md)。
- **可选服务与大资源**：Redis / Milvus profile、模型、音乐与视频的只读挂载均见部署指南。
- **数据库迁移**：启动时自动执行 `backend/db/migrations/`；生产更新前先备份。部署备份与数据库备份默认各保留最近 10 份，可通过 `BACKUP_RETENTION` 调整。

## 开发文档

| 文档 | 内容 |
| --- | --- |
| [部署与运维](docs/DEPLOY.md) | Docker、PM2、反向代理、资源挂载、备份与恢复 |
| [权限模型](docs/PERMISSIONS.md) | 用户、管理员与超级管理员的权限边界 |
| [Room 长期记忆](docs/ROOM_MEMORY.md) | 记忆存储、检索与用户隔离 |
| [Room 渲染性能](docs/room-rendering-performance.md) | Live2D 渲染与性能策略 |
| [Wiki 维护](docs/WIKI.md) | 百科内容与页面维护 |
| [文章排序](docs/article-ranking.md) | 文章排序与读者互动指标 |
| [文章封面](docs/FEATURE_COVER_IMAGE.md) | 封面图片功能说明 |


## 技术栈

- 前端：Vue 3、Vite、CSS3、原生 JavaScript、Live2D Cubism、Anime.js、Lucide 图标
- 后端：Node.js、Express、better-sqlite3
- 数据与缓存：SQLite、可选 Redis、可选 Milvus 向量库
- 认证：JWT、Cookie、bcryptjs、QQ OAuth、邮箱验证码
- 存储：本地受控上传、S3 兼容对象存储 / 阿里云 OSS
- 集成：Agent OS、MCP、RSS / JSON Feed、多邮箱聚合 API
- 测试：node:test、Playwright
- 部署：Docker Compose、PM2、Nginx / OpenResty、GitHub Actions、SSH、国内 / 海外双站

## 项目结构

```text
tsukuyomi-space/
├── assets/          # 图片、README 示例图、图标、音频和样式等静态资源
├── backend/         # Express API、SQLite 初始化、路由和中间件
├── deploy/          # PM2、Nginx、部署脚本样例
├── docs/            # 部署和维护文档
├── docker-compose.yml # Docker Compose 生产部署入口
├── dist/frontend/   # npm run build:web 生成的 Vue 前端产物
├── live2d-studio/   # Live2D Studio 独立前端
├── lib/             # Live2D / 前端运行库
├── models/          # Live2D 模型资源
├── src/frontend/    # Vue 3 + Vite 主线前端源码
│   └── styles/      # 设计系统 token、主题、组件、动画和响应式规则
├── tests/           # API 与 Playwright 端到端测试
├── .env.example     # 生产环境变量模板
└── package.json     # 项目脚本与依赖
```

## 设计系统

前端设计系统位于 `src/frontend/styles/`，用于稳定“简约清爽 + 现代感 + 二次元动漫风格”的整体视觉：

- `tokens.css`：色彩、字体、间距、圆角、阴影、动效时长等基础 token
- `themes.css`：深色 / 浅色主题变量，以及旧变量名兼容映射
- `components.css`：按钮、卡片、面板、导航、输入框等通用组件样式
- `animations.css`：全局背景动效、页面入场和动效节奏
- `responsive.css`：全局移动端断点和导航响应式规则

新增页面优先使用 `--ts-*` 变量；旧的 `--moon-*`、`--panel`、`--radius` 等变量会继续映射到设计系统，便于逐步迁移。

<details>
<summary>查看完整模块与 Room / Agent 使用说明</summary>

### 完整模块列表

| 模块 | 说明 |
| --- | --- |
| Hub | 站点中枢大厅，聚合主要入口、广场动态、文章预览和访问统计 |
| Room | Live2D AI 私人房间，包含聊天、长期记忆、资料、便签、天气、音乐、TTS 和独立设置页 |
| Growth | 月契成长中心，提供每日任务、连续签到、等级、邀请关系和与八千代联动的成长反馈 |
| Stage / Article | 文章列表、详情阅读、编辑器和管理端内容发布流程 |
| Plaza | 留言广场，支持留言、回复、点赞和管理员审核 |
| Gallery / Attachments | 图库与附件库，支持上传者展示、个人管理、审核和对象存储 |
| Pixel | `/pixel` 固定 192×108 画布的像素工坊，支持触控笔、发布、点赞、分享和 PNG 导出 |
| Game | `/game` 辉夜姬主题节奏跑酷游戏，支持桌面键盘、移动端触控与全屏游玩 |
| Wiki | 角色、世界观、音乐、发行与衍生资料总览，以及独立角色和术语词条 |
| Friend Links | 公开友链目录与独立申请、审核流程 |
| Agent OS | `/agent-os` 独立应用入口，运行时请求复用站内登录校验 |
| Notifications | 分页站内信、已读状态、未读角标与内容跳转 |
| User Center | 用户资料、文章、留言、收藏、作品和账号安全管理 |
| Admin | 面向 `admin` / `super_admin` 的文章、留言、图库和附件审核工作台 |
| Terminal | 管理用户权限、友链、访问统计、对象存储和系统配置 |
| Reality | 联系方式、隐私说明、责任边界和第三方技术 / 素材来源 |

### Room / Agent 能力

Room 页面正在向个人 Agent 方向演进，当前能力包括：

- LLM 与 TTS 请求默认从用户浏览器侧发出，减少用户对话和 API Key 经由站点后端转发。
- 登录用户的会话与长期记忆保存在服务端并按账号隔离，通过账号会话和实时事件跨设备同步；未登录访客退回浏览器本地存储。
- 记忆检索支持本地向量，并可选接入 Milvus；数据库边界和向量查询都会携带用户作用域。
- 房间设置页提供“记忆管理”，默认折叠，展开后可搜索、查看、编辑、删除当前用户的记忆。
- 角色知识库保存在浏览器 `localStorage`，默认内置八千代身份、人设、说话风格、关系和限制条目，用户可自行新增、编辑、停用或恢复默认。
- 聊天时会把相关长期记忆、角色知识、真实天气、最新站点动态和可用 MCP 工具一起组织进上下文。
- 八千代能够读取用户当前等级、签到与任务状态；每天第一次对话前会显示一次“今日约定”成长入口。
- 登录用户可以选择一轮问答生成公开对话卡，分享链接会还原对应场景，并提供独立标题、描述和 OG 图片。
- MCP 支持自定义 JSON-RPC 端点，以及 MiniMax Token Plan 的站内受限桥接；图片理解在 LLM 不支持多模态时会尝试调用 MCP。
- LLM 支持受控的云服务直连，也支持浏览器直连用户本机 `http://localhost:11434` 的 Ollama；本机模式不会把对话转发到本站服务器。
- Room 音乐播放卡片读取服务器静态目录 `/assets/music/` 下的歌曲文件；音乐资源体积较大，不提交到 Git，部署时单独上传。
- Room 天气卡片会优先使用用户浏览器定位获取所在地天气，并作为聊天上下文的一部分。

Room 相关设置主要保存在浏览器本地，包括：

- `roomLLMSettings`
- `roomTTSSettings`
- `roomMCPSettings`
- `roomMemorySettings`
- `roomKnowledgeSettings`
- `roomMusicTrackIndex`
- `roomMusicVolume`

从 HTTPS 站点连接本机 Ollama 时，需要允许浏览器访问本地网络，并为 Ollama 配置可信来源后完整重启：

```powershell
[Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS','https://yachiyo.hk,https://yachiyo.com.cn,https://cho-kaguyahime.cn','User')
```

### 内容、分享与订阅

- 文章、留言、图库、像素画和友链等公开列表使用路径级缓存破坏与服务端缓存失效，发布后会请求最新内容。
- 文章详情和像素作品提供复制链接及社交媒体分享入口；用户分享行为会进入每日成长任务，但奖励只由服务端判定一次。
- Room 对话分享只发布用户主动选择的单轮内容，不会公开整段私人会话或长期记忆。
- JSON 动态接口为 `/api/site-feed`，RSS 地址为 `/feed.xml` 或 `/api/site-feed/rss`。
- 对象存储配置位于超级管理员终端；数据库只保存受控资源索引，公开访问仍通过站点资产接口或配置的 CDN 域名。
- 部署与数据库备份默认各保留最近 10 份，可通过 `BACKUP_RETENTION` 调整。

海外英文构建使用同一份源码：

```bash
VITE_SITE_LANGUAGE=en npm run build:web
```

</details>

## 安全说明

- 生产环境的 `JWT_SECRET` 少于 32 字符时会拒绝启动。
- 生产环境首次创建管理员时必须提供 `ADMIN_PASSWORD`。
- 管理员终端所有数据接口都需要管理员 JWT。
- API 已加入基础安全响应头、CORS 白名单和 Redis 优先的限流。
- CSP 由 HTTP 响应头统一下发，并限制脚本、媒体、框架、连接目标和对象资源来源。
- Cookie 写操作校验可信请求来源，JSON 请求拒绝重复键，上传文件同时校验扩展名、MIME 与文件特征。
- 外部请求与对象存储地址经过 SSRF 校验，管理员操作按 `admin` / `super_admin` 权限分层。
- 公开内容中的外部链接会经过协议与风险处理，留言、文章、图库、附件和友链提供独立审核边界。
- SQLite 默认存放在 `DATA_DIR`，不应提交到 Git。
- 权限模型见 [docs/PERMISSIONS.md](docs/PERMISSIONS.md)。
- Room 长期记忆说明见 [docs/ROOM_MEMORY.md](docs/ROOM_MEMORY.md)。

## 支持项目

如果月读空间为你带来了帮助，可以通过爱发电自愿支持服务器、对象存储、CDN 与持续维护。支持不会影响站内功能、内容审核或用户权限。

<p align="center">
  <a href="https://www.ifdian.net/a/redchenk?utm_source=copylink&amp;utm_medium=link">
    <img src="assets/images/support/afdian-redchenk.jpg" width="240" alt="通过爱发电支持 redchenk 和月读空间">
  </a>
</p>

<p align="center"><a href="https://www.ifdian.net/a/redchenk?utm_source=copylink&amp;utm_medium=link">前往爱发电支持月读空间</a></p>

## 技术与素材来源

- 本站的无刷新平滑切页、Markdown 编辑增强和图片渐显加载等部分前端技术，参考了 [LyraVoid/Shirone](https://github.com/LyraVoid/Shirone)；原项目的代码与许可证信息请以其仓库说明为准。
- Agent OS 页面音乐 App 的技术实现来源于 [firefly20041001/Yachiyo](https://github.com/firefly20041001/yachiyo)，原项目采用 Electron、React、TypeScript，并以 Apache-2.0 许可证发布。
- 站内 Live2D、角色视觉与音乐素材版权归原作者及相关权利方所有；项目仅用于非盈利个人展示与交流。
- 右下角网页宠物来源于 [Petdex / Yachiyo](https://petdex.dev/zh/pets/yachiyo)，界面图标使用 [Lucide](https://lucide.dev/)。
- 更完整的来源、隐私和责任边界请查看站内 [`/reality`](https://yachiyo.hk/reality) 页面。

## License

项目自有代码以 [MIT 许可证](LICENSE)发布。第三方代码、模型、音乐、图片和角色素材分别遵循其原始许可证与权利声明。
