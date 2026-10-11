const { test, expect } = require('../e2e-fixtures.cjs');
const fs = require('node:fs');
const path = require('node:path');

const article = {
    id: 3, slug: '八千代语音合成一键包新手教程', title: '八千代语音合成一键包新手教程',
    excerpt: '一步一步让八千代的回复拥有声音。', content: '## 新手教程\n\n公开分享的正文。',
    content_format: 'markdown', cover_image: '/assets/icons/icon-512.png',
    author_id: 'e2e-user-001', author_username: 'e2e-user', published_at: '2026-10-11T04:00:00Z'
};

async function openShare(page, baseURL, { clipboard = 'success', native = 'unavailable', legacy = false, qq = false } = {}) {
    const headers = { Origin: baseURL, 'X-Requested-With': 'XMLHttpRequest', 'Sec-Fetch-Site': 'same-origin' };
    const login = await page.request.post('/api/auth/login', { headers, data: { username: 'e2e-user', password: 'e2e-password' } });
    expect(login.ok()).toBe(true);
    await page.addInitScript(({ clipboard, native, legacy, qq }) => {
        localStorage.setItem('tsukuyomi_user', JSON.stringify({ id: 'e2e-user-001', username: 'e2e-user', role: 'user' }));
        window.testCopiedValues = [];
        window.testNativePayloads = [];
        window.testQQPayloads = [];
        if (qq) {
            const qqVersion = /Android/.test(navigator.userAgent) ? ' V1_AND_SQ_9.2.1 Mobile QQ/9.2.1' : ' Mobile QQ/9.2.1';
            Object.defineProperty(navigator, 'userAgent', { configurable: true, value: navigator.userAgent + qqVersion });
            if (qq === 'mock') window.mqq = { ui: { shareMessage: (payload, callback) => {
                window.testQQPayloads.push(payload);
                window.testQQCallback = callback;
            } } };
        }
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => {
            if (clipboard !== 'success') throw new DOMException('Denied', 'NotAllowedError');
            window.testCopiedValues.push(value);
        } } });
        document.execCommand = command => {
            if (command !== 'copy' || !legacy) return false;
            window.testCopiedValues.push(document.activeElement.value);
            return true;
        };
        Object.defineProperty(navigator, 'share', { configurable: true, value: native === 'unavailable' ? undefined : async payload => {
            window.testNativePayloads.push(payload);
            if (native === 'cancel') throw new DOMException('Cancelled', 'AbortError');
            if (native === 'error') throw new DOMException('Denied', 'NotAllowedError');
        } });
    }, { clipboard, native, legacy, qq });
    const recorded = [];
    await page.route(/\/api\/(?:live\/[^/]+\/)?growth\/actions\/share(?:\?.*)?$/, route => {
        recorded.push(route.request().postDataJSON().platform);
        return route.fulfill({ json: { success: true, data: { state: { level: 1 }, award: null } } });
    });
    await page.route(/\/api\/(?:live\/[^/]+\/)?articles\/3\/live\//, route => route.fulfill({ json: { success: true, data: article } }));
    await page.route(/\/api\/(?:live\/[^/]+\/)?articles\/3\/messages/, route => route.fulfill({ json: { success: true, data: [] } }));
    await page.goto('/article?id=3&from=%2Fstage%3Fpage%3D2#article-top');
    await expect(page.locator('.article-reader h1')).toHaveText(article.title);
    await page.locator('.article-social-actions').getByRole('button', { name: '分享', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '分享', exact: true });
    await expect(dialog).toBeVisible();
    return { dialog, recorded, shortUrl: `${baseURL}/articles/3` };
}

test('copying shares the short stable ID URL while canonical and OG retain the full slug', async ({ page, baseURL }, testInfo) => {
    const { dialog, shortUrl } = await openShare(page, baseURL);
    await expect(dialog.getByRole('textbox', { name: '分享链接' })).toHaveValue(shortUrl);
    await expect(dialog.getByRole('button', { name: '复制分享内容', exact: true })).toBeInViewport();
    await dialog.getByRole('button', { name: '复制链接', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('链接已复制');
    expect(await page.evaluate(() => window.testCopiedValues)).toEqual([shortUrl]);
    const canonical = 'https://yachiyo.hk/articles/3/' + encodeURIComponent(article.slug);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical);
    const directory = path.resolve('output/qq-mobile-share-20261011');
    fs.mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, `${testInfo.project.name}.png`) });
});

test('desktop QQ opens the official share page and gives no reward for launching it', async ({ page, baseURL }, testInfo) => {
    test.skip(Boolean(testInfo.project.use.isMobile), 'Mobile QQ launches the app instead of the QR page');
    const { dialog, recorded, shortUrl } = await openShare(page, baseURL);
    await page.context().route('https://connect.qq.com/widget/shareqq/**', route => route.fulfill({ contentType: 'text/html', body: '<title>QQ 分享页测试</title><p>手机 QQ 扫码后选择好友发送</p>' }));
    const popupPromise = page.waitForEvent('popup');
    await dialog.getByRole('button', { name: 'QQ', exact: true }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    const url = new URL(popup.url());
    expect(url.origin + url.pathname).toBe('https://connect.qq.com/widget/shareqq/index.html');
    expect(url.searchParams.get('url')).toBe(shortUrl);
    expect(url.searchParams.get('title')).toBe(article.title);
    expect(url.searchParams.has('share_id')).toBe(false);
    await expect(dialog.getByRole('status')).toHaveText('请用手机 QQ 扫描打开页面的二维码，再选择好友发送。');
    expect(recorded).toEqual([]);
    expect(await page.evaluate(() => window.testCopiedValues)).toEqual([]);
    await popup.close();
    await dialog.getByRole('button', { name: '复制分享内容', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('标题和链接已复制，请粘贴到 QQ 聊天后发送。');
    expect(await page.evaluate(() => window.testCopiedValues)).toEqual([`${article.title}\n${shortUrl}`]);
    await expect.poll(() => recorded).toEqual(['copy']);
});

test('mobile QQ launches an article card directly without a QR page or launch reward', async ({ page, baseURL }, testInfo) => {
    test.skip(!testInfo.project.use.isMobile, 'This transport is for Android and iOS');
    test.skip(testInfo.project.name === 'webkit-mobile', 'iPhone uses its tested system extension');
    const { dialog, shortUrl, recorded } = await openShare(page, baseURL, { native: 'success' });
    const button = dialog.getByRole('button', { name: 'QQ', exact: true });
    const link = new URL(await button.getAttribute('href'));
    const decode = key => Buffer.from(link.searchParams.get(key), 'base64').toString('utf8');
    expect(link.protocol + '//' + link.host + link.pathname).toBe('mqqapi://share/to_fri');
    expect(decode('url')).toBe(shortUrl);
    expect(decode('title')).toBe(article.title);
    expect(decode('image_url')).toBe(baseURL + article.cover_image);
    expect(Buffer.byteLength(decode('url'))).toBeLessThan(120);
    await expect(dialog.locator('.social-share-hint')).toHaveText('点击 QQ 打开好友选择页，选好友后点发送，即可分享文章卡片。');
    const popups = [];
    page.on('popup', popup => popups.push(popup));
    await button.click();
    await expect(dialog.getByRole('status')).toHaveText('正在打开 QQ，请选择好友并点击发送。');
    expect(recorded).toEqual([]);
    expect(popups).toEqual([]);
    expect(await page.evaluate(() => window.testCopiedValues)).toEqual([]);
    await expect(dialog.getByRole('status')).toHaveText('若 QQ 没有打开，可点「系统分享」选择 QQ，或在 QQ 内打开本页后重试。');
    const directory = path.resolve('output/qq-mobile-share-20261011');
    fs.mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, `${testInfo.project.name}-qq-fallback.png`) });
    // Desktop emulation verifies the outbound app URL and failure guidance.
    // Actual QQ handoff/delivery must be checked on a phone with QQ installed.
});

for (const native of ['success', 'cancel', 'error']) {
    test(`iPhone QQ button uses the system extension and handles ${native}`, async ({ page, baseURL }, testInfo) => {
        test.skip(testInfo.project.name !== 'webkit-mobile', 'This transport is for iPhone and iPad');
        const { dialog, shortUrl, recorded } = await openShare(page, baseURL, { native });
        const button = dialog.getByRole('button', { name: 'QQ', exact: true });
        expect(await button.getAttribute('href')).toBeNull();
        await expect(dialog.locator('.social-share-hint')).toHaveText('iPhone、iPad 会打开系统分享面板，请选择 QQ，再选择好友发送文章卡片。');
        await button.click();
        expect(await page.evaluate(() => window.testNativePayloads)).toEqual([{ title: article.title, text: article.title, url: shortUrl }]);
        if (native === 'success') {
            await expect(dialog.getByRole('status')).toHaveText('请在所选应用中确认收件人并发送。');
            await expect.poll(() => recorded).toEqual(['qq']);
        } else {
            if (native === 'cancel') await expect(dialog.getByRole('status')).toBeEmpty();
            else await expect(dialog.getByRole('status')).toHaveText('QQ 未完成分享，请稍后重试。');
            expect(recorded).toEqual([]);
        }
        expect(await page.evaluate(() => window.testCopiedValues)).toEqual([]);
    });
}

for (const [name, response, status, award] of [
    ['Android confirmation', { retCode: 0 }, 'QQ 已确认分享操作。', true],
    ['iOS confirmation', { ret: 0 }, 'QQ 已确认分享操作。', true],
    ['cancellation', { retCode: 1 }, '', false],
    ['error', { retCode: -1 }, 'QQ 未完成分享，请稍后重试。', false],
    ['unknown callback', {}, 'QQ 未完成分享，请稍后重试。', false]
]) {
    test(`inside QQ uses the friend picker and handles ${name}`, async ({ page, baseURL }) => {
        const { dialog, shortUrl, recorded } = await openShare(page, baseURL, { qq: 'mock' });
        await dialog.getByRole('button', { name: 'QQ', exact: true }).click();
        expect(await page.evaluate(() => window.testQQPayloads)).toEqual([{
            title: article.title, desc: article.excerpt, share_url: shortUrl,
            image_url: baseURL + article.cover_image, share_type: 0, shareElement: 'news', appid: '1904951941', back: true
        }]);
        expect(recorded).toEqual([]);
        await page.evaluate(response => window.testQQCallback(response), response);
        if (status) await expect(dialog.getByRole('status')).toHaveText(status);
        else await expect(dialog.getByRole('status')).toBeEmpty();
        if (award) await expect.poll(() => recorded).toEqual(['qq']);
        else expect(recorded).toEqual([]);
    });
}

test('QQ loads its official SDK under the existing CSP before sharing', async ({ page, baseURL }) => {
    const { dialog, recorded } = await openShare(page, baseURL, { qq: 'real-sdk' });
    await page.waitForFunction(() => typeof window.mqq?.ui?.shareMessage === 'function');
    const scripts = await page.locator('script[src*="qqapi-"]').count();
    expect(scripts).toBe(1);
    await page.evaluate(() => {
        // Verify loading real SDK code; replace only the native call to avoid
        // sending a real message from this controlled browser test.
        window.mqq.ui.shareMessage = (payload, callback) => {
            window.testQQPayloads.push(payload);
            callback({ retCode: 1 });
        };
    });
    await dialog.getByRole('button', { name: 'QQ', exact: true }).click();
    expect(await page.evaluate(() => window.testQQPayloads.length)).toBe(1);
    await expect(dialog.getByRole('status')).toBeEmpty();
    expect(recorded).toEqual([]);
});

test('the real QQ SDK native iframe is allowed by CSP', async ({ page, baseURL }, testInfo) => {
    test.skip(!testInfo.project.use.isMobile, 'The native bridge runs in mobile QQ');
    const { dialog, recorded } = await openShare(page, baseURL, { qq: 'real-sdk' });
    await page.waitForFunction(() => typeof window.mqq?.ui?.shareMessage === 'function');
    await page.evaluate(() => {
        window.testBridgeFrames = [];
        window.testBlockedBridges = [];
        document.addEventListener('securitypolicyviolation', event => {
            if (event.blockedURI.startsWith('jsbridge')) window.testBlockedBridges.push(event.effectiveDirective);
        });
        new MutationObserver(records => {
            for (const record of records) for (const node of record.addedNodes) {
                if (node.tagName === 'IFRAME' && node.src.startsWith('jsbridge:')) window.testBridgeFrames.push(node.src);
            }
        }).observe(document.documentElement, { childList: true, subtree: true });
    });
    await dialog.getByRole('button', { name: 'QQ', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.testBridgeFrames)).toEqual(expect.arrayContaining([
        expect.stringMatching(/^jsbridge:\/\/(?:nav\/shareURLWebRichData|QQApi\/shareMsg)/)
    ]));
    // A desktop browser cannot execute QQ's native handler. It must still allow
    // its frame navigation, rather than silently blocking it with our CSP.
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('iframe[src^="jsbridge:"]').length)).toBe(0);
    expect(await page.evaluate(() => window.testBlockedBridges)).toEqual([]);
    expect(recorded).toEqual([]);
});

test('unavailable QQ SDK reports a failure without claiming or awarding a share', async ({ page, baseURL }) => {
    await page.route('**/assets/qqapi-*.js', route => route.abort());
    const { dialog, recorded } = await openShare(page, baseURL, { qq: 'real-sdk' });
    await dialog.getByRole('button', { name: 'QQ', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('QQ 未完成分享，请稍后重试。');
    expect(recorded).toEqual([]);
});

test('repeated or stale QQ callbacks cannot award shares or overwrite a later copy action', async ({ page, baseURL }) => {
    const { dialog, recorded } = await openShare(page, baseURL, { qq: 'mock' });
    await dialog.getByRole('button', { name: 'QQ', exact: true }).click();
    await page.evaluate(() => {
        window.testQQCallback({ retCode: 0 });
        window.testQQCallback({ retCode: 0 });
    });
    await expect.poll(() => recorded).toEqual(['qq']);
    await dialog.getByRole('button', { name: 'QQ', exact: true }).click();
    await dialog.getByRole('button', { name: '复制链接', exact: true }).click();
    await page.evaluate(() => window.testQQCallback({ retCode: 0 }));
    await expect(dialog.getByRole('status')).toHaveText('链接已复制');
    await expect.poll(() => recorded).toEqual(['qq', 'copy']);
});

test('clipboard denial and failed fallback never claim copied or award sharing', async ({ page, baseURL }) => {
    const { dialog, recorded, shortUrl } = await openShare(page, baseURL, { clipboard: 'denied' });
    await dialog.getByRole('button', { name: '复制链接', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('复制未成功，请选中下方链接手动复制。');
    await expect(dialog.getByRole('textbox', { name: '分享链接' })).toHaveValue(shortUrl);
    expect(await page.evaluate(() => window.testCopiedValues)).toEqual([]);
    expect(recorded).toEqual([]);
});

test('successful legacy copying remains usable when clipboard API is unavailable', async ({ page, baseURL }) => {
    const { dialog, shortUrl, recorded } = await openShare(page, baseURL, { clipboard: 'denied', legacy: true });
    await dialog.getByRole('button', { name: '复制链接', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('链接已复制');
    expect(await page.evaluate(() => window.testCopiedValues)).toEqual([shortUrl]);
    await expect.poll(() => recorded).toEqual(['copy']);
});

test('cancelled native sharing stays quiet and gives no reward', async ({ page, baseURL }) => {
    const { dialog, shortUrl, recorded } = await openShare(page, baseURL, { native: 'cancel' });
    await dialog.getByRole('button', { name: '系统分享', exact: true }).click();
    expect(await page.evaluate(() => window.testNativePayloads)).toEqual([{ title: article.title, text: article.excerpt, url: shortUrl }]);
    await expect(dialog.getByRole('status')).toBeEmpty();
    expect(recorded).toEqual([]);
});

test('system sharing offers the short article link as a separate mobile fallback', async ({ page, baseURL }) => {
    const { dialog, shortUrl, recorded } = await openShare(page, baseURL, { native: 'success' });
    await dialog.getByRole('button', { name: '系统分享', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.testNativePayloads)).toEqual([{ title: article.title, text: article.excerpt, url: shortUrl }]);
    await expect(dialog.getByRole('status')).toHaveText('请在所选应用中确认收件人并发送。');
    await expect.poll(() => recorded).toEqual(['native']);
});
