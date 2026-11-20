const { contentFeatures } = require('../services/article-ranking');
const { routineReason, routineTitle } = require('../services/article-content-policy');
const { summarizeArticle } = require('../services/article-summary');

// Longer documents never need the placeholder check. Sitemap queries send at
// most one extra character to distinguish a complete candidate from a prefix.
const MAX_PLACEHOLDER_SOURCE = 1024;
function placeholderLabel(value) {
    const label = String(value || '').normalize('NFKC').trim();
    return !label || routineTitle(label) || /^(?:[\d\p{P}\s]+|([a-z\d])\1{1,8}|wu|暂无|无|测试)$/iu.test(label);
}

function articleNoindex(article) {
    if (article.category === '公告' || article.cover_image || article.cover_image_asset_id) return false;
    const content = String(article.content || '');
    if (content.length > MAX_PLACEHOLDER_SOURCE || /https?:\/\/|!\[|<img\b|<svg\b|\x60\x60\x60|\$\$/i.test(content)) return false;
    const features = contentFeatures(content, article.content_format);
    if (features.mediaCount || features.linkCount) return false;
    const text = features.text.trim();
    // Respect substantive headlines, captions and short creative pieces in any category.
    if (!placeholderLabel(article.title) || (!placeholderLabel(text) && !(article.category === '任务' && features.textLength === 1))) return false;
    const excerpt = String(article.excerpt || '').trim();
    if (excerpt && excerpt !== text && !placeholderLabel(excerpt) && !(article.category === '任务' && excerpt.length <= 2 && features.textLength === 1)) return false;
    return Boolean(routineReason({ ...article, features })) || placeholderLabel(text);
}

function articleSearch(article) {
    const noindex = articleNoindex(article);
    const name = article.author_nickname || article.author_username || '';
    const rawTitle = String(article.title || '文章').trim();
    const title = !noindex && rawTitle.length < 12 && name ? `${rawTitle}｜${name}的${article.category && !['任务', '其他'].includes(article.category) ? article.category : '作品'}` : rawTitle;
    const excerpt = summarizeArticle(article.excerpt, 'markdown');
    const rawBody = excerpt.length >= 100 ? '' : summarizeArticle(article.content, article.content_format);
    // Generated attachment filenames are useful identifiers in the editor only.
    const body = rawBody.replace(/\b[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\.(?:jpe?g|png|gif|webp|avif)\b/gi, '').trim();
    const parts = [excerpt];
    if (body.startsWith(excerpt)) parts[0] = body;
    else if (!excerpt.includes(body) && body !== '小标题') parts.push(body);
    let summary = parts.filter(Boolean).join(' · ');
    if (!noindex && name && (summary === rawTitle || summary.length < 20)) {
        summary = `${name}发布的《${rawTitle}》${article.cover_image || article.cover_image_asset_id ? '，含作品配图' : ''}。${summary === rawTitle ? '' : summary}`;
    }
    const description = Array.from(summary || rawTitle).slice(0, 170).join('');
    return { title, description, noindex };
}
module.exports = { articleSearch, articleNoindex, MAX_PLACEHOLDER_SOURCE };
