# Tsukuyomi Space

一个带 Live2D 私人房间、文章系统、留言广场、用户中心和管理员终端的沉浸式个人网站。

> 预览地址：[https://yachiyo.redchenk.com](https://yachiyo.redchenk.com)

![Tsukuyomi Space](assets/images/tsukuyomi-bg.png)

## 项目预览

| 入口视觉 | 私人房间 |
| --- | --- |
| ![月读空间主视觉](assets/images/tsukuyomi-bg.png) | ![Live2D 房间背景](assets/images/room-bg.png) |

## 亮点

- 沉浸式站点入口与统一导航，移动端有视频背景和图片兜底
- Live2D 私人居所，支持浏览器侧 LLM 聊天和 TTS 语音配置
- Room Agent 化能力：长期记忆、角色知识库、MCP 工具接入、图片理解兜底
- 角色知识库可在房间设置页管理，用于稳定还原“八千代”的人格、语气和行为边界
- 文章浏览、详情页、编辑器与后台管理
- 用户注册、登录、邮箱验证码与 JWT 鉴权
- 留言广场、点赞、回复与管理员审核
- 管理员终端：文章、留言、用户、友链、访问统计和系统配置
- PM2 + Nginx 部署方案，支持生产环境变量和 SQLite 数据目录隔离

## 技术栈

- 前端：Vue 3、Vite、CSS3、原生 JavaScript、Live2D Cubism
- 后端：Node.js、Express、better-sqlite3
- 认证：JWT、bcryptjs
- 测试：node:test、Playwright
- 部署：PM2、Nginx、GitHub Actions、SSH

## 快速开始

需要 Node.js 20 或以上版本。

```bash
npm install
npm run dev
```

开发环境会并行启动 API 和前端：

- 前端开发服务：`http://localhost:5173/`
- API 服务：`http://localhost:3000/api/health`

常用脚本：

- `npm run dev` / `npm run dev:all`：并行启动后端 API 和 Vite 前端
- `npm run dev:api`：只启动 Express API
- `npm run dev:web`：只启动 Vite 前端
- `npm test`：执行 Node 语法检查和后端接口测试
- `npm run test:api`：执行 auth、articles、messages、admin、room memory、MCP 等接口测试
- `npm run test:e2e`：执行 Playwright 端到端主流程测试，需要先构建前端或提供 `E2E_BASE_URL`
- `npm run build:web`：构建 Vue 前端产物

## 项目结构

```text
tsukuyomi-space/
├── assets/          # 图片、图标、音频、样式等静态资源
├── backend/         # Express API、SQLite 初始化、路由和中间件
├── deploy/          # PM2、Nginx、部署脚本样例
├── docs/            # 部署和维护文档
├── dist/frontend/   # npm run build:web 生成的 Vue 前端产物
├── lib/             # Live2D / 前端运行库
├── models/          # Live2D 模型资源
├── src/frontend/    # Vue 3 + Vite 主线前端源码
├── .env.example     # 生产环境变量模板
└── package.json     # 项目脚本与依赖
```

## 配置

生产环境必须设置：

- `NODE_ENV=production`
- `JWT_SECRET`：至少 32 字符，建议用 `openssl rand -base64 48` 生成
- `ADMIN_PASSWORD`：首次创建或重置管理员时使用
- `CORS_ORIGINS`：线上域名，例如 `https://your-domain.example`
- `DATA_DIR` 或 `DB_PATH`：SQLite 数据库存放路径

复制 `.env.example` 到服务器的 `/etc/tsukuyomi-space/tsukuyomi-space.env`。真实 `.env`、密码、API Key 不应提交到仓库。

## 数据库迁移

启动时会自动执行 `backend/db/migrations/` 下按版本号排序的迁移脚本，并把执行记录写入 `schema_migrations` 表。

生产部署前必须先备份 SQLite。`deploy/deploy.sh` 会在安装依赖、构建和 PM2 reload 前自动备份 `DB_PATH` 或 `DATA_DIR/tsukuyomi.db` 到 `BACKUP_DIR`，默认目录是 `DATA_DIR/backups`。

新增迁移时使用 `NNN_description.js` 命名，例如 `003_add_article_indexes.js`，并导出：

```js
module.exports = {
  version: '003',
  name: 'add_article_indexes',
  up(db) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status)');
  }
};
```

## Room / Agent 能力

Room 页面正在向个人 Agent 方向演进，当前能力包括：

- LLM 与 TTS 请求默认从用户浏览器侧发出，减少用户对话和 API Key 经由站点后端转发。
- 长期记忆按用户隔离：登录用户使用服务端 SQLite 记忆库，未登录访客退回本机 IndexedDB。
- 房间设置页提供“记忆管理”，默认折叠，展开后可搜索、查看、编辑、删除当前用户的记忆。
- 角色知识库保存在浏览器 `localStorage`，默认内置八千代身份、人设、说话风格、关系和限制条目，用户可自行新增、编辑、停用或恢复默认。
- 聊天时会把相关长期记忆、角色知识、天气上下文和可用 MCP 工具一起组织进上下文。
- MCP 支持自定义 JSON-RPC 端点，以及 MiniMax Token Plan 的站内受限桥接；图片理解在 LLM 不支持多模态时会尝试调用 MCP。

Room 相关设置主要保存在浏览器本地，包括：

- `roomLLMSettings`
- `roomTTSSettings`
- `roomMCPSettings`
- `roomMemorySettings`
- `roomKnowledgeSettings`

## 部署

推荐使用 PM2 运行后端，Nginx 处理静态文件并反向代理 `/api/`：

```bash
bash deploy/deploy.sh
```

完整步骤见 [docs/DEPLOY.md](docs/DEPLOY.md)。

## 安全说明

- 生产环境没有强 `JWT_SECRET` 会拒绝启动。
- 生产环境首次创建管理员时必须提供 `ADMIN_PASSWORD`。
- 管理员终端所有数据接口都需要管理员 JWT。
- API 已加入基础安全响应头、CORS 白名单和内存限流。
- SQLite 默认存放在 `DATA_DIR`，不应提交到 Git。
- 权限模型见 [docs/PERMISSIONS.md](docs/PERMISSIONS.md)。
- Room 长期记忆说明见 [docs/ROOM_MEMORY.md](docs/ROOM_MEMORY.md)。

## License

MIT
