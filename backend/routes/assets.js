const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { authenticateToken } = require('../middleware/auth');
const assetRepository = require('../repositories/asset-repository');
const articleMedia = require('../services/article-media');
const objectStorage = require('../services/object-storage');
const { parsePositiveInt } = require('../validators');

const router = express.Router();

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
        const options = { limit, offset, type, search };
        const assets = assetRepository.listAssetsByOwner(req.user.id, options);
        const total = assetRepository.countAssetsByOwner(req.user.id, { type, search });
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
        const asset = assetRepository.findAssetForOwner(req.params.id, req.user.id);
        if (!asset) return fail(res, 404, '附件不存在');
        const metadata = asset.metadata || {};
        if (metadata.storage === 'oss') {
            await objectStorage.deleteObject(asset.storage_key).catch((error) => {
                console.warn('Delete OSS asset failed:', error.message);
            });
        } else {
            deleteLocalFile(asset.storage_key);
        }
        assetRepository.deleteAssetForOwner(req.params.id, req.user.id);
        ok(res, null, '附件已删除');
    } catch (error) {
        console.error('Delete asset failed:', error);
        fail(res, 500, '附件删除失败');
    }
});

module.exports = router;
