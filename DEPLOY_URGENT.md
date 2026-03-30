# 🌐 语言切换功能 - 紧急部署指南

## ⚠️ SSH 连接问题

当前 SSH 连接超时，请使用以下方法手动上传文件。

---

## 📋 方法 1: 使用 WinSCP/ FileZilla（推荐 Windows 用户）

### 步骤：

1. **下载安装 WinSCP 或 FileZilla**
   - WinSCP: https://winscp.net/
   - FileZilla: https://filezilla-project.org/

2. **连接配置**
   ```
   主机：112.124.111.228
   端口：22
   用户名：root
   密码：@Aa620880123
   协议：SFTP
   ```

3. **上传文件**
   - 本地路径：`/home/node/.openclaw/workspace/moon-reader-space/`
   - 远程路径：`/var/www/html/`
   
   **需要上传的文件**:
   - ✅ `i18n.js` → `/var/www/html/i18n.js`
   - ✅ `editor.html` → `/var/www/html/editor.html`

4. **验证**
   - 访问：http://112.124.111.228/i18n.js
   - 应该能看到 JavaScript 代码

---

## 📋 方法 2: 使用 scp 命令（推荐 Linux/Mac 用户）

```bash
# 1. 上传 i18n.js
scp -P 22 /home/node/.openclaw/workspace/moon-reader-space/i18n.js root@112.124.111.228:/var/www/html/

# 输入密码：@Aa620880123

# 2. 上传 editor.html
scp -P 22 /home/node/.openclaw/workspace/moon-reader-space/editor.html root@112.124.111.228:/var/www/html/

# 3. 验证
ssh -p 22 root@112.124.111.228 "ls -lh /var/www/html/i18n.js"
```

---

## 📋 方法 3: 使用 curl 通过 HTTP 上传

如果服务器启用了 WebDAV 或其他上传接口：

```bash
# 使用 curl 上传
curl -T /home/node/.openclaw/workspace/moon-reader-space/i18n.js http://112.124.111.228/upload/i18n.js
```

---

## 📋 方法 4: 通过 Git 同步

如果服务器配置了 Git：

```bash
# 在服务器上执行
cd /var/www/html
git pull origin main
```

---

## ✅ 验证部署

上传完成后，访问以下页面验证：

### 1. 检查文件是否存在
```
http://112.124.111.228/i18n.js
```
应该显示 JavaScript 代码（约 13KB）

### 2. 测试编辑器页面
```
http://112.124.111.228/editor.html
```
- 右上角应该显示语言切换器：[中文] [日本語]
- 点击"日本語"切换为日文
- 点击"中文"切换回中文

### 3. 检查控制台
按 F12 打开浏览器控制台，应该看到：
```
Language initialized: zh
```

---

## 🎨 语言切换器预览

```
┌──────────────────────────────────────┐
│                                      │
│  月読空間                            │
│                     [中文] [日本語] │ ← 右上角
│                                      │
│  新規投稿                            │
│  创建新文章                          │
│                                      │
│  [标题输入框]                         │
│  [分类选择] [阅读时间]                │
│  [摘要]                              │
│  [正文]                              │
│                                      │
│  [投稿] [取消]                        │
└──────────────────────────────────────┘
```

---

## 🔧 故障排查

### 问题 1: 切换器不显示
**检查**:
```javascript
// 在浏览器控制台执行
console.log(typeof i18n);
// 应该输出：object

console.log(typeof setLanguage);
// 应该输出：function
```

**解决**: i18n.js 未正确加载，检查文件路径

### 问题 2: 点击无反应
**检查**:
```javascript
// 在浏览器控制台执行
setLanguage('ja');
// 应该切换为日文
```

**解决**: 检查按钮 onclick 属性是否正确

### 问题 3: 404 错误
**检查**:
```
http://112.124.111.228/i18n.js
```

**解决**: 文件未上传成功，重新上传

---

## 📝 文件清单

| 文件 | 大小 | 必须 | 说明 |
|------|------|------|------|
| `i18n.js` | 13KB | ✅ | 语言配置文件 |
| `editor.html` | 21KB | ✅ | 编辑器页面（已修改） |
| `login.html` | ~10KB | ⭕ | 登录页面（可选） |
| `LANG_DEPLOY.md` | 6KB | ⭕ | 详细文档 |
| `deploy_lang.sh` | 2KB | ⭕ | 部署脚本 |

---

## 🌐 支持的语言

| 语言 | 代码 | 默认 |
|------|------|------|
| 中文 | zh | ✅ 是 |
| 日本語 | ja | ❌ 否 |

---

## 📞 需要帮助？

如果遇到问题：
1. 检查浏览器控制台错误
2. 确认文件已上传到正确路径
3. 清除浏览器缓存
4. 检查文件权限（应为 644）

---

**上传完成后，网站将支持中日双语切换！** 🌸✨
