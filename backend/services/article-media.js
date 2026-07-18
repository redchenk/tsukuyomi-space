const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const objectStorage = require('./object-storage');
const { detectMimeFromMagic, validateUserUpload } = require('./file-security');

const DATA_IMAGE_PATTERN = /^data:image\/(png|jpe?g|gif|webp);base64,([\s\S]+)$/i;
const MARKDOWN_DATA_IMAGE_PATTERN = /!\[([^\]\n]*)\]\((data:image\/(?:png|jpe?g|gif|webp);base64,[^)]+)\)/gi;
const EXT_BY_MIME = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-matroska': 'mkv',
    'audio/mpeg': 'mp3',
    'audio/flac': 'flac',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'text/markdown': 'md',
    'application/zip': 'zip',
    'application/json': 'json'
};
const MIME_BY_EXT = Object.fromEntries(Object.entries(EXT_BY_MIME).map(([mime, ext]) => [ext, mime]));

function normalizeExt(ext) {
    const value = String(ext || '').toLowerCase();
    if (value === 'jpeg') return 'jpg';
    return ['png', 'jpg', 'gif', 'webp'].includes(value) ? value : 'png';
}

function extFromName(fileName = '') {
    return String(fileName || '').split('?')[0].split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
}

function normalizeAssetExt({ fileName = '', mimeType = '' } = {}) {
    const ext = extFromName(fileName);
    if (ext) return ext.slice(0, 12);
    return EXT_BY_MIME[String(mimeType || '').toLowerCase()] || 'bin';
}

function normalizeAssetMimeType({ fileName = '', mimeType = '' } = {}) {
    const clean = String(mimeType || '').trim().toLowerCase();
    if (clean && clean !== 'application/octet-stream') return clean;
    return MIME_BY_EXT[extFromName(fileName)] || clean || 'application/octet-stream';
}

function assetTypeFromMime(mimeType = '') {
    const value = String(mimeType || '');
    if (value.startsWith('image/')) return 'body-image';
    if (value.startsWith('video/')) return 'video';
    if (value.startsWith('audio/')) return 'audio';
    if (value.startsWith('text/') || value === 'application/pdf') return 'document';
    return 'file';
}

function assetFolderFromMime(mimeType = '', assetType = '') {
    const type = String(assetType || '').toLowerCase();
    const mime = String(mimeType || '').toLowerCase();
    if (type.includes('image') || mime.startsWith('image/')) return 'image';
    if (type.startsWith('video') || mime.startsWith('video/')) return 'video';
    if (type.startsWith('audio') || mime.startsWith('audio/')) return 'audio';
    if (type.startsWith('live2d')) return 'live2d';
    if (type.startsWith('document') || mime.startsWith('text/') || mime === 'application/pdf') return 'document';
    return 'file';
}

function safeUserFolderId(ownerId = '') {
    return String(ownerId || '')
        .trim()
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'unknown';
}

function userAssetUploadPath(ownerId, { mimeType = '', assetType = 'file' } = {}) {
    return ['users', safeUserFolderId(ownerId), assetFolderFromMime(mimeType, assetType)].join('/');
}

function userGalleryUploadPath(ownerId) {
    return ['users', safeUserFolderId(ownerId), 'gallery'].join('/');
}

function parseDataImage(dataUrl) {
    const match = String(dataUrl || '').match(DATA_IMAGE_PATTERN);
    if (!match) return null;
    const ext = normalizeExt(match[1]);
    const base64 = match[2].replace(/\s/g, '');
    const buffer = Buffer.from(base64, 'base64');
    const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    if (detectMimeFromMagic(buffer, mimeType) !== mimeType) return null;
    return {
        ext,
        mimeType,
        buffer
    };
}

function isDataImage(value) {
    return DATA_IMAGE_PATTERN.test(String(value || ''));
}

function parseStoredMetadata(value) {
    try {
        return value ? JSON.parse(value) : {};
    } catch (_) {
        return {};
    }
}

function safeRelativePath(value = '') {
    const cleaned = String(value || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '')
        .replace(/\/{2,}/g, '/');
    if (!cleaned || /^[a-z][a-z0-9+.-]*:/i.test(cleaned) || cleaned.includes('..')) return '';
    return cleaned
        .split('/')
        .map(part => part.replace(/[^a-zA-Z0-9._-]/g, '-'))
        .filter(Boolean)
        .join('/');
}

function expandUploadPathTemplate(value = '', { role = 'body', id = '', ext = '' } = {}) {
    const now = new Date();
    return String(value || '')
        .replace(/\$\{year\}/g, String(now.getFullYear()))
        .replace(/\$\{month\}/g, String(now.getMonth() + 1).padStart(2, '0'))
        .replace(/\$\{day\}/g, String(now.getDate()).padStart(2, '0'))
        .replace(/\$\{role\}/g, role)
        .replace(/\$\{uuid\}/g, id)
        .replace(/\$\{ext\}/g, ext);
}

function uploadFolder(uploadPath = '', context = {}) {
    const now = new Date();
    const expandedPath = safeRelativePath(expandUploadPathTemplate(uploadPath, context));
    const folder = path.join(
        config.projectRoot,
        'assets',
        'uploads',
        expandedPath || path.join('articles', String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'))
    );
    fs.mkdirSync(folder, { recursive: true });
    return folder;
}

function publicUrlForFile(filePath) {
    return `/${path.relative(config.projectRoot, filePath).replace(/\\/g, '/')}`;
}

function createAssetRecord({ id, articleId = null, ownerId = null, assetType, mimeType, url, storageKey, metadata = {} }) {
    db.prepare(`
        INSERT INTO article_assets (
            id, article_id, owner_id, asset_type, mime_type, url, storage_key, metadata
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            article_id = COALESCE(excluded.article_id, article_assets.article_id),
            owner_id = COALESCE(excluded.owner_id, article_assets.owner_id),
            asset_type = excluded.asset_type,
            mime_type = excluded.mime_type,
            url = excluded.url,
            storage_key = excluded.storage_key,
            metadata = excluded.metadata,
            updated_at = CURRENT_TIMESTAMP
    `).run(id, articleId, ownerId, assetType, mimeType, url, storageKey, JSON.stringify(metadata || {}));
}

function durableAssetUrl(id) {
    return `/api/assets/proxy/${encodeURIComponent(String(id || ''))}`;
}

function articleMediaError(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function findCoverAsset(id) {
    return db.prepare(`
        SELECT id, article_id, owner_id, asset_type, mime_type
        FROM article_assets
        WHERE id = ?
    `).get(id);
}

function saveParsedImageLocal(parsed, { id = crypto.randomUUID(), articleId = null, ownerId = null, role = 'body', alt = '', uploadPath = '' } = {}) {
    const fileName = `${id}.${parsed.ext}`;
    const filePath = path.join(uploadFolder(uploadPath, { role, id, ext: parsed.ext }), fileName);
    fs.writeFileSync(filePath, parsed.buffer);
    const url = publicUrlForFile(filePath);
    createAssetRecord({
        id,
        articleId,
        ownerId,
        assetType: role === 'cover' ? 'cover-image' : 'body-image',
        mimeType: parsed.mimeType,
        url,
        storageKey: path.relative(config.projectRoot, filePath).replace(/\\/g, '/'),
        metadata: { role, alt, size: parsed.buffer.length, storage: 'local' }
    });
    return { id, url: durableAssetUrl(id) };
}

function saveBufferLocal({ buffer, mimeType, ext, id, articleId = null, ownerId = null, role = 'attachment', alt = '', fileName = '', uploadPath = '' }) {
    const filePath = path.join(uploadFolder(uploadPath, { role, id, ext }), `${id}.${ext}`);
    fs.writeFileSync(filePath, buffer);
    const url = publicUrlForFile(filePath);
    createAssetRecord({
        id,
        articleId,
        ownerId,
        assetType: assetTypeFromMime(mimeType),
        mimeType,
        url,
        storageKey: path.relative(config.projectRoot, filePath).replace(/\\/g, '/'),
        metadata: { role, alt, fileName, size: buffer.length, storage: 'local', folder: safeRelativePath(uploadPath) }
    });
    return { id, url };
}

async function saveDataImage(dataUrl, { articleId = null, ownerId = null, role = 'body', alt = '', storage = 'auto', uploadPath = '' } = {}) {
    const parsed = parseDataImage(dataUrl);
    if (!parsed || !parsed.buffer.length) return null;

    const id = crypto.randomUUID();
    const settings = objectStorage.getSettings();
    const storageMode = objectStorage.normalizeStorageMode(storage === 'auto' ? settings.ossDefaultStorage : storage);
    if (storageMode === 'oss' && !objectStorage.hasUploadParams(settings)) {
        throw new Error('对象存储未启用或参数不完整');
    }
    const shouldTryOss = storageMode !== 'local' && (storageMode === 'oss' || (settings.ossEnabled === true && objectStorage.hasUploadParams(settings)));

    if (shouldTryOss) try {
        const uploaded = await objectStorage.putObject({
            buffer: parsed.buffer,
            mimeType: parsed.mimeType,
            ext: parsed.ext,
            role,
            id,
            uploadPath,
            requireEnabled: storageMode !== 'oss'
        });
        if (uploaded?.url) {
            createAssetRecord({
                id,
                articleId,
                ownerId,
                assetType: role === 'cover' ? 'cover-image' : 'body-image',
                mimeType: parsed.mimeType,
                url: uploaded.url,
                storageKey: uploaded.key,
                metadata: { role, alt, size: parsed.buffer.length, storage: uploaded.storage || 'oss' }
            });
            return { id, url: durableAssetUrl(id) };
        }
    } catch (error) {
        if (storageMode === 'oss') throw new Error('对象存储上传失败，请检查后台配置或上传路径');
        console.warn('OSS image upload failed, falling back to local storage:', error.message);
    }

    return saveParsedImageLocal(parsed, { id, articleId, ownerId, role, alt, uploadPath });
}

async function saveUserImageAsset(dataUrl, { ownerId, alt = '', fileName = '', storage = 'auto', uploadPath = '' } = {}) {
    if (!ownerId) return null;
    const asset = await saveDataImage(dataUrl, {
        articleId: null,
        ownerId,
        role: 'attachment',
        alt,
        storage,
        uploadPath: userAssetUploadPath(ownerId, { mimeType: 'image/jpeg', assetType: 'body-image' })
    });
    if (!asset) return null;
    if (fileName) {
        const row = db.prepare('SELECT metadata FROM article_assets WHERE id = ?').get(asset.id);
        const metadata = {
            ...parseStoredMetadata(row?.metadata),
            fileName: String(fileName || '').slice(0, 180)
        };
        db.prepare('UPDATE article_assets SET metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify(metadata), asset.id);
    }
    return db.prepare(`
        SELECT id, article_id, owner_id, asset_type, mime_type, url, storage_key, metadata, created_at, updated_at
        FROM article_assets
        WHERE id = ?
    `).get(asset.id);
}

async function saveUserFileAsset({ buffer, ownerId, mimeType = 'application/octet-stream', fileName = '', alt = '', storage = 'auto', uploadPath = '', collection = '' } = {}) {
    if (!ownerId || !Buffer.isBuffer(buffer) || !buffer.length) return null;
    const id = crypto.randomUUID();
    const inspection = validateUserUpload({ buffer, fileName, claimedMimeType: mimeType });
    const normalizedMimeType = normalizeAssetMimeType({ fileName, mimeType: inspection.trustedMimeType });
    const ext = EXT_BY_MIME[normalizedMimeType] || normalizeAssetExt({ fileName, mimeType: normalizedMimeType });
    const normalizedAssetType = assetTypeFromMime(normalizedMimeType);
    const isGallery = collection === 'gallery' && normalizedMimeType.startsWith('image/');
    const managedUploadPath = isGallery
        ? userGalleryUploadPath(ownerId)
        : userAssetUploadPath(ownerId, { mimeType: normalizedMimeType, assetType: normalizedAssetType });
    const assetRole = isGallery ? 'gallery' : 'attachment';
    const metadata = {
        role: assetRole,
        alt,
        fileName,
        size: buffer.length,
        folder: managedUploadPath,
        ...(isGallery ? { collection: 'gallery', gallery: true, visibility: 'public' } : {})
    };
    const settings = objectStorage.getSettings();
    const storageMode = objectStorage.normalizeStorageMode(storage === 'auto' ? settings.ossDefaultStorage : storage);
    if (storageMode === 'oss' && !objectStorage.hasUploadParams(settings)) {
        throw new Error('对象存储未启用或参数不完整');
    }
    const shouldTryOss = storageMode !== 'local' && (storageMode === 'oss' || (settings.ossEnabled === true && objectStorage.hasUploadParams(settings)));

    if (shouldTryOss) try {
        const uploaded = await objectStorage.putObject({
            buffer,
            mimeType: normalizedMimeType,
            ext,
            role: 'attachment',
            id,
            uploadPath: managedUploadPath,
            requireEnabled: storageMode !== 'oss'
        });
        if (uploaded?.url) {
            createAssetRecord({
                id,
                articleId: null,
                ownerId,
                assetType: isGallery ? 'gallery-image' : normalizedAssetType,
                mimeType: normalizedMimeType,
                url: uploaded.url,
                storageKey: uploaded.key,
                metadata: { ...metadata, storage: uploaded.storage || 'oss' }
            });
            return db.prepare(`
                SELECT id, article_id, owner_id, asset_type, mime_type, url, storage_key, metadata, created_at, updated_at
                FROM article_assets
                WHERE id = ?
            `).get(id);
        }
    } catch (error) {
        if (storageMode === 'oss') throw new Error('对象存储上传失败，请检查后台配置或上传路径');
        console.warn('OSS file upload failed, falling back to local storage:', error.message);
    }

    saveBufferLocal({ buffer, mimeType: normalizedMimeType, ext, id, ownerId, role: assetRole, alt, fileName, uploadPath: managedUploadPath });
    if (isGallery) {
        db.prepare('UPDATE article_assets SET asset_type = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run('gallery-image', JSON.stringify({ ...metadata, storage: 'local' }), id);
    }
    return db.prepare(`
        SELECT id, article_id, owner_id, asset_type, mime_type, url, storage_key, metadata, created_at, updated_at
        FROM article_assets
        WHERE id = ?
    `).get(id);
}

function saveDataImageLocal(dataUrl, { articleId = null, ownerId = null, role = 'body', alt = '', uploadPath = '' } = {}) {
    const parsed = parseDataImage(dataUrl);
    if (!parsed || !parsed.buffer.length) return null;
    return saveParsedImageLocal(parsed, { articleId, ownerId, role, alt, uploadPath });
}

async function replaceInlineDataImages(content, { articleId = null, ownerId = null } = {}) {
    const assetIds = [];
    const matches = [...String(content || '').matchAll(MARKDOWN_DATA_IMAGE_PATTERN)];
    let nextContent = String(content || '');
    for (const match of matches) {
        const [raw, alt, dataUrl] = match;
        const asset = await saveDataImage(dataUrl, { articleId, ownerId, role: 'body', alt });
        if (!asset) continue;
        assetIds.push(asset.id);
        nextContent = nextContent.replace(raw, `![${alt}](${asset.url})`);
    }
    return { content: nextContent, assetIds };
}

async function normalizeArticleMediaPayload(article, { articleId = null, ownerId = null, allowAnyAsset = false } = {}) {
    const result = { ...article };
    const assetIds = [];

    if (isDataImage(result.coverImage)) {
        const cover = await saveDataImage(result.coverImage, { articleId, ownerId, role: 'cover' });
        if (cover) {
            result.coverImage = cover.url;
            result.coverImageAssetId = cover.id;
            assetIds.push(cover.id);
        }
    }

    if (result.coverImageAssetId) {
        const coverAsset = findCoverAsset(result.coverImageAssetId);
        if (!coverAsset) throw articleMediaError('封面资源不存在');
        const imageAsset = String(coverAsset.mime_type || '').startsWith('image/')
            || String(coverAsset.asset_type || '').includes('image');
        if (!imageAsset) throw articleMediaError('封面必须使用图片资源');
        const ownedByUser = ownerId && coverAsset.owner_id === ownerId;
        const attachedToArticle = articleId && String(coverAsset.article_id || '') === String(articleId);
        if (!allowAnyAsset && !ownedByUser && !attachedToArticle) {
            throw articleMediaError('无权使用该封面资源', 403);
        }
        result.coverImage = durableAssetUrl(coverAsset.id);
        result.coverImageAssetId = coverAsset.id;
        assetIds.push(coverAsset.id);
    }

    const body = await replaceInlineDataImages(result.content || '', { articleId, ownerId });
    result.content = body.content;
    assetIds.push(...body.assetIds);
    result.mediaAssetIds = assetIds;
    return result;
}

function replaceInlineDataImagesLocal(content, { articleId = null, ownerId = null } = {}) {
    const assetIds = [];
    const nextContent = String(content || '').replace(MARKDOWN_DATA_IMAGE_PATTERN, (match, alt, dataUrl) => {
        const asset = saveDataImageLocal(dataUrl, { articleId, ownerId, role: 'body', alt });
        if (!asset) return match;
        assetIds.push(asset.id);
        return `![${alt}](${asset.url})`;
    });
    return { content: nextContent, assetIds };
}

function normalizeArticleMediaPayloadLocal(article, { articleId = null, ownerId = null } = {}) {
    const result = { ...article };
    if (isDataImage(result.coverImage)) {
        const cover = saveDataImageLocal(result.coverImage, { articleId, ownerId, role: 'cover' });
        if (cover) {
            result.coverImage = cover.url;
            result.coverImageAssetId = cover.id;
        }
    }
    const body = replaceInlineDataImagesLocal(result.content || '', { articleId, ownerId });
    result.content = body.content;
    return result;
}

function attachAssetsToArticle(assetIds = [], articleId) {
    const ids = [...new Set(assetIds.filter(Boolean))];
    if (!ids.length || !articleId) return;
    const update = db.prepare('UPDATE article_assets SET article_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    const tx = db.transaction(() => {
        for (const id of ids) update.run(articleId, id);
    });
    tx();
}

function migrateExistingArticleImages() {
    const rows = db.prepare(`
        SELECT id, author_id, cover_image, content
        FROM articles
        WHERE cover_image LIKE 'data:image/%' OR content LIKE '%data:image/%'
    `).all();
    if (!rows.length) return 0;

    const update = db.prepare(`
        UPDATE articles
        SET cover_image = ?, cover_image_asset_id = COALESCE(?, cover_image_asset_id), content = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `);

    const tx = db.transaction(() => {
        for (const row of rows) {
            const normalized = normalizeArticleMediaPayloadLocal({
                coverImage: row.cover_image,
                content: row.content
            }, { articleId: row.id, ownerId: row.author_id });
            update.run(
                normalized.coverImage || row.cover_image,
                normalized.coverImageAssetId || null,
                normalized.content,
                row.id
            );
        }
    });
    tx();
    console.log(`Migrated ${rows.length} articles from inline base64 images to article assets`);
    return rows.length;
}

module.exports = {
    isDataImage,
    normalizeArticleMediaPayload,
    saveUserFileAsset,
    saveUserImageAsset,
    attachAssetsToArticle,
    migrateExistingArticleImages
};
