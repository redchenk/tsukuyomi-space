# 🌐 语言切换功能 - 完整部署包

## ✅ 部署包已准备完成

**文件**: `lang_switcher_complete.tar.gz`
**大小**: 17KB
**位置**: `/home/node/.openclaw/workspace/moon-reader-space/`

---

## 📦 包含文件

| 文件 | 大小 | 说明 |
|------|------|------|
| `i18n.js` | 13KB | 语言配置文件（109 条翻译） |
| `hub.html` | 16KB | 中枢大厅（已添加切换器） |
| `editor.html` | 21KB | 文章编辑器（已添加切换器） |
| `login.html` | 12KB | 登录页（已添加切换器） |
| `stage.html` | 18KB | 主舞台（已添加切换器） |
| `LANG_SWITCHER_TEST.md` | 3KB | 测试指南 |

---

## 🚀 部署步骤

### 方法 1: WinSCP（推荐）⭐

#### 1. 下载 WinSCP
```
https://winscp.net/
```

#### 2. 连接配置
```
文件协议：SFTP
主机名：112.124.111.228
端口号：22
用户名：root
密码：@Aa620880123
```

#### 3. 上传步骤
1. 打开 WinSCP，输入以上信息
2. 点击"登录"
3. 左侧找到：`/home/node/.openclaw/workspace/moon-reader-space/`
4. 右侧进入：`/var/www/html/`
5. 选中以下文件拖拽到右侧：
   - ✅ i18n.js
   - ✅ hub.html
   - ✅ editor.html
   - ✅ login.html
   - ✅ stage.html
6. 等待上传完成

#### 4. 设置权限
```bash
# 在 WinSCP 中右键文件 → 属性
# 或上传后执行以下命令：
chmod 644 /var/www/html/*.html
chmod 644 /var/www/html/i18n.js
```

---

### 方法 2: FileZilla

#### 1. 下载
```
https://filezilla-project.org/
```

#### 2. 连接
```
主机：sftp://112.124.111.228
用户名：root
密码：@Aa620880123
端口：22
```

#### 3. 上传
- 左侧找到文件
- 右侧进入 `/var/www/html/`
- 拖拽上传

---

### 方法 3: Linux/Mac scp 命令

```bash
# 1. 上传语言配置
scp -P 22 /home/node/.openclaw/workspace/moon-reader-space/i18n.js root@112.124.111.228:/var/www/html/

# 2. 上传页面文件
scp -P 22 /home/node/.openclaw/workspace/moon-reader-space/hub.html root@112.124.111.228:/var/www/html/
scp -P 22 /home/node/.openclaw/workspace/moon-reader-space/editor.html root@112.124.111.228:/var/www/html/
scp -P 22 /home/node/.openclaw/workspace/moon-reader-space/login.html root@112.124.111.228:/var/www/html/
scp -P 22 /home/node/.openclaw/workspace/moon-reader-space/stage.html root@112.124.111.228:/var/www/html/

# 3. 验证
ssh -p 22 root@112.124.111.228 "ls -lh /var/www/html/"
```

---

## ✅ 验证步骤

### 1. 检查文件
访问以下 URL 确认文件存在：
```
http://112.124.111.228/i18n.js
```
应该显示 JavaScript 代码

### 2. 测试中枢大厅
```
http://112.124.111.228/hub.html
```
**检查**:
- 右上角显示：`[中文] [日本語]`
- 默认"中文"高亮
- 点击切换语言

### 3. 测试编辑器
```
http://112.124.111.228/editor.html
```
**检查**:
- 右上角显示切换器
- 点击切换生效

### 4. 测试登录页
```
http://112.124.111.228/login.html
```
**检查**:
- 右上角显示切换器
- 界面文字正确

### 5. 测试主舞台
```
http://112.124.111.228/stage.html
```
**检查**:
- 右上角显示切换器
- 筛选按钮可切换

---

## 🎨 预期效果

### 所有页面右上角
```
┌──────────────────────────────────────┐
│  月读空间                            │
│  [导航链接...]                       │
│                     ┌─────────────┐  │
│                     │[中文][日本語]│ ← 切换器
│                     └─────────────┘  │
└──────────────────────────────────────┘
```

### 切换效果
- 点击"中文" → 界面显示中文
- 点击"日本語" → 界面显示日文
- 刷新页面 → 语言偏好保留

---

## 🔧 故障排查

### 问题 1: 看不到切换器
**检查**:
```javascript
// 按 F12 打开控制台，执行：
console.log(document.querySelector('.lang-switcher'));
// 应该输出：<div class="lang-switcher">...</div>
```

**解决**:
1. 清除浏览器缓存
2. 强制刷新（Ctrl+F5）
3. 检查 i18n.js 是否加载

### 问题 2: 点击无反应
**检查**:
```javascript
// 在控制台执行：
console.log(typeof setLanguage);
// 应该输出：function
```

**解决**: i18n.js 未正确加载

### 问题 3: 样式不显示
**检查**:
```javascript
const style = getComputedStyle(document.querySelector('.lang-switcher'));
console.log(style.position);
// 应该输出：fixed
```

**解决**: CSS 未加载

---

## 📋 验证清单

部署后请检查：
- [ ] i18n.js 文件存在
- [ ] hub.html 右上角有切换器
- [ ] editor.html 右上角有切换器
- [ ] login.html 右上角有切换器
- [ ] stage.html 右上角有切换器
- [ ] 默认"中文"高亮
- [ ] 点击切换生效
- [ ] 刷新后语言保留
- [ ] 控制台无错误

---

## 📞 需要帮助？

如遇问题：
1. 检查浏览器控制台错误
2. 确认文件已上传
3. 清除浏览器缓存
4. 检查文件权限（应为 644）

---

## 🌐 GitHub 更新

代码已提交到 GitHub：
```
https://github.com/redchenk/tsukuyomi-space
```

**最新提交**:
- feat: hub.html 添加语言切换功能
- feat: 添加语言切换按钮到所有页面
- docs: 调整项目以中文为基本语言

---

**部署包已准备就绪！请使用 WinSCP 或 FileZilla 上传！** 🌸✨
