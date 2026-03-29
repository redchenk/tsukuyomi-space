# 🔐 月读空间 - 用户认证系统部署完成

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                     前端服务器                               │
│                  112.124.111.228:80                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Nginx + 静态页面                                     │   │
│  │  - login.html (登录页)                                │   │
│  │  - register.html (注册页)                             │   │
│  │  - hub.html (中枢大厅 - 带用户状态)                   │   │
│  │  - terminal.html (管理后台)                           │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↕ JWT Token
┌─────────────────────────────────────────────────────────────┐
│                     后端服务器                               │
│                   47.97.0.122:3000                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Node.js + Express + SQLite                           │   │
│  │  - JWT 认证                                           │   │
│  │  - bcrypt 密码加密                                    │   │
│  │  - 用户管理                                           │   │
│  │  - 文章/留言管理                                      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 数据库配置

### 数据库类型
**SQLite** (文件型数据库，无需额外安装)

### 数据库位置
```
/opt/tsukuyomi-api/tsukuyomi.db
```

### 数据表结构

#### 1. users (用户表)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 用户 UUID |
| username | TEXT | 用户名（唯一） |
| email | TEXT | 邮箱（唯一） |
| password_hash | TEXT | bcrypt 加密的密码 |
| role | TEXT | 角色：user/admin |
| avatar | TEXT | 头像 URL |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

#### 2. articles (文章表)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 自增 ID |
| title | TEXT | 标题 |
| excerpt | TEXT | 摘要 |
| content | TEXT | 正文 |
| category | TEXT | 分类 |
| tags | TEXT | 标签 (JSON) |
| author_id | TEXT | 作者 ID |
| publish_date | TEXT | 发布日期 |
| read_time | TEXT | 阅读时长 |
| view_count | INTEGER | 阅读量 |

#### 3. messages (留言表)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 自增 ID |
| author | TEXT | 留言者 |
| content | TEXT | 内容 |
| user_id | TEXT | 用户 ID |
| created_at | DATETIME | 创建时间 |

---

## 默认管理员账户

```
用户名：admin
密码：admin123
角色：admin
```

⚠️ **重要**：首次登录后请立即修改密码！

---

## API 端点

### 公开 API

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |
| GET | /api/articles | 获取文章列表 |
| GET | /api/articles/:id | 获取单篇文章 |
| GET | /api/messages | 获取留言列表 |
| GET | /api/stats | 网站统计 |

### 认证 API

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | /api/auth/register | 用户注册 |
| POST | /api/auth/login | 用户登录 |
| GET | /api/auth/me | 获取当前用户信息 |

### 需认证 API

| 方法 | 端点 | 权限 | 说明 |
|------|------|------|------|
| POST | /api/messages | 用户 | 创建留言 |

### 管理员 API

| 方法 | 端点 | 权限 | 说明 |
|------|------|------|------|
| POST | /api/articles | 管理员 | 创建文章 |
| PUT | /api/articles/:id | 管理员 | 更新文章 |
| DELETE | /api/articles/:id | 管理员 | 删除文章 |
| GET | /api/admin/users | 管理员 | 获取所有用户 |

---

## API 使用示例

### 1. 用户注册
```bash
curl -X POST http://47.97.0.122:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "email": "user@example.com",
    "password": "password123"
  }'
```

响应：
```json
{
  "success": true,
  "message": "注册成功",
  "data": {
    "user": {
      "id": "uuid-xxx",
      "username": "newuser",
      "email": "user@example.com",
      "role": "user"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 2. 用户登录
```bash
curl -X POST http://47.97.0.122:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

### 3. 创建文章（需管理员）
```bash
curl -X POST http://47.97.0.122:3000/api/articles \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "新文章",
    "excerpt": "文章摘要",
    "content": "文章内容...",
    "category": "公告",
    "tags": ["标签 1", "标签 2"]
  }'
```

### 4. 获取当前用户信息
```bash
curl http://47.97.0.122:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 前端页面

### 登录页
```
http://112.124.111.228/login.html
```
功能：
- 用户名/邮箱登录
- 密码验证
- JWT Token 存储
- 自动跳转

### 注册页
```
http://112.124.111.228/register.html
```
功能：
- 用户名、邮箱、密码注册
- 密码强度检测
- 密码确认验证
- 自动登录

### 中枢大厅（带用户状态）
```
http://112.124.111.228/hub.html
```
功能：
- 显示登录状态
- 用户名显示
- 退出登录
- 管理员专属入口

---

## 管理命令

### 后端服务管理
```bash
# 查看服务状态
ssh root@47.97.0.122 "systemctl status tsukuyomi-api"

# 重启服务
ssh root@47.97.0.122 "systemctl restart tsukuyomi-api"

# 查看日志
ssh root@47.97.0.122 "journalctl -u tsukuyomi-api -f"

# 停止服务
ssh root@47.97.0.122 "systemctl stop tsukuyomi-api"

# 启动服务
ssh root@47.97.0.122 "systemctl start tsukuyomi-api"
```

### 数据库管理
```bash
# 进入数据库（需要安装 sqlite3）
ssh root@47.97.0.122 "sqlite3 /opt/tsukuyomi-api/tsukuyomi.db"

# 查看所有用户
sqlite> SELECT id, username, email, role, created_at FROM users;

# 查看所有文章
sqlite> SELECT id, title, category, publish_date FROM articles;

# 修改管理员密码（需要生成新的 bcrypt hash）
sqlite> UPDATE users SET password_hash = 'new_hash' WHERE username = 'admin';
```

### 备份数据库
```bash
# 备份数据库文件
ssh root@47.97.0.122 "cp /opt/tsukuyomi-api/tsukuyomi.db /opt/tsukuyomi-api/tsukuyomi.db.bak"

# 下载备份
scp root@47.97.0.122:/opt/tsukuyomi-api/tsukuyomi.db ./backup.db
```

---

## JWT Token 配置

### 当前密钥
```javascript
JWT_SECRET = 'tsukuyomi_space_secret_key_2024_change_in_production'
```

⚠️ **重要**：生产环境请修改此密钥！

修改位置：
```
/opt/tsukuyomi-api/server.js (第 11 行)
```

### Token 有效期
- **7 天** (168 小时)
- 过期后需重新登录

### Token 存储
- 前端：localStorage
- 键名：`tsukuyomi_token`

---

## 安全建议

### 1. 修改默认密码
```bash
# 登录后立即修改 admin 密码
```

### 2. 修改 JWT 密钥
编辑 `/opt/tsukuyomi-api/server.js`：
```javascript
const JWT_SECRET = 'your_super_secret_key_here';
```

### 3. 启用 HTTPS
```bash
# 在前端服务器配置 SSL
ssh root@112.124.111.228 "certbot --nginx"
```

### 4. 配置防火墙
```bash
# 后端服务器仅开放必要端口
ssh root@47.97.0.122 "ufw allow 22 && ufw allow 3000 && ufw enable"
```

### 5. 定期备份
```bash
# 设置定时备份任务
crontab -e
# 每天凌晨 3 点备份
0 3 * * * cp /opt/tsukuyomi-api/tsukuyomi.db /backup/tsukuyomi-$(date +\%Y\%m\%d).db
```

---

## 故障排查

### 无法登录
1. 检查后端服务状态
2. 查看 API 日志
3. 验证用户名密码
4. 检查网络连接

### 数据库错误
```bash
# 检查数据库文件权限
ssh root@47.97.0.122 "ls -la /opt/tsukuyomi-api/tsukuyomi.db"

# 修复数据库
ssh root@47.97.0.122 "sqlite3 /opt/tsukuyomi-api/tsukuyomi.db \"PRAGMA integrity_check;\""
```

### Token 无效
- Token 已过期（7 天）
- JWT 密钥被修改
- 用户被删除

---

## 下一步开发

1. **管理后台页面** - 可视化文章/用户管理
2. **密码重置** - 邮箱验证重置密码
3. **用户资料** - 修改头像、个人信息
4. **权限系统** - 更细粒度的权限控制
5. **操作日志** - 记录所有管理操作

---

**部署完成时间**: 2024-03-29  
**版本**: v1.0 (带认证系统)  
**状态**: ✅ 运行正常
