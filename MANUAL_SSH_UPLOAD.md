# 📤 手动 SSH 上传指南

## ✅ 文件已准备就绪

所有文件已在本地准备好，需要手动 SSH 上传。

---

## 📁 文件位置

```
/home/node/.openclaw/workspace/moon-reader-space/
├── i18n.js           (13KB)
├── hub.html          (16KB)
├── editor.html       (21KB)
├── login.html        (12KB)
└── stage.html        (18KB)
```

---

## 🚀 SSH 上传命令

### 1. SSH 连接到服务器
```bash
ssh -p 22 root@112.124.111.228
# 输入密码：@Aa620880123
```

### 2. 上传 i18n.js
```bash
# 方法 1: 使用 cat 命令
cat > /var/www/html/i18n.js
# 然后粘贴 i18n.js 的内容
# 按 Ctrl+D 保存
```

```bash
# 方法 2: 使用 echo 命令
echo '文件内容' > /var/www/html/i18n.js
```

### 3. 上传 HTML 文件
```bash
cat > /var/www/html/hub.html
# 粘贴 hub.html 内容
# Ctrl+D 保存

cat > /var/www/html/editor.html
# 粘贴 editor.html 内容
# Ctrl+D 保存

cat > /var/www/html/login.html
# 粘贴 login.html 内容
# Ctrl+D 保存

cat > /var/www/html/stage.html
# 粘贴 stage.html 内容
# Ctrl+D 保存
```

### 4. 验证上传
```bash
ls -lh /var/www/html/*.html /var/www/html/i18n.js
```

### 5. 设置权限
```bash
chmod 644 /var/www/html/*.html
chmod 644 /var/www/html/i18n.js
```

### 6. 退出 SSH
```bash
exit
```

---

## 📋 快速复制命令

```bash
# 1. 连接
ssh -p 22 root@112.124.111.228

# 2. 进入目录
cd /var/www/html

# 3. 创建文件（每个文件执行一次）
cat > i18n.js
# 粘贴内容，Ctrl+D

cat > hub.html
# 粘贴内容，Ctrl+D

cat > editor.html
# 粘贴内容，Ctrl+D

cat > login.html
# 粘贴内容，Ctrl+D

cat > stage.html
# 粘贴内容，Ctrl+D

# 4. 验证
ls -lh

# 5. 设置权限
chmod 644 *.html i18n.js

# 6. 退出
exit
```

---

## ✅ 验证步骤

上传完成后访问：

1. **检查文件**
   ```
   http://112.124.111.228/i18n.js
   ```

2. **测试页面**
   ```
   http://112.124.111.228/hub.html
   http://112.124.111.228/editor.html
   http://112.124.111.228/login.html
   http://112.124.111.228/stage.html
   ```

3. **测试切换器**
   - 右上角应该显示 `[中文] [日本語]`
   - 点击切换语言

---

## 📞 需要帮助？

如遇问题：
1. 检查文件权限（应为 644）
2. 清除浏览器缓存
3. 检查控制台错误

---

**请使用 SSH 手动上传文件！** 🌸
