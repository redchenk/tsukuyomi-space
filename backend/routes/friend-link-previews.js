const express = require('express');
const friendLinkRepository = require('../repositories/friend-link-repository');
const objectStorage = require('../services/object-storage');

const router = express.Router();
const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;

function sendNotFound(res) {
    res.set('Cache-Control', 'private, no-store');
    return res.status(404).end();
}

router.get('/:id/:version.jpg', async (req, res) => {
    try {
        const id = Number.parseInt(req.params.id, 10);
        const version = String(req.params.version || '');
        if (!Number.isFinite(id) || id <= 0 || !/^\d{1,17}$/.test(version)) return sendNotFound(res);

        const expectedUrl = `/friend-link-previews/${id}/${version}.jpg`;
        const link = friendLinkRepository.findById(id);
        if (
            !link
            || link.status !== 'active'
            || link.screenshot_url !== expectedUrl
            || !link.screenshot_storage_key
        ) {
            return sendNotFound(res);
        }

        const object = await objectStorage.getObject(link.screenshot_storage_key);
        if (!object?.buffer?.length || object.buffer.length > MAX_PREVIEW_BYTES) return sendNotFound(res);

        res.set({
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Type': 'image/jpeg',
            'Content-Length': String(object.buffer.length),
            'Content-Disposition': 'inline',
            'X-Content-Type-Options': 'nosniff',
            ...(object.etag ? { ETag: object.etag } : {}),
            ...(object.lastModified ? { 'Last-Modified': object.lastModified } : {})
        });
        return res.end(object.buffer);
    } catch (error) {
        console.warn('Friend link preview failed:', error.message);
        return sendNotFound(res);
    }
});

module.exports = router;
