# 部署指南

项目支持两种生产部署方式：

- Docker / Docker Compose：推荐用于后续迁移、复制环境和快速恢复。
- PM2 + Nginx：当前服务器使用的传统部署方式，仍然保留。

## Docker Compose 部署

Docker 是推荐部署方式。镜像构建阶段会安装依赖并构建 Vue 前端与 Live2D Studio 前端，运行时由 Express 同时提供 Vue 产物、静态资源和 `/api/` 接口。默认对外端口是 `3280`，容器内端口是 `3000`。

新的 Docker 流程遵循三个原则：

- 镜像只包含应用运行所需文件，`node_modules` 分为构建依赖和生产依赖两层。
- 依赖阶段包含 Python、make 和 C++ 编译器，在 SQLite 没有可用预编译包时从源码构建；依赖安装一次后裁剪开发依赖，编译工具不进入最终运行镜像。
- SQLite、上传附件和可选 Redis 数据都放在 Docker volume。
- 本地额外音乐、视频背景、独立音频和 `models/` 不进入构建上下文或镜像，使用只读挂载或独立对象存储。仓库中的前端图片和 `lib/` 运行库仍随镜像提供。

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

Room 记忆默认使用 SQLite 本地向量检索。2 GB 内存的服务器不要常驻 Milvus；SQLite 仍会保存、隔离并检索每个账号的长期记忆。资源充足且确实需要 Milvus 时，在 `.env.docker` 中配置访问密钥、`ROOM_MEMORY_VECTOR_BACKEND=milvus`、`MILVUS_ADDRESS=milvus:19530`，再启用可选 profile：

```bash
docker compose --profile milvus up -d --build
```

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
./assets/audio -> /app/assets/audio
./models       -> /app/models
```

启动时带上 override：

```bash
docker compose -f docker-compose.yml -f docker-compose.resources.yml up -d --build
```

`docker-compose.resources.yml` 是本机配置文件，不需要提交。音乐、视频、音频和模型已在 `.dockerignore` 中排除；挂载前应确认这些宿主机目录确实存在。镜像内同时包含前后端共同依赖的 `shared/`，缺少它会导致构建或启动失败。

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

PM2 部署会自动安装 `tsukuyomi-maintenance.timer`。它每小时检查并轮转 Docker、PM2 和应用日志，压缩系统日志，删除超过两天的部署临时包，并让数据库与部署归档各保留最近 10 份。可用以下命令检查状态：

```bash
systemctl status tsukuyomi-maintenance.timer
systemctl start tsukuyomi-maintenance.service
df -h /
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
- 备份方式：服务器有 `sqlite3` 时使用 `.backup`；没有时使用 `better-sqlite3` 的在线备份 API。不会分别复制正在写入的 DB/WAL/SHM 文件。

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

当前双站使用 `.github/workflows/deploy.yml`。推送 `main` 会在测试成功后发布；PR 只运行检查，不部署。检查环境固定为 Node 20.20.2，并使用 `npm ci` 安装锁定依赖。

正常更新只发布业务代码和中英文 web 产物。不要直接在生产目录执行 `git pull`、`git reset --hard`、`git clean`，也不要对站点根目录执行 `rsync --delete`。`deploy/deploy.sh` 禁止服务器构建 Live2D；既有资源的内容、权限和软链接必须保持原样。

国内 2 核 2 GB 主机使用轻量发布：构建、测试及依赖安装都在 CI；日常发布复用服务器现有 `node_modules`，不默认启用 `--environment-release`。修改构建脚本不会触发 `npm ci`。依赖、安装生命周期脚本或锁文件有变更时，必须另行安排环境发布，不能在日常发布中临时安装。

两站预检通过 `prepare-lightweight-release.sh` 在独立 systemd scope 内运行：内存高水位 384 MiB、硬上限 512 MiB、交换上限 128 MiB、最多一个 CPU 核、64 个任务，并设 5 分钟超时。需要 systemd 与可用的内存/CPU cgroup 控制器；无法建立限制会直接失败，不回退为无约束执行。发布的 Git 命令禁用自动 GC/maintenance，pack/index 使用单线程和较小缓存；既有全局 Git 配置不变。限制只覆盖发布预检，不改变正在运行的 API。服务器重启或资源不足时，先确认服务恢复再重试发布。

### 两站发布顺序

1. CI 完成应用测试、部署安全测试、Docker 构建和容器冒烟测试，以及 Playwright E2E；分别构建国内和海外前端。
2. 上传前端、Git bundle、`safe-release.py` 和轻量预检脚本至 `/tmp/tsukuyomi-prebuilt-<run>-<attempt>/`。
3. 两站都先运行 `prepare`，备份首页、记录资源校验清单，国内额外校验 Git 快进和服务器差异。任何预检失败都不激活站点。
4. 国内更新代码并重载 PM2，海外更新英文前端。先写入新的哈希文件，最后原子替换首页；同名哈希文件内容不一致时拒绝发布，旧资源不删除。
5. 校验两站 API 的 `status=ok`、HTTP 首页内容及入口引用的 JS/CSS 文件哈希，并复核受保护资源。HTTPS 检查通过 `--resolve` 直达本机 OpenResty，仍验证真实域名的 TLS 证书。
6. 任一步激活或验收失败，流水线尝试回退两站中已经激活的部分；恢复原代码、原首页、服务器补丁，并重载国内 PM2。无法连接服务器时不能保证自动回退成功，应按下方命令处理。

GitHub Actions 并非跨服务器的原子事务，两站更新之间存在短暂时间差。自动回退不写数据库、不删除新增哈希文件、不恢复或覆盖资源。数据库迁移、依赖锁文件、后端包清单或根包的依赖/运行时要求有变更时，此代码发布通道会直接拒绝，必须先完成单独的迁移或环境发布及对应恢复方案。代码发布也不会临时安装依赖，避免回退代码后仍使用已被替换的依赖。

### 保护范围与服务器补丁

国内保护整个 `assets/`、`lib/`、`models/`、`models-v3/`、`models-v4/`、`live2d-core.js`、`dist/live2d-studio/`、游戏资源目录，以及独立的 `/var/www/tsukuyomi-game-assets/`。只有脚本白名单中的代码、测试、文档和示例配置允许通过 Git 更新。重命名或删除保护路径同样会被拦截。

海外保留当前 `frontend` 软链接，保护其音乐、视频、音频、上传、模型、Live2D 和 `game-assets/` 路径。只接受 `index.html` 与 `assets/` 下一层带哈希的文件；不接受目录链接或资源子目录作为前端发布产物。

静态资源清单检查 SHA-256、大小、权限、UID/GID、修改时间和软链接目标。上传目录仍由业务服务实时写入，因此发布程序通过禁止代码覆盖和权限改写保护它，不对用户上传内容做静态一致性判定。生产 `.env`、数据库及用户数据不在代码更新白名单中。

服务器未提交的业务代码必须与即将发布的对应文件逐字节相同，才能由发布程序采用并纳入 Git；其他业务差异会阻止发布。既有保护资源的差异保持原状。原业务补丁和 Git index 会保存到发布状态目录，回退时恢复。

`backend/services/object-storage.js` 已纳入既有服务器上传选项：`inline`、`contentEncoding`、`cacheControl`、`publicRead`。默认调用行为保持不变，`publicRead` 的 OSS ACL 只在调用方显式传入 `true` 时添加；这些选项没有新增公开 HTTP 写入口。

代码发布不会自动替换 Nginx/OpenResty 配置、安装维护服务或更新海外翻译程序。修改这些文件后应走独立配置发布：备份当前文件、保持资源映射、验证配置，再重载对应服务。`--code-only` 会强制禁用构建和反向代理配置更新。

### 手工验收与回退

每次预检都在 `/var/backups/tsukuyomi-space/releases/<run>-<attempt>-<site>/` 保存独立 `release.py`、`state.json`、资源清单和首页备份；国内还保存原提交和服务器补丁。即使临时上传目录已清理，也可以使用该份脚本：

```bash
state=/var/backups/tsukuyomi-space/releases/实际运行编号-尝试次数-domestic
python3 "$state/release.py" verify --state "$state"
# 需要撤回此发布时执行；拒绝覆盖已被其他发布推进的 HEAD。
python3 "$state/release.py" rollback --state "$state"
```

海外将路径末尾改成 `overseas`，在海外机执行。资源检查失败时脚本会报告路径，但不会尝试覆盖资源来“修复”差异。上传目录中的实时数据和数据库都不会由此命令回退。

### 保留策略与本地验证

部署成功后，两台服务器分别清理已完成的发布状态及旧首页备份，每站每类保留最近 10 份；国内小时维护任务也运行同样的清理。`prepared` / `activating` 状态、无法识别的目录、软链接和人工文件不自动删除。新增哈希资源与游戏文件仍保留，不由此清理。

```bash
python3 deploy/prune-release-backups.py --retention 10
python3 -m unittest discover -s tests -p 'deployment_safety_test.py'
docker build --target runtime -t tsukuyomi-local-check .
bash tests/docker-smoke.sh tsukuyomi-local-check
```

部署测试在临时 Git 仓库中验证受保护路径拦截、服务器补丁采用与恢复、发布失败回退、海外软链接保留、资源元数据和备份保留。容器冒烟测试使用临时内存文件系统，不挂载生产目录，不暴露端口，测试结束自动删除测试容器。
