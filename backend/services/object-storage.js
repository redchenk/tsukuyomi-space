const crypto = require('crypto');
const adminRepository = require('../repositories/admin-repository');
const { attachmentDisposition } = require('./file-security');

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

function normalizeStorageMode(value) {
    const mode = String(value || '').trim().toLowerCase();
    return ['auto', 'local', 'oss'].includes(mode) ? mode : 'auto';
}

function normalizeUploadPath(value, fallback = '') {
    const path = trimSlashes(value || fallback)
        .replace(/\\/g, '/')
        .replace(/\/{2,}/g, '/');
    if (!path) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.includes('..')) return '';
    return path
        .split('/')
        .map(part => part.replace(/[^a-zA-Z0-9._~!$&'()+,;=@${}-]/g, '-'))
        .filter(Boolean)
        .join('/');
}

function normalizeObjectKey(value) {
    const key = String(value || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '')
        .replace(/\/{2,}/g, '/');
    if (!key) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(key) || key.includes('..')) return '';
    return key
        .split('/')
        .map(part => part.replace(/[\u0000-\u001f\u007f]/g, '').trim())
        .filter(Boolean)
        .join('/');
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

function aliyunSigningKey(secret, date, region) {
    const kDate = hmac(`aliyun_v4${secret}`, date);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, 'oss');
    return hmac(kService, 'aliyun_v4_request');
}

function normalizeRegion(value) {
    const region = String(value || '').trim();
    if (!region) return 'auto';
    return region === 'Auto' ? 'auto' : region;
}

function isAliyunProvider(settings = {}) {
    const provider = String(settings.ossProvider || '').toLowerCase();
    const endpoint = normalizeEndpoint(settings.ossEndpoint);
    return provider === 'aliyun' || endpoint?.hostname.includes('aliyuncs.com');
}

function canonicalQueryString(searchParams) {
    return [...searchParams.entries()]
        .map(([key, value]) => [encodeURIComponent(key), encodeURIComponent(value)])
        .sort(([aKey, aValue], [bKey, bValue]) => aKey === bKey ? aValue.localeCompare(bValue) : aKey.localeCompare(bKey))
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
}

function buildObjectKey({ settings, id, ext, role = 'body', uploadPath = '' }) {
    const now = new Date();
    const uuid = id || crypto.randomUUID();
    const cleanExt = String(ext || 'bin').replace(/^\./, '').toLowerCase();
    const baseName = String(settings.ossFileNameMode || 'uuid') === 'timestamp'
        ? `${Date.now()}-${uuid.slice(0, 8)}`
        : uuid;
    const template = normalizeUploadPath(uploadPath, settings.ossUploadPath || 'articles/${year}/${month}/${role}');
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

function isPathStyle(settings, endpoint) {
    const provider = String(settings.ossProvider || '').toLowerCase();
    if (provider === 'aliyun' || endpoint.hostname.includes('aliyuncs.com')) {
        return isIpHost(endpoint.hostname);
    }
    return settings.ossForcePathStyle === true || settings.ossForcePathStyle === 'true' || isIpHost(endpoint.hostname);
}

function buildRequestUrl(settings, objectKey) {
    const endpoint = normalizeEndpoint(settings.ossEndpoint);
    if (!endpoint || !settings.ossBucket) return null;

    const forcePathStyle = isPathStyle(settings, endpoint);
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

function aliyunCanonicalPath(settings, url) {
    const endpoint = normalizeEndpoint(settings.ossEndpoint);
    const publicBase = normalizeEndpoint(settings.ossPublicBaseUrl);
    const bucket = trimSlashes(settings.ossBucket || '');
    const pathname = url.pathname || '/';
    if (publicBase && url.hostname === publicBase.hostname) {
        return `/${bucket}${pathname === '/' ? '/' : pathname}`;
    }
    const forcePathStyle = endpoint ? isPathStyle(settings, endpoint) : false;
    if (forcePathStyle) return url.pathname || '/';
    return `/${bucket}${pathname === '/' ? '/' : pathname}`;
}

function publicUrl(settings, objectKey) {
    const publicBaseUrl = String(settings.ossPublicBaseUrl || '').trim().replace(/\/+$/, '');
    if (publicBaseUrl) return `${publicBaseUrl}/${encodeKeyPath(objectKey)}`;
    const requestUrl = buildRequestUrl(settings, objectKey);
    return requestUrl ? requestUrl.toString() : '';
}

function publicUrlForKey(objectKey, settings = getSettings()) {
    const key = normalizeObjectKey(objectKey);
    if (!key) return '';
    return publicUrl(settings, key);
}

function canonicalAliyunV1Resource(settings, url) {
    const signedQueryKeys = new Set([
        'acl',
        'uploads',
        'location',
        'cors',
        'logging',
        'website',
        'referer',
        'lifecycle',
        'delete',
        'append',
        'tagging',
        'objectMeta',
        'uploadId',
        'partNumber',
        'security-token',
        'position',
        'response-cache-control',
        'response-content-disposition',
        'response-content-encoding',
        'response-content-language',
        'response-content-type',
        'response-expires'
    ]);
    const parts = [...url.searchParams.entries()]
        .filter(([key]) => signedQueryKeys.has(key))
        .sort(([aKey, aValue], [bKey, bValue]) => aKey === bKey ? aValue.localeCompare(bValue) : aKey.localeCompare(bKey))
        .map(([key, value]) => value ? `${key}=${value}` : key);
    const resource = aliyunCanonicalPath(settings, url);
    return parts.length ? `${resource}?${parts.join('&')}` : resource;
}

function publicRequestUrl(settings, objectKey) {
    const publicBaseUrl = String(settings.ossPublicBaseUrl || '').trim().replace(/\/+$/, '');
    if (!publicBaseUrl) return null;
    try {
        return new URL(`${publicBaseUrl}/${encodeKeyPath(objectKey)}`);
    } catch (_) {
        return null;
    }
}

function aliyunV1SignatureUrl(objectKey, { expiresSeconds = 21600, contentType = '', contentDisposition = '', preferPublicBase = false, settings: providedSettings = null } = {}) {
    const settings = providedSettings || getSettings();
    const key = normalizeObjectKey(objectKey);
    if (!hasUploadParams(settings) || !key || !isAliyunProvider(settings)) return '';
    const url = preferPublicBase ? (publicRequestUrl(settings, key) || buildRequestUrl(settings, key)) : buildRequestUrl(settings, key);
    if (!url) return '';
    if (String(settings.ossPublicBaseUrl || '').trim().startsWith('https://') || String(settings.ossEndpoint || '').trim().startsWith('https://')) {
        url.protocol = 'https:';
    }
    if (contentType) url.searchParams.set('response-content-type', contentType);
    if (contentDisposition) url.searchParams.set('response-content-disposition', contentDisposition);
    const expiresAt = Math.floor(Date.now() / 1000) + Math.min(Math.max(Number(expiresSeconds) || 21600, 60), 604800);
    const canonicalResource = canonicalAliyunV1Resource(settings, url);
    const stringToSign = ['GET', '', '', String(expiresAt), canonicalResource].join('\n');
    const signature = crypto.createHmac('sha1', settings.ossAccessKeySecret).update(stringToSign, 'utf8').digest('base64');
    url.searchParams.set('OSSAccessKeyId', settings.ossAccessKeyId);
    url.searchParams.set('Expires', String(expiresAt));
    url.searchParams.set('Signature', signature);
    return url.toString();
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

function normalizeExtraHeaders(headers = {}) {
    return Object.fromEntries(
        Object.entries(headers || {})
            .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
            .map(([key, value]) => [String(key).toLowerCase(), String(value)])
    );
}

async function signedFetch({ method, url, region, accessKeyId, accessKeySecret, body = Buffer.alloc(0), contentType = 'application/octet-stream', headers = {}, settings = null }) {
    if (settings && isAliyunProvider(settings)) {
        return aliyunSignedFetch({ method, url, region, accessKeyId, accessKeySecret, body, contentType, headers, settings });
    }
    const now = new Date();
    const requestDate = amzDate(now);
    const scopeDate = dateStamp(now);
    const payloadHash = sha256(body);
    const host = url.host;
    const extraHeaders = normalizeExtraHeaders(headers);
    const headersForCanonical = {
        'content-type': contentType,
        host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': requestDate,
        ...extraHeaders
    };
    const canonicalHeaders = Object.entries(headersForCanonical)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}:${String(value).trim()}\n`)
        .join('');
    const signedHeaders = Object.keys(headersForCanonical).sort().join(';');
    const canonicalRequest = [
        method,
        url.pathname,
        canonicalQueryString(url.searchParams),
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
            'X-Amz-Date': requestDate,
            ...extraHeaders
        },
        body: method === 'PUT' ? body : undefined
    });
}

async function aliyunSignedFetch({ method, url, region, accessKeyId, accessKeySecret, body = Buffer.alloc(0), contentType = 'application/octet-stream', headers = {}, settings }) {
    const now = new Date();
    const requestDate = amzDate(now);
    const scopeDate = dateStamp(now);
    const payloadHash = 'UNSIGNED-PAYLOAD';
    const extraHeaders = normalizeExtraHeaders(headers);
    const headersForCanonical = {
        'x-oss-content-sha256': payloadHash,
        'x-oss-date': requestDate,
        ...extraHeaders
    };
    if (contentType) headersForCanonical['content-type'] = contentType;
    const additionalHeaders = Object.keys(extraHeaders)
        .filter(key => !key.startsWith('x-oss-') && !['content-type', 'content-md5'].includes(key))
        .sort()
        .join(';');
    const canonicalHeaders = Object.entries(headersForCanonical)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}:${String(value).trim()}\n`)
        .join('');
    const canonicalRequest = [
        method,
        aliyunCanonicalPath(settings, url),
        canonicalQueryString(url.searchParams),
        canonicalHeaders,
        additionalHeaders,
        payloadHash
    ].join('\n');
    const credentialScope = `${scopeDate}/${region}/oss/aliyun_v4_request`;
    const stringToSign = [
        'OSS4-HMAC-SHA256',
        requestDate,
        credentialScope,
        sha256(canonicalRequest)
    ].join('\n');
    const signature = hmac(aliyunSigningKey(accessKeySecret, scopeDate, region), stringToSign, 'hex');
    const authorizationParts = [
        `Credential=${accessKeyId}/${credentialScope}`
    ];
    if (additionalHeaders) authorizationParts.push(`AdditionalHeaders=${additionalHeaders}`);
    authorizationParts.push(`Signature=${signature}`);
    const authorization = `OSS4-HMAC-SHA256 ${authorizationParts.join(',')}`;

    return fetch(url, {
        method,
        headers: {
            Authorization: authorization,
            'Content-Type': contentType,
            'X-Oss-Content-Sha256': payloadHash,
            'X-Oss-Date': requestDate,
            ...normalizeExtraHeaders(headers)
        },
        body: method === 'PUT' ? body : undefined
    });
}

function textBetween(value, tag) {
    const match = String(value || '').match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return match ? match[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : '';
}

function parseListObjectsXml(xml) {
    return [...String(xml || '').matchAll(/<Contents>([\s\S]*?)<\/Contents>/gi)]
        .map((match) => {
            const block = match[1];
            return {
                key: textBetween(block, 'Key'),
                size: Number(textBetween(block, 'Size')) || 0,
                etag: textBetween(block, 'ETag').replace(/^"|"$/g, ''),
                lastModified: textBetween(block, 'LastModified')
            };
        })
        .filter(item => item.key);
}

function parseByteRange(range = '', totalSize = 0) {
    const match = String(range || '').match(/^bytes=(\d*)-(\d*)$/i);
    if (!match || !totalSize) return null;
    let start = match[1] === '' ? null : Number(match[1]);
    let end = match[2] === '' ? null : Number(match[2]);
    if (start === null && end === null) return null;
    if (start === null) {
        const suffixLength = Math.max(0, Math.min(end || 0, totalSize));
        start = Math.max(0, totalSize - suffixLength);
        end = totalSize - 1;
    } else {
        if (!Number.isFinite(start) || start < 0 || start >= totalSize) return null;
        end = end === null || !Number.isFinite(end) ? totalSize - 1 : Math.min(end, totalSize - 1);
    }
    if (end < start) return null;
    return { start, end, totalSize };
}

async function fullObjectSlice({ objectKey, range, settings }) {
    const key = normalizeObjectKey(objectKey);
    const url = buildRequestUrl(settings, key);
    if (!url) return null;
    const response = await signedFetch({
        method: 'GET',
        url,
        region: normalizeRegion(settings.ossRegion),
        accessKeyId: settings.ossAccessKeyId,
        accessKeySecret: settings.ossAccessKeySecret,
        body: Buffer.alloc(0),
        contentType: 'application/octet-stream',
        settings
    });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    const parsed = parseByteRange(range, buffer.length);
    if (!parsed) {
        return {
            buffer,
            status: 200,
            contentType: response.headers.get('content-type') || 'application/octet-stream',
            contentLength: String(buffer.length),
            acceptRanges: 'bytes',
            etag: response.headers.get('etag') || '',
            lastModified: response.headers.get('last-modified') || ''
        };
    }
    const sliced = buffer.subarray(parsed.start, parsed.end + 1);
    return {
        buffer: sliced,
        status: 206,
        contentType: response.headers.get('content-type') || 'application/octet-stream',
        contentLength: String(sliced.length),
        contentRange: `bytes ${parsed.start}-${parsed.end}/${parsed.totalSize}`,
        acceptRanges: 'bytes',
        etag: response.headers.get('etag') || '',
        lastModified: response.headers.get('last-modified') || ''
    };
}

async function listObjects({ prefix = '', maxKeys = 100, settings: providedSettings = null } = {}) {
    const settings = providedSettings || getSettings();
    if (!hasUploadParams(settings)) return { objects: [] };
    const url = buildRequestUrl(settings, '');
    if (!url) return { objects: [] };
    url.searchParams.set('list-type', '2');
    url.searchParams.set('max-keys', String(Math.min(Math.max(Number(maxKeys) || 100, 1), 1000)));
    const cleanPrefix = normalizeObjectKey(prefix);
    if (cleanPrefix) url.searchParams.set('prefix', cleanPrefix);
    const response = await signedFetch({
        method: 'GET',
        url,
        region: normalizeRegion(settings.ossRegion),
        accessKeyId: settings.ossAccessKeyId,
        accessKeySecret: settings.ossAccessKeySecret,
        body: Buffer.alloc(0),
        contentType: 'application/octet-stream',
        settings
    });
    const text = await response.text().catch(() => '');
    if (!response.ok) {
        throw new Error(`OSS list failed: HTTP ${response.status} ${text.slice(0, 160)}`);
    }
    return { objects: parseListObjectsXml(text), prefix: cleanPrefix };
}

async function putObject({ buffer, mimeType, ext, role, id, uploadPath = '', settings: providedSettings = null, requireEnabled = true }) {
    const settings = providedSettings || getSettings();
    if ((requireEnabled && !settings.ossEnabled) || !hasUploadParams(settings)) return null;
    const objectKey = buildObjectKey({ settings, id, ext, role, uploadPath });
    const url = buildRequestUrl(settings, objectKey);
    if (!url) return null;
    const response = await signedFetch({
        method: 'PUT',
        url,
        region: normalizeRegion(settings.ossRegion),
        accessKeyId: settings.ossAccessKeyId,
        accessKeySecret: settings.ossAccessKeySecret,
        body: buffer,
        contentType: mimeType || 'application/octet-stream',
        headers: {
            'Content-Disposition': attachmentDisposition(objectKey.split('/').pop() || 'attachment')
        },
        settings
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
        contentType: 'application/octet-stream',
        settings
    });
    return response.ok || response.status === 204 || response.status === 404;
}

async function getObject(objectKey, { range = '', settings: providedSettings = null } = {}) {
    const settings = providedSettings || getSettings();
    const key = normalizeObjectKey(objectKey);
    if (!hasUploadParams(settings) || !key) return null;
    const url = buildRequestUrl(settings, key);
    if (!url) return null;
    const response = await signedFetch({
        method: 'GET',
        url,
        region: normalizeRegion(settings.ossRegion),
        accessKeyId: settings.ossAccessKeyId,
        accessKeySecret: settings.ossAccessKeySecret,
        body: Buffer.alloc(0),
        contentType: 'application/octet-stream',
        headers: range ? { range } : {},
        settings
    });
    if (!response.ok && response.status !== 206) {
        if (range) {
            const fallback = await fullObjectSlice({ objectKey: key, range, settings }).catch(() => null);
            if (fallback) return fallback;
        }
        const text = await response.text().catch(() => '');
        throw new Error(`OSS get failed: HTTP ${response.status} ${text.slice(0, 160)}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return {
        buffer: Buffer.from(arrayBuffer),
        status: response.status,
        contentType: response.headers.get('content-type') || 'application/octet-stream',
        contentLength: response.headers.get('content-length') || '',
        contentRange: response.headers.get('content-range') || '',
        acceptRanges: response.headers.get('accept-ranges') || 'bytes',
        etag: response.headers.get('etag') || '',
        lastModified: response.headers.get('last-modified') || ''
    };
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
    aliyunV1SignatureUrl,
    buildObjectKey,
    buildRequestUrl,
    deleteObject,
    getObject,
    getSettings,
    hasUploadParams,
    isConfigured,
    listObjects,
    normalizeObjectKey,
    normalizeStorageMode,
    normalizeUploadPath,
    publicUrl,
    publicUrlForKey,
    putObject,
    testWrite
};
