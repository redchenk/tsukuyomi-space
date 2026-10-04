# 配色与网站图标的轻量发布

常规发布继续使用 deploy/safe-release.py 和 prepare-lightweight-release.sh。
构建国内与海外前端在本地完成，不在服务器执行 npm install 或 Vite。
prepare 阶段沿用 MemoryHigh=384M、MemoryMax=512M、CPUQuota=100% 等限制。

网站图标属于一次明确授权的品牌资源更新，使用可选参数
`--brand-artifact /tmp/<release>/brand`。目录必须只包含以下六个文件：

- favicon.ico
- site.webmanifest
- assets/icons/icon-32.png
- assets/icons/icon-180.png
- assets/icons/icon-192.png
- assets/icons/icon-512.png

每个文件不得超过 1 MiB，图片必须具有正确的 PNG/ICO 头，manifest 必须
是 JSON 对象。禁止符号链接、其他文件和额外目录。国内站要求文件与目标
Git 提交一致，服务器当前品牌文件必须与原提交一致，否则停止发布。

默认不带参数时，图标仍属于受保护/未管理路径，不允许代码发布修改。
传入参数仅放行这六个文件，不放行整个 assets 目录。其他图标、Live2D、
音乐、模型、上传、独立游戏、Wiki 图片和生产未提交资源仍按原规则验证。

prepare 保存原文件与前后 SHA-256；activate 复核链接、源文件和目标文件，
然后原子替换。Git 使用快进更新，不重置整个生产工作区。前端新增哈希资源
先上传，index.html 最后切换。旧哈希文件保留供缓存客户端及回滚使用。
verify 同时检查 HTTPS 可访问性、前端入口、图标内容哈希及受保护资源。

回滚使用该发布备份目录中的 release.py：

```sh
python3 /var/backups/tsukuyomi-space/releases/<release>-<site>/release.py rollback \
  --state /var/backups/tsukuyomi-space/releases/<release>-<site>
```

回滚恢复旧入口、仅允许的源代码路径和六个品牌文件；之前不存在的品牌文件
只删除本次新增的对应文件，不清理其他资源。检测到新的人工改动、较新发布
或符号链接变化时拒绝覆盖。国内先回滚代码/图标，海外随后回滚前端/图标。

2026-10-04 的品牌图标来自用户提供的「樱伞下的白发少女-5」。HTML、
根目录兼容图标继续保留 sakura-20261004 标记；构建入口中的 favicon、
Apple 图标、PWA manifest 及其图标使用 Vite 内容指纹路径。实测国内 CDN
忽略图标查询参数，所以发布验收须验证入口实际引用的指纹文件，而非只检查
`?v=`。根目录旧图标缓存可在 CDN 控制台做指定 URL 刷新，但不影响新入口
使用新图标。原始素材及压缩说明见
src/frontend/assets/sakura/README.md。回归测试覆盖显式放行、媒体拒绝、
产物/提交不一致、准备后被改动、符号链接、较新图标和两站恢复路径。
