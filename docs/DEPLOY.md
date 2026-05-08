# 部署指南

项目支持两种生产部署方式：

- Docker / Docker Compose：推荐用于后续迁移、复制环境和快速恢复。
- PM2 + Nginx：当前服务器使用的传统部署方式，仍然保留。

## Docker Compose 部署

Docker 镜像会在构建阶段执行 `npm run build:web`，运行时由 Express 同时提供 Vue 前端、静态资源和 `/api/` 接口。默认对外端口是 `3280`，容器内服务端口是 `3000`。

### 1. 准备配置

```bash
cp .env.docker.example .env.docker
chmod 600 .env.docker
openssl rand -base64 48
```

把生成的随机值填入 `.env.docker` 的 `JWT_SECRET`，并修改：

- `ADMIN_PASSWORD`：生产环境不要使用示例密码。
- `CORS_ORIGINS`：例如 `https://your-domain.example` 或 `http://your-server-ip:3280`。
- SMTP、LLM、TTS 等第三方服务配置。

Docker 默认使用：

- `DATA_DIR=/data`
- `DB_PATH=/data/tsukuyomi.db`

`/data` 会挂载到 Compose 命名卷 `tsukuyomi-data`，用于持久化 SQLite 数据库。

### 2. 启动

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:3280/api/health
```

常用维护命令：

```bash
docker compose logs -f tsukuyomi-space
docker compose restart tsukuyomi-space
docker compose down
docker compose pull
docker compose up -d --build
```

### 3. 备份与恢复 SQLite

备份运行中的容器数据库，会在 Docker 数据卷内生成 `/data/backups/*.db`：

```bash
docker compose exec -T tsukuyomi-space node - <<'NODE'
const fs = require('fs');
const Database = require('better-sqlite3');

(async () => {
  fs.mkdirSync('/data/backups', { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const target = `/data/backups/tsukuyomi-${stamp}.db`;
  const db = new Database('/data/tsukuyomi.db');
  await db.backup(target);
  db.close();
  console.log(`SQLite backup created: ${target}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
```

更保守的生产备份方式是在维护窗口暂停容器后复制卷内数据库：

```bash
docker compose stop tsukuyomi-space
docker run --rm -v tsukuyomi-space_tsukuyomi-data:/data -v "$PWD/backups:/backups" busybox \
  cp /data/tsukuyomi.db /backups/tsukuyomi-$(date +%Y%m%d-%H%M%S).db
docker compose start tsukuyomi-space
```

恢复数据库：

```bash
docker compose stop tsukuyomi-space
docker run --rm -v tsukuyomi-space_tsukuyomi-data:/data -v "$PWD/backups:/backups" busybox \
  cp /backups/your-backup.db /data/tsukuyomi.db
docker compose start tsukuyomi-space
```

如果 Compose 项目名不是目录名，卷名可能不是 `tsukuyomi-space_tsukuyomi-data`。可以用 `docker volume ls | grep tsukuyomi` 查看实际名称。

### 4. 从当前服务器迁移到 Docker

当前 PM2/Nginx 部署的数据通常在：

- 数据库：`/var/lib/tsukuyomi-space/tsukuyomi.db`
- 环境变量：`/etc/tsukuyomi-space/tsukuyomi-space.env`
- 额外音乐资源：`/var/www/tsukuyomi-space/assets/music/`，如果有

迁移步骤：

```bash
cd /var/www/tsukuyomi-space
cp .env.docker.example .env.docker
# 把旧 env 中的 JWT_SECRET、ADMIN_PASSWORD、SMTP/LLM/TTS/CORS 等值迁入 .env.docker
docker compose up -d --build
docker compose stop tsukuyomi-space
docker run --rm -v tsukuyomi-space_tsukuyomi-data:/data -v /var/lib/tsukuyomi-space:/host-data busybox \
  cp /host-data/tsukuyomi.db /data/tsukuyomi.db
docker compose start tsukuyomi-space
curl http://127.0.0.1:3280/api/health
```

确认 Docker 服务正常后，再决定是否停止旧 PM2/Nginx 服务。不要在同一端口同时暴露两套服务。

---

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
