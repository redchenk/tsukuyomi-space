// 后台管理接口体量较大，先通过包装文件纳入 routes 目录。
// 后续可继续把文章审核、留言审核、系统设置拆成更小的后台子路由。
module.exports = require('../admin-routes');
