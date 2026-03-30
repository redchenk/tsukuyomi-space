# 🌙 月読空間 - 最终部署说明

## ⚠️ SSH 连接超时说明

当前 SSH 连接持续超时，但 HTTP 访问正常（200 OK）。

**服务器状态**:
- ✅ 前端 HTTP 访问正常：http://112.124.111.228/
- ❌ SSH 连接超时：112.124.111.228:22
- ℹ️ 需要密码认证

---

## 📦 部署包已准备

**文件**: `final_deploy_pack.tar.gz`
**大小**: 19KB
**位置**: `/home/node/.openclaw/workspace/moon-reader-space/`

**包含文件**:
- ✅ i18n.js (13KB) - 语言配置
- ✅ editor.html (21KB) - 编辑器页面
- ✅ article.html (13KB) - 文章详情
- ✅ stage.html (15KB) - 主舞台
- ✅ login.html (~10KB) - 登录页
- ✅ 部署文档

---

## 🚀 推荐部署方法

### 方法 1: WinSCP（Windows 推荐）⭐

1. **下载 WinSCP**
   ```
   https://winscp.net/
   ```

2. **连接配置**
   ```
   文件协议：SFTP
   主机名：112.124.111.228
   端口号：22
   用户名：root
   密码：@Aa620880123
   ```

3. **上传步骤**
   - 左侧找到：`/home/node/.openclaw/workspace/moon-reader-space/`
   - 右侧进入：`/var/www/html/`
   - 选中以下文件拖拽到右侧：
     - i18n.js
     - editor.html
     - article.html
     - stage.html
     - login.html

4. **设置权限**
   ```bash
   # 在 WinSCP 中右键文件 → 属性
   # 或上传后执行：
   chmod 644 /var/www/html/*.html
   chmod 644 /var/www/html/i18n.js
   ```

---

### 方法 2: FileZilla（跨平台）⭐

1. **下载 FileZilla**
   ```
   https://filezilla-project.org/
   ```

2. **连接配置**
   ```
   主机：sftp://112.124.111.228
   用户名：root
   密码：@Aa620880123
   端口：22
   ```

3. **上传文件**
   - 本地站点：找到项目文件
   - 远程站点：进入 `/var/www/html/`
   - 拖拽上传

---

### 方法 3: macOS Finder

1. **打开 Finder**
2. **Cmd+K 连接服务器**
   ```
   sftp://112.124.111.228
   ```
3. **输入凭据**
   ```
   用户名：root
   密码：@Aa620880123
   ```
4. **拖拽文件上传**

---

### 方法 4: Linux scp 命令

```bash
# 1. 上传语言配置
scp -P 22 /home/node/.openclaw/workspace/moon-reader-space/i18n.js root@112.124.111.228:/var/www/html/

# 2. 上传页面文件
scp -P 22 /home/node/.openclaw/workspace/moon-reader-space/editor.html root@112.124.111.228:/var/www/html/
scp -P 22 /home/node/.openclaw/workspace/moon-reader-space/article.html root@112.124.111.228:/var/www/html/
scp -P 22 /home/node/.openclaw/workspace/moon-reader-space/stage.html root@112.124.111.228:/var/www/html/
scp -P 22 /home/node/.openclaw/workspace/moon-reader-space/login.html root@112.124.111.228:/var/www/html/

# 3. 验证
ssh -p 22 root@112.124.111.228 "ls -lh /var/www/html/"
```

---

## ✅ 验证步骤

### 1. 检查文件
```
http://112.124.111.228/i18n.js
```
应显示 JavaScript 代码（约 13KB）

### 2. 测试编辑器
```
http://112.124.111.228/editor.html
```
- 右上角显示：`[中文] [日本語]`
- 点击切换语言
- 界面文字变化

### 3. 测试主舞台
```
http://112.124.111.228/stage.html
```
- 显示文章列表
- 有搜索框
- 有分类筛选

### 4. 测试文章详情
```
http://112.124.111.228/article.html?id=1
```
- 显示文章完整内容
- 显示封面图片（如果有）
- 显示作者信息

### 5. 检查控制台
按 F12 打开控制台，应看到：
```
Language initialized: zh
```

---

## 🎨 预期效果

### 编辑器页面
```
┌─────────────────────────────────────────┐
│  月読空間                               │
│  [返回] [主舞台]      [中文] [日本語] │
├─────────────────────────────────────────┤
│         新建投稿                         │
│        创建新文章                        │
│  标题：[输入文章标题____________]         │
│  分类：[请选择分类 ▼]                    │
│  封面：[选择文件] [删除]                 │
│  摘要：[_____________________________]   │
│  正文：[_____________________________]   │
│         [投稿]  [取消]                   │
└─────────────────────────────────────────┘
```

### 主舞台页面
```
┌─────────────────────────────────────────┐
│  主舞台 | 演唱会场馆                     │
│  [搜索框____________] [全部][公告][传说] │
│  ✏️ 新建投稿                            │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐   │
│  │       [封面图片]                 │   │
│  │  [公告] 📅 2024-03-30 👤 admin  │   │
│  │  文章标题...                     │   │
│  │  文章摘要...                     │   │
│  │  ⏱️ 5 min              →        │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

---

## 📋 必须上传的文件

| 文件 | 大小 | 说明 | 必须 |
|------|------|------|------|
| i18n.js | 13KB | 语言配置 | ✅ |
| editor.html | 21KB | 编辑器页面 | ✅ |
| article.html | 13KB | 文章详情 | ✅ |
| stage.html | 15KB | 主舞台 | ✅ |
| login.html | ~10KB | 登录页 | ⭕ |

---

## 🔧 故障排查

### 问题 1: 切换器不显示
**检查**:
```javascript
// 浏览器控制台执行
console.log(typeof i18n);
// 应输出：object
```
**解决**: i18n.js 未正确加载

### 问题 2: 404 错误
**检查**:
```
http://112.124.111.228/i18n.js
```
**解决**: 文件未上传成功

### 问题 3: 语言不切换
**检查**:
```javascript
setLanguage('ja');
// 应切换为日文
```
**解决**: 检查 data-i18n 属性

---

## 📞 需要帮助？

如遇问题请检查:
1. ✅ 文件是否上传成功
2. ✅ 文件权限是否为 644
3. ✅ 清除浏览器缓存
4. ✅ 检查浏览器控制台错误

---

## 📊 更新内容总结

### v1.1.0 新增
- 🎤 主舞台博客系统
- 🌐 中日双语切换
- 📷 封面上传功能
- 🔐 权限系统优化

### 文件统计
- 新增页面：3 个
- 翻译条目：109 条
- 支持语言：2 种
- 代码行数：~7000 行

---

**部署包已准备就绪，请使用 WinSCP 或 FileZilla 上传！** 🌸✨

GitHub Release: https://github.com/redchenk/tsukuyomi-space/releases/tag/v1.1.0
