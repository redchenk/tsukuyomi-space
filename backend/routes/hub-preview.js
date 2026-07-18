const express = require('express');
const config = require('../config');
const articleRepository = require('../repositories/article-repository');
const assetRepository = require('../repositories/asset-repository');
const messageRepository = require('../repositories/message-repository');
const pixelArtRepository = require('../repositories/pixel-art-repository');
const statsRepository = require('../repositories/stats-repository');
const { setPrivateNoStore } = require('../services/public-cache');

const router = express.Router();

function siteUptimeSeconds() {
    const launchedAt = Number.isFinite(config.siteLaunchedAtMs) ? config.siteLaunchedAtMs : Date.now();
    return Math.max(0, Math.floor((Date.now() - launchedAt) / 1000));
}

function publicStats() {
    const articles = statsRepository.articleCounters();
    const views = statsRepository.publicViewCounters();
    return {
        articles: articles.count || 0,
        articleViews: articles.views || 0,
        users: statsRepository.userCount(),
        messages: statsRepository.messageCount(),
        todayViews: views.today || 0,
        weekViews: views.week || 0,
        totalViews: views.total || 0,
        uptime: siteUptimeSeconds()
    };
}

function latestArticle() {
    const article = articleRepository.listRecentPublishedArticles(1)[0];
    if (!article) return null;
    return {
        id: article.id,
        title: article.title,
        slug: article.slug,
        excerpt: article.excerpt,
        category: article.category,
        publish_date: article.publish_date,
        published_at: article.published_at,
        cover_image: article.cover_image,
        created_at: article.created_at,
        updated_at: article.updated_at
    };
}

function latestMessages() {
    return messageRepository.listRecentPublicMessages(4).map(message => ({
        id: message.id,
        author: message.author,
        content: message.content,
        created_at: message.created_at
    }));
}

function latestGalleryImage() {
    const asset = assetRepository.listGalleryAssets({ limit: 1, offset: 0 })[0];
    if (!asset) return null;
    return {
        id: asset.id,
        url: `/api/assets/proxy/${encodeURIComponent(String(asset.id))}`,
        created_at: asset.created_at,
        updated_at: asset.updated_at
    };
}

function latestPixelArtwork() {
    const artwork = pixelArtRepository.listArtworks({
        viewerId: '',
        sort: 'latest',
        limit: 1,
        offset: 0,
        preview: 'compact'
    }).items[0];
    if (!artwork) return null;
    return {
        id: artwork.id,
        title: artwork.title,
        author: artwork.author,
        width: artwork.preview_width,
        height: artwork.preview_height,
        background_color: artwork.background_color,
        palette: artwork.palette,
        pixels_base64: artwork.pixels_base64,
        created_at: artwork.created_at,
        updated_at: artwork.updated_at
    };
}

router.get('/', (req, res) => {
    try {
        setPrivateNoStore(res, { vary: 'Accept-Encoding' });
        res.json({
            success: true,
            data: {
                article: latestArticle(),
                messages: latestMessages(),
                gallery: latestGalleryImage(),
                pixel: latestPixelArtwork(),
                stats: publicStats()
            }
        });
    } catch (error) {
        console.error('Read hub preview failed:', error);
        res.status(500).json({ success: false, message: 'Hub content failed to load' });
    }
});

module.exports = router;
