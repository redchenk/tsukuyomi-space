# App 北京下载分发验收

2026-10-22，`downloads.yachiyo.hk` 已在阿里云北京 `39.105.82.189` 独立提供 HTTPS。App v0.6.27 起直接读取 `/releases.json`；国内和海外网站通过公开元数据接口获取同一目录，安装包与校验清单直接从北京站下载。

- 标准平台和鸿蒙 Release 均已发布，源码为 `0002da723611b0058d8d3353b765b0ddcbbc6a1c`。两次 `workflow_run` 自动分发成功：[基础包](https://github.com/redchenk/tsukuyomi-space-app/actions/runs/39797660034)、[完整补包](https://github.com/redchenk/tsukuyomi-space-app/actions/runs/39798886023)。
- GitHub 与北京站的 16 个文件均实际下载，大小、SHA-256 和两份校验清单完全一致。HTTP Range 首个 1 MiB 与原始 APK 字节一致。App 使用全新临时缓存检查、下载并校验 v0.6.27 IPA 成功。
- 北京站仅一个当前目录，总计约 2.3 GiB，无临时接收目录，v0.6.26 安装包地址返回 404。清理只针对专属分发目录。每次先完成校验，再原子切换并删除旧版本；失败保留当前目录。
- 北京原有 1,372 个项目/配置文件哈希及两个原有容器的身份、进程、启动时间均未改变。错误地址上先前创建的分发准备资源已按清单撤回。
- 下载站使用独立受限 SSH 账号和专用 CI 密钥。账号不可交互登录或端口转发；接收进程有内存、CPU 和时间限额。HTTPS 证书的专用自动续期定时器已开启，过慢的主动拉取定时器禁用。
- 网站构建提交 `33f54ab814b8aa018427183bf3a5efd88cc02cef`；国内仅部署一份备用版本 JSON 及 177 个前端文件，保留 191 个受保护文件、凭据及其他服务；海外仅部署 177 个前端文件。健康检查、文件哈希、受保护资源验证通过。
- 本地 31 项 Node 回归、4 项浏览器用例、12 项分发服务测试通过。线上两个站点在 390px、1280px 下六个平台均指向北京的 v0.6.27，无横向溢出。网站备用信息与北京目录归一化后的内容完全一致。

完整 App 发布证据在 [App 仓库验收记录](https://github.com/redchenk/tsukuyomi-space-app/tree/main/docs/qa/distribution-v0.6.27)。服务器同步维护方式见 [运行说明](../../deploy/app-distribution/README.md)。旧 App 需先升级一次才能切换检查来源；网站最多有五分钟缓存，旧页面需要刷新检查。iOS/HarmonyOS 包仍未签名，此次未做真机安装验收。
