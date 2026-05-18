const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const objectStorage = require('./object-storage');

const DATA_IMAGE_PATTERN = /^data:image\/(png|jpe?g|gif|webp);base64,([\s\S]+)$/i;
const MARKDOWN_DATA_IMAGE_PATTERN = /!\[([^\]\n]*)\]\((data:image\/(?:png|jpe?g|gif|webp);base64,[^)]+)\)/gi;

function normalizeExt(ext) {
    const value = String(ext || '').toLowerCase();
    if (value === 'jpeg') return 'jpg';
    return ['png', 'jpg', 'gif', 'webp'].includes(value) ? value : 'png';
}

function parseDataImage(dataUrl) {
    const match = String(dataUrl || '').match(DATA_IMAGE_PATTERN);
    if (!match) return null;
    const ext = normalizeExt(match[1]);
    const base64 = match[2].replace(/\s/g, '');
    return {
        ext,
        mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        buffer: Buffer.from(base64, 'base64')
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

function uploadFolder() {
    const now = new Date();
    const folder = path.join(
        config.projectRoot,
        'assets',
        'uploads',
        'articles',
        String(now.getFullYear()),
        String(now.getMonth() + 1).padStart(2, '0')
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

function saveParsedImageLocal(parsed, { id = crypto.randomUUID(), articleId = null, ownerId = null, role = 'body', alt = '' } = {}) {
    const fileName = `${id}.${parsed.ext}`;
    const filePath = path.join(uploadFolder(), fileName);
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
    return { id, url };
}

async function saveDataImage(dataUrl, { articleId = null, ownerId = null, role = 'body', alt = '' } = {}) {
    const parsed = parseDataImage(dataUrl);
    if (!parsed || !parsed.buffer.length) return null;

    const id = crypto.randomUUID();
    try {
        const uploaded = await objectStorage.putObject({
            buffer: parsed.buffer,
            mimeType: parsed.mimeType,
            ext: parsed.ext,
            role,
            id
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
            return { id, url: uploaded.url };
        }
    } catch (error) {
        console.warn('OSS image upload failed, falling back to local storage:', error.message);
    }

    return saveParsedImageLocal(parsed, { id, articleId, ownerId, role, alt });
}

async function saveUserImageAsset(dataUrl, { ownerId, alt = '', fileName = '' } = {}) {
    if (!ownerId) return null;
    const asset = await saveDataImage(dataUrl, {
        articleId: null,
        ownerId,
        role: 'attachment',
        alt
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

function saveDataImageLocal(dataUrl, { articleId = null, ownerId = null, role = 'body', alt = '' } = {}) {
    const parsed = parseDataImage(dataUrl);
    if (!parsed || !parsed.buffer.length) return null;
    return saveParsedImageLocal(parsed, { articleId, ownerId, role, alt });
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

async function normalizeArticleMediaPayload(article, { articleId = null, ownerId = null } = {}) {
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
    saveUserImageAsset,
    attachAssetsToArticle,
    migrateExistingArticleImages
};
