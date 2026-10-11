const { test, expect } = require('../e2e-fixtures.cjs');
const fs = require('node:fs');
const path = require('node:path');

const article = {
    id: 3, slug: '八千代语音合成一键包新手教程', title: '八千代语音合成一键包新手教程',
    excerpt: '一步一步让八千代的回复拥有声音。', content: '## 新手教程\n\n公开分享的正文。',
    content_format: 'markdown', cover_image: '/assets/icons/icon-512.png',
    author_id: 'e2e-user-001', author_username: 'e2e-user', published_at: '2026-10-11T04:00:00Z'
};

async function openShare(page, baseURL, { clipboard = 'success', native = 'unavailable', legacy = false } = {}) {
    const headers = { Origin: baseURL, 'X-Requested-With': 'XMLHttpRequest', 'Sec-Fetch-Site': 'same-origin' };
    const login = await page.request.post('/api/auth/login', { headers, data: { username: 'e2e-user', password: 'e2e-password' } });
    expect(login.ok()).toBe(true);
    await page.addInitScript(({ clipboard, native, legacy }) => {
        localStorage.setItem('tsukuyomi_user', JSON.stringify({ id: 'e2e-user-001', username: 'e2e-user', role: 'user' }));
        window.testCopiedValues = [];
        window.testNativePayloads = [];
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
        } });
    }, { clipboard, native, legacy });
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
    const directory = path.resolve('output/article-sharing-20261011');
    fs.mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, `${testInfo.project.name}.png`) });
});

test('QQ opens the official share page with clear sending steps and gives no reward for launching it', async ({ page, baseURL }) => {
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
