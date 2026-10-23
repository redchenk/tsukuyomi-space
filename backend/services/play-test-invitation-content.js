const { createHash } = require('node:crypto');
const policy = require('../../shared/play-testing.json');

// This exact link was supplied by the site owner. Do not accept an arbitrary
// URL or mail body from a browser or relax general campaign URL restrictions.
const actionUrl = 'https://play.google.com/apps/internaltest/4701667283312409674';
const subject = '月读空间 Android 内部测试邀请';
const actionLabel = '加入 Google Play 内部测试';
const body = `你好！感谢你报名体验月读空间。

本次邀请为 Google Play 内部测试，请按以下步骤加入：
1. 用报名时填写的 Google 账号打开下方邀请链接。
2. 在 Google 页面点击“成为测试者 / Become a tester”。
3. 加入成功后，点击页面中的 Google Play 下载入口，使用同一账号安装或更新月读空间。

欢迎体验八千代聊天、Live2D 和手机端功能，告诉我们性格是否鲜明、对话是否自然、前后文能否接上，以及卡顿或闪退等问题。不要求好评，参与自愿，可随时退出。

这是内部测试，不计入申请正式发布资格所需的封闭测试连续 14 天。后续如收到封闭测试邀请，需要先退出内部测试，再加入封闭测试。

若提示无法加入，请核对浏览器和 Play 商店是否使用报名邮箱；名单变更可能需要数小时生效。仍有问题，请联系 ${policy.contact}，附上提示和设备型号，不要提供密码、验证码或 API 密钥。聊天服务按应用内引导配置，是否收费以提供方为准，不必为参加测试购买服务。

报名与教程：https://yachiyo.hk/apply
如不希望再收到测试邀请，也可联系上述邮箱。

谢谢你的帮助！
月读空间`;
const version = createHash('sha256').update(JSON.stringify({ subject, body, actionUrl, actionLabel })).digest('hex');
module.exports = Object.freeze({ subject, body, actionUrl, actionLabel, version, track: 'internal' });
