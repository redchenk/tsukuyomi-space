# 辉夜快跑：积分榜与长局稳定性

## 行为与边界

- `/api/growth/kaguya/leaderboard?page=1&limit=50` 每次最多返回 50 人，包含 `page`、`pageSize`、`total`、`totalPages` 和当前登录用户的排名。相同分数使用并列排名，跨页仍保持一致。
- 页面通过上一页、下一页读取榜单；失败保留已显示的榜单，过期请求会取消。保存分数只更新自己的最高分与排名，不重刷全榜。
- 原有登录、Origin/CSRF、限流与每日任务奖励仍生效。游戏分数来自客户端，本补丁不将它宣称为可信的反作弊数据。
- 游戏继续使用原 TurboWarp 项目及媒体。每一万分换关从固定浏览器计时器改为游戏引擎确认的重置、启动两个阶段，保留累计分数和当前心情值。死亡与手动重开会取消旧换关。
- 克隆数上限为 300，跑步速度上限为 14，启用编译器 warp timer。页面退出时移除钩子并停止游戏，避免后台残留。

## 构建与发布

`node scripts/build-kaguya-runtime.cjs <existing-r7.html> <output-directory>`

输入必须是现有 r7 导出的解压 HTML，SHA-256 必须为
`65e9088158219516cfb851ee196304d3a8e2aada4844e95870ab27b765539639`。
源文件及大媒体不纳入 Git。构建器只执行固定哈希来源的解码片段，并生成：

- `kaguya-run-ef04c26b4900-r8.html.gz`：游戏引擎与补丁。
- `kaguya-run-ef04c26b4900-r8.sb3.gz`：字节不变的原项目及媒体。

HTML 从约 96.2 MB 降到约 4.1 MB，原项目改为二进制加载，减少大段文本与 DOM 的解析和驻留。媒体仍约 73.6 MB，首次加载还需要网络传输及纹理解码；本补丁不承诺低内存设备绝无闪退。

在两站现有游戏资源目录仅新增以上版本文件，分别设置 `Content-Encoding: gzip`。HTML 使用现有 `game-security-headers.inc`；SB3 只对这一公开静态资源设置匿名 CORS，以支持不带 `allow-same-origin` 的隔离 iframe。不要给认证 API 增加通配 CORS，也不要扩大主站 CSP。

先配置并验收新资源，再使用现有 `safe-release.py` 发布预构建前端与后端源码；服务器不构建、不安装依赖、不提高服务内存上限。旧版本与 Live2D、音乐等目录均保留。

回滚时使用该发布的 `safe-release.py rollback --state <release-state>` 恢复应用，随后恢复发布前备份的 Nginx 配置、检查并 reload。保留新旧不可变媒体文件，避免破坏仍打开旧页面的用户。

## 验证

`npm run check:game`、`npm run test:game`；完整前端、安全及部署保护回归另行运行。无 npm 的 Node 22 环境可用 `node --run check:game`、`node --run test:game`。

隔离测试覆盖万人榜单分页、边界并列、失败保留、请求取消、账号切换、保存不重刷、换关确认停滞、死亡、重开和退出清理。真实 TurboWarp 引擎完成 200 次加速换关，模拟累计分数超过 200 万，脚本错误为 0，峰值 74 个克隆、165 个线程，速度保持在上限内。测试未向生产积分榜写入任何模拟分数。

另使用完整页面验证游戏加载和榜单翻页，在 390×844 视口检查移动布局。加速引擎测试与桌面浏览器移动视口不等于真实 iPhone 长时间游戏验收。
