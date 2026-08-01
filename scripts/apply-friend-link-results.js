const fs = require('fs');
const path = require('path');
const { runMigrations } = require('../backend/db/migrations/init');
const friendLinkRepository = require('../backend/repositories/friend-link-repository');
const objectStorage = require('../backend/services/object-storage');
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
    return `/api/friend-links/${encodeURIComponent(id)}/preview?v=${Date.parse(timestamp) || Date.now()}`;
}

function isJpeg(buffer) {
    return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

async function main() {
    const args = readArgs(process.argv.slice(2));
    const inputPath = path.resolve(args.input || 'friend-link-results/result.json');
    const screenshotDir = path.resolve(args.dir || path.join(path.dirname(inputPath), 'screenshots'));
    const stats = fs.statSync(inputPath);
    if (!stats.isFile() || stats.size > MAX_RESULT_BYTES) throw new Error('监测结果文件无效或过大');
    const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    if (!Array.isArray(payload.links)) throw new Error('监测结果格式无效');

    runMigrations();
    let updated = 0;
    let screenshots = 0;
    let skipped = 0;
    for (const result of payload.links) {
        const id = Number.parseInt(result.id, 10);
        const existing = id > 0 ? friendLinkRepository.findById(id) : null;
        if (!existing || existing.status !== 'active' || normalizeFriendLinkUrl(existing.url) !== normalizeFriendLinkUrl(result.url)) {
            skipped += 1;
            continue;
        }
        const applyStatus = result.apply_status !== false;
        if (applyStatus && !ALLOWED_STATUSES.has(result.status)) {
            skipped += 1;
            continue;
        }

        if (applyStatus) {
            friendLinkRepository.updateMonitorResult(id, result);
            updated += 1;
        }

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

    process.stdout.write(`${JSON.stringify({ updated, screenshots, skipped })}\n`);
}

main().catch(error => {
    console.error(error?.stack || error);
    process.exitCode = 1;
});
