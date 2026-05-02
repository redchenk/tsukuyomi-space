# 月读广场配置说明

## 🌙 功能概述

月读广场是月读空间的社交互动区，包含三个核心功能：

1. **月读留言墙** - 基于 Giscus 的 GitHub Discussions 留言系统
2. **常驻访客席** - 友链展示区
3. **访客统计** - 网站访问量统计

---

## 📋 Giscus 留言墙配置

### 1. 访问 Giscus 配置页面
打开 https://giscus.app/zh-CN

### 2. 配置 GitHub Repository
```
1. GitHub 仓库：redchenk/tsukuyomi-space
2. 选择 Announcement（公告）或 General（常规）分类
3. 获取 Repo ID 和 Category ID
```

### 3. 获取 Repo ID
在浏览器控制台运行：
```javascript
// 访问 https://github.com/redchenk/tsukuyomi-space/discussions
// 然后运行：
console.log(document.querySelector('[data-name="discussion-repo-id"]')?.value);
```

### 4. 修改 Vue Plaza 配置
编辑 `src/frontend/pages/PlazaPage.vue` 中对应的广场配置：

```javascript
script.setAttribute('data-repo', 'redchenk/tsukuyomi-space');
script.setAttribute('data-repo-id', '你的 Repo ID');  // 替换这里
script.setAttribute('data-category', 'General');
script.setAttribute('data-category-id', '你的 Category ID');  // 替换这里
```

### 5. 启用 GitHub Discussions
确保你的 GitHub 仓库已启用 Discussions 功能：
- 进入仓库 Settings
- 找到 Features 区域
- 勾选 ✓ Discussions

---

## 🔗 友链配置

### 方式一：通过管理后台添加
1. 登录管理后台：`http://yourip:3280/terminal`
2. 进入「友链管理」
3. 添加友链信息

### 方式二：修改代码
编辑 `src/frontend/pages/PlazaPage.vue` 中的 `friends` 数组：

```javascript
const defaultFriends = [
    { 
        name: '友链名称', 
        desc: '简介描述', 
        url: 'https://example.com', 
        avatar: '🌙'  // 或使用 emoji 或图片 URL
    },
    // 添加更多...
];
```

---

## 📊 访客统计

访客统计自动从后端 API 获取数据：
- **累计访客**：网站总访问量
- **今日访客**：今日访问量
- **留言数量**：留言总数

### API 端点
- `/api/stats` - 获取统计数据
- `/api/stats/view` - 记录访问（POST）

---

## 🎨 视觉定制

### 修改主题色
编辑 `assets/css/vue/pages/plaza.css` 的相关 CSS 变量：

```css
:root {
    --sakura-pink: #ffb7c5;      /* 樱花粉 */
    --deep-pink: #ff6b9d;        /* 深粉色 */
    --dark-bg: #1a1025;          /* 深色背景 */
    --night-blue: #0f1724;       /* 夜空蓝 */
}
```

---

## 🚀 部署检查清单

- [ ] 运行 `npm run build:web` 并部署 Vue 前端产物
- [ ] 配置 Giscus Repo ID 和 Category ID
- [ ] 启用 GitHub Discussions
- [ ] 测试留言墙是否正常显示
- [ ] 配置友链（可选）
- [ ] 测试访客统计

---

## 🔧 故障排查

### 留言墙不显示
1. 检查浏览器控制台是否有 CORS 错误
2. 确认 Giscus Repo ID 和 Category ID 正确
3. 确保 GitHub Discussions 已启用

### 统计数据不显示
1. 检查后端 API：`curl http://localhost:3000/api/stats`
2. 确保 PM2 进程正常运行：`pm2 list`

---

## 📝 更新日志

### v1.0.0 (2026-04-20)
- ✅ 创建月读广场页面
- ✅ 集成 Giscus 留言墙
- ✅ 友链展示区
- ✅ 访客统计显示
