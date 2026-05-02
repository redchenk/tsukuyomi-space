# 部署指南

以下示例面向 Ubuntu/Debian 服务器，应用目录使用 `/var/www/tsukuyomi-space`，API 只监听 `127.0.0.1:3000`，由 Nginx 在 `3280` 端口对外提供访问。

## 1. 准备服务器

```bash
apt update
apt install -y git nginx nodejs npm
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

## 5. 配置 Nginx

```bash
cp deploy/nginx.conf /etc/nginx/sites-available/tsukuyomi-space
ln -s /etc/nginx/sites-available/tsukuyomi-space /etc/nginx/sites-enabled/tsukuyomi-space
nginx -t
systemctl reload nginx
curl http://38.76.173.139:3280/hub
```

上线域名后，建议使用 Certbot 配置 HTTPS，并把 `.env` 里的 `CORS_ORIGINS` 改成 HTTPS 域名。

## 6. 更新

```bash
cd /var/www/tsukuyomi-space
git pull --ff-only
npm ci --omit=dev
npm run build:web
pm2 reload tsukuyomi-api --update-env
```
