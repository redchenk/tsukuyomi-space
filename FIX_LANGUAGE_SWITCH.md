# 🔧 语言切换问题 - 完整诊断和修复

## 📊 当前状态

### 服务器文件检查结果

| 页面 | lang-switcher | i18n.js | 状态 |
|------|---------------|---------|------|
| hub.html | ✅ 有 | ✅ 有 | 正常 |
| stage.html | ❌ 无 | ❌ 无 | **需要修复** |
| login.html | ? | ? | 待检查 |
| editor.html | ? | ? | 待检查 |

**问题**: stage.html 没有语言切换器！

---

## 🔍 问题原因

1. **服务器文件未更新** - SSH 上传超时，文件没有成功上传
2. **Nginx 缓存** - 服务器缓存了旧版本 HTML
3. **浏览器缓存** - 浏览器缓存了旧版本页面

---

## ✅ 解决方案

### 方法 1: 手动上传（推荐）⭐

由于 SSH 连接不稳定，请手动上传文件：

#### 使用 WinSCP
1. 下载：https://winscp.net/
2. 连接配置：
   ```
   主机：112.124.111.228
   端口：22
   用户名：root
   密码：@Aa620880123
   ```
3. 上传以下文件到 `/var/www/html/`:
   - ✅ stage_final.html → 重命名为 stage.html
   - ✅ editor.html
   - ✅ login.html
   - ✅ i18n.js

#### 使用 FileZilla
1. 下载：https://filezilla-project.org/
2. 主机：sftp://112.124.111.228
3. 用户名：root
4. 密码：@Aa620880123
5. 上传文件到 `/var/www/html/`

---

### 方法 2: SSH 命令行

```bash
# 1. SSH 连接
ssh -p 22 root@112.124.111.228
# 输入密码：@Aa620880123

# 2. 删除旧文件
cd /var/www/html
rm -f stage.html editor.html login.html

# 3. 重启 Nginx 清除缓存
systemctl restart nginx

# 4. 退出
exit

# 5. 重新上传文件（使用 WinSCP 或 FileZilla）
```

---

### 方法 3: 服务器端直接下载

如果服务器可以访问 GitHub：

```bash
# SSH 连接服务器
ssh -p 22 root@112.124.111.228

# 进入目录
cd /var/www/html

# 从 GitHub 下载最新文件
curl -O https://raw.githubusercontent.com/redchenk/tsukuyomi-space/main/stage.html
curl -O https://raw.githubusercontent.com/redchenk/tsukuyomi-space/main/editor.html
curl -O https://raw.githubusercontent.com/redchenk/tsukuyomi-space/main/login.html
curl -O https://raw.githubusercontent.com/redchenk/tsukuyomi-space/main/i18n.js

# 重启 Nginx
systemctl restart nginx

# 退出
exit
```

---

## ✅ 验证步骤

上传完成后，访问以下链接验证：

### 1. 检查 stage.html
```
http://112.124.111.228/stage.html
```
**应该看到**:
- 导航栏右侧：`[中枢大厅] [主舞台] [竞技场] [中文] [日本語]`
- 标题：**主舞台**
- 筛选按钮：**全部 / 公告 / 传说 / 技术 / 其他**

### 2. 测试语言切换
- 点击 `[日本語]` → 界面变日文
- 点击 `[中文]` → 界面变中文
- 刷新页面 → 语言保持

### 3. 从 hub.html 进入
```
http://112.124.111.228/hub.html
```
- 点击"主舞台"卡片
- 应该跳转到 stage.html
- 语言切换器应该保持

---

## 🔍 诊断命令

### 检查服务器文件
```bash
curl "http://112.124.111.228/stage.html" | grep "lang-switcher"
# 应该输出：lang-switcher

curl "http://112.124.111.228/stage.html" | grep "i18n.js"
# 应该输出：i18n.js

curl "http://112.124.111.228/stage.html" | grep "主舞台"
# 应该输出：主舞台
```

### 浏览器控制台检查
按 F12 打开控制台，执行：
```javascript
// 检查 localStorage
console.log(localStorage.getItem('tsukuyomi_lang'));
// 应该输出：zh

// 检查 i18n.js 是否加载
console.log(typeof setLanguage);
// 应该输出：function

// 检查切换器
console.log(document.querySelector('.lang-switcher'));
// 应该输出：<div class="lang-switcher">...</div>
```

---

## 📁 需要上传的文件

所有文件位置：
```
/home/node/.openclaw/workspace/moon-reader-space/
├── i18n.js           (13KB) ✅ 必须
├── stage_final.html  (9KB)  ✅ 上传为 stage.html
├── editor.html       (21KB) ✅ 必须
├── login.html        (12KB) ✅ 必须
└── hub.html          (16KB) ✅ 已有
```

---

## ⚠️ 注意事项

1. **清除浏览器缓存** - 按 Ctrl+Shift+Delete
2. **强制刷新** - 按 Ctrl+F5
3. **使用无痕模式测试** - 按 Ctrl+Shift+N
4. **检查多个浏览器** - Chrome、Firefox、Edge

---

## 📞 还是不行？

如果手动上传后还是不行，请提供：

1. **截图** - 显示导航栏和页面内容
2. **浏览器控制台输出** - 按 F12 查看错误
3. **使用的浏览器** - Chrome/Firefox/Edge/Safari
4. **是否清除缓存** - 是/否

---

**请使用 WinSCP 或 FileZilla 手动上传文件！** 🌸

这是最可靠的方法，可以避免 SSH 超时问题。
