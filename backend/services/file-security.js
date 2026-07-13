const path = require('path');

const MAX_USER_UPLOAD_BYTES = 20 * 1024 * 1024;
const SAFE_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const ALLOWED_USER_MIME_TYPES = new Set([
    ...SAFE_IMAGE_MIME_TYPES,
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mpeg',
    'audio/flac',
    'audio/wav',
    'audio/ogg',
    'audio/mp4',
    'application/pdf',
    'text/plain',
    'text/markdown'
]);
const ALLOWED_EXTENSIONS_BY_MIME = {
    'image/jpeg': new Set(['jpg', 'jpeg']),
    'image/png': new Set(['png']),
    'image/gif': new Set(['gif']),
    'image/webp': new Set(['webp']),
    'video/mp4': new Set(['mp4', 'm4v']),
    'video/webm': new Set(['webm']),
    'video/quicktime': new Set(['mov']),
    'audio/mpeg': new Set(['mp3']),
    'audio/flac': new Set(['flac']),
    'audio/wav': new Set(['wav']),
    'audio/ogg': new Set(['ogg']),
    'audio/mp4': new Set(['m4a']),
    'application/pdf': new Set(['pdf']),
    'text/plain': new Set(['txt']),
    'text/markdown': new Set(['md', 'markdown'])
};

function cleanMime(value = '') {
    return String(value || '').split(';')[0].trim().toLowerCase();
}

function extensionFromName(fileName = '') {
    return path.extname(String(fileName || '').split('?')[0]).replace(/^\./, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function startsWith(buffer, signature) {
    return Buffer.isBuffer(buffer) && buffer.length >= signature.length && signature.every((byte, index) => buffer[index] === byte);
}

function ascii(buffer, start, end) {
    return Buffer.isBuffer(buffer) ? buffer.subarray(start, end).toString('ascii') : '';
}

function looksLikeText(buffer) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) return false;
    const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
    let suspicious = 0;
    for (const byte of sample) {
        if (byte === 0) return false;
        if (byte < 7 || (byte > 13 && byte < 32)) suspicious += 1;
    }
    return suspicious / sample.length < 0.02;
}

function detectMimeFromMagic(buffer, fallback = '') {
    if (!Buffer.isBuffer(buffer) || !buffer.length) return cleanMime(fallback) || 'application/octet-stream';
    if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
    if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
    if (ascii(buffer, 0, 6) === 'GIF87a' || ascii(buffer, 0, 6) === 'GIF89a') return 'image/gif';
    if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WEBP') return 'image/webp';
    if (ascii(buffer, 0, 5) === '%PDF-') return 'application/pdf';
    if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buffer, [0x50, 0x4b, 0x05, 0x06]) || startsWith(buffer, [0x50, 0x4b, 0x07, 0x08])) return 'application/zip';
    if (ascii(buffer, 4, 8) === 'ftyp') {
        const brand = ascii(buffer, 8, 12).toLowerCase();
        if (['qt  '].includes(brand)) return 'video/quicktime';
        if (['m4a ', 'm4b ', 'm4p '].includes(brand)) return 'audio/mp4';
        return 'video/mp4';
    }
    if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
    if (ascii(buffer, 0, 3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
    if (ascii(buffer, 0, 4) === 'fLaC') return 'audio/flac';
    if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WAVE') return 'audio/wav';
    if (ascii(buffer, 0, 4) === 'OggS') return 'audio/ogg';
    if (looksLikeText(buffer)) {
        const sample = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('utf8').trimStart().toLowerCase();
        if (sample.startsWith('<!doctype html') || sample.startsWith('<html') || sample.startsWith('<script')) return 'text/html';
        if (sample.startsWith('<svg') || sample.includes('<svg')) return 'image/svg+xml';
        return cleanMime(fallback).startsWith('text/') ? cleanMime(fallback) : 'text/plain';
    }
    return 'application/octet-stream';
}

function uploadError(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function validateUserUpload({ buffer, fileName = '', claimedMimeType = '' } = {}) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw uploadError('文件内容为空');
    if (buffer.length > MAX_USER_UPLOAD_BYTES) throw uploadError('文件不能超过 20MB', 413);

    const ext = extensionFromName(fileName);
    const claimedMime = cleanMime(claimedMimeType);
    const detectedMime = detectMimeFromMagic(buffer, claimedMime);

    if (!ALLOWED_USER_MIME_TYPES.has(detectedMime)) {
        throw uploadError('不支持此文件类型');
    }

    if (claimedMime && !ALLOWED_USER_MIME_TYPES.has(claimedMime)) {
        throw uploadError('文件声明类型不受支持');
    }

    if (ext) {
        const detectedExtensions = ALLOWED_EXTENSIONS_BY_MIME[detectedMime] || new Set();
        const claimedExtensions = ALLOWED_EXTENSIONS_BY_MIME[claimedMime] || new Set();
        const safeImageTranscode = SAFE_IMAGE_MIME_TYPES.has(detectedMime)
            && SAFE_IMAGE_MIME_TYPES.has(claimedMime)
            && claimedExtensions.has(ext);
        if (!detectedExtensions.has(ext) && !safeImageTranscode) {
            throw uploadError('文件扩展名与内容类型不匹配');
        }
    }

    return {
        ext,
        claimedMimeType: claimedMime,
        detectedMimeType: detectedMime,
        trustedMimeType: detectedMime || claimedMime || 'application/octet-stream'
    };
}

function attachmentDisposition(fileName = 'attachment') {
    const fallback = String(fileName || 'attachment').replace(/[^\x20-\x7e]/g, '_').replace(/["\\\r\n]/g, '_').slice(0, 120) || 'attachment';
    return `attachment; filename="${fallback}"`;
}

module.exports = {
    ALLOWED_USER_MIME_TYPES,
    MAX_USER_UPLOAD_BYTES,
    SAFE_IMAGE_MIME_TYPES,
    cleanMime,
    detectMimeFromMagic,
    validateUserUpload,
    attachmentDisposition
};
