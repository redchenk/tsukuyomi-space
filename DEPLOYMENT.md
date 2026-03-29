# 🚀 月読空間 - 详细部署指南

> 完整的服务器部署教程

---

## 📋 目录

1. [服务器准备](#服务器准备)
2. [前端部署](#前端部署)
3. [后端部署](#后端部署)
4. [域名配置](#域名配置)
5. [HTTPS 配置](#https 配置)
6. [监控与维护](#监控与维护)
7. [故障排查](#故障排查)

---

## 服务器准备

### 系统要求
- **操作系统**: Ubuntu 20.04+ / CentOS 7+
- **内存**: 最低 1GB，推荐 2GB+
- **存储**: 最低 10GB，推荐 20GB+
- **网络**: 开放端口 80, 443, 22, 3000

### 1. 更新系统
```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y

# CentOS/RHEL
sudo yum update -y
```

### 2. 安装必要软件
```bash
# 安装 Git
sudo apt install git -y  # Ubuntu
sudo yum install git -y  # CentOS

# 安装 Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs  # Ubuntu

# 或
sudo yum install -y nodejs  # CentOS
```

### 3. 验证安装
```bash
node --version  # 应显示 v20.x
npm --version   # 应显示 10.x
git --version
```

---

## 前端部署

### 方案 A: 手动上传

#### 1. 创建网站目录
```bash
sudo mkdir -p /var/www/tsukuyomi-space
sudo chown -R www-data:www-data /var/www/tsukuyomi-space
```

#### 2. 上传文件
```bash
# 使用 scp
sudo scp -r frontend/* root@your-server:/var/www/tsukuyomi-space/

# 或使用 rsync
sudo rsync -avz frontend/ root@your-server:/var/www/tsukuyomi-space/
```

#### 3. 设置权限
```bash
sudo chmod -R 755 /var/www/tsukuyomi-space
sudo chown -R www-data:www-data /var/www/tsukuyomi-space
```

### 方案 B: Git 部署

#### 1. 克隆仓库
```bash
cd /var/www
sudo git clone https://github.com/redchenk/tsukuyomi-space.git
sudo chown -R www-data:www-data tsukuyomi-space
```

#### 2. 配置自动更新
```bash
# 创建更新脚本
sudo nano /usr/local/bin/update-tsukuyomi.sh
```

```bash
#!/bin/bash
cd /var/www/tsukuyomi-space
sudo -u www-data git pull origin main
echo "更新完成！"
```

```bash
sudo chmod +x /usr/local/bin/update-tsukuyomi.sh
```

### Nginx 配置

#### 1. 创建配置文件
```bash
sudo nano /etc/nginx/sites-available/tsukuyomi-space
```

#### 2. 添加配置
```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    
    root /var/www/tsukuyomi-space;
    index index.html access.html;
    
    # 日志
    access_log /var/log/nginx/tsukuyomi-access.log;
    error_log /var/log/nginx/tsukuyomi-error.log;
    
    # 主配置
    location / {
        try_files $uri $uri/ /index.html;
        
        # 缓存静态资源
        location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
        
        # 视频文件优化
        location ~* \.(mp4|webm)$ {
            add_header Accept-Ranges bytes;
            add_header Content-Type video/mp4;
            add_header Cache-Control "public, max-age=31536000";
        }
    }
    
    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

#### 3. 启用配置
```bash
sudo ln -s /etc/nginx/sites-available/tsukuyomi-space /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 后端部署

### 1. 准备环境
```bash
# 创建应用目录
sudo mkdir -p /opt/tsukuyomi-api
cd /opt/tsukuyomi-api

# 复制后端文件
sudo cp -r /path/to/backend/* .
sudo chown -R $USER:$USER .
```

### 2. 安装依赖
```bash
npm install --production
```

### 3. 配置环境变量
```bash
# 创建 .env 文件
nano .env
```

```env
NODE_ENV=production
PORT=3000
JWT_SECRET=your_super_secret_key_here_change_in_production
DB_PATH=/opt/tsukuyomi-api/tsukuyomi.db
```

### 4. 使用 PM2 管理

#### 安装 PM2
```bash
sudo npm install -g pm2
```

#### 启动服务
```bash
pm2 start server.js --name tsukuyomi-api
pm2 save
pm2 startup
```

#### 配置开机自启
```bash
# 复制 PM2 生成的命令并执行
# 例如：sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u your-user --hp /home/your-user
```

#### 查看状态
```bash
pm2 status
pm2 logs tsukuyomi-api
pm2 monit
```

### 5. 使用 systemd 管理（可选）

#### 创建服务文件
```bash
sudo nano /etc/systemd/system/tsukuyomi-api.service
```

```ini
[Unit]
Description=Tsukuyomi Space API Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/tsukuyomi-api
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000

# 安全设置
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

#### 启动服务
```bash
sudo systemctl daemon-reload
sudo systemctl start tsukuyomi-api
sudo systemctl enable tsukuyomi-api
sudo systemctl status tsukuyomi-api
```

---

## 域名配置

### 1. 购买域名
推荐服务商：
- Cloudflare
- Namecheap
- GoDaddy
- 阿里云

### 2. 配置 DNS
在域名控制台添加 A 记录：

| 类型 | 主机记录 | 记录值 | TTL |
|------|----------|--------|-----|
| A | @ | 你的服务器 IP | 10 分钟 |
| A | www | 你的服务器 IP | 10 分钟 |

### 3. 验证解析
```bash
# 等待 DNS 生效后测试
ping your-domain.com
nslookup your-domain.com
```

---

## HTTPS 配置

### 使用 Let's Encrypt

#### 1. 安装 Certbot
```bash
# Ubuntu
sudo apt install certbot python3-certbot-nginx -y

# CentOS
sudo yum install certbot python3-certbot-nginx -y
```

#### 2. 申请证书
```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

#### 3. 自动续期
```bash
# 测试自动续期
sudo certbot renew --dry-run

# 添加定时任务
sudo crontab -e
# 添加：0 3 * * * certbot renew --quiet
```

### 配置 HTTPS
Certbot 会自动修改 Nginx 配置，确认包含：

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # SSL 优化
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # ... 其他配置
}

# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

---

## 监控与维护

### 1. 网站监控

#### 使用 Uptime Kuma
```bash
# Docker 安装
docker run -d --restart=always -p 3001:3001 \
  -v uptime-kuma:/app/data \
  --name uptime-kuma louislam/uptime-kuma:1
```

访问 `http://your-server:3001` 配置监控。

### 2. 日志查看
```bash
# Nginx 日志
sudo tail -f /var/log/nginx/tsukuyomi-access.log
sudo tail -f /var/log/nginx/tsukuyomi-error.log

# PM2 日志
pm2 logs tsukuyomi-api

# 系统日志
sudo journalctl -u tsukuyomi-api -f
```

### 3. 数据库备份
```bash
# 创建备份脚本
nano /opt/backup-tsukuyomi.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/backup/tsukuyomi"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
cp /opt/tsukuyomi-api/tsukuyomi.db $BACKUP_DIR/tsukuyomi_$DATE.db

# 保留最近 7 天的备份
find $BACKUP_DIR -name "*.db" -mtime +7 -delete

echo "备份完成：tsukuyomi_$DATE.db"
```

```bash
# 添加定时任务
sudo crontab -e
# 每天凌晨 3 点备份
0 3 * * * /opt/backup-tsukuyomi.sh
```

### 4. 性能监控
```bash
# 查看系统资源
htop

# 查看磁盘使用
df -h

# 查看内存使用
free -h

# 查看网络连接
netstat -tulpn
```

---

## 故障排查

### 前端无法访问

#### 1. 检查 Nginx 状态
```bash
sudo systemctl status nginx
sudo nginx -t
```

#### 2. 检查文件权限
```bash
ls -la /var/www/tsukuyomi-space/
sudo chown -R www-data:www-data /var/www/tsukuyomi-space
sudo chmod -R 755 /var/www/tsukuyomi-space
```

#### 3. 检查防火墙
```bash
sudo ufw status
sudo ufw allow 80
sudo ufw allow 443
```

### 后端 API 无法连接

#### 1. 检查服务状态
```bash
pm2 status
pm2 restart tsukuyomi-api
pm2 logs tsukuyomi-api
```

#### 2. 检查端口监听
```bash
netstat -tlnp | grep 3000
sudo lsof -i :3000
```

#### 3. 检查 CORS 配置
确保 `server.js` 中配置了正确的 CORS：
```javascript
app.use(cors({
    origin: ['https://your-domain.com']
}));
```

### 视频无法播放

#### 1. 检查文件存在
```bash
ls -lh /var/www/tsukuyomi-space/background.mp4
```

#### 2. 检查 MIME 类型
```bash
# Nginx 配置中添加
http {
    types {
        video/mp4 mp4;
        video/webm webm;
    }
}
```

#### 3. 检查文件大小
```bash
# 视频文件不应超过浏览器限制（通常 50MB）
ls -lh background.mp4
```

### 数据库错误

#### 1. 检查文件权限
```bash
ls -la /opt/tsukuyomi-api/tsukuyomi.db
sudo chown www-data:www-data tsukuyomi.db
```

#### 2. 检查磁盘空间
```bash
df -h
```

#### 3. 恢复备份
```bash
cp /backup/tsukuyomi/tsukuyomi_20240329.db tsukuyomi.db
```

---

## 📞 获取帮助

如遇到问题：
1. 查看日志文件
2. 检查 GitHub Issues
3. 联系项目作者

---

<div align="center">

**部署愉快！🌙**

Made with ❤️ for Tsukuyomi Space

</div>
