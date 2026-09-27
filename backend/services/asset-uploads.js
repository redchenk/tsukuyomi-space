const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const articleMedia = require('./article-media');
const assetRepository = require('../repositories/asset-repository');
const { MAX_USER_UPLOAD_BYTES, validateUserUpload } = require('./file-security');

const CHUNK_BYTES = 4 * 1024 * 1024;
const TTL_MS = 24 * 60 * 60 * 1000;
const ROOT = path.join(config.dataDir, 'asset-upload-sessions');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const locks = new Set();
let running = 0;
let lastCleanup = 0;

function error(message, status = 400) { return Object.assign(new Error(message), { status }); }
function directory(id) {
    if (!UUID.test(String(id))) throw error('上传记录不存在或已过期', 404);
    return path.join(ROOT, id);
}
function initializeRoot() {
    fs.mkdirSync(ROOT, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(ROOT).isSymbolicLink()) throw error('上传暂存目录无效', 503);
}
function read(id, ownerId) {
    try {
        const dir = directory(id);
        if (fs.lstatSync(dir).isSymbolicLink()) throw error('上传记录无效', 404);
        const value = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
        if (value.ownerId !== ownerId || value.expiresAt <= Date.now()) throw error('上传记录不存在或已过期', 404);
        return value;
    } catch (e) {
        if (e.status) throw e;
        throw error('上传记录不存在或已过期', 404);
    }
}
function save(session) {
    const dir = directory(session.id);
    const temp = path.join(dir, 'state.next');
    fs.writeFileSync(temp, JSON.stringify(session), { mode: 0o600 });
    fs.renameSync(temp, path.join(dir, 'state.json'));
}
function sessions() {
    initializeRoot();
    const items = [];
    for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
        if (!entry.isDirectory() || !UUID.test(entry.name)) continue;
        try {
            const row = JSON.parse(fs.readFileSync(path.join(ROOT, entry.name, 'state.json'), 'utf8'));
            items.push(row);
        } catch (_) {
            // Incomplete creation after a crash has no usable session.
            if (!locks.has(entry.name)) fs.rmSync(path.join(ROOT, entry.name), { recursive: true, force: true });
        }
    }
    return items;
}
function cleanup(force = false) {
    if (!force && Date.now() - lastCleanup < 60000) return;
    lastCleanup = Date.now();
    const rows = sessions();
    const completed = rows.filter(s => s.completed).sort((a, b) => b.createdAt - a.createdAt);
    const oldReceipts = new Set(completed.slice(64).map(s => s.id));
    for (const s of rows) {
        if (s.completed && !locks.has(s.id)) fs.rmSync(path.join(directory(s.id), 'upload.bin'), { force: true });
        if (!locks.has(s.id) && (s.expiresAt <= Date.now() || oldReceipts.has(s.id))) {
            fs.rmSync(directory(s.id), { recursive: true, force: true });
        }
    }
}
const timer = setInterval(() => { try { cleanup(true); } catch (e) { console.error('Upload cleanup failed:', e.code || e.name); } }, 60000);
timer.unref();

function create(ownerId, input) {
    cleanup(true);
    const size = Number(input.size);
    if (!Number.isSafeInteger(size) || size <= 0) throw error('文件内容为空或大小无效');
    if (size > MAX_USER_UPLOAD_BYTES) throw error('文件不能超过 100MB', 413);
    const requestId = UUID.test(String(input.requestId)) ? input.requestId : '';
    const rows = sessions();
    const previous = requestId && rows.find(s => s.ownerId === ownerId && s.requestId === requestId);
    if (previous) {
        if (previous.size !== size || previous.fileName !== String(input.fileName || '').trim().slice(0, 180)) throw error('上传参数不一致', 409);
        return previous;
    }
    const pending = rows.filter(s => !s.completed && s.expiresAt > Date.now());
    if (pending.filter(s => s.ownerId === ownerId).length >= 2) throw error('已有两个未完成的上传，请先续传或取消', 429);
    if (pending.length >= 8) throw error('上传暂存空间繁忙，请稍后重试', 429);
    const fileName = String(input.fileName || '').trim().slice(0, 180);
    if (!fileName) throw error('缺少文件名');
    const id = crypto.randomUUID();
    const row = { id, requestId, ownerId, fileName, size, mimeType: String(input.mimeType || '').slice(0, 120),
        alt: String(input.alt || '').slice(0, 500), storage: ['auto', 'local', 'oss'].includes(input.storage) ? input.storage : 'auto',
        parts: [], chunkBytes: CHUNK_BYTES, createdAt: Date.now(), expiresAt: Date.now() + TTL_MS, completed: false };
    fs.mkdirSync(directory(id), { mode: 0o700 });
    fs.closeSync(fs.openSync(path.join(directory(id), 'upload.bin'), 'wx', 0o600));
    save(row);
    return row;
}
function status(id, ownerId) { return publicState(read(id, ownerId)); }
function list(ownerId) {
    cleanup();
    return sessions().filter(s => s.ownerId === ownerId && !s.completed && s.expiresAt > Date.now())
        .map(s => ({ ...publicState(s), fileName: s.fileName }));
}
function publicState(s) {
    // A durable receipt can exist while finalization still holds the lock for
    // temporary-file cleanup. Publish completion only once retries can proceed.
    const finalizing = Boolean((s.processing || s.completed) && locks.has(s.id));
    return { id: s.id, size: s.size, chunkBytes: CHUNK_BYTES, parts: s.parts,
        received: s.parts.reduce((n, p) => n + p.size, 0), expiresAt: s.expiresAt, completed: s.completed && !finalizing,
        processing: finalizing, error: s.error || '' };
}
// Admit before raw parsing, including when clients send a chunked HTTP body.
function admit(req, res, next) {
    if (running >= 2 || (req.params.uploadId && locks.has(req.params.uploadId))) {
        res.set('Retry-After', '2');
        return res.status(429).json({ success: false, message: '上传通道繁忙，正在等待重试' });
    }
    running++;
    const id = req.params.uploadId;
    if (id) locks.add(id);
    let released = false;
    let operationFinished = false;
    let responseFinished = false;
    function release() {
        if (released || !operationFinished || !responseFinished) return;
        released = true; running--;
        if (id) locks.delete(id);
    }
    req.uploadFinished = () => { operationFinished = true; release(); };
    // Parsing errors never enter the handler. The handler takes responsibility
    // for locks once it starts; client disconnects cannot unlock an active write.
    const done = () => { responseFinished = true; if (!req.uploadHandlerStarted) operationFinished = true; release(); };
    res.once('finish', done); res.once('close', done);
    next();
}
async function append(id, ownerId, index, buffer, suppliedHash) {
    const s = read(id, ownerId);
    if (s.completed) throw error('此上传已完成', 409);
    if (!Number.isSafeInteger(index) || index < 0 || index >= Math.ceil(s.size / CHUNK_BYTES)) throw error('分块编号无效');
    if (!Buffer.isBuffer(buffer) || buffer.length !== Math.min(CHUNK_BYTES, s.size - index * CHUNK_BYTES)) throw error('分块大小不匹配');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    if (!/^[a-f0-9]{64}$/.test(String(suppliedHash)) || hash !== suppliedHash) throw error('分块校验失败，请重试', 422);
    if (index < s.parts.length) {
        if (s.parts[index].hash !== hash) throw error('文件内容与已上传分块不同，请重新上传', 409);
        return publicState(s);
    }
    if (index !== s.parts.length) throw error('请按顺序上传分块', 409);
    if (index === 0) validateUserUpload({ buffer: buffer.subarray(0, 4096), fileSize: s.size, fileName: s.fileName, claimedMimeType: s.mimeType });
    const file = await fs.promises.open(path.join(directory(id), 'upload.bin'), fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW || 0));
    try {
        let written = 0;
        while (written < buffer.length) {
            const result = await file.write(buffer, written, buffer.length - written, index * CHUNK_BYTES + written);
            if (!result.bytesWritten) throw error('暂存写入失败', 503);
            written += result.bytesWritten;
        }
        await file.truncate(index * CHUNK_BYTES + buffer.length);
        await file.sync();
    } finally { await file.close(); }
    s.parts.push({ hash, size: buffer.length });
    save(s);
    return publicState(s);
}
async function complete(id, ownerId) {
    const s = read(id, ownerId);
    if (s.completed) {
        const asset = assetRepository.findAssetForOwner(id, ownerId);
        if (!asset) throw error('已完成的附件已被删除', 410);
        return asset;
    }
    if (s.parts.reduce((n, p) => n + p.size, 0) !== s.size) throw error('还有未上传的分块，请继续上传', 409);
    const filePath = path.join(directory(id), 'upload.bin');
    s.processing = true;
    s.error = '';
    save(s);
    try {
        const asset = await articleMedia.saveUserFileFromPath({ ...s, filePath });
        s.completed = true;
        s.processing = false;
        save(s);
        await fs.promises.unlink(filePath).catch(() => {});
        return asset;
    } catch (e) {
        s.processing = false;
        s.error = '保存附件暂时失败，已上传分块已保留，请稍后重试';
        save(s);
        throw e;
    }
}
function cancel(id, ownerId) {
    const s = read(id, ownerId);
    fs.rmSync(directory(s.id), { recursive: true, force: true });
}
module.exports = { CHUNK_BYTES, MAX_USER_UPLOAD_BYTES, create, publicState, status, list, append, complete, cancel, admit, cleanup };
