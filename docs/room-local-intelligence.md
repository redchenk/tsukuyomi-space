# 本地语义记忆与好感度

本方案内置在项目中，面向国内 2 核 4 GB 主机。海外站继续使用国内 API，不运行第二份模型或数据库。聊天回复仍走用户原有模型；记忆向量、语义分类、重要度、置信度和八千代的互动进度只在服务器本地计算，不需要云端记忆密钥、Docker、Redis 或外置社区服务。

## 实际链路

1. `/api/room/chat/turn` 在一个 SQLite 事务内保存聊天、完整来源记忆及后台任务；不等待模型。
2. 单个后台 worker 读取持久任务，私有 Unix socket 调用 BGE-small-zh-v1.5 ONNX（512 维）。长来源分为 400 字、50 字重叠的向量片段，原文始终保留。
3. 内嵌 `mem0ai/oss@3.3.0` 使用本站原生向量适配器。sqlite-vec 的 `vec0` 按 `user_id` 分区，账号过滤在 KNN 内执行。没有全站向量读入 Node 内存，也没有在聊天请求中追赶索引。
4. 检索先召回语义片段，再结合关键词、重要度与证据置信度排序。原文库再次核验所有权和包含模型版本的来源摘要；编辑、删除及未完成的旧任务不能把旧文本重新注入。交给聊天模型的内容仍是有来源的 JSON 参考资料。
5. 分析复用同一个语义模型，与固定的语义样例比较；只保存能在用户原话中找到的证据。语义分类判断身份、健康安全、偏好、计划、临时情绪等，明确陈述、假设、引述、不确定和更正进一步影响评分。不会把助手说的话猜成用户事实。

分析使用有限类别和可解释的评分规则，不是另一个生成式聊天模型，也不是临床或心理判断。置信度是证据可靠等级，**不是经过统计校准的正确概率**。健康安全与长期身份一般优先于闲聊；“如果我……”和小说引述降低置信度。语义检索不保证每次都召回正确结果；仍保留原文检索、手动编辑及评分。历史旧记录的角色边界不如新结构化记录可靠，评分会保守处理（置信度上限 0.72），不会补发历史好感度。

手动编辑会退出自动评分，并撤销旧事实引用。单值姓名、生日更正按来源顺序生效，后台乱序处理也不会让旧身份覆盖新身份。其他类型保留带时间的原话，不把两种偏好强行合并为一个事实。

## 好感度

这是八千代的角色互动进度，与全站 Growth 经验及旧日记存档的可编辑数值独立。专属服务端事件按账号和稳定 turn ID 唯一记录，客户端不能提交分数。语义意图与原话中的感谢、关心、共同约定、信任表达共同决定每轮 0–2 点，每日北京时间最多 10 点；相同原话和重复调用不重复计分。重生成同一轮不会叠加奖励。

分数 0–1000，对应初次相识、渐渐熟悉、月下同行、相知相伴、月之眷属。悲伤、批评、拒绝、缺席不会扣分。阶段仅作为聊天语气的参考，不修改八千代原作身份，也不代表真人感情。房间设置可查看索引状态、分数、待分析数量、近期记录和评分原话。访客及选择“当前浏览器本地记忆”的用户不向账号上传新记忆；服务器进度不会用浏览器日记数值覆盖。

## 内存与网站优先

| 边界 | 配置 |
| --- | --- |
| 全部新后台服务 | `tsukuyomi-memory.slice`，MemoryHigh 512 MiB，MemoryMax **640 MiB**，MemorySwapMax **0** |
| 向量与分析服务 | 独立进程，MemoryMax 448 MiB，ONNX 单线程，关闭 CPU arena，SQLite cache 4 MiB |
| worker | 单进程、串行任务，Node heap 96 MiB、MemoryMax 160 MiB |
| CPU | 合计最多 75% 的一个 CPU，低调度优先级和 CPUWeight；网站在 slice 外 |
| 执行前检查 | MemAvailable 至少 768 MiB，1 分钟负载小于 1.5；不足时暂停后台任务 |
| 请求 | 最多两个语义检索、最多四个私有服务连接，模型请求及响应最多 256 KiB |
| 索引 | 每次小批次持久游标，编辑任务合并，失败最多六次指数退避，崩溃租约两分钟后恢复 |

这些是内核硬上限，不只是 PM2 超过 RSS 后重启。后台服务超限只会在自己的 cgroup 中被停止，网站随后使用有界原文检索。所有索引都可从主库重建；无须清空用户记忆。后台暂不可用时最多读取近期 120 条来源，并明确显示降级；此时尚未索引的很早记忆可能暂时无法语义召回。

硬上限限制的是这次新增的服务，不能保证其他管理员启动的任意进程永远不耗尽整台主机内存。保留现有 API 堆上限及系统监控，避免与网站争抢资源。实测后舍弃了本机每秒约 0.5 token、常驻约 800 MiB 的生成式分析模型，使用同一个小型语义模型完成证据分类。

## 安装与启用

依赖 Linux/systemd、Python 3.10+（生产为 3.12，需 `python3-venv`）及现有 Node 20 项目依赖。模型不放入 Git；下载清单固定版本及 SHA-256，Python 包通过官方 PyPI 哈希锁定。第一次安装仅下载约 95 MB 的语义权重及 CPU 运行库，不编译或加载 PyTorch。

```sh
sudo systemd-run --scope --quiet \
  -p MemoryMax=448M -p MemorySwapMax=0 -p CPUQuota=75% \
  python3 deploy/install-room-local-memory.py
```

也可先下载 `backend/local-memory/models.manifest.json` 中的文件，再指定 `--asset-dir` 进行离线校验安装。安装器不启用服务。先按本站轻量发布流程备份数据库与代码、发布代码、由 API 执行 migration 041，再复制以下 unit：

```sh
sudo install -m 644 deploy/tsukuyomi-memory.slice /etc/systemd/system/
sudo install -m 644 deploy/tsukuyomi-memory-vector.service /etc/systemd/system/
sudo install -m 644 deploy/tsukuyomi-memory-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
```

在原来的 `/etc/tsukuyomi-space/tsukuyomi-space.env` 中设置 `.env.example` 的 `ROOM_LOCAL_INTELLIGENCE=true` 和三个本地路径；保留其他设置及密钥。API 和 worker 使用同一个主库路径。然后：

```sh
sudo systemctl enable --now tsukuyomi-memory-vector tsukuyomi-memory-worker
# 用项目现有 PM2 发布配置加载更新后的环境，不在生产编译前端。
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
npm run verify:memory-local
```

socket 为 `0600`，只允许应用用户访问；向量服务没有 TCP 端口，并禁止 Internet 地址族。worker 也禁止非本机出站，不会用用户提供的 URL 下载模型或提交记忆。迁移新增任务、索引引用、分析证据、事实与好感度事件表，不改既有聊天或媒体数据。

验收脚本使用临时主库、随机的模拟账号及真实本地向量服务，验证很早的原话能通过不同措辞召回、评分、好感度、账号隔离和编辑撤销，并清理自己的索引。不会创建真实网站账号或打印私有对话。运行时须有权限访问私有 socket，可用应用用户在受限 systemd scope 内执行。单元回归：`npm run test:memory`；语法：`npm run check:memory-local`。

## 运维与回滚

查看 `systemctl show tsukuyomi-memory.slice -p MemoryCurrent -p MemoryPeak` 与两个 service 的状态；主机 `/proc/meminfo` 和网站 health 响应同时核验。任务日志仅有固定组件名、错误码、次数和下次重试时间，不打印聊天、向量、账号、Cookie 或密钥。设置页可为当前账号重试最多 100 个失败索引任务和 20 个分析任务；所有写请求继续使用网站鉴权、Origin 与 CSRF 保护。

备份主数据库及向量库（通过 SQLite online backup，不要只复制一个正在写入的 `.db` 文件）。索引丢失时停 worker，修复/重建向量库，重置 `room_local_state` 中的 `backfill-rowid`，再启动服务，小批补建。失败删除任务保留到成功清理，不因重启丢失。完成/取消分析的冗余记录按日有界清理，原话仍在来源记忆中。

紧急回滚：将 `ROOM_LOCAL_INTELLIGENCE=false`，按现有发布配置重新加载 API，停止这两个 service，再用轻量发布备份回滚代码和前端。migration 041 的附加表可暂时保留，不删主库、不删除原始记忆、不动 Live2D/音乐/OSS 资源。索引删除与手动评分不会被旧后台任务覆盖。

## 致谢

[Mem0](https://github.com/mem0ai/mem0)、[BGE/智源研究院](https://huggingface.co/BAAI/bge-small-zh-v1.5)、[Qdrant 的 ONNX 导出](https://huggingface.co/Qdrant/bge-small-zh-v1.5)、[ONNX Runtime](https://github.com/microsoft/onnxruntime)、[sqlite-vec](https://github.com/asg017/sqlite-vec)。本站使用 Mem0 的原生存储契约，未使用会丢弃过滤条件的通用 LangChain 向量封装，也不使用 Mem0 云端服务。
