const crypto = require('crypto');
const adminRepository = require('../repositories/admin-repository');

function parseSettingValue(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
}

function getSettings() {
    return Object.fromEntries(
        adminRepository.listSettings().map(row => [row.key, parseSettingValue(row.value)])
    );
}

function trimSlashes(value) {
    return String(value || '').trim().replace(/^\/+|\/+$/g, '');
}

function normalizeEndpoint(value) {
    const endpoint = String(value || '').trim().replace(/\/+$/, '');
    if (!endpoint) return null;
    const url = /^https?:\/\//i.test(endpoint) ? endpoint : `http://${endpoint}`;
    try {
        return new URL(url);
    } catch (_) {
        return null;
    }
}

function isIpHost(hostname) {
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
}

function encodeKeyPath(key) {
    return String(key || '').split('/').map(encodeURIComponent).join('/');
}

function hmac(key, value, encoding) {
    return crypto.createHmac('sha256', key).update(value, 'utf8').digest(encoding);
}

function sha256(value, encoding = 'hex') {
    return crypto.createHash('sha256').update(value).digest(encoding);
}

function amzDate(date = new Date()) {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function dateStamp(date = new Date()) {
    return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function signingKey(secret, date, region) {
    const kDate = hmac(`AWS4${secret}`, date);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, 's3');
    return hmac(kService, 'aws4_request');
}

function normalizeRegion(value) {
    const region = String(value || '').trim();
    if (!region) return 'auto';
    return region === 'Auto' ? 'auto' : region;
}

function buildObjectKey({ settings, id, ext, role = 'body' }) {
    const now = new Date();
    const uuid = id || crypto.randomUUID();
    const cleanExt = String(ext || 'bin').replace(/^\./, '').toLowerCase();
    const baseName = String(settings.ossFileNameMode || 'uuid') === 'timestamp'
        ? `${Date.now()}-${uuid.slice(0, 8)}`
        : uuid;
    const template = String(settings.ossUploadPath || 'articles/${year}/${month}/${role}').trim();
    const folder = template
        .replace(/\$\{year\}/g, String(now.getFullYear()))
        .replace(/\$\{month\}/g, String(now.getMonth() + 1).padStart(2, '0'))
        .replace(/\$\{day\}/g, String(now.getDate()).padStart(2, '0'))
        .replace(/\$\{role\}/g, role)
        .replace(/\$\{uuid\}/g, uuid)
        .replace(/\$\{ext\}/g, cleanExt);
    return [settings.ossPrefix, folder, `${baseName}.${cleanExt}`]
        .map(trimSlashes)
        .filter(Boolean)
        .join('/');
}

function buildRequestUrl(settings, objectKey) {
    const endpoint = normalizeEndpoint(settings.ossEndpoint);
    if (!endpoint || !settings.ossBucket) return null;

    const forcePathStyle = settings.ossForcePathStyle === true || settings.ossForcePathStyle === 'true' || isIpHost(endpoint.hostname);
    const encodedKey = encodeKeyPath(objectKey);
    const url = new URL(endpoint.toString());
    if (forcePathStyle) {
        url.pathname = `/${encodeURIComponent(settings.ossBucket)}/${encodedKey}`;
    } else {
        url.hostname = `${settings.ossBucket}.${url.hostname}`;
        url.pathname = `/${encodedKey}`;
    }
    return url;
}

function publicUrl(settings, objectKey) {
    const publicBaseUrl = String(settings.ossPublicBaseUrl || '').trim().replace(/\/+$/, '');
    if (publicBaseUrl) return `${publicBaseUrl}/${encodeKeyPath(objectKey)}`;
    const requestUrl = buildRequestUrl(settings, objectKey);
    return requestUrl ? requestUrl.toString() : '';
}

function hasUploadParams(settings = getSettings()) {
    return Boolean(
        settings.ossEndpoint &&
        settings.ossBucket &&
        settings.ossAccessKeyId &&
        settings.ossAccessKeySecret
    );
}

function isConfigured(settings = getSettings()) {
    return Boolean(settings.ossEnabled === true && hasUploadParams(settings));
}

async function signedFetch({ method, url, region, accessKeyId, accessKeySecret, body = Buffer.alloc(0), contentType = 'application/octet-stream' }) {
    const now = new Date();
    const requestDate = amzDate(now);
    const scopeDate = dateStamp(now);
    const payloadHash = sha256(body);
    const host = url.host;
    const canonicalHeaders = [
        `content-type:${contentType}`,
        `host:${host}`,
        `x-amz-content-sha256:${payloadHash}`,
        `x-amz-date:${requestDate}`
    ].join('\n') + '\n';
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
        method,
        url.pathname,
        url.searchParams.toString(),
        canonicalHeaders,
        signedHeaders,
        payloadHash
    ].join('\n');
    const credentialScope = `${scopeDate}/${region}/s3/aws4_request`;
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        requestDate,
        credentialScope,
        sha256(canonicalRequest)
    ].join('\n');
    const signature = hmac(signingKey(accessKeySecret, scopeDate, region), stringToSign, 'hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return fetch(url, {
        method,
        headers: {
            Authorization: authorization,
            'Content-Type': contentType,
            'X-Amz-Content-Sha256': payloadHash,
            'X-Amz-Date': requestDate
        },
        body: method === 'PUT' ? body : undefined
    });
}

async function putObject({ buffer, mimeType, ext, role, id, settings: providedSettings = null, requireEnabled = true }) {
    const settings = providedSettings || getSettings();
    if ((requireEnabled && !settings.ossEnabled) || !hasUploadParams(settings)) return null;
    const objectKey = buildObjectKey({ settings, id, ext, role });
    const url = buildRequestUrl(settings, objectKey);
    if (!url) return null;
    const response = await signedFetch({
        method: 'PUT',
        url,
        region: normalizeRegion(settings.ossRegion),
        accessKeyId: settings.ossAccessKeyId,
        accessKeySecret: settings.ossAccessKeySecret,
        body: buffer,
        contentType: mimeType || 'application/octet-stream'
    });
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`OSS upload failed: HTTP ${response.status} ${text.slice(0, 160)}`);
    }
    return {
        storage: 'oss',
        key: objectKey,
        url: publicUrl(settings, objectKey)
    };
}

async function deleteObject(objectKey, settings = getSettings()) {
    if (!hasUploadParams(settings) || !objectKey) return false;
    const url = buildRequestUrl(settings, objectKey);
    if (!url) return false;
    const response = await signedFetch({
        method: 'DELETE',
        url,
        region: normalizeRegion(settings.ossRegion),
        accessKeyId: settings.ossAccessKeyId,
        accessKeySecret: settings.ossAccessKeySecret,
        body: Buffer.alloc(0),
        contentType: 'application/octet-stream'
    });
    return response.ok || response.status === 204 || response.status === 404;
}

async function testWrite(settings = getSettings()) {
    if (!hasUploadParams(settings)) {
        return { ok: false, skipped: true, message: '对象存储上传参数未填写完整' };
    }
    const id = crypto.randomUUID();
    const startedAt = Date.now();
    const uploaded = await putObject({
        buffer: Buffer.from('tsukuyomi-object-storage-test', 'utf8'),
        mimeType: 'text/plain; charset=utf-8',
        ext: 'txt',
        role: 'test',
        id,
        settings,
        requireEnabled: false
    });
    if (!uploaded) {
        return { ok: false, skipped: true, message: '对象存储上传参数未填写完整' };
    }
    await deleteObject(uploaded.key, settings).catch(() => false);
    return {
        ok: true,
        elapsedMs: Date.now() - startedAt,
        key: uploaded.key,
        url: uploaded.url
    };
}

module.exports = {
    buildObjectKey,
    buildRequestUrl,
    deleteObject,
    getSettings,
    hasUploadParams,
    isConfigured,
    publicUrl,
    putObject,
    testWrite
};
