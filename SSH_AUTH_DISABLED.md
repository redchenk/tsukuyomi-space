# ⚠️ SSH 密码认证被禁用 - 最终解决方案

## ❌ 问题

SSH 连接测试结果显示：
```
Permission denied (publickey,password).
```

**原因**: 服务器配置了只允许 SSH 密钥认证，禁用了密码认证。

**HTTP 状态**: ✅ 正常 (200 OK)

---

## ✅ 解决方案

由于 SSH 密码认证被禁用，请使用以下方法上传文件：

### 方法 1: WinSCP（图形界面，最简单）⭐

1. **下载 WinSCP**
   ```
   https://winscp.net/
   ```

2. **配置连接**
   ```
   文件协议：SFTP
   主机名：112.124.111.228
   端口号：22
   用户名：root
   密码：@Aa620880123
   ```

3. **高级设置**
   - 点击"高级" → "SSH" → "认证"
   - 允许密码认证（如果支持）
   - 或配置 SSH 密钥

4. **上传文件**
   - 左侧：`/home/node/.openclaw/workspace/moon-reader-space/`
   - 右侧：`/var/www/html/`
   - 拖拽以下文件：
     - i18n.js
     - hub.html
     - editor.html
     - login.html
     - stage.html

---

### 方法 2: 配置 SSH 密钥（推荐）⭐

#### 1. 生成 SSH 密钥
```bash
ssh-keygen -t rsa -b 4096
```

#### 2. 复制公钥到服务器
```bash
ssh-copy-id -p 22 root@112.124.111.228
# 输入密码：@Aa620880123
```

#### 3. 测试连接
```bash
ssh -p 22 root@112.124.111.228 "echo 连接成功"
```

#### 4. 上传文件
```bash
scp -P 22 /home/node/.openclaw/workspace/moon-reader-space/i18n.js root@112.124.111.228:/var/www/html/
scp -P 22 /home/node/.openclaw/workspace/moon-reader-space/hub.html root@112.124.111.228:/var/www/html/
scp -P 22 /home/node/.openclaw/workspace/moon-reader-space/editor.html root@112.124.111.228:/var/www/html/
scp -P 22 /home/node/.openclaw/workspace/moon-reader-space/login.html root@112.124.111.228:/var/www/html/
scp -P 22 /home/node/.openclaw/workspace/moon-reader-space/stage.html root@112.124.111.228:/var/www/html/
```

---

### 方法 3: 使用服务器控制面板

如果服务器有 Web 控制面板（如 cPanel、宝塔等）：

1. 登录控制面板
2. 找到文件管理器
3. 进入 `/var/www/html/`
4. 上传文件

---

### 方法 4: 通过 Git 部署

如果服务器配置了 Git：

```bash
# 在服务器上执行
cd /var/www/html
git pull origin main
```

---

## 📁 需要上传的文件

| 文件 | 大小 | 必须 |
|------|------|------|
| i18n.js | 13KB | ✅ |
| hub.html | 16KB | ✅ |
| editor.html | 21KB | ✅ |
| login.html | 12KB | ✅ |
| stage.html | 18KB | ✅ |

**部署包**: `lang_switcher_complete.tar.gz` (17KB)

---

## ✅ 验证步骤

上传完成后访问：

1. **检查文件**
   ```
   http://112.124.111.228/i18n.js
   ```
   应显示 JavaScript 代码

2. **测试中枢大厅**
   ```
   http://112.124.111.228/hub.html
   ```
   - 右上角显示：`[中文] [日本語]`
   - 点击切换语言

3. **测试其他页面**
   - editor.html
   - login.html
   - stage.html

---

## 🔧 服务器配置修改（可选）

如果需要启用 SSH 密码认证，在服务器上执行：

```bash
# 1. 编辑 SSH 配置
sudo nano /etc/ssh/sshd_config

# 2. 修改或添加以下行
PasswordAuthentication yes
PermitRootLogin yes

# 3. 重启 SSH 服务
sudo systemctl restart sshd
```

**注意**: 修改 SSH 配置可能影响服务器安全，请谨慎操作。

---

## 📞 需要帮助？

如遇问题：
1. 检查服务器 SSH 配置
2. 使用 WinSCP 图形界面
3. 配置 SSH 密钥认证
4. 联系服务器管理员

---

**当前状态**: 
- ✅ 代码已完成
- ✅ Git 已推送
- ✅ 部署包已准备
- ❌ SSH 密码认证被禁用
- ⏳ 需要手动上传文件

---

**请使用 WinSCP 或配置 SSH 密钥后上传文件！** 🌸
