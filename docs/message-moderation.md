# 留言、评论与回复审核

广场留言、文章评论、回复以及用户编辑统一调用
`backend/services/message-moderation.js`。普通文本直接发布；关键词和站外链接
进入人工审核；活动标记、危险协议以及格式/长度无效的内容拒绝保存。

外链识别对无协议的候选域名检查真实顶级域，避免把中文句号连接的普通句子或
颜文字转换成 Punycode 后误报。`backend/data/domain-tlds.json` 是
[IANA 根区顶级域列表](https://data.iana.org/TLD/tlds-alpha-by-domain.txt) 的本地快照，
更新时保留来源和版本。审核请求不查询 DNS，也不调用外部服务。
显式 URL、IP 地址及保留用途域名仍接受外链检查；协议混淆、全角字符、中文域名、
伪造站内域名后缀和用户信息部分仍按真实主机检查。检查过程不改变保存的原文。

提交接口返回 `moderation: { status, reasons: [{ code, message }], nextStep }`，
同时保留原有 `message` 和 `data.status` 供旧客户端使用。待审记录已保存但不公开；
拒绝时不写入数据库且前端保留草稿。原因提示在表单附近持续显示，不仅显示短暂 toast。

`GET /api/messages/mine` 仅向当前登录用户返回待审原因，响应不缓存。
旧记录没有历史原因快照，因此此处明确标注“按当前审核规则说明”，不把重新计算
当作历史审核记录，也不自动发布旧的待审内容。用户修改后会重新审核；管理员的
人工确认、外链确认和并发审核保护仍按原流程执行。

验证：`tests/message-moderation.test.js` 覆盖真实接口及用户提供的假期原文；
`tests/e2e/message-moderation-feedback.spec.js` 覆盖手机端发布、拒绝保留草稿、
留言/评论/回复原因、用户中心回读和编辑后重审。
