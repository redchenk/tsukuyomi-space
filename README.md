# Tsukuyomi Space

月读空间是一个带 Live2D 房间、文章系统、留言与后台管理的个人网站。项目使用原生 HTML/CSS/JavaScript 构建前端，Node.js + Express + SQLite 提供 API 服务。

## 功能

- 文章浏览、详情页与后台编辑
- 用户注册、登录与 JWT 鉴权
- 留言管理与审核
- 访问统计与后台数据面板
- Live2D 私人居所页面
- 可选 LLM/TTS 配置，用于房间聊天体验

## 技术栈

- 前端：HTML5、CSS3、原生 JavaScript、Live2D Cubism
- 后端：Node.js、Express、better-sqlite3
- 认证：JWT、bcryptjs
- 部署：静态文件 + Express API，可配合 PM2/Nginx

## 快速开始

```bash
git clone https://github.com/redchenk/tsukuyomi-space.git
cd tsukuyomi-space
npm install
npm start
```

默认服务地址：

- 网站首页：`http://localhost:3000/`
- 中枢大厅：`http://localhost:3000/pages/hub`
- 私人居所：`http://localhost:3000/pages/room`
- 数据终端：`http://localhost:3000/pages/terminal`
- 健康检查：`http://localhost:3000/api/health`

## 项目结构

```text
tsukuyomi-space/
├── assets/          # 图片、音频、前端脚本等静态资源
├── backend/         # Express API、SQLite 数据库初始化与路由
├── docs/            # 补充文档
├── lib/             # Live2D / 前端运行库
├── models/          # Live2D 模型资源
├── pages/           # 页面入口
├── index.html       # 根入口
└── package.json     # 项目脚本与依赖
```

## 主要页面

| 页面 | 路径 | 用途 |
| --- | --- | --- |
| 接入页 | `/` | 站点入口 |
| 中枢大厅 | `/pages/hub` | 主导航 |
| 主舞台 | `/pages/stage` | 文章列表 |
| KASSEN 竞技场 | `/pages/arena` | 3v3 涨粉对抗游戏 |
| 文章详情 | `/pages/article` | 阅读文章 |
| 编辑器 | `/pages/editor` | 编辑文章 |
| 私人居所 | `/pages/room` | Live2D 房间与聊天 |
| 现实锚点 | `/pages/reality` | 联系方式、隐私声明与站点边界 |
| 数据终端 | `/pages/terminal` | 后台管理 |
| 用户中心 | `/pages/user-center` | 用户资料 |

## API 概览

- `POST /api/auth/register`：注册
- `POST /api/auth/login`：登录
- `GET /api/articles`：文章列表
- `GET /api/articles/:id`：文章详情
- `GET /api/messages`：留言列表
- `POST /api/messages`：创建留言
- `POST /api/stats/view`：记录访问
- `GET /api/admin/*`：后台管理接口，需要管理员令牌

## 部署提示

生产环境可使用 PM2 启动后端：

```bash
npm install --production
pm2 start backend/server.js --name tsukuyomi-api
pm2 save
```

如果使用 Nginx，建议将静态资源交给 Nginx，`/api/` 请求反向代理到 Express 服务。

## 维护备注

- SQLite 数据库文件不应提交到仓库。
- API 密钥、GitHub token、TTS/LLM key 等敏感信息不要写入代码或 README。
- Live2D 模型资源体积较大，更新前注意检查单文件大小和 Git LFS 配置。

## License

MIT
