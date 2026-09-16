const { summarizeArticle, MAX_SUMMARY_INPUT } = require('../services/article-summary');

// Mounted behind the existing user/admin authentication middleware. No content is saved.
module.exports = function sendArticleSummary(req, res) {
    const { content, content_format = 'markdown' } = req.body || {};
    res.set('Cache-Control', 'no-store');
    if (typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({ success: false, message: '请先填写正文' });
    }
    if (content.length > MAX_SUMMARY_INPUT) {
        return res.status(413).json({ success: false, message: '正文过长，请手动填写摘要' });
    }
    if (!['markdown', 'html', 'block'].includes(content_format)) {
        return res.status(400).json({ success: false, message: '不支持的正文格式' });
    }
    const excerpt = summarizeArticle(content, content_format);
    if (!excerpt) {
        return res.status(422).json({ success: false, message: '正文中没有可提取的文字，请手动填写摘要' });
    }
    return res.json({ success: true, data: { excerpt } });
};
