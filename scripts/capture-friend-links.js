const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { resolvePublicUrl } = require('../backend/services/outbound-url-security');

const MIN_SCREENSHOT_BYTES = 12 * 1024;

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

async function mapWithConcurrency(items, limit, worker) {
    let cursor = 0;
    async function run() {
        while (cursor < items.length) await worker(items[cursor++]);
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

async function main() {
    const args = readArgs(process.argv.slice(2));
    const inputPath = path.resolve(args.input || 'friend-link-results/result.json');
    const outputDir = path.resolve(args.dir || 'friend-link-results/screenshots');
    const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const links = Array.isArray(payload.links)
        ? payload.links.filter(link => link.status !== 'offline')
        : [];
    fs.mkdirSync(outputDir, { recursive: true });

    const browser = await chromium.launch({ headless: true });
    try {
        await mapWithConcurrency(links, 2, async link => {
            delete link.screenshot_file;
            delete link.screenshot_captured_at;
            delete link.screenshot_error;
            const context = await browser.newContext({
                viewport: { width: 1280, height: 720 },
                deviceScaleFactor: 1,
                colorScheme: 'light',
                locale: 'zh-CN',
                reducedMotion: 'reduce',
                userAgent: 'TsukuyomiSpace-FriendLinkScreenshot/1.0 (+https://yachiyo.hk/friend-links)'
            });
            const checkedHosts = new Map();
            await context.route('**/*', async route => {
                const request = route.request();
                const resourceType = request.resourceType();
                if (['media', 'websocket', 'eventsource'].includes(resourceType)) return route.abort();
                let requestUrl;
                try {
                    requestUrl = new URL(request.url());
                } catch (_) {
                    return route.abort();
                }
                if (['data:', 'blob:', 'about:'].includes(requestUrl.protocol)) return route.continue();
                if (!['http:', 'https:'].includes(requestUrl.protocol)) return route.abort();
                const cacheKey = `${requestUrl.protocol}//${requestUrl.hostname}`;
                try {
                    if (!checkedHosts.has(cacheKey)) {
                        await resolvePublicUrl(requestUrl.toString(), { protocols: ['http:', 'https:'] });
                        checkedHosts.set(cacheKey, true);
                    }
                    return route.continue();
                } catch (_) {
                    return route.abort();
                }
            });

            const page = await context.newPage();
            try {
                await page.goto(link.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
                await page.addStyleTag({ content: `
                    html { scrollbar-width: none !important; }
                    html::-webkit-scrollbar { display: none !important; }
                    [class*="cookie" i], [id*="cookie" i], [class*="consent" i],
                    [class*="popup" i], [class*="modal" i] { display: none !important; }
                ` }).catch(() => {});
                await page.waitForTimeout(1200);
                const fileName = `${Number.parseInt(link.id, 10)}.jpg`;
                await page.screenshot({
                    path: path.join(outputDir, fileName),
                    type: 'jpeg',
                    quality: 78,
                    fullPage: false,
                    animations: 'disabled'
                });
                const screenshotPath = path.join(outputDir, fileName);
                if (fs.statSync(screenshotPath).size < MIN_SCREENSHOT_BYTES) {
                    fs.unlinkSync(screenshotPath);
                    throw new Error('页面预览为空白或内容过少');
                }
                link.screenshot_file = fileName;
                link.screenshot_captured_at = new Date().toISOString();
                process.stdout.write(`${link.name || link.url}: screenshot captured\n`);
            } catch (error) {
                link.screenshot_error = String(error?.message || '截图失败').slice(0, 200);
                console.warn(`${link.name || link.url}: ${link.screenshot_error}`);
            } finally {
                await context.close();
            }
        });
    } finally {
        await browser.close();
    }

    fs.writeFileSync(inputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

main().catch(error => {
    console.error(error?.stack || error);
    process.exitCode = 1;
});
