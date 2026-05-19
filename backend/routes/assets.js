const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
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

function ok(res, data = null, message = '操作成功') {
    res.json({ success: true, message, data });
}

function fail(res, status, message) {
    res.status(status).json({ success: false, message });
}

function normalizeAsset(row) {
    if (!row) return row;
    return {
        ...row,
        metadata: typeof row.metadata === 'string' ? safeJson(row.metadata) : (row.metadata || {})
    };
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
        const includePublic = req.query.includePublic === 'true';
        const options = { limit, offset, type, search, includePublic };
        const assets = assetRepository.listAssetsByOwner(req.user.id, options);
        const total = assetRepository.countAssetsByOwner(req.user.id, { type, search, includePublic });
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
        const storageKey = objectStorage.normalizeObjectKey(objectKey);
        if (!storageKey) return fail(res, 400, '请填写有效的 OSS Object Key');
        const url = objectStorage.publicUrlForKey(storageKey);
        if (!url) return fail(res, 400, '对象存储公开域名或 Endpoint 未配置，无法生成访问 URL');
        const normalizedMimeType = inferMimeType(storageKey, mimeType);
        const normalizedAssetType = inferAssetType(normalizedMimeType, storageKey, assetType);
        const displayName = String(title || storageKey.split('/').pop() || storageKey).trim().slice(0, 180);
        const publicAsset = visibility !== 'private';
        const asset = assetRepository.createAsset({
            id: crypto.randomUUID(),
            articleId: null,
            ownerId: publicAsset ? null : req.user.id,
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
                mirror: 'oss_only'
            }
        });
        ok(res, normalizeAsset(asset), 'OSS 资源已登记');
    } catch (error) {
        console.error('Register OSS asset failed:', error);
        fail(res, 500, 'OSS 资源登记失败');
    }
});

router.post('/', authenticateToken, async (req, res) => {
    try {
        const { dataUrl, alt, fileName, storage, uploadPath } = req.body || {};
        if (!dataUrl) return fail(res, 400, '请选择要上传的图片');
        const asset = await articleMedia.saveUserImageAsset(dataUrl, {
            ownerId: req.user.id,
            alt: String(alt || '').trim(),
            fileName: String(fileName || '').trim(),
            storage: objectStorage.normalizeStorageMode(storage),
            uploadPath: objectStorage.normalizeUploadPath(uploadPath, '')
        });
        if (!asset) return fail(res, 400, '图片格式无效');
        ok(res, normalizeAsset(asset), '附件已上传');
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
