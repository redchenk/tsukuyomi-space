const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { authenticateToken, optionalAuth, requireAdmin } = require('../middleware/auth');
const assetRepository = require('../repositories/asset-repository');
const articleMedia = require('../services/article-media');
const objectStorage = require('../services/object-storage');
const { parsePositiveInt } = require('../validators');

const router = express.Router();

const MIME_BY_EXT = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    m4v: 'video/mp4',
    mkv: 'video/x-matroska',
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    zip: 'application/zip',
    json: 'application/json'
};
const SKIP_SCAN_KEYS = /(^|\/)(?:\.|__MACOSX)|\/$/;
const ASSET_URL_TTL_SECONDS = 30 * 60;

function ok(res, data = null, message = '操作成功') {
    res.json({ success: true, message, data });
}

function fail(res, status, message) {
    res.status(status).json({ success: false, message });
}

function signAssetAccess(assetId, expiresAt) {
    return crypto
        .createHmac('sha256', config.jwtSecret)
        .update(`${assetId}.${expiresAt}`)
        .digest('base64url');
}

function signedAssetUrl(assetId) {
    const expiresAt = Math.floor(Date.now() / 1000) + ASSET_URL_TTL_SECONDS;
    const signature = signAssetAccess(assetId, expiresAt);
    return `/api/assets/proxy/${encodeURIComponent(assetId)}?expires=${expiresAt}&signature=${encodeURIComponent(signature)}`;
}

function durableAssetUrl(assetId) {
    return `/api/assets/proxy/${encodeURIComponent(assetId)}`;
}

function currentOssPublicUrl(asset) {
    if (!asset?.storage_key) return asset?.url || '';
    return objectStorage.publicUrlForKey(asset.storage_key) || asset.url || '';
}

function hasValidAssetSignature(assetId, query = {}) {
    const expiresAt = Number(query.expires);
    const signature = String(query.signature || '');
    if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000) || !signature) return false;
    const expected = signAssetAccess(assetId, Math.floor(expiresAt));
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    return expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

function normalizeAsset(row, { signUrl = false } = {}) {
    if (!row) return row;
    const asset = {
        ...row,
        metadata: typeof row.metadata === 'string' ? safeJson(row.metadata) : (row.metadata || {})
    };
    if (asset.metadata?.storage === 'oss') {
        const isPublic = !asset.owner_id || asset.metadata?.visibility === 'public';
        asset.url = currentOssPublicUrl(asset);
        asset.display_url = isPublic ? asset.url : (signUrl ? signedAssetUrl(asset.id) : durableAssetUrl(asset.id));
    } else {
        asset.display_url = asset.url;
    }
    return asset;
}

function isAdminUser(user) {
    return user?.role === 'admin' || user?.role === 'super_admin' || user?.scope === 'admin';
}

function inferMimeType(objectKey, provided = '') {
    const clean = String(provided || '').trim();
    if (clean) return clean.slice(0, 120);
    const ext = String(objectKey || '').split('?')[0].split('.').pop()?.toLowerCase() || '';
    return MIME_BY_EXT[ext] || 'application/octet-stream';
}

function inferAssetType(mimeType, objectKey, provided = '') {
    const clean = String(provided || '').trim().toLowerCase();
    if (clean && clean !== 'auto') return clean.slice(0, 60);
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (/(\.moc3|\.model3\.json|\.motion3\.json|\.atlas)$/i.test(objectKey)) return 'live2d';
    if (/^(application\/pdf|text\/)/.test(mimeType)) return 'document';
    return 'file';
}

function parsePositiveSize(value) {
    const size = Number(value);
    return Number.isFinite(size) && size > 0 ? Math.round(size) : 0;
}

function parseDataUrl(value = '') {
    const match = String(value || '').match(/^data:([^;,]+);base64,([\s\S]+)$/i);
    if (!match) return null;
    return {
        mimeType: match[1].toLowerCase(),
        buffer: Buffer.from(match[2].replace(/\s/g, ''), 'base64')
    };
}

function createOssAssetRecord({ objectKey, title = '', assetType = 'auto', mimeType = '', size = 0, visibility = 'public', description = '', etag = '', lastModified = '', ownerId }) {
    const storageKey = objectStorage.normalizeObjectKey(objectKey);
    if (!storageKey) return null;
    const url = objectStorage.publicUrlForKey(storageKey);
    if (!url) return null;
    const normalizedMimeType = inferMimeType(storageKey, mimeType);
    const normalizedAssetType = inferAssetType(normalizedMimeType, storageKey, assetType);
    const displayName = String(title || storageKey.split('/').pop() || storageKey).trim().slice(0, 180);
    const publicAsset = visibility !== 'private';
    return assetRepository.createAsset({
        id: crypto.randomUUID(),
        articleId: null,
        ownerId: publicAsset ? null : ownerId,
        assetType: normalizedAssetType,
        mimeType: normalizedMimeType,
        url,
        storageKey,
        metadata: {
            title: displayName,
            fileName: displayName,
            description: String(description || '').trim().slice(0, 500),
            size: parsePositiveSize(size),
            storage: 'oss',
            source: 'oss_import',
            visibility: publicAsset ? 'public' : 'private',
            mirror: 'oss_only',
            etag,
            lastModified
        }
    });
}

function safeJson(value) {
    try {
        return value ? JSON.parse(value) : {};
    } catch (_) {
        return {};
    }
}

function canDeleteLocal(storageKey) {
    const key = String(storageKey || '').replace(/\\/g, '/');
    return key.startsWith('assets/uploads/');
}

function deleteLocalFile(storageKey) {
    if (!canDeleteLocal(storageKey)) return;
    const target = path.resolve(config.projectRoot, storageKey);
    const root = path.resolve(config.projectRoot, 'assets', 'uploads');
    if (!target.startsWith(root)) return;
    fs.rmSync(target, { force: true });
}

router.get('/', authenticateToken, (req, res) => {
    try {
        const page = parsePositiveInt(req.query.page, 1);
        const limit = Math.min(parsePositiveInt(req.query.limit, 60), 120);
        const offset = (page - 1) * limit;
        const type = String(req.query.type || '').trim();
        const search = String(req.query.search || '').trim().slice(0, 80);
        const requestedAll = req.query.scope === 'all';
        const requestedPublic = req.query.includePublic === 'true';
        if ((requestedAll || requestedPublic) && !isAdminUser(req.user)) {
            return fail(res, 403, '无权限访问全部附件');
        }
        const includeAll = requestedAll && isAdminUser(req.user);
        const includePublic = !includeAll && requestedPublic && isAdminUser(req.user);
        const options = { limit, offset, type, search, includePublic, includeAll };
        const assets = assetRepository.listAssetsByOwner(req.user.id, options).map((asset) => normalizeAsset(asset, { signUrl: true }));
        const total = assetRepository.countAssetsByOwner(req.user.id, { type, search, includePublic, includeAll });
        ok(res, {
            assets,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('List assets failed:', error);
        fail(res, 500, '无法读取附件');
    }
});

router.post('/oss-register', authenticateToken, requireAdmin, (req, res) => {
    try {
        const {
            objectKey,
            title,
            assetType,
            mimeType,
            size,
            visibility = 'public',
            description = ''
        } = req.body || {};
        const asset = createOssAssetRecord({
            objectKey,
            title,
            assetType,
            mimeType,
            size,
            visibility,
            description,
            ownerId: req.user.id
        });
        if (!asset) return fail(res, 400, 'Invalid OSS Object Key or public URL settings');
        ok(res, normalizeAsset(asset, { signUrl: true }), 'OSS asset registered');
    } catch (error) {
        console.error('Register OSS asset failed:', error);
        fail(res, 500, 'OSS asset registration failed');
    }
});

router.post('/oss-scan', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const {
            prefix = '',
            maxKeys = 100,
            visibility = 'public',
            assetType = 'auto'
        } = req.body || {};
        const listed = await objectStorage.listObjects({ prefix, maxKeys });
        const imported = [];
        const skipped = [];
        for (const item of listed.objects || []) {
            if (!item.key || SKIP_SCAN_KEYS.test(item.key)) {
                skipped.push({ key: item.key, reason: 'ignored' });
                continue;
            }
            if (assetRepository.findAssetByStorageKey(item.key)) {
                skipped.push({ key: item.key, reason: 'exists' });
                continue;
            }
            const asset = createOssAssetRecord({
                objectKey: item.key,
                assetType,
                size: item.size,
                visibility,
                etag: item.etag,
                lastModified: item.lastModified,
                ownerId: req.user.id
            });
            if (asset) imported.push(normalizeAsset(asset, { signUrl: true }));
            else skipped.push({ key: item.key, reason: 'invalid' });
        }
        ok(res, {
            imported,
            importedCount: imported.length,
            skippedCount: skipped.length,
            skipped,
            scannedCount: (listed.objects || []).length,
            prefix: listed.prefix || ''
        }, 'OSS scan completed');
    } catch (error) {
        console.error('Scan OSS assets failed:', error);
        fail(res, 500, error.message || 'OSS scan failed');
    }
});

router.get('/proxy/:id', optionalAuth, async (req, res) => {
    try {
        const admin = isAdminUser(req.user);
        const asset = assetRepository.findAssetForAdmin(req.params.id);
        if (!asset) return fail(res, 404, '附件不存在');
        const metadata = asset.metadata || {};
        const isOwner = asset.owner_id && asset.owner_id === req.user?.id;
        const publicAsset = !asset.owner_id || metadata.visibility === 'public';
        const signedAccess = hasValidAssetSignature(asset.id, req.query);
        const publishedReference = assetRepository.isAssetPubliclyReferenced(asset.id);
        if (!signedAccess && !admin && !isOwner && !publicAsset && !publishedReference) {
            return fail(res, req.user ? 403 : 401, '无权访问附件');
        }
        const publicUrl = currentOssPublicUrl(asset);
        if (metadata.storage !== 'oss') {
            return res.redirect(302, publicUrl || asset.url);
        }
        if (publicAsset && publicUrl) {
            if (!/aliyuncs\.com/i.test(publicUrl)) {
                return res.redirect(302, publicUrl);
            }
            const signedUrl = objectStorage.aliyunV1SignatureUrl(asset.storage_key, {
                expiresSeconds: 21600,
                contentDisposition: 'inline'
            });
            return res.redirect(302, signedUrl || publicUrl);
        }
        const object = await objectStorage.getObject(asset.storage_key, { range: req.headers.range || '' });
        if (!object?.buffer) return fail(res, 404, '附件不存在');
        res.setHeader('Content-Type', asset.mime_type || object.contentType || 'application/octet-stream');
        if (object.contentLength) res.setHeader('Content-Length', object.contentLength);
        if (object.acceptRanges) res.setHeader('Accept-Ranges', object.acceptRanges);
        if (object.contentRange) res.setHeader('Content-Range', object.contentRange);
        if (object.etag) res.setHeader('ETag', object.etag);
        if (object.lastModified) res.setHeader('Last-Modified', object.lastModified);
        res.setHeader('Cache-Control', metadata.visibility === 'private' ? 'private, no-store' : 'public, max-age=300');
        res.status(object.status === 206 ? 206 : 200).send(object.buffer);
    } catch (error) {
        console.error('Proxy OSS asset failed:', error);
        fail(res, 502, '对象存储资源读取失败');
    }
});

router.post('/', authenticateToken, async (req, res) => {
    try {
        const { dataUrl, alt, fileName, mimeType, storage } = req.body || {};
        if (!dataUrl) return fail(res, 400, '请选择要上传的文件');
        const parsed = parseDataUrl(dataUrl);
        if (!parsed?.buffer?.length) return fail(res, 400, '文件格式无效');
        const asset = await articleMedia.saveUserFileAsset({
            buffer: parsed.buffer,
            ownerId: req.user.id,
            mimeType: String(mimeType || parsed.mimeType || 'application/octet-stream').trim().slice(0, 120),
            alt: String(alt || '').trim(),
            fileName: String(fileName || '').trim(),
            storage: objectStorage.normalizeStorageMode(storage)
        });
        if (!asset) return fail(res, 400, '文件格式无效');
        ok(res, normalizeAsset(asset, { signUrl: true }), '附件已上传');
    } catch (error) {
        console.error('Upload asset failed:', error);
        fail(res, 500, '附件上传失败');
    }
});

router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const admin = isAdminUser(req.user);
        const asset = admin
            ? assetRepository.findAssetForAdmin(req.params.id)
            : assetRepository.findAssetForOwner(req.params.id, req.user.id);
        if (!asset) return fail(res, 404, '附件不存在');
        const metadata = asset.metadata || {};
        if (metadata.storage === 'oss' && metadata.source !== 'oss_import') {
            await objectStorage.deleteObject(asset.storage_key).catch((error) => {
                console.warn('Delete OSS asset failed:', error.message);
            });
        } else {
            deleteLocalFile(asset.storage_key);
        }
        if (admin) {
            assetRepository.deleteAssetById(req.params.id);
        } else {
            assetRepository.deleteAssetForOwner(req.params.id, req.user.id);
        }
        ok(res, null, '附件已删除');
    } catch (error) {
        console.error('Delete asset failed:', error);
        fail(res, 500, '附件删除失败');
    }
});

module.exports = router;
