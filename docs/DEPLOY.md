# 部署指南

项目支持两种生产部署方式：

- Docker / Docker Compose：推荐用于后续迁移、复制环境和快速恢复。
- PM2 + Nginx：当前服务器使用的传统部署方式，仍然保留。

## Docker Compose 部署

Docker 是推荐部署方式。镜像构建阶段会安装依赖并构建 Vue 前端与 Live2D Studio 前端，运行时由 Express 同时提供 Vue 产物、静态资源和 `/api/` 接口。默认对外端口是 `3280`，容器内端口是 `3000`。

新的 Docker 流程遵循三个原则：

- 镜像只包含应用运行所需文件，`node_modules` 分为构建依赖和生产依赖两层。
- SQLite、上传附件和可选 Redis 数据都放在 Docker volume。
- 本地额外音乐、视频背景、Live2D 模型等大资源不强制打进镜像，推荐用只读挂载或独立对象存储。

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
- `TSUKUYOMI_HTTP_PORT=3280`

`/data` 会挂载到 Compose 命名卷 `tsukuyomi-data`，用于持久化 SQLite 数据库。`/app/assets/uploads` 会挂载到 `tsukuyomi-uploads`，避免用户上传文件跟随容器生命周期丢失。

### 2. 启动

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:3280/api/health
```

如果需要 Redis 存储验证码、限流、天气缓存和 token 黑名单：

```bash
# .env.docker
REDIS_URL=redis://redis:6379/0

docker compose --profile redis up -d --build
```

### 3. 挂载本地大资源

如果服务器本地有额外音乐、视频背景或 Live2D 模型，不要把它们复制进镜像。复制 override 示例后再按实际目录调整：

```bash
cp docker-compose.resources.example.yml docker-compose.resources.yml
```

默认示例会把这些目录只读挂进容器：

```yaml
./assets/music -> /app/assets/music
./assets/video -> /app/assets/video
./models       -> /app/models
```

启动时带上 override：

```bash
docker compose -f docker-compose.yml -f docker-compose.resources.yml up -d --build
```

`docker-compose.resources.yml` 是本机配置文件，不需要提交。这样本地资源不会被 Docker 构建上下文打包，也不会被部署脚本删除。

### 4. 推荐更新流程

推荐使用脚本自动做“备份 -> 构建 -> 启动 -> 健康检查”：

```bash
bash deploy/docker-deploy.sh
```

如果存在 `docker-compose.resources.yml`，脚本会自动带上它。服务已经在运行时，脚本会先调用 `deploy/docker-backup.sh` 在线备份 SQLite，再更新容器。

默认情况下脚本会优先使用本机已有基础镜像和构建缓存，适合网络不稳定的服务器。需要强制拉取最新基础镜像时：

```bash
PULL_BASE_IMAGES=true bash deploy/docker-deploy.sh
```

常用维护命令：

```bash
docker compose logs -f tsukuyomi-space
docker compose restart tsukuyomi-space
docker compose down
docker compose build --pull tsukuyomi-space
docker compose up -d --remove-orphans tsukuyomi-space
```

### 5. 备份与恢复 SQLite

在线备份：

```bash
bash deploy/docker-backup.sh
```

备份文件会先通过 SQLite backup API 写到容器 `/data/backups/`，再复制到宿主机 `./backups/`。

也可以手动备份运行中的容器数据库：

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

如果 Compose 项目名不是目录名，卷名可能不是 `tsukuyomi-space_tsukuyomi-data`。可以用 `docker volume ls | grep tsukuyomi` 查看实际名称，或者优先使用 `deploy/docker-backup.sh` 和 `docker compose cp` 避免手写卷名。

### 6. 从当前服务器迁移到 Docker

当前 PM2/Nginx 部署的数据通常在：

- 数据库：`/var/lib/tsukuyomi-space/tsukuyomi.db`
- 环境变量：`/etc/tsukuyomi-space/tsukuyomi-space.env`
- 额外资源：`/var/www/tsukuyomi-space/assets/music/`、`assets/video/`、`models/`，如果有本地扩展

迁移步骤：

```bash
cd /var/www/tsukuyomi-space
cp .env.docker.example .env.docker
# 把旧 env 中的 JWT_SECRET、ADMIN_PASSWORD、SMTP/LLM/TTS/CORS 等值迁入 .env.docker
# 如果要保留本地大资源：
cp docker-compose.resources.example.yml docker-compose.resources.yml
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
- 部署备份目录：`BACKUP_DIR`，默认是 `/var/backups/tsukuyomi-space/deploy`。
- 数据库历史备份目录：`DATABASE_BACKUP_DIR`，默认是 `DATA_DIR/backups`。
- 备份保留数量：`BACKUP_RETENTION`，默认每个目录保留最新 10 份。
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
