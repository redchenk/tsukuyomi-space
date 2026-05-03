# 部署指南

以下示例面向 Ubuntu/Debian 服务器，应用目录使用 `/var/www/tsukuyomi-space`，API 只监听 `127.0.0.1:3000`，由 Nginx 在 `3280` 端口对外提供访问。

## 1. 准备服务器

```bash
apt update
apt install -y git nginx nodejs npm sqlite3
npm install -g pm2
mkdir -p /var/www /etc/tsukuyomi-space /var/lib/tsukuyomi-space /var/log/tsukuyomi-space
```

## 2. 获取代码

```bash
cd /var/www
git clone https://github.com/redchenk/tsukuyomi-space.git
cd tsukuyomi-space
```

## 3. 配置环境变量

```bash
cp .env.example /etc/tsukuyomi-space/tsukuyomi-space.env
chmod 600 /etc/tsukuyomi-space/tsukuyomi-space.env
openssl rand -base64 48
```

把生成的随机值填到 `JWT_SECRET`，并修改 `ADMIN_PASSWORD`、`CORS_ORIGINS`、SMTP/LLM/TTS 等配置。生产环境不要使用示例密码。

## 4. 启动应用

```bash
bash deploy/deploy.sh
pm2 status
curl http://127.0.0.1:3000/api/health
```

`deploy/deploy.sh` 会在每次部署前自动备份 SQLite：

- 数据库路径：优先使用环境变量 `DB_PATH`，否则使用 `DATA_DIR/tsukuyomi.db`。
- 备份目录：`BACKUP_DIR`，默认是 `DATA_DIR/backups`。
- 备份方式：服务器有 `sqlite3` 时使用 `.backup`；没有时复制 `.db`，并同时复制可能存在的 `-wal`、`-shm` 文件。

生产环境执行迁移前不要跳过这一步。需要回滚时，先停止 PM2，再把目标备份恢复为当前 `DB_PATH`。

## 5. 配置 Nginx

```bash
cp deploy/nginx.conf /etc/nginx/sites-available/tsukuyomi-space
ln -s /etc/nginx/sites-available/tsukuyomi-space /etc/nginx/sites-enabled/tsukuyomi-space
nginx -t
systemctl reload nginx
curl http://your-domain.example/hub
```

上线域名后，建议使用 Certbot 配置 HTTPS，并把 `.env` 里的 `CORS_ORIGINS` 改成 HTTPS 域名。

## 6. 更新

```bash
cd /var/www/tsukuyomi-space
git pull --ff-only
bash deploy/deploy.sh
```
