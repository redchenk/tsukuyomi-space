# 🌙 月読空間 - Tsukuyomi Space

> 夢と希望が交わる場所  
> Welcome to the space where dreams and hopes meet

[![License: MIT](https://img.shields.io/badge/License-MIT-pink.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/Version-2.1.0-blue.svg)](https://github.com/redchenk/tsukuyomi-space)

**月読空間** 是一个灵感来自动画《超かぐや姫！》的沉浸式个人网站，采用前后端分离架构，包含用户认证、内容管理等完整功能。

---

## 📑 目录

- [✨ 功能特性](#-功能特性)
- [🎨 设计灵感](#-设计灵感)
- [🏗️ 技术架构](#️-技术架构)
- [🚀 快速开始](#-快速开始)
- [📦 部署指南](#-部署指南)
- [📁 项目结构](#-项目结构)
- [🔐 认证系统](#-认证系统)
- [📡 API 文档](#-api-文档)
- [⚙️ 配置说明](#️-配置说明)
- [🔒 安全建议](#-安全建议)
- [📝 更新日志](#-更新日志)
- [📄 许可证](#-许可证)

---

## ✨ 功能特性

### 前端特性
- 🎬 **动态视频背景** - 接入页使用官方 MV 作为背景
- 🌸 **樱花飘落效果** - 基于物理模拟的真实樱花飘落动画
- 📱 **响应式设计** - 完美适配 PC 和移动端
- 🎨 **原作风格** - 贴合《超かぐや姫！》的视觉设计
- ⚡ **顺滑动画** - 60fps 流畅过渡效果

### 页面列表
| 页面 | 路径 | 描述 |
|------|------|------|
| 接入页 | `/` | 自动跳转到中枢大厅 |
| 中枢大厅 | `/pages/hub.html` | 极简列表式导航 |
| 登录页 | `/pages/login.html` | 日文界面登录 |
| 注册页 | `/pages/register.html` | 用户注册 |
| 主舞台 | `/pages/stage.html` | 博客/文章区 |
| 私人居所 | `/pages/room.html` | 个人主页/Live2D |
| 数据终端 | `/pages/terminal.html` | 管理后台 |

### 后端特性
- 🔐 **JWT 认证** - 安全的用户认证系统
- 👥 **用户管理** - 注册、登录、权限控制
- 📝 **内容管理** - 文章、留言 CRUD
- 📊 **数据统计** - 访问量统计
- 🛡️ **密码加密** - bcrypt 加密存储

---

## 🎨 设计灵感

本项目设计灵感来源于 Netflix 动画电影《超かぐや姫！》：

- **配色方案**: 樱花粉 (#ffb7c5) + 深紫 (#1a1025) + 月光白 (#f8f9fa)
- **视觉元素**: 樱花、月亮、竹子、虚拟空间
- **排版风格**: 日文 Noto Sans JP 字体
- **动画效果**: 流畅自然的过渡动画

---

## 🏗️ 技术架构

### 前端技术栈
```
├── HTML5          - 语义化结构
├── CSS3           - 现代样式与动画
├── JavaScript     - 原生 ES6+
├── Google Fonts   - Noto Sans JP 字体
└── Live2D         - 虚拟角色
```

### 后端技术栈
```
├── Node.js 20.x   - 运行环境
├── Express 4.x    - Web 框架
├── SQLite3        - 数据库
├── JWT            - 认证令牌
├── bcryptjs       - 密码加密
└── CORS           - 跨域支持
```

### 架构图
```
┌─────────────────────────────────────────────────────────┐
│                    前端服务器                            │
│                 xxx.xxx.xxx.xxx:80                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Nginx + 静态页面                                 │   │
│  │  - /pages/*.html                                  │   │
│  │  - /assets/images/*                               │   │
│  │  - /lib/*                                         │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          ↕ HTTP API (CORS)
┌─────────────────────────────────────────────────────────┐
│                    后端服务器                            │
│                  xxx.xxx.xxx.xxx:3000                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Node.js + Express API Server                    │   │
│  │  - /api/auth/* (认证)                             │   │
│  │  - /api/articles/* (文章)                         │   │
│  │  - /api/messages/* (留言)                         │   │
│  │  - /api/admin/* (管理)                            │   │
│  │  - /api/stats (统计)                              │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 快速开始

### 环境要求
- Node.js >= 20.x
- npm >= 10.x
- Git

### 1. 克隆项目
```bash
git clone https://github.com/redchenk/tsukuyomi-space.git
cd tsukuyomi-space
```

### 2. 安装依赖
```bash
npm install
```

### 3. 启动服务
```bash
npm start
# 服务将运行在 http://localhost:3000
```

### 4. 访问网站
- 首页：http://localhost:3000/
- 中枢大厅：http://localhost:3000/pages/hub.html
- 管理后台：http://localhost:3000/pages/terminal.html
- API 健康检查：http://localhost:3000/api/health

---

## 📦 部署指南

### 前端部署 (Nginx)

#### 1. 安装 Nginx
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx
```

#### 2. 配置 Nginx
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    root /var/www/tsukuyomi-space;
    index index.html;
    
    location / {
        try_files $uri $uri/ =404;
    }
    
    # 静态资源优化
    location ~* \.(jpg|jpeg|png|gif|webp|svg|ico)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
    
    # 视频文件优化
    location ~* \.(mp4|webm)$ {
        add_header Accept-Ranges bytes;
        add_header Content-Type video/mp4;
    }
}
```

#### 3. 上传文件
```bash
sudo scp -r ./* root@your-server:/var/www/tsukuyomi-space/
```

#### 4. 启动服务
```bash
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 后端部署 (PM2)

#### 1. 安装 PM2
```bash
npm install -g pm2
```

#### 2. 启动服务
```bash
cd tsukuyomi-space
pm2 start backend/server.js --name tsukuyomi-api
pm2 save
pm2 startup
```

#### 3. 配置防火墙
```bash
# Ubuntu
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 3000

# CentOS
sudo firewall-cmd --permanent --add-port=22/tcp
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

### Docker 部署（可选）

#### docker-compose.yml
```yaml
version: '3.8'

services:
  frontend:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./:/usr/share/nginx/html
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
  
  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    volumes:
      - ./backend:/app
```

---

## 📁 项目结构

```
tsukuyomi-space/
├── assets/                      # 资源文件
│   └── images/                  # 图片资源
│       ├── tsukuyomi-bg.png     # 月读背景图
│       └── room-bg.png          # 房间背景图
│
├── backend/                     # 后端服务
│   ├── middleware/              # 中间件
│   │   └── auth.js              # 统一认证中间件
│   ├── server.js                # API 服务器
│   └── admin-routes.js          # 管理后台路由
│
├── pages/                       # HTML 页面目录
│   ├── index.html               # 首页（重定向）
│   ├── access.html              # 访问页面
│   ├── hub.html                 # 中枢大厅
│   ├── stage.html               # 主舞台
│   ├── room.html                # 私人居所
│   ├── login.html               # 登录页
│   ├── register.html            # 注册页
│   ├── editor.html              # 文章编辑器
│   ├── terminal.html            # 管理后台
│   ├── i18n.js                  # 国际化
│   └── i18n_final.js            # 国际化最终版
│
├── lib/                         # 第三方库
│   ├── cubism-core.min.js       # Live2D Cubism 核心
│   └── pixi-live2d-display-*.min.js
│
├── models/                      # Live2D 模型（需手动添加）
│   └── 【雪熊企划】八千代辉夜姬/    # 解压压缩包到此处
│       ├── 八千代辉夜姬.model3.json
│       ├── 八千代辉夜姬.moc3
│       ├── *.exp3.json          # 动作配置
│       └── texture_*.png        # 纹理贴图
│
├── docs/                        # 文档目录
│
├── index.html                   # 根目录首页（重定向）
├── package.json                 # 项目配置
├── README.md                    # 项目说明
├── LICENSE                      # MIT 许可证
└── .gitignore                   # Git 忽略配置
```

---

## 🔐 认证系统

### JWT 令牌说明

本系统使用 JWT (JSON Web Token) 进行身份验证。

```http
Authorization: Bearer <your_jwt_token>
```

### Token 有效期

| 用户类型 | 有效期 |
|---------|--------|
| 普通用户 | 7 天 |
| 管理员 | 24 小时 |

### 用户角色

| 角色 | 说明 | 权限 |
|------|------|------|
| `user` | 普通用户 | 创建留言、创建文章（非公告类） |
| `admin` | 管理员 | 所有权限，包括审核、删除、系统配置 |
| `super_admin` | 超级管理员 | 最高权限，可管理其他管理员 |

### 默认管理员账号

- **用户名**: `admin`
- **密码**: `admin123`
- **管理后台**: `/pages/terminal.html`

⚠️ **首次登录后请立即修改密码！**

---

## 📡 API 文档

### 基础地址
- 开发环境：`http://localhost:3000/api`
- 生产环境：`https://112.124.111.228/api`

### 公开 API

#### 健康检查
```http
GET /api/health
```

#### 获取文章列表
```http
GET /api/articles?category={category}&page={page}&limit={limit}
```

#### 获取单篇文章
```http
GET /api/articles/:id
```

#### 获取留言列表
```http
GET /api/messages
```

### 用户认证 API

#### 用户注册
```http
POST /api/auth/register
Content-Type: application/json

{
    "username": "newuser",
    "email": "user@example.com",
    "password": "password123"
}
```

#### 用户登录
```http
POST /api/auth/login
Content-Type: application/json

{
    "username": "admin",
    "password": "admin123"
}
```

#### 获取当前用户信息
```http
GET /api/auth/me
Authorization: Bearer <token>
```

### 文章管理 API

#### 创建文章（需认证）
```http
POST /api/articles
Authorization: Bearer <token>
Content-Type: application/json

{
    "title": "文章标题",
    "content": "文章内容",
    "category": "技术",
    "tags": ["技术", "分享"]
}
```

#### 更新文章（需管理员）
```http
PUT /api/articles/:id
Authorization: Bearer <token>
```

#### 删除文章（需管理员）
```http
DELETE /api/articles/:id
Authorization: Bearer <token>
```

### 管理后台 API

#### 管理员登录
```http
POST /api/admin/login
Content-Type: application/json

{
    "username": "admin",
    "password": "admin123"
}
```

#### 获取系统统计
```http
GET /api/admin/stats
Authorization: Bearer <token>
```

#### 获取友链列表
```http
GET /api/admin/links
Authorization: Bearer <token>
```

#### 保存系统配置
```http
POST /api/admin/settings
Authorization: Bearer <token>
Content-Type: application/json

{
    "siteTitle": "月读空间",
    "sakuraEffect": true,
    "scanlineEffect": true
}
```

### 错误响应

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未认证（缺少 Token） |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

---

## ⚙️ 配置说明

### 后端配置

编辑 `backend/server.js`：

```javascript
// JWT 密钥（生产环境请修改！）
const JWT_SECRET = 'your_super_secret_key_here';

// 端口
const PORT = 3000;

// CORS 配置
app.use(cors({
    origin: ['http://localhost:8080', 'https://your-domain.com']
}));
```

### 环境变量（可选）

创建 `.env` 文件：

```env
# LLM API 配置（用于聊天功能）
LLM_API_KEY=your_api_key
LLM_API_URL=https://api.example.com/v1/chat/completions

# 管理员 JWT 密钥（可选）
ADMIN_JWT_SECRET=your_admin_secret
```

### 前端配置

在所有 HTML 文件中修改 API 地址：

```javascript
// 开发环境
const API_BASE = 'http://localhost:3000/api';

// 生产环境
const API_BASE = 'https://api.your-domain.com/api';
```

---

## 🔒 安全建议

### 1. 修改默认密码
```bash
# 首次登录后立即修改 admin 密码
# 默认：admin / admin123
```

### 2. 修改 JWT 密钥
```javascript
// backend/server.js 或 backend/middleware/auth.js
const JWT_SECRET = 'your_unique_secret_key_2024';
```

### 3. 启用 HTTPS
```bash
# 使用 Let's Encrypt
sudo certbot --nginx -d your-domain.com
```

### 4. 配置防火墙
```bash
# 仅开放必要端口
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw deny 3000   # API（仅内网访问）
sudo ufw enable
```

### 5. 数据库备份
```bash
# 定期备份 SQLite 数据库
0 3 * * * cp /var/www/tsukuyomi-space/backend/tsukuyomi.db /backup/
```

---

## 📝 更新日志

### v2.1.1 (2026-04-01)
- ✅ Live2D 模型配置：创建 `models/` 目录
- ✅ 房间页面：更新模型路径为 `../models/`
- ✅ 服务器：配置 `/models` 静态文件服务
- ⚠️ 模型文件需手动添加（见项目结构说明）

### v2.1.0 (2026-04-01)
- ✅ 项目结构优化：创建 `pages/` 和 `assets/images/` 目录
- ✅ 鉴权系统统一：创建 `backend/middleware/auth.js`
- ✅ 背景图资源管理：集中存放于 `assets/images/`
- ✅ 文档整合：所有内容统一到 README.md

### v2.0.0 (2026-03-31)
- ✅ 初始版本发布
- ✅ 管理后台界面
- ✅ 基础 CRUD 功能
- ✅ JWT 认证系统

### 计划中
- [ ] 文章详情页
- [ ] 评论系统
- [ ] 用户个人资料
- [ ] PWA 支持

---

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

---

## 🙏 致谢

- **《超かぐや姫！》** - 设计灵感来源
- **Netflix** - 动画制作
- **スタジオコロリド** - 动画制作公司

---

## 📬 联系方式

- **GitHub**: [@redchenk](https://github.com/redchenk)
- **项目地址**: https://github.com/redchenk/tsukuyomi-space
- **在线演示**: https://112.124.111.228

---

<div align="center">

**🌙 夢と希望が交わる場所**

Made with ❤️ by redchenk

</div>
