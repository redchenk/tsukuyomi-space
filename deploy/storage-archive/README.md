# 国内站 OSS 备份归档

`archive.py plan` 统计可归档的数据库快照。范围是 `/var/backups/tsukuyomi-space` 内至少 1 MiB、修改时间已满 7 天的常规 `.db`、`.sqlite`、`.db.gz` 和 `.sqlite.gz` 文件。全站最近 3 份以及标准 deploy 目录最近 2 份留在本机。有非空 WAL 或回滚日志的文件跳过。线上数据库、用户上传目录与其他站点均在扫描范围外。

归档将含原相对路径的 tar 流压缩，再使用 OpenSSL CMS、RSA 接收方证书及 AES-256-GCM 加密。站点账号只传输密文。对象写入阿里云 OSS 的 `ops-archive/domestic-v1/`，使用私有 ACL。新上传的冷备份指定低频访问 IA，在线媒体继续使用原有存储策略。IA 可立即读取，取回按量计费。若 OSS 对象响应声明了到期删除时间，归档会保留本机文件。每个对象上传后检查匿名访问，从 OSS 重新读取并解密，将 SHA-256 和原始文件逐字节计算的摘要比对。核对源文件身份和时间后，原路径旁落盘 `.oss-archive.json` 回执。首轮可用 `verify --limit 1` 演练并保留原件，`offload` 会在验收完成后释放该本机副本。服务每小时处理至多 4 份。

其他旧版发布目录可由管理员使用 `--snapshot /var/backups/发布目录/快照.db` 逐个指定。此模式检查站点数据库表、静置时间和日志状态，定时任务继续只扫描站点专属备份目录。

## 在国内站恢复

以 root 身份运行，将目标写到有足够空间的空闲路径。现有文件受覆盖保护。

```sh
/usr/local/lib/tsukuyomi-archive/archive.py restore \
  --receipt /var/backups/tsukuyomi-space/RELEASE/before.sqlite.oss-archive.json \
  --output /path/to/recovered.sqlite
```

恢复 `.sqlite.gz` 回执时得到原始 gzip 文件。需要核查数据库时，可在隔离目录中解压，执行 SQLite `PRAGMA quick_check`。恢复生产数据库属于单独的运维操作。

## 异机恢复与维护

服务使用 `/etc/tsukuyomi-archive/recipient.pem` 和仅 root 可读的 `recovery.key`。应独立保管这对文件。生产系统重装时可以通过 OSS 控制台或具备该前缀读取权限的账号下载归档。即使原站回执丢失，密文仍包含经过认证的 tar 归档和原路径。在私有临时目录执行：

```sh
set -o pipefail
umask 077
openssl cms -decrypt -binary -inform DER -in backup.cms \
  -recip recipient.pem -inkey recovery.key | tar -tzf -
```

确认路径后，将末端命令替换为 `tar -xzOf - -- '归档内相对路径' > recovered.tmp`。只有整条流水线成功且摘要与可用回执一致时才采用该文件。恢复和证书轮换时须保留旧私钥。

安装位置为 `/usr/local/lib/tsukuyomi-archive/{archive.py,oss.cjs}`，脚本和目录由 root 管理。`/var/cache/tsukuyomi-archive` 属于 root，模式 0711，只临时保存单个密文。定时与运行结果可通过 `systemctl list-timers tsukuyomi-oss-archive.timer` 和 `journalctl -u tsukuyomi-oss-archive.service` 查看。原有磁盘维护仍负责用量告警。
