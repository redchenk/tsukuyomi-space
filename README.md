# 🌙 月読空間 - Tsukuyomi Space

> 夢と希望が交わる場所  
> Welcome to the space where dreams and hopes meet

[![License: MIT](https://img.shields.io/badge/License-MIT-pink.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![Vue.js](https://img.shields.io/badge/Frontend-HTML/CSS/JS-green.svg)](https://vuejs.org/)

**月読空間** 是一个灵感来自动画《超かぐや姫！》的沉浸式个人网站，采用前后端分离架构，包含用户认证、内容管理等完整功能。

![Preview](./docs/preview.png)

---

## 📑 目录

- [✨ 功能特性](#-功能特性)
- [🎨 设计灵感](#-设计灵感)
- [🏗️ 技术架构](#️-技术架构)
- [🚀 快速开始](#-快速开始)
- [📦 部署指南](#-部署指南)
- [📁 项目结构](#-项目结构)
- [⚙️ 配置说明](#️-配置说明)
- [🔐 安全建议](#-安全建议)
- [📝 开发日志](#-开发日志)
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
| 接入页 | `/` | 视频背景 + 樱花飘落 |
| 中枢大厅 | `/hub.html` | 极简列表式导航 |
| 登录页 | `/login.html` | 日文界面登录 |
| 注册页 | `/register.html` | 用户注册 |
| 主舞台 | `/stage.html` | 博客/文章区 |
| 竞技场 | `/arena.html` | 项目展示区 |
| 私人居所 | `/room.html` | 个人主页 |
| 月读广场 | `/plaza.html` | 留言板 |
| 数据终端 | `/terminal.html` | 管理后台 |
| 现实锚点 | `/reality.html` | 联系方式 |

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
└── Video Background - MP4 视频背景
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

### 部署架构
```
┌─────────────────────────────────────────────────────────┐
│                    前端服务器                            │
│                 xxx.xxx.xxx.xxx:80                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Nginx + 静态页面                                 │   │
│  │  - access.html (视频背景)                         │   │
│  │  - hub.html (中枢大厅)                            │   │
│  │  - login.html / register.html                     │   │
│  │  - 其他场景页面...                                │   │
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

### 2. 安装后端依赖
```bash
cd backend
npm install
```

### 3. 启动后端服务
```bash
npm start
# 服务将运行在 http://localhost:3000
```

### 4. 配置前端
编辑前端页面的 API 地址：
```javascript
// 在所有 HTML 文件中修改
const API_BASE = 'http://localhost:3000/api';
```

### 5. 启动前端
使用任意静态服务器：
```bash
# 使用 Node.js http-server
npx http-server -p 8080

# 或使用 Python
python3 -m http.server 8080
```

访问 `http://localhost:8080` 即可看到网站。

---

## 📦 部署指南

### 前端服务器 (Nginx)

#### 1. 安装 Nginx
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx

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

### 后端服务器 (PM2)

#### 1. 安装 PM2
```bash
npm install -g pm2
```

#### 2. 启动服务
```bash
cd backend
pm2 start server.js --name tsukuyomi-api
pm2 save
pm2 startup
```

#### 3. 配置防火墙
```bash
# Ubuntu
sudo ufw allow 3000

# CentOS
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
      - ./frontend:/usr/share/nginx/html
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
  
  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    volumes:
      - ./backend/data:/app/data
```

---

## 📁 项目结构

```
tsukuyomi-space/
├── frontend/                    # 前端文件
│   ├── index.html              # 接入页（重定向）
│   ├── access.html             # 接入页（视频背景）
│   ├── hub.html                # 中枢大厅
│   ├── login.html              # 登录页
│   ├── register.html           # 注册页
│   ├── stage.html              # 主舞台（博客）
│   ├── arena.html              # 竞技场（项目）
│   ├── room.html               # 私人居所
│   ├── plaza.html              # 月读广场
│   ├── terminal.html           # 数据终端
│   ├── reality.html            # 现实锚点
│   └── background.mp4          # 视频背景文件
│
├── backend/                     # 后端服务
│   ├── server.js               # API 服务器
│   ├── package.json            # 依赖配置
│   ├── tsukuyomi.db            # SQLite 数据库
│   └── data/                   # 数据目录
│
├── docs/                        # 文档
│   ├── preview.png             # 预览图
│   └── deployment.md           # 部署文档
│
├── .gitignore                  # Git 忽略文件
├── README.md                   # 项目说明
└── DEPLOYMENT.md               # 详细部署指南
```

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

### 前端配置

在所有 HTML 文件中修改 API 地址：

```javascript
// 开发环境
const API_BASE = 'http://localhost:3000/api';

// 生产环境
const API_BASE = 'https://api.your-domain.com/api';
```

---

## 🔐 安全建议

### 1. 修改默认密码
```bash
# 首次登录后立即修改 admin 密码
# 默认：admin / admin123
```

### 2. 修改 JWT 密钥
```javascript
// backend/server.js 第 11 行
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
sudo ufw allow 3000  # API（仅内网访问）
sudo ufw enable
```

### 5. 数据库备份
```bash
# 定期备份 SQLite 数据库
0 3 * * * cp /opt/tsukuyomi-api/tsukuyomi.db /backup/tsukuyomi-$(date +\%Y\%m\%d).db
```

---

## 📝 开发日志

### v1.0.0 (2024-03-29)
- ✅ 初始版本发布
- ✅ 前后端分离架构
- ✅ 用户认证系统
- ✅ 视频背景支持
- ✅ 樱花飘落效果
- ✅ 日文界面

### 计划中
- [ ] 文章详情页
- [ ] 管理后台可视化
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

---

<div align="center">

**🌙 夢と希望が交わる場所**

Made with ❤️ by redchenk

</div>
