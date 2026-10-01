# Fushi 专用海外出站通道（待批准启用）

网站 MCP 入口、SQLite、OAuth、通知和回复事务继续留在现有网站。只为 Fushi 的 challenge 和 webhook 增加可选 TCP 出站通道；没有第二套社区服务，没有新增 Redis、HTTP 代理、公开端口或常驻连接。默认 `FUSHI_EGRESS_MODE=direct`，必须批准新凭证后才能启用 SSH 模式。

## 为什么需要

2026-10-01 16:22:56 的真实 `events/subscribe` 关联 ID 为 `93f6c672-0bc2-4fe0-821f-761f7729a99e`。参数与 DNS 校验通过，真实平台目标为 `connectors.api.openai.com:443`，国内 IPv4 等满现有 10 秒预算仍未建立连接，IPv6 返回 `ENETUNREACH`，没有进入 TLS 或 challenge，订阅未保存。国内默认 DNS 与海外 HTTPS DNS 结果不一致；国内固定 HTTPS DNS 提供的地址后 TCP 可建立，但 TLS 在约 113 ms 被重置。海外同一域名完成证书校验并得到 404。404 只证明根路径 HTTPS 可达，不证明 challenge、签名或订阅已经成功。

此前已确认网站入口 CDN 原为仅中国内地，控制台当前已显示全球，海外无授权 MCP 探测由 TCP 超时恢复为正常 401。入口恢复和回调出站是两条链路，不能混用验收结果。

## 传输与权限

网站每次需要回调时启动一个 `/usr/bin/ssh` 子进程，使用专用普通账号及已固定的海外 SSH 主机密钥。关闭密码、交互提示、agent forwarding 和 shell 参数继承。海外强制命令只运行 [Python 标准库转发端](../deploy/fushi-egress-worker.py)，客户端不能选择远程命令、账号身份或任意目的端口。

唯一控制信息为平台提供的 hostname 和端口 443。海外端仅允许管理员在 `/etc/tsukuyomi-fushi-egress/hosts.json` 中登记的域名；初始条目来自本次实际平台请求的 `connectors.api.openai.com`，不是猜测 dot 地址，也没有固定 callback URL、路径或 CDN IP。完整 DNS 答案先校验；任一内网、环回、保留或转换地址均拒绝。国内再校验整个返回快照，连接必须属于该快照，海外连接不重新解析；最多尝试八条记录、同时两条候选 TCP。

海外端只转发不透明的 TLS 字节。原主机名、SNI、证书验证、HTTPS 请求、challenge 回声、Standard Webhooks 签名以及 10 秒全流程预算仍由国内网站处理。完整 callback URL、正文及签名不会作为明文控制参数或日志发给转发端，平台签名密钥不会离开国内网站。国内每进程最多两个 SSH 子进程；海外单次最多 12 秒、每方向最多 768 KiB，失败关闭，不降级到不安全解析、明文 HTTP 或忽略证书。

## 请求批准的新增配置

| 新增项 | 用途和权限 | 有效期 | 撤销 |
| --- | --- | --- | --- |
| 国内专用 Ed25519 私钥 | API 运行用户仅能请求海外强制转发命令；不使用现有 root/deploy 密钥 | 持续使用期间有效，不要求手动刷新；安全事件时撤销 | 删除海外对应公钥、关闭 `FUSHI_EGRESS_MODE=ssh`，必要时替换密钥 |
| 海外普通账号 `fushi-egress` 与强制命令 | 只允许来自国内固定公网 IP 的专用公钥；无 shell、SFTP、TTY、任意 SSH 端口转发或管理权限 | 配置存在期间 | 删除对应公钥或专用 Match 配置；账户可保留停用 |
| 固定 SSH 主机公钥文件 | 防止中间人替换海外服务器 | 现有服务器主机身份存续期间 | 经站长核验更换服务器时更新；身份变更不会自动接受 |
| 允许的目标域名与资源上限 | 限制出站目的端口与最大负载 | 配置存在期间 | 删除域名或停止通道；平台更换域名时先核实再调整 |

这是独立于 Fushi OAuth 的服务器传输凭证，不增加助手的网站 scope。批准前不生成或安装长期密钥、不新增海外账号、不写入生产 SSH 安全配置，也不启用新模式。真实密钥只在服务器生成，保存在 API 用户独享的 `0400` 文件；根目录由 root 控制，公钥和主机密钥可读但不可由运行用户修改。代码、文档、聊天和日志不保存真实私钥。

## 批准后的上线顺序

1. 按既有轻量发布流程发布应用代码，保留 SQLite、Live2D、音乐和上传目录；不用服务器 npm install 或编译。
2. 海外使用已有 `/usr/bin/python3`，仅复制已校验的 worker（不安装运行时或依赖），文件由 root 持有且普通账号不可写。
3. 新建无密码普通账号。专用 `AuthorizedKeysFile` 由 root 控制；公钥选项为 `from="<国内公网IP>",restrict`。配置专用 `Match User fushi-egress`，固定 `ForceCommand /usr/bin/python3 -I -u <worker路径>`，禁用密码、键盘交互、TTY、agent、X11、TCP/Unix socket 转发、用户 rc 和 tunnel。不改变现有 root/管理用户规则。先 `sshd -t`，再 reload。
4. 海外专用用户 slice 限制内存 128 MiB、CPU 25%、Tasks 16；不是修改全机或已有网站上限。国内继续原 heap 192 MiB / API RSS 384 MiB，并限制最多两个短时 SSH 子进程。
5. 先以 API 运行身份完成无授权、无 challenge 的真实 HTTPS 根路径检查，核对证书、清理及上限；随后仅将 Fushi 模式切为 SSH，OAuth 的 issuer、resource、用户绑定、scope 和现有授权不变。
6. 让平台提供真实订阅，确认参数→回调→持久化全部成功，再用新的真实互动验证 signed webhook→dot→一次站内幂等回复→查询。历史 1122 已由 1123 回答，禁止重发。接收与助手完成处理分开验收。

若新模式失败，恢复 `FUSHI_EGRESS_MODE=direct` 并按现有方式重启 API，移除对应公钥即可切断新增通道；不覆盖数据库，不丢弃正常留言，不动现有媒体或 root 管理入口。回滚网络模式不代表国内原回调链路已经可用。

## 验证

`npm run check:fushi`、`npm run test:fushi` 覆盖配置约束、主机密钥/凭证文件保护、私网与混合 DNS、固定地址、原 TLS 主机校验、SSH 退出与取消清理、控制帧大小/重复字段、错误端口和超量字节。修改共享 URL 安全模块后另运行 `npm run test:api`。临时真实出站探测使用既有 SSH 授权，不创建生产账号/凭证、不发帖、不创建事件订阅；真实平台闭环须单独验收。

2026-10-01 验证结果：语法检查通过；99 项 Node Fushi 测试、10 项 Python 转发测试通过；246 项 API 测试及审核脚本通过。临时真实探测在海外使用已有 `nobody` 运行身份，不安装账号或密钥；通过完整控制帧和 TLS 字节通道，以原域名完成证书验证，得到 `404 / tls_verified: true`，总耗时 5122 ms。未发送真实签名或 challenge。生产模式仍为 direct、订阅为零，因此不宣称 dot 唤醒或回复链路已完成。
