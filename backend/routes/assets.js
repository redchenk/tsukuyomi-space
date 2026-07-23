const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const {
    authenticateToken,
    authenticateAdminToken,
    optionalAuth,
    requireAdmin,
    requireSuperAdmin
} = require('../middleware/auth');
const assetRepository = require('../repositories/asset-repository');
const articleMedia = require('../services/article-media');
const objectStorage = require('../services/object-storage');
const responseCache = require('../services/response-cache');
const userGrowth = require('../services/user-growth');
const { setPublicReadCache } = require('../services/public-cache');
const { attachmentDisposition, cleanMime, MAX_USER_UPLOAD_BYTES } = require('../services/file-security');
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
const BROWSER_PREVIEW_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mpeg',
    'audio/flac',
    'audio/wav',
    'audio/ogg',
    'audio/mp4'
]);

function ok(res, data = null, message = '操作成功') {
    res.json({ success: true, message, data });
}

function fail(res, status, message) {
    res.status(status).json({ success: false, message });
}

function clearPublicGalleryCache() {
    responseCache.delPrefix('public:gallery');
    responseCache.delPrefix('public:site-feed');
}

function recordGalleryGrowth(userId, assetId) {
    try {
        return userGrowth.recordDailyActivity(userId, 'gallery_upload', assetId);
    } catch (error) {
        console.error('Record gallery growth failed:', error);
        return null;
    }
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
        asset.url = currentOssPublicUrl(asset);
        asset.markdown_url = durableAssetUrl(asset.id);
        asset.access_url = signUrl ? signedAssetUrl(asset.id) : durableAssetUrl(asset.id);
        asset.display_url = asset.access_url;
        asset.preview_url = isBrowserPreviewMedia(asset)
            ? objectStorage.aliyunV1SignatureUrl(asset.storage_key, {
                expiresSeconds: 6 * 60 * 60,
                preferPublicBase: true
            }) || asset.access_url
            : asset.access_url;
    } else {
        asset.markdown_url = durableAssetUrl(asset.id);
        asset.access_url = signUrl ? signedAssetUrl(asset.id) : durableAssetUrl(asset.id);
        asset.display_url = asset.access_url;
        asset.preview_url = asset.access_url;
    }
    return asset;
}

function isAdminUser(user) {
    return user?.role === 'admin' || user?.role === 'super_admin' || user?.scope === 'admin';
}

function canAccessAsset(req, asset) {
    const metadata = asset?.metadata || {};
    const isOwner = Boolean(asset?.owner_id && asset.owner_id === req.user?.id);
    const publicAsset = !asset?.owner_id || metadata.visibility === 'public';
    return hasValidAssetSignature(asset.id, req.query)
        || isAdminUser(req.user)
        || isOwner
        || publicAsset
        || assetRepository.isAssetPubliclyReferenced(asset.id);
}

function rejectAssetAccess(req, res) {
    return fail(res, req.user ? 403 : 401, '无权访问附件');
}

function inferMimeType(objectKey, provided = '') {
    const clean = cleanMime(provided);
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
    if (typeof value !== 'string' || value.length > Math.ceil(MAX_USER_UPLOAD_BYTES * 4 / 3) + 1024) {
        const error = new Error('文件不能超过 20MB');
        error.status = 413;
        throw error;
    }
    const match = value.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i);
    if (!match) return null;
    const encoded = match[2].replace(/\s/g, '');
    if (!encoded || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return null;
    const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
    if (Math.floor(encoded.length * 3 / 4) - padding > MAX_USER_UPLOAD_BYTES) {
        const error = new Error('文件不能超过 20MB');
        error.status = 413;
        throw error;
    }
    const buffer = Buffer.from(encoded, 'base64');
    if (buffer.length > MAX_USER_UPLOAD_BYTES) {
        const error = new Error('文件不能超过 20MB');
        error.status = 413;
        throw error;
    }
    return {
        mimeType: cleanMime(match[1]),
        buffer
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

function resolveLocalUpload(storageKey) {
    if (!canDeleteLocal(storageKey)) return '';
    const root = path.resolve(config.projectRoot, 'assets', 'uploads');
    const target = path.resolve(config.projectRoot, storageKey);
    const relative = path.relative(root, target);
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) return '';
    return target;
}

function deleteLocalFile(storageKey) {
    const target = resolveLocalUpload(storageKey);
    if (!target || !fs.existsSync(target)) return;
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) return;
    fs.unlinkSync(target);
}

function assetFileName(asset, metadata = {}) {
    return metadata.fileName || metadata.title || `${asset.id}.${String(asset.mime_type || '').split('/').pop() || 'bin'}`;
}

function setAttachmentHeaders(res, asset, metadata = {}, { inline = false } = {}) {
    res.setHeader('Content-Type', cleanMime(asset.mime_type) || 'application/octet-stream');
    const disposition = attachmentDisposition(assetFileName(asset, metadata));
    res.setHeader('Content-Disposition', inline ? disposition.replace(/^attachment/, 'inline') : disposition);
    res.setHeader('X-Content-Type-Options', 'nosniff');
}

function isBrowserPreviewMedia(asset) {
    return BROWSER_PREVIEW_MIME_TYPES.has(cleanMime(asset?.mime_type));
}

function streamLocalAsset(req, res, asset, metadata = {}) {
    const target = resolveLocalUpload(asset.storage_key);
    if (!target || !fs.existsSync(target)) return fail(res, 404, 'Attachment not found');
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
    let fd;
    try {
        fd = fs.openSync(target, flags);
    } catch (_) {
        return fail(res, 404, 'Attachment not found');
    }
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) {
        fs.closeSync(fd);
        return fail(res, 404, 'Attachment not found');
    }
    const range = String(req.headers.range || '');
    setAttachmentHeaders(res, asset, metadata, { inline: isBrowserPreviewMedia(asset) });
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', metadata.visibility === 'private' ? 'private, no-store' : 'public, max-age=300');

    const match = range.match(/^bytes=(\d*)-(\d*)$/i);
    if (match) {
        const start = match[1] === '' ? 0 : Number(match[1]);
        const end = match[2] === '' ? stat.size - 1 : Math.min(Number(match[2]), stat.size - 1);
        if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < stat.size) {
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
            res.setHeader('Content-Length', end - start + 1);
            return fs.createReadStream(target, { fd, autoClose: true, start, end }).pipe(res);
        }
    }

    res.setHeader('Content-Length', stat.size);
    return fs.createReadStream(target, { fd, autoClose: true }).pipe(res);
}

async function streamOssAsset(req, res, asset, metadata) {
    if (isBrowserPreviewMedia(asset)) {
        const redirectUrl = objectStorage.aliyunV1SignatureUrl(asset.storage_key, {
            expiresSeconds: 6 * 60 * 60,
            preferPublicBase: true
        });
        if (redirectUrl) {
            res.setHeader('Cache-Control', metadata.visibility === 'private' ? 'private, no-store' : 'public, max-age=60');
            return res.redirect(302, redirectUrl);
        }
    }
    const object = await objectStorage.getObject(asset.storage_key, { range: req.headers.range || '' });
    if (!object?.buffer) return fail(res, 404, '附件不存在');
    const streamedAsset = { ...asset, mime_type: asset.mime_type || object.contentType || 'application/octet-stream' };
    setAttachmentHeaders(res, streamedAsset, metadata, { inline: isBrowserPreviewMedia(streamedAsset) });
    if (object.contentLength) res.setHeader('Content-Length', object.contentLength);
    if (object.acceptRanges) res.setHeader('Accept-Ranges', object.acceptRanges);
    if (object.contentRange) res.setHeader('Content-Range', object.contentRange);
    if (object.etag) res.setHeader('ETag', object.etag);
    if (object.lastModified) res.setHeader('Last-Modified', object.lastModified);
    res.setHeader('Cache-Control', metadata.visibility === 'private' ? 'private, no-store' : 'public, max-age=300');
    return res.status(object.status === 206 ? 206 : 200).send(object.buffer);
}

router.get('/', authenticateToken, (req, res) => {
    try {
        const page = parsePositiveInt(req.query.page, 1);
        const limit = Math.min(parsePositiveInt(req.query.limit, 60), 120);
        const offset = (page - 1) * limit;
        const type = String(req.query.type || '').trim();
        const search = String(req.query.search || '').trim().slice(0, 80);
        const excludeGallery = String(req.query.collection || '').trim().toLowerCase() === 'attachments';
        const requestedAll = req.query.scope === 'all';
        const requestedPublic = req.query.includePublic === 'true';
        if ((requestedAll || requestedPublic) && !isAdminUser(req.user)) {
            return fail(res, 403, '无权限访问全部附件');
        }
        const includeAll = requestedAll && isAdminUser(req.user);
        const includePublic = !includeAll && requestedPublic && isAdminUser(req.user);
        const options = { limit, offset, type, search, includePublic, includeAll, excludeGallery };
        const assets = assetRepository.listAssetsByOwner(req.user.id, options).map((asset) => normalizeAsset(asset, { signUrl: true }));
        const total = assetRepository.countAssetsByOwner(req.user.id, { type, search, includePublic, includeAll, excludeGallery });
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

router.get('/gallery/public', (req, res) => {
    try {
        const limit = Math.min(parsePositiveInt(req.query.limit, 4), 24);
        const random = ['1', 'true', 'yes'].includes(String(req.query.random || '').trim().toLowerCase());
        const key = `public:gallery:preview:${random ? 'random' : 'latest'}:${limit}`;
        setPublicReadCache(res, { maxAge: random ? 5 : 20, stale: 30 });
        res.json(responseCache.remember(key, random ? 5000 : 20000, () => {
            const assets = (random
                ? assetRepository.listRandomGalleryAssets({ limit })
                : assetRepository.listGalleryAssets({ limit, offset: 0 }))
                .map((asset) => normalizeAsset(asset));
            return { success: true, message: 'OK', data: { assets } };
        }));
    } catch (error) {
        console.error('List public gallery assets failed:', error);
        fail(res, 500, '无法读取图库');
    }
});

router.get('/gallery', optionalAuth, (req, res) => {
    try {
        const page = parsePositiveInt(req.query.page, 1);
        const limit = Math.min(parsePositiveInt(req.query.limit, 48), 120);
        const offset = (page - 1) * limit;
        const search = String(req.query.search || '').trim().slice(0, 80);
        const requestedScope = String(req.query.scope || '').trim().toLowerCase();
        if (requestedScope === 'all' && !isAdminUser(req.user)) {
            return fail(res, 403, 'Forbidden');
        }
        if (requestedScope === 'mine' && !req.user?.id) {
            return fail(res, 401, '请先登录');
        }
        const ownerId = requestedScope === 'mine' ? req.user.id : '';
        const cacheablePublicList = !req.user && !requestedScope && !search;
        if (cacheablePublicList) setPublicReadCache(res, { maxAge: 15, stale: 30 });
        const payload = cacheablePublicList
            ? responseCache.remember(`public:gallery:list:${page}:${limit}`, 15000, () => {
                const assets = assetRepository.listGalleryAssets({ limit, offset, search, ownerId }).map((asset) => normalizeAsset(asset));
                const total = assetRepository.countGalleryAssets({ search, ownerId });
                return {
                    assets,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages: Math.ceil(total / limit)
                    }
                };
            })
            : (() => {
                const assets = assetRepository.listGalleryAssets({ limit, offset, search, ownerId }).map((asset) => normalizeAsset(asset, { signUrl: Boolean(req.user) }));
                const total = assetRepository.countGalleryAssets({ search, ownerId });
                return {
                    assets,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages: Math.ceil(total / limit)
                    }
                };
            })();
        ok(res, {
            assets: payload.assets,
            pagination: payload.pagination
        });
    } catch (error) {
        console.error('List gallery assets failed:', error);
        fail(res, 500, '无法读取图库');
    }
});

router.post('/oss-register', authenticateAdminToken, requireAdmin, requireSuperAdmin, (req, res) => {
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
        if ((visibility || 'public') !== 'private') clearPublicGalleryCache();
        ok(res, normalizeAsset(asset, { signUrl: true }), 'OSS asset registered');
    } catch (error) {
        console.error('Register OSS asset failed:', error);
        fail(res, 500, 'OSS asset registration failed');
    }
});

router.post('/oss-scan', authenticateAdminToken, requireAdmin, requireSuperAdmin, async (req, res) => {
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
        if (imported.some((asset) => !asset.owner_id || asset.metadata?.visibility === 'public')) clearPublicGalleryCache();
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

router.get('/local/*', optionalAuth, (req, res) => {
    try {
        const relativeKey = String(req.params[0] || '').replace(/\\/g, '/').replace(/^\/+/, '');
        if (!relativeKey || relativeKey.includes('\0')) return fail(res, 404, '附件不存在');
        const asset = assetRepository.findAssetByStorageKey(`assets/uploads/${relativeKey}`);
        if (!asset || asset.metadata?.storage === 'oss') return fail(res, 404, '附件不存在');
        if (!canAccessAsset(req, asset)) return rejectAssetAccess(req, res);
        return streamLocalAsset(req, res, asset, asset.metadata || {});
    } catch (error) {
        console.error('Read local asset failed:', error);
        return fail(res, 500, '附件读取失败');
    }
});

router.get('/proxy/:id', optionalAuth, async (req, res) => {
    try {
        const asset = assetRepository.findAssetForAdmin(req.params.id);
        if (!asset) return fail(res, 404, '附件不存在');
        const metadata = asset.metadata || {};
        if (!canAccessAsset(req, asset)) return rejectAssetAccess(req, res);
        if (metadata.storage !== 'oss') return streamLocalAsset(req, res, asset, metadata);
        return streamOssAsset(req, res, asset, metadata);
    } catch (error) {
        console.error('Proxy OSS asset failed:', error);
        fail(res, 502, '对象存储资源读取失败');
    }
});

router.post('/', authenticateToken, async (req, res) => {
    try {
        const { dataUrl, alt, fileName, mimeType, storage, collection } = req.body || {};
        if (!dataUrl) return fail(res, 400, '请选择要上传的文件');
        const parsed = parseDataUrl(dataUrl);
        if (!parsed?.buffer?.length) return fail(res, 400, '文件格式无效');
        const targetCollection = String(collection || '').trim().toLowerCase();
        if (targetCollection === 'gallery' && !String(mimeType || parsed.mimeType || '').startsWith('image/')) {
            return fail(res, 400, '图库只支持图片文件');
        }
        const asset = await articleMedia.saveUserFileAsset({
            buffer: parsed.buffer,
            ownerId: req.user.id,
            mimeType: String(mimeType || parsed.mimeType || 'application/octet-stream').trim().slice(0, 120),
            alt: String(alt || '').trim(),
            fileName: String(fileName || '').trim(),
            storage: objectStorage.normalizeStorageMode(storage),
            collection: targetCollection,
        });
        if (!asset) return fail(res, 400, '文件格式无效');
        if (targetCollection === 'gallery') clearPublicGalleryCache();
        const growth = targetCollection === 'gallery' ? recordGalleryGrowth(req.user.id, asset.id) : null;
        res.json({ success: true, message: '附件已上传', data: normalizeAsset(asset, { signUrl: true }), growth });
    } catch (error) {
        if (!error.status || error.status >= 500) console.error('Upload asset failed:', error);
        fail(res, error.status || 500, error.status ? error.message : '附件上传失败');
    }
});

async function deleteAsset(req, res) {
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
        clearPublicGalleryCache();
        ok(res, null, '附件已删除');
    } catch (error) {
        console.error('Delete asset failed:', error);
        fail(res, 500, '附件删除失败');
    }
}

router.post('/:id/delete', authenticateToken, requireAdmin, deleteAsset);
router.delete('/:id', authenticateToken, deleteAsset);

module.exports = router;
