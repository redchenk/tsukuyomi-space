const crypto = require('crypto');
const config = require('../config');
const articleRepository = require('../repositories/article-repository');
const assetRepository = require('../repositories/asset-repository');
const messageRepository = require('../repositories/message-repository');
const pixelArtRepository = require('../repositories/pixel-art-repository');
const statsRepository = require('../repositories/stats-repository');
const responseCache = require('./response-cache');
const { articlePath } = require('../seo/render-article');

const CACHE_PREFIX = 'public:site-feed';
const CACHE_TTL_MS = 15000;
const SITE_NAME = '\u6708\u8bfb\u7a7a\u95f4';
const TYPE_LABELS = {
    announcement: '\u516c\u544a',
    article: '\u6587\u7ae0',
    gallery: '\u56fe\u5e93',
    pixel: '\u50cf\u7d20\u753b',
    plaza: '\u7559\u8a00'
};

function cleanText(value, limit = 240) {
    return String(value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
        .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
        .replace(/[#>*_`~|]/g, ' ')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, limit);
}

function isoTimestamp(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(raw)
        ? `${raw.replace(' ', 'T')}Z`
        : raw;
    const timestamp = Date.parse(normalized);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

function absoluteUrl(pathname) {
    const value = String(pathname || '').trim();
    if (/^https?:\/\//i.test(value)) return value;
    return `${config.publicSiteUrl}${value.startsWith('/') ? value : `/${value}`}`;
}

function makeItem({ id, type, title, summary, author, publishedAt, url, category = '' }) {
    return {
        id: `${type}:${id}`,
        type,
        typeLabel: TYPE_LABELS[type] || type,
        title: cleanText(title, 120),
        summary: cleanText(summary, 320),
        author: cleanText(author, 80),
        category: cleanText(category, 40),
        publishedAt: isoTimestamp(publishedAt),
        url: absoluteUrl(url)
    };
}

function articleItems(limit) {
    return articleRepository.listRecentPublishedArticles(limit).map(article => makeItem({
        id: article.id,
        type: article.category === '\u516c\u544a' ? 'announcement' : 'article',
        title: article.title,
        summary: article.excerpt,
        author: article.author_username || SITE_NAME,
        category: article.category,
        publishedAt: article.updated_at || article.created_at || article.publish_date,
        url: articlePath(article)
    }));
}

function plazaItems(limit) {
    return messageRepository.listRecentPublicMessages(limit).map(message => makeItem({
        id: message.id,
        type: 'plaza',
        title: `${message.author || '\u8bbf\u5ba2'}\u7684\u7559\u8a00`,
        summary: message.content,
        author: message.author,
        publishedAt: message.updated_at || message.created_at,
        url: `/plaza#msg-${message.id}`
    }));
}

function galleryItems(limit) {
    return assetRepository.listGalleryAssets({ limit, offset: 0 }).map(asset => {
        const metadata = asset.metadata || {};
        return makeItem({
            id: asset.id,
            type: 'gallery',
            title: metadata.title || metadata.fileName || '\u56fe\u5e93\u65b0\u4f5c\u54c1',
            summary: metadata.description || '\u56fe\u5e93\u6536\u5f55\u4e86\u65b0\u4f5c\u54c1',
            author: metadata.author || SITE_NAME,
            publishedAt: asset.updated_at || asset.created_at,
            url: '/gallery'
        });
    });
}

function pixelItems(limit) {
    return pixelArtRepository.listArtworks({ sort: 'latest', limit, offset: 0 }).items.map(artwork => makeItem({
        id: artwork.id,
        type: 'pixel',
        title: artwork.title,
        summary: artwork.description || '\u516c\u5f00\u50cf\u7d20\u753b\u5eca\u7684\u65b0\u4f5c\u54c1',
        author: artwork.author || SITE_NAME,
        publishedAt: artwork.updated_at || artwork.created_at,
        url: `/pixel?art=${encodeURIComponent(artwork.id)}#pixel-art-${encodeURIComponent(artwork.id)}`
    }));
}

function itemTime(item) {
    return Date.parse(item.publishedAt || '') || 0;
}

function buildSiteFeed(limit = 20) {
    const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 20, 30));
    const sectionLimit = Math.min(8, safeLimit);
    const articleCount = articleRepository.listArticles({ limit: 1, offset: 0 }).total;
    const galleryCount = assetRepository.countGalleryAssets();
    const pixelPayload = pixelArtRepository.listArtworks({ sort: 'latest', limit: 1, offset: 0 });
    const views = statsRepository.publicViewCounters();
    const items = [
        ...articleItems(sectionLimit),
        ...plazaItems(sectionLimit),
        ...galleryItems(Math.min(5, sectionLimit)),
        ...pixelItems(sectionLimit)
    ]
        .filter(item => item.title && item.publishedAt)
        .sort((first, second) => itemTime(second) - itemTime(first) || second.id.localeCompare(first.id))
        .slice(0, safeLimit);
    const updatedAt = items[0]?.publishedAt || isoTimestamp(config.siteLaunchedAt) || new Date(0).toISOString();

    return {
        version: 1,
        site: {
            name: SITE_NAME,
            url: config.publicSiteUrl,
            status: 'online',
            timezone: 'Asia/Hong_Kong'
        },
        updatedAt,
        stats: {
            articles: articleCount,
            galleryItems: galleryCount,
            pixelArtworks: pixelPayload.total,
            plazaMessages: statsRepository.messageCount(),
            users: statsRepository.userCount(),
            todayVisitors: views.today || 0,
            totalVisitors: views.total || 0
        },
        feeds: {
            json: absoluteUrl('/api/site-feed'),
            rss: absoluteUrl('/api/site-feed/rss'),
            rssAlias: absoluteUrl('/feed.xml')
        },
        items
    };
}

function getSiteFeed(limit = 20) {
    const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 20, 30));
    return responseCache.remember(`${CACHE_PREFIX}:${safeLimit}`, CACHE_TTL_MS, () => buildSiteFeed(safeLimit));
}

function invalidateSiteFeed() {
    responseCache.delPrefix(CACHE_PREFIX);
}

function feedEtag(feed, format = 'json') {
    const digest = crypto.createHash('sha256').update(`${format}\n${JSON.stringify(feed)}`).digest('base64url').slice(0, 20);
    return `"site-feed-${digest}"`;
}

function xmlEscape(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function rssDate(value) {
    const timestamp = Date.parse(String(value || ''));
    return Number.isFinite(timestamp) ? new Date(timestamp).toUTCString() : '';
}

function toRss(feed) {
    const items = feed.items.map(item => [
        '    <item>',
        `      <title>${xmlEscape(`[${item.typeLabel}] ${item.title}`)}</title>`,
        `      <link>${xmlEscape(item.url)}</link>`,
        `      <guid isPermaLink="false">${xmlEscape(item.id)}</guid>`,
        item.publishedAt ? `      <pubDate>${xmlEscape(rssDate(item.publishedAt))}</pubDate>` : '',
        item.category || item.typeLabel ? `      <category>${xmlEscape(item.category || item.typeLabel)}</category>` : '',
        `      <description>${xmlEscape([item.summary, item.author ? `\u4f5c\u8005\uff1a${item.author}` : ''].filter(Boolean).join(' | '))}</description>`,
        '    </item>'
    ].filter(Boolean).join('\n'));

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        '  <channel>',
        `    <title>${xmlEscape(`${SITE_NAME}\u6700\u65b0\u52a8\u6001`)}</title>`,
        `    <link>${xmlEscape(feed.site.url)}</link>`,
        `    <atom:link href="${xmlEscape(feed.feeds.rss)}" rel="self" type="application/rss+xml" />`,
        `    <description>${xmlEscape(`${SITE_NAME}\u516c\u544a\u3001\u6587\u7ae0\u3001\u7559\u8a00\u3001\u56fe\u5e93\u4e0e\u50cf\u7d20\u753b\u7684\u6700\u65b0\u516c\u5f00\u52a8\u6001`)}</description>`,
        '    <language>zh-CN</language>',
        `    <lastBuildDate>${xmlEscape(rssDate(feed.updatedAt))}</lastBuildDate>`,
        ...items,
        '  </channel>',
        '</rss>',
        ''
    ].join('\n');
}

module.exports = {
    CACHE_PREFIX,
    buildSiteFeed,
    feedEtag,
    getSiteFeed,
    invalidateSiteFeed,
    toRss
};
