# 月读空间 - API 接口文档

## 基础信息

**基础 URL:** `http://localhost:3000/api`（开发环境）

**认证方式:** JWT Bearer Token

**请求头:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

---

## 目录

1. [公开接口](#公开接口)
2. [用户认证](#用户认证)
3. [管理员认证](#管理员认证)
4. [文章管理](#文章管理)
5. [留言管理](#留言管理)
6. [友链管理](#友链管理)
7. [用户管理](#用户管理)
8. [系统配置](#系统配置)
9. [统计数据](#统计数据)
10. [LLM 聊天](#llm 聊天)

---

## 公开接口

### 健康检查

**请求:**
```http
GET /api/health
```

**响应:**
```json
{
    "status": "ok",
    "message": "Tsukuyomi Space API is running",
    "timestamp": "2026-04-01T10:00:00.000Z"
}
```

### 获取文章列表

**请求:**
```http
GET /api/articles?category=公告&page=1&limit=10
```

**参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| category | string | 否 | 分类筛选 |
| page | number | 否 | 页码，默认 1 |
| limit | number | 否 | 每页数量，默认 100 |

**响应:**
```json
{
    "success": true,
    "data": [
        {
            "id": 1,
            "title": "欢迎来到月读空间",
            "excerpt": "跨越八千年时光，与你相遇的虚拟场域",
            "content": "...",
            "category": "公告",
            "tags": ["公告", "欢迎"],
            "author_id": "admin-001",
            "author_username": "admin",
            "publish_date": "2024-01-01",
            "read_time": "3 min",
            "view_count": 128,
            "cover_image": null,
            "created_at": "2024-01-01T00:00:00.000Z"
        }
    ],
    "pagination": {
        "page": 1,
        "limit": 10,
        "total": 50,
        "totalPages": 5
    }
}
```

### 获取单篇文章

**请求:**
```http
GET /api/articles/:id
```

**响应:**
```json
{
    "success": true,
    "data": {
        "id": 1,
        "title": "欢迎来到月读空间",
        "excerpt": "跨越八千年时光，与你相遇的虚拟场域",
        "content": "...",
        "category": "公告",
        "tags": ["公告", "欢迎"],
        "author_id": "admin-001",
        "publish_date": "2024-01-01",
        "read_time": "3 min",
        "view_count": 129,
        "cover_image": null
    }
}
```

### 获取留言列表

**请求:**
```http
GET /api/messages
```

**响应:**
```json
{
    "success": true,
    "data": [
        {
            "id": 1,
            "author": "张三",
            "content": "很喜欢这个网站！",
            "user_id": "user-uuid-123",
            "created_at": "2024-01-01T12:00:00.000Z"
        }
    ]
}
```

---

## 用户认证

### 用户注册

**请求:**
```http
POST /api/auth/register
Content-Type: application/json

{
    "username": "newuser",
    "email": "user@example.com",
    "password": "password123"
}
```

**参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名（唯一） |
| email | string | 是 | 邮箱（唯一） |
| password | string | 是 | 密码（至少 6 位） |

**响应:**
```json
{
    "success": true,
    "message": "注册成功",
    "data": {
        "user": {
            "id": "fc350ae2-6aae-4939-aa28-f2ed24960c89",
            "username": "newuser",
            "email": "user@example.com",
            "role": "user"
        },
        "token": "eyJhbGciOiJIUzI1NiIs..."
    }
}
```

### 用户登录

**请求:**
```http
POST /api/auth/login
Content-Type: application/json

{
    "username": "newuser",
    "password": "password123"
}
```

**响应:**
```json
{
    "success": true,
    "message": "登录成功",
    "data": {
        "user": {
            "id": "fc350ae2-6aae-4939-aa28-f2ed24960c89",
            "username": "newuser",
            "email": "user@example.com",
            "role": "user",
            "avatar": ""
        },
        "token": "eyJhbGciOiJIUzI1NiIs..."
    }
}
```

### 获取当前用户信息

**请求:**
```http
GET /api/auth/me
Authorization: Bearer <token>
```

**响应:**
```json
{
    "success": true,
    "data": {
        "id": "fc350ae2-6aae-4939-aa28-f2ed24960c89",
        "username": "newuser",
        "email": "user@example.com",
        "role": "user",
        "avatar": "",
        "created_at": "2024-01-01T00:00:00.000Z"
    }
}
```

---

## 管理员认证

### 管理员登录

**请求:**
```http
POST /api/admin/login
Content-Type: application/json

{
    "username": "admin",
    "password": "admin123"
}
```

**参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 管理员用户名 |
| password | string | 是 | 管理员密码 |

**响应:**
```json
{
    "success": true,
    "message": "登录成功",
    "data": {
        "token": "eyJhbGciOiJIUzI1NiIs...",
        "admin": {
            "id": 1,
            "username": "admin",
            "role": "super_admin"
        }
    }
}
```

---

## 文章管理

### 获取文章列表（管理）

**请求:**
```http
GET /api/admin/articles
Authorization: Bearer <token>
```

**响应:**
```json
{
    "success": true,
    "data": [
        {
            "id": 1,
            "title": "欢迎来到月读空间",
            "category": "公告",
            "view_count": 128,
            "created_at": "2024-01-01T00:00:00.000Z"
        }
    ]
}
```

### 获取单篇文章（管理）

**请求:**
```http
GET /api/admin/articles/:id
Authorization: Bearer <token>
```

### 创建文章

**请求:**
```http
POST /api/articles
Authorization: Bearer <token>
Content-Type: application/json

{
    "title": "新文章标题",
    "excerpt": "文章摘要",
    "content": "文章内容...",
    "category": "技术",
    "tags": ["技术", "分享"],
    "read_time": "5 min",
    "cover_image": "data:image/jpeg;base64,..."
}
```

**参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 是 | 文章标题 |
| excerpt | string | 否 | 文章摘要 |
| content | string | 否 | 文章内容 |
| category | string | 否 | 分类（公告/传说/技术/其他） |
| tags | array | 否 | 标签数组 |
| read_time | string | 否 | 阅读时间 |
| cover_image | string | 否 | 封面图片 Base64 |

**注意:** 
- `公告` 分类仅管理员可发布
- 普通用户发布文章会自动归类为 `其他`

**响应:**
```json
{
    "success": true,
    "message": "投稿が完了しました",
    "data": {
        "id": 4,
        "title": "新文章标题",
        "excerpt": "文章摘要",
        "content": "文章内容...",
        "category": "技术",
        "tags": "[]",
        "author_id": "admin-001",
        "publish_date": "2026-04-01",
        "read_time": "5 min",
        "view_count": 0,
        "cover_image": "data:image/jpeg;base64,...",
        "created_at": "2026-04-01 10:00:00",
        "updated_at": "2026-04-01 10:00:00"
    }
}
```

### 更新文章

**请求:**
```http
PUT /api/articles/:id
Authorization: Bearer <token>
Content-Type: application/json

{
    "title": "更新后的标题",
    "excerpt": "更新后的摘要",
    "content": "更新后的内容...",
    "category": "技术",
    "tags": ["技术", "更新"],
    "read_time": "8 min",
    "cover_image": "data:image/jpeg;base64,..."
}
```

**响应:**
```json
{
    "success": true,
    "message": "文章更新成功",
    "data": {
        "id": 1,
        "title": "更新后的标题",
        "excerpt": "更新后的摘要",
        "content": "更新后的内容...",
        "category": "技术",
        "cover_image": "data:image/jpeg;base64,..."
    }
}
```

### 删除文章

**请求:**
```http
DELETE /api/admin/articles/:id
Authorization: Bearer <token>
```

**响应:**
```json
{
    "success": true,
    "message": "文章已删除"
}
```

---

## 留言管理

### 获取留言列表（管理）

**请求:**
```http
GET /api/admin/messages
Authorization: Bearer <token>
```

**响应:**
```json
{
    "success": true,
    "data": [
        {
            "id": 1,
            "username": "张三",
            "content": "留言内容",
            "status": "pending",
            "created_at": "2024-01-01T12:00:00.000Z"
        }
    ]
}
```

### 通过留言

**请求:**
```http
POST /api/admin/messages/:id/approve
Authorization: Bearer <token>
```

**响应:**
```json
{
    "success": true,
    "message": "留言已通过"
}
```

### 删除留言

**请求:**
```http
DELETE /api/admin/messages/:id
Authorization: Bearer <token>
```

**响应:**
```json
{
    "success": true,
    "message": "留言已删除"
}
```

---

## 友链管理

### 获取友链列表

**请求:**
```http
GET /api/admin/links
Authorization: Bearer <token>
```

**响应:**
```json
{
    "success": true,
    "data": [
        {
            "id": 1,
            "name": "GitHub",
            "url": "https://github.com",
            "status": "active",
            "created_at": "2024-01-01T00:00:00.000Z"
        }
    ]
}
```

### 添加友链

**请求:**
```http
POST /api/admin/links
Authorization: Bearer <token>
Content-Type: application/json

{
    "name": "GitHub",
    "url": "https://github.com"
}
```

**响应:**
```json
{
    "success": true,
    "message": "友链已添加"
}
```

### 删除友链

**请求:**
```http
DELETE /api/admin/links/:id
Authorization: Bearer <token>
```

**响应:**
```json
{
    "success": true,
    "message": "友链已删除"
}
```

---

## 用户管理

### 获取用户列表

**请求:**
```http
GET /api/admin/users
Authorization: Bearer <token>
```

**响应:**
```json
{
    "success": true,
    "data": [
        {
            "id": "admin-001",
            "username": "admin",
            "email": "admin@tsukuyomi.space",
            "role": "admin",
            "created_at": "2024-01-01T00:00:00.000Z"
        },
        {
            "id": "fc350ae2-6aae-4939-aa28-f2ed24960c89",
            "username": "testuser",
            "email": "test@example.com",
            "role": "user",
            "created_at": "2026-04-01T10:00:00.000Z"
        }
    ]
}
```

---

## 系统配置

### 获取系统配置

**请求:**
```http
GET /api/admin/settings
Authorization: Bearer <token>
```

**响应:**
```json
{
    "success": true,
    "data": {
        "siteTitle": "月读空间",
        "siteAnnouncement": "欢迎访问月读空间",
        "sakuraEffect": true,
        "scanlineEffect": true
    }
}
```

### 保存系统配置

**请求:**
```http
POST /api/admin/settings
Authorization: Bearer <token>
Content-Type: application/json

{
    "siteTitle": "月读空间",
    "siteAnnouncement": "欢迎访问月读空间",
    "sakuraEffect": true,
    "scanlineEffect": true
}
```

**响应:**
```json
{
    "success": true,
    "message": "配置已保存"
}
```

---

## 统计数据

### 获取系统统计

**请求:**
```http
GET /api/admin/stats
Authorization: Bearer <token>
```

**响应:**
```json
{
    "success": true,
    "data": {
        "articles": 15,
        "pendingMessages": 3,
        "todayViews": 128,
        "totalViews": 5680
    }
}
```

### 获取网站统计（公开）

**请求:**
```http
GET /api/stats
```

**响应:**
```json
{
    "success": true,
    "data": {
        "articles": 15,
        "users": 5,
        "messages": 20,
        "uptime": 12345.67
    }
}
```

---

## LLM 聊天

### 发送消息

**请求:**
```http
POST /api/chat
Content-Type: application/json

{
    "message": "你好",
    "conversation": [
        {"role": "user", "content": "你好"},
        {"role": "assistant", "content": "你好呀！"}
    ],
    "apiKey": "sk-xxx",
    "apiUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    "model": "qwen-turbo"
}
```

**参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message | string | 是 | 用户消息 |
| conversation | array | 否 | 对话历史 |
| apiKey | string | 否 | LLM API Key |
| apiUrl | string | 否 | LLM API 端点 |
| model | string | 否 | 模型名称 |

**响应:**
```json
{
    "success": true,
    "data": {
        "reply": "你好呀！我是月读空间的虚拟助手～",
        "model": "qwen-turbo"
    }
}
```

**注意:**
- 未配置 `apiKey` 时返回预设回复
- 支持阿里云百炼、OpenAI 等兼容 API

---

## 错误响应

### 通用错误格式

```json
{
    "success": false,
    "message": "错误描述"
}
```

### 常见错误码

| HTTP 状态码 | 说明 |
|------------|------|
| 400 | 请求参数错误 |
| 401 | 未授权（未提供 Token 或 Token 无效） |
| 403 | 禁止访问（权限不足） |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

---

## 默认管理员账号

```
用户名：admin
密码：admin123
```

⚠️ **重要**: 首次登录后请修改默认密码！

---

**文档版本:** v2.0.0
**最后更新:** 2026-04-01
**技术支持:** redchenk
