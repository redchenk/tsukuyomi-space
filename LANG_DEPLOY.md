# 🌐 语言切换功能部署指南

## ✅ 已完成的工作

### 1. 创建了语言配置文件
- **文件**: `i18n.js`
- **位置**: `/home/node/.openclaw/workspace/moon-reader-space/i18n.js`
- **大小**: ~10KB
- **内容**: 中文和日文完整翻译

### 2. 修改了页面
- ✅ `editor.html` - 添加语言切换器样式和脚本
- ✅ `login.html` - 已添加语言切换功能

### 3. 功能特性
- ✅ 默认语言：中文 (zh)
- ✅ 支持语言：中文、日文
- ✅ 自动保存语言偏好
- ✅ 实时切换无需刷新
- ✅ 美观的切换器 UI

---

## 📋 手动部署步骤

### 方法 1: 使用 SCP 上传（推荐）

```bash
# 1. 上传语言配置文件
scp /home/node/.openclaw/workspace/moon-reader-space/i18n.js root@112.124.111.228:/var/www/html/

# 2. 上传修改后的编辑器页面
scp /home/node/.openclaw/workspace/moon-reader-space/editor.html root@112.124.111.228:/var/www/html/

# 3. 上传登录页面（如已修改）
scp /home/node/.openclaw/workspace/moon-reader-space/login.html root@112.124.111.228:/var/www/html/

# 4. 验证文件
ssh root@112.124.111.228 "ls -lh /var/www/html/i18n.js"
```

### 方法 2: 使用 SSH 管道

```bash
# 上传 i18n.js
cat /home/node/.openclaw/workspace/moon-reader-space/i18n.js | ssh root@112.124.111.228 "cat > /var/www/html/i18n.js"

# 上传 editor.html
cat /home/node/.openclaw/workspace/moon-reader-space/editor.html | ssh root@112.124.111.228 "cat > /var/www/html/editor.html"
```

### 方法 3: 使用 Git（如果配置了）

```bash
cd /home/node/.openclaw/workspace/moon-reader-space
git add i18n.js editor.html login.html
git commit -m "feat: 添加中日双语切换功能"
git push origin main

# 然后在服务器拉取
ssh root@112.124.111.228 "cd /var/www/html && git pull"
```

---

## 🎨 语言切换器 UI

```
┌─────────────────────────────┐
│                             │
│              [中文] [日本語] │ ← 右上角固定
│                             │
└─────────────────────────────┘
```

**样式特点**:
- 位置：页面右上角固定
- 背景：深色半透明毛玻璃
- 按钮：圆角胶囊状
- 激活状态：高亮显示
- 动画：平滑过渡

---

## 📝 使用方法

### 在任意页面添加语言切换

#### 1. 引入语言文件
```html
<head>
    ...
    <script src="i18n.js"></script>
</head>
```

#### 2. 添加切换器组件
```html
<body>
    <!-- 语言切换器 -->
    <div class="lang-switcher">
        <button class="lang-btn" data-lang="zh" onclick="setLanguage('zh')">中文</button>
        <button class="lang-btn" data-lang="ja" onclick="setLanguage('ja')">日本語</button>
    </div>
    
    <!-- 页面内容 -->
</body>
```

#### 3. 使用 data-i18n 属性
```html
<!-- 普通文本 -->
<h1 data-i18n="login_title">登录</h1>

<!-- 按钮 -->
<button data-i18n="btn_login">登录</button>

<!-- 输入框占位符 -->
<input type="text" data-i18n="field_username_placeholder" placeholder="请输入用户名">

<!-- 多行文本（使用 \n 换行） -->
<p data-i18n="scene_main_stage_desc">演唱会场馆\n博客文章</p>
```

#### 4. 初始化（可选，已自动）
```javascript
// 页面加载时自动初始化
// 如需手动调用：
initLanguage();
```

---

## 🔧 代码示例

### 完整的页面结构
```html
<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <title data-i18n="page_title">页面标题</title>
    <script src="i18n.js"></script>
    <style>
        .lang-switcher {
            position: fixed;
            top: 1.5rem;
            right: 2rem;
            z-index: 1001;
            display: flex;
            gap: 0.5rem;
            background: rgba(26,16,37,0.9);
            backdrop-filter: blur(10px);
            padding: 0.5rem;
            border-radius: 25px;
            border: 1px solid rgba(255,107,157,0.3);
        }
        .lang-btn {
            padding: 0.4rem 1rem;
            background: transparent;
            border: 1px solid rgba(255,183,197,0.3);
            border-radius: 20px;
            color: rgba(255,183,197,0.6);
            cursor: pointer;
            font-size: 0.8rem;
            transition: all 0.3s;
        }
        .lang-btn.active {
            background: rgba(255,107,157,0.25);
            color: #ffb7c5;
        }
    </style>
</head>
<body>
    <div class="lang-switcher">
        <button class="lang-btn" data-lang="zh" onclick="setLanguage('zh')">中文</button>
        <button class="lang-btn" data-lang="ja" onclick="setLanguage('ja')">日本語</button>
    </div>
    
    <h1 data-i18n="login_title">登录</h1>
    <button data-i18n="btn_login">登录</button>
    
    <script>
        // 自动初始化
        initLanguage();
    </script>
</body>
</html>
```

---

## 📊 翻译统计

| 类别 | 中文条目 | 日文条目 |
|------|---------|---------|
| 通用 | 15 | 15 |
| 导航 | 8 | 8 |
| 接入页 | 3 | 3 |
| 中枢大厅 | 18 | 18 |
| 主舞台 | 10 | 10 |
| 编辑器 | 30 | 30 |
| 登录/注册 | 20 | 20 |
| 错误消息 | 5 | 5 |
| **总计** | **109** | **109** |

---

## 🌐 支持的语言

| 代码 | 语言 | 默认 |
|------|------|------|
| zh | 中文 | ✅ 是 |
| ja | 日本語 | ❌ 否 |

---

## 🔮 扩展其他语言

### 1. 在 i18n.js 中添加新语言

```javascript
const i18n = {
    zh: { ... },
    ja: { ... },
    en: {  // 添加英语
        'login': 'Login',
        'register': 'Register',
        'logout': 'Logout',
        'submit': 'Submit',
        // ... 其他翻译
    }
};
```

### 2. 添加切换按钮

```html
<div class="lang-switcher">
    <button class="lang-btn" data-lang="zh" onclick="setLanguage('zh')">中文</button>
    <button class="lang-btn" data-lang="ja" onclick="setLanguage('ja')">日本語</button>
    <button class="lang-btn" data-lang="en" onclick="setLanguage('en')">English</button>
</div>
```

### 3. 系统会自动处理

无需修改其他代码，`setLanguage()` 函数会自动处理新语言！

---

## ✅ 验证清单

部署后请检查：

- [ ] i18n.js 文件已上传
- [ ] 页面右上角显示语言切换器
- [ ] 点击"中文"显示中文
- [ ] 点击"日本語"显示日文
- [ ] 刷新页面后语言偏好保留
- [ ] 所有文本正确翻译
- [ ] 输入框占位符正确翻译
- [ ] 按钮文本正确翻译

---

## 🐛 故障排查

### 问题 1: 切换器不显示
**解决**: 检查 i18n.js 是否正确引入
```html
<script src="i18n.js"></script>
```

### 问题 2: 点击无反应
**解决**: 检查浏览器控制台是否有错误
```javascript
// 在控制台测试
setLanguage('zh');
setLanguage('ja');
```

### 问题 3: 翻译不生效
**解决**: 检查元素是否有 data-i18n 属性
```html
<!-- 正确 -->
<h1 data-i18n="login_title">登录</h1>

<!-- 错误 -->
<h1>登录</h1>
```

### 问题 4: 语言偏好未保存
**解决**: 检查 localStorage 是否可用
```javascript
// 在控制台测试
localStorage.setItem('test', '123');
console.log(localStorage.getItem('test'));
```

---

## 📞 技术支持

如有问题，请检查：
1. 浏览器控制台错误
2. 网络请求是否成功
3. 文件路径是否正确
4. 缓存是否需要清除

---

**部署完成后，网站将支持中日双语切换！** 🌸✨
