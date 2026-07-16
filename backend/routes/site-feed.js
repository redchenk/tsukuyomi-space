const express = require('express');
const { feedEtag, getSiteFeed, toRss } = require('../services/site-feed');

const router = express.Router();

function setFeedHeaders(res, etag) {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store',
        'Vary': 'Accept-Encoding',
        'ETag': etag
    });
}

function isNotModified(req, etag) {
    return String(req.get('if-none-match') || '').split(',').map(value => value.trim()).includes(etag);
}

function sendJson(req, res) {
    try {
        const feed = getSiteFeed(req.query.limit);
        const etag = feedEtag(feed, 'json');
        setFeedHeaders(res, etag);
        if (isNotModified(req, etag)) return res.status(304).end();
        return res.json({ success: true, data: feed });
    } catch (error) {
        console.error('Read site feed failed:', error);
        return res.status(500).json({ success: false, message: 'Site feed unavailable' });
    }
}

function sendRss(req, res) {
    try {
        const feed = getSiteFeed(req.query.limit);
        const etag = feedEtag(feed, 'rss');
        setFeedHeaders(res, etag);
        if (isNotModified(req, etag)) return res.status(304).end();
        return res.type('application/rss+xml; charset=utf-8').send(toRss(feed));
    } catch (error) {
        console.error('Read RSS feed failed:', error);
        return res.status(500).type('text/plain; charset=utf-8').send('Site feed unavailable');
    }
}

router.get('/', sendJson);

module.exports = {
    router,
    sendRss
};
