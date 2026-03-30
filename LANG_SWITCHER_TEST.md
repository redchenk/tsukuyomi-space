# 🌐 语言切换按钮测试指南

## ✅ 切换按钮已添加到所有页面

### 页面清单
| 页面 | 文件 | 切换器 | 状态 |
|------|------|--------|------|
| 中枢大厅 | hub.html | ✅ | 已添加 |
| 编辑器 | editor.html | ✅ | 已添加 |
| 登录页 | login.html | ✅ | 已添加 |
| 主舞台 | stage.html | ✅ | 已添加 |

---

## 🔍 切换按钮位置

**所有页面的右上角固定位置**:
```
┌──────────────────────────────────────┐
│  月读空间                            │
│  [导航链接...]                       │
│                     ┌─────────────┐  │
│                     │[中文][日本語]│ ← 右上角
│                     └─────────────┘  │
└──────────────────────────────────────┘
```

---

## 📋 验证步骤

### 1. 访问页面
```
http://112.124.111.228/hub.html
```

### 2. 检查右上角
应该看到：
```
┌─────────────┐
│[中文][日本語]│
└─────────────┘
```

### 3. 测试切换
- 点击"中文" → 界面显示中文
- 点击"日本語" → 界面显示日文
- "中文"按钮应该高亮（默认）

### 4. 检查控制台
按 F12 打开控制台，应该看到：
```
Language initialized: zh
```

---

## 🎨 切换器样式

**CSS 样式**:
```css
.lang-switcher {
    position: fixed;
    top: 1.5rem;       /* 距离顶部 1.5rem */
    right: 2rem;       /* 距离右侧 2rem */
    z-index: 1001;     /* 最高层级 */
    background: rgba(26,16,37,0.9);
    backdrop-filter: blur(10px);
    border-radius: 25px;
}
```

**按钮样式**:
```css
.lang-btn {
    padding: 0.4rem 1rem;
    border-radius: 20px;
    color: rgba(255,183,197,0.6);
}
.lang-btn.active {
    background: rgba(255,107,157,0.25);
    color: #ffb7c5;    /* 高亮颜色 */
}
```

---

## 🔧 故障排查

### 问题 1: 看不到切换器
**检查**:
1. 页面右上角是否有按钮
2. 浏览器是否清除了缓存
3. CSS 是否加载成功

**解决**:
```javascript
// 在控制台执行
console.log(document.querySelector('.lang-switcher'));
// 应该输出：<div class="lang-switcher">...</div>
```

### 问题 2: 点击无反应
**检查**:
```javascript
// 在控制台执行
console.log(typeof setLanguage);
// 应该输出：function
```

**解决**: i18n.js 未正确加载

### 问题 3: 样式不显示
**检查**:
```javascript
// 在控制台执行
const style = getComputedStyle(document.querySelector('.lang-switcher'));
console.log(style.position);
// 应该输出：fixed
```

**解决**: CSS 未加载或被覆盖

---

## 📁 文件清单

**必须上传的文件**:
- ✅ i18n.js (13KB) - 语言配置
- ✅ hub.html (修改) - 中枢大厅
- ✅ editor.html (修改) - 编辑器
- ✅ login.html (修改) - 登录页
- ✅ stage.html (修改) - 主舞台

---

## 🚀 部署方法

### 方法 1: WinSCP
1. 连接：112.124.111.228:22
2. 用户名：root
3. 密码：@Aa620880123
4. 上传所有 HTML 文件和 i18n.js

### 方法 2: FileZilla
1. 主机：sftp://112.124.111.228
2. 用户名：root
3. 密码：@Aa620880123
4. 拖拽上传

---

## ✅ 验证清单

部署后检查：
- [ ] hub.html 右上角有切换器
- [ ] editor.html 右上角有切换器
- [ ] login.html 右上角有切换器
- [ ] stage.html 右上角有切换器
- [ ] 默认"中文"高亮
- [ ] 点击切换生效
- [ ] 刷新后语言保留
- [ ] 控制台无错误

---

**切换按钮已添加到所有页面！** 🌸✨

如果看不到，请清除浏览器缓存并刷新页面！
