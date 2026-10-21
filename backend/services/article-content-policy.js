const { contentFeatures } = require('./article-ranking');
const TASK_CATEGORY = '任务';
const normalize = value => String(value || '').normalize('NFKC').replace(/[\p{Cf}\uFE0F]/gu, '').trim();
const intent = /^(?:(?:每日|每天|今日|今天|日常|依旧|为了|完成|做个?|来个?|纯|新手|第[\d一二三四五六七八九十百]+天)\s*)*(?:签到|簽到|打卡|一签|一簽|任务|任務)(?:(?:打卡|签到|没事|完成|罢了|而已|记录|帖|贴|一下|啊|呀|呢|哦|啦|捏)|[\s\d\p{P}\p{S}])*$/u;
function routineTitle(title) {
    const value = normalize(title);
    return intent.test(value)
        || /^(?:每日|今日|日常)?任务(?:让我|要我|要求我|需要|要求)?(?:发|发布)(?:一篇)?(?:文章|帖子)[!！~～。]*$/u.test(value)
        || /^(?:留[一一个]*)?(?:打卡|签到){1,2}(?:的)?(?:楼|帖|贴|记录)[!！~～。]*$/u.test(value);
}
function routineReason(article = {}) {
    const category = normalize(article.category);
    if (['任务', '签到', '簽到', '打卡'].includes(category)) return 'task_category';
    if (category === '公告') return '';
    if (routineTitle(article.title)) return 'task_title';
    // Do not mistake short captions, drawings or downloadable works for empty posts.
    if (article.content === undefined && !article.features) return '';
    const f = article.features || contentFeatures(article.content, article.content_format || article.contentFormat);
    if (f.mediaCount || f.linkCount || f.textLength > 80) return '';
    const text = normalize(f.text).replace(/[*_`~]/g, ''), title = normalize(article.title);
    if (routineTitle(text) || /^(?:只是|就是|只是一[帖篇])?(?:做个?)?任务(?:罢了|而已)?[!！~～。]*$/u.test(text) || /^成长经验到账/u.test(text)) return 'task_body';
    if (!text) return /^(?:无|無|标题|标题躲起来啦|这是标题|[\d\p{P}\p{S}]+)$/u.test(title) ? 'empty_placeholder' : '';
    // A clear question in the title can be the substance of a short discussion.
    if ([...title].length >= 8 && /[?？]|怎么|怎麼|如何|是否|能否|吗|嗎/u.test(title)) return '';
    if (f.textLength === 1 || /^[\p{P}\p{S}\s]+$/u.test(text) || /^([\p{L}\p{N}])\1{1,19}$/u.test(text)) return 'single_character';
    if (/^(?:无|無|wu|暂无|没有内容|test|测试)$/i.test(text)) return 'placeholder';
    if (/^(?:列表项|分享正文|小标题|正文|这是正文|内容)$/u.test(text) && /^(?:无|無|标题|这是标题|[\d\p{P}\p{S}]+)$/u.test(title)) return 'editor_placeholder';
    return '';
}
module.exports = { TASK_CATEGORY, routineTitle, routineReason };
