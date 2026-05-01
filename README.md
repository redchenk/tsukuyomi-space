# Tsukuyomi Space

月读空间是一个带 Live2D 房间、文章系统、留言、用户中心和后台管理的个人网站。前端使用原生 HTML/CSS/JavaScript，后端使用 Node.js + Express + SQLite。

## 功能

- 文章浏览、详情页与后台编辑
- 用户注册、登录、邮箱验证码与 JWT 鉴权
- 留言、点赞与后台审核
- 访问统计与后台数据面板
- Live2D 私人居所页面
- 可选 LLM/TTS 配置，用于房间聊天体验

## 技术栈

- 前端：HTML5、CSS3、原生 JavaScript、Live2D Cubism
- 后端：Node.js、Express、better-sqlite3
- 认证：JWT、bcryptjs
- 部署：PM2 + Nginx，配置通过 `.env` 管理

## 快速开始

```bash
npm install
npm run check
npm start
```

默认地址：

- 首页：`http://localhost:3000/`
- 中枢大厅：`http://localhost:3000/pages/hub`
- 私人居所：`http://localhost:3000/pages/room`
- 数据终端：`http://localhost:3000/pages/terminal`
- 健康检查：`http://localhost:3000/api/health`

## 项目结构

```text
tsukuyomi-space/
├── assets/          # 图片、音频、前端脚本等静态资源
├── backend/         # Express API、SQLite 初始化、路由和中间件
├── deploy/          # PM2、Nginx、部署脚本样例
├── docs/            # 补充文档
├── lib/             # Live2D / 前端运行库
├── models/          # Live2D 模型资源
├── pages/           # 页面入口
├── .env.example     # 生产环境变量模板
├── index.html       # 根入口
└── package.json     # 项目脚本与依赖
```

## 配置

生产环境必须设置：

- `NODE_ENV=production`
- `JWT_SECRET`：至少 32 字符，建议用 `openssl rand -base64 48` 生成
- `ADMIN_PASSWORD`：首次创建管理员时使用
- `CORS_ORIGINS`：线上域名，例如 `https://example.com`
- `DATA_DIR` 或 `DB_PATH`：SQLite 数据库存放路径

复制 `.env.example` 到服务器的 `/etc/tsukuyomi-space/tsukuyomi-space.env`，不要把真实 `.env` 或密码提交到仓库。

## 部署

推荐使用 PM2 运行后端，Nginx 处理静态文件并反向代理 `/api/`：

```bash
bash deploy/deploy.sh
```

完整步骤见 [docs/DEPLOY.md](docs/DEPLOY.md)。

## 安全说明

- 生产环境没有强 `JWT_SECRET` 会拒绝启动。
- 生产环境首次创建管理员时必须提供 `ADMIN_PASSWORD`。
- API 已加入基础安全响应头、CORS 白名单和内存限流。
- 数据库默认存放在 `data/` 或 `DATA_DIR`，不应提交到 Git。
- `/api/admin/upload-room` 默认关闭，只有显式设置 `ENABLE_UPLOAD_ROOM=true` 才会启用。

## License

MIT
