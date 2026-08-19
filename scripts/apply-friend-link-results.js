const fs = require('fs');
const path = require('path');
const { normalizeFriendLinkUrl } = require('../backend/services/friend-links');

const ALLOWED_STATUSES = new Set(['online', 'slow', 'restricted', 'offline']);
const MAX_RESULT_BYTES = 2 * 1024 * 1024;
const MIN_SCREENSHOT_BYTES = 12 * 1024;
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

function readArgs(argv) {
    const args = {};
    for (let index = 0; index < argv.length; index += 1) {
        if (!argv[index].startsWith('--')) continue;
        args[argv[index].slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--')
            ? argv[++index]
            : 'true';
    }
    return args;
}

function previewUrl(id, timestamp) {
    return `/friend-link-previews/${encodeURIComponent(id)}/${Date.parse(timestamp) || Date.now()}.jpg`;
}

function isJpeg(buffer) {
    return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function validateResultPayload(payload) {
    if (!Array.isArray(payload?.links)) throw new Error('监测结果格式无效');
    const totalCount = Number.parseInt(payload.total_count, 10);
    const checkedCount = Number.parseInt(payload.checked_count, 10);
    if (!Number.isInteger(totalCount) || totalCount < 0 || !Number.isInteger(checkedCount) || checkedCount < 0) {
        throw new Error('监测结果计数无效');
    }
    if (checkedCount !== payload.links.length) throw new Error('监测结果条数与声明不一致');

    const inferredMode = payload.links.length > 0 && payload.links.every(result => result.apply_status === false)
        ? 'screenshots_only'
        : 'status_only';
    const mode = String(payload.mode || inferredMode);
    if (!['status_only', 'screenshots_only'].includes(mode)) throw new Error('监测结果模式无效');
    const target = String(payload.target || '').trim();
    const statusResults = payload.links.filter(result => result.apply_status !== false);

    if (mode === 'status_only') {
        if (!target && totalCount > 0 && checkedCount === 0) throw new Error('完整监测任务没有产生任何结果');
        if (statusResults.length !== payload.links.length) throw new Error('状态监测结果不得跳过状态应用');
        if (statusResults.some(result => !ALLOWED_STATUSES.has(result.status))) throw new Error('状态监测结果包含无效状态');
    } else if (statusResults.length > 0) {
        throw new Error('截图任务不得修改友链状态');
    }

    return {
        mode,
        target,
        totalCount,
        checkedCount,
        expectedStatusUpdates: statusResults.length
    };
}

async function main() {
    const db = require('../backend/db');
    const { runMigrations } = require('../backend/db/migrations/init');
    const friendLinkRepository = require('../backend/repositories/friend-link-repository');
    const objectStorage = require('../backend/services/object-storage');
    const args = readArgs(process.argv.slice(2));
    const inputPath = path.resolve(args.input || 'friend-link-results/result.json');
    const screenshotDir = path.resolve(args.dir || path.join(path.dirname(inputPath), 'screenshots'));
    const stats = fs.statSync(inputPath);
    if (!stats.isFile() || stats.size > MAX_RESULT_BYTES) throw new Error('监测结果文件无效或过大');
    const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const validation = validateResultPayload(payload);

    runMigrations();
    let updated = 0;
    let screenshots = 0;
    let skipped = 0;
    const prepared = [];
    for (const result of payload.links) {
        const id = Number.parseInt(result.id, 10);
        const existing = id > 0 ? friendLinkRepository.findById(id) : null;
        if (!existing || existing.status !== 'active' || normalizeFriendLinkUrl(existing.url) !== normalizeFriendLinkUrl(result.url)) {
            skipped += 1;
            continue;
        }
        prepared.push({ id, result });
    }

    if (validation.mode === 'status_only') {
        if (skipped > 0 || prepared.length !== validation.expectedStatusUpdates) {
            throw new Error(`友链状态应用前校验失败: expected=${validation.expectedStatusUpdates} prepared=${prepared.length} skipped=${skipped}`);
        }
        updated = db.transaction((items) => items.reduce((count, item) => (
            friendLinkRepository.updateMonitorResult(item.id, item.result) ? count + 1 : count
        ), 0))(prepared);
        if (updated !== validation.expectedStatusUpdates) {
            throw new Error(`友链状态未完整落库: expected=${validation.expectedStatusUpdates} updated=${updated}`);
        }
    }

    for (const { id, result } of prepared) {
        const screenshotName = String(result.screenshot_file || '');
        if (!/^\d+\.jpg$/.test(screenshotName) || screenshotName !== `${id}.jpg`) continue;
        const screenshotPath = path.resolve(screenshotDir, screenshotName);
        if (!screenshotPath.startsWith(`${screenshotDir}${path.sep}`) || !fs.existsSync(screenshotPath)) continue;
        const screenshotStats = fs.statSync(screenshotPath);
        if (!screenshotStats.isFile() || screenshotStats.size < MIN_SCREENSHOT_BYTES || screenshotStats.size > MAX_SCREENSHOT_BYTES) continue;
        const buffer = fs.readFileSync(screenshotPath);
        if (!isJpeg(buffer)) continue;

        try {
            const uploaded = await objectStorage.putObject({
                buffer,
                mimeType: 'image/jpeg',
                ext: 'jpg',
                role: 'friend-link-preview',
                id: `friend-link-${id}`,
                uploadPath: 'friend-links/screenshots'
            });
            if (uploaded?.url) {
                const capturedAt = result.screenshot_captured_at || new Date().toISOString();
                friendLinkRepository.updateScreenshot(id, previewUrl(id, capturedAt), capturedAt, uploaded.key);
                screenshots += 1;
            }
        } catch (error) {
            console.warn(`Friend link ${id} screenshot upload failed: ${error.message}`);
        }
    }

    process.stdout.write(`${JSON.stringify({
        mode: validation.mode,
        expected: validation.expectedStatusUpdates,
        updated,
        screenshots,
        skipped
    })}\n`);
}

if (require.main === module) {
    main().catch(error => {
        console.error(error?.stack || error);
        process.exitCode = 1;
    });
}

module.exports = {
    validateResultPayload
};
