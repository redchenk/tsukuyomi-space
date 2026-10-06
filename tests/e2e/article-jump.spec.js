const { test, expect } = require('../e2e-fixtures.cjs');

const article = {
    id: 3, title: '长文章跳转测试', content_format: 'markdown',
    content: Array.from({ length: 85 }, (_, i) => `## 第 ${i + 1} 节\n\n${'图片加载后正文高度会继续变化。'.repeat(28)}\n\n![插图 ${i}](/jump-image-${i}.svg)`).join('\n\n')
        + '\n\n' + '文末也保留完整的阅读内容。'.repeat(40)
};
async function fixture(page) {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const requested = new Set();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.route(/\/api\/(?:live\/[^/]+\/)?articles\/3\/live\//, route => route.fulfill({ json: { success: true, data: article } }));
    await page.route(/\/api\/(?:live\/[^/]+\/)?articles\/3\/messages/, route => route.fulfill({ json: { success: true, data: [] } }));
    await page.route(/\/jump-image-\d+\.svg$/, async route => {
        requested.add(new URL(route.request().url()).pathname);
        await pending;
        await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="1400"><rect width="1280" height="1400" fill="#aeb9d3"/></svg>' }).catch(() => {});
    });
    await page.goto('/article?id=3', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.article-content img')).toHaveCount(85);
    return { release, requested, loaded: () => page.locator('.article-content img').evaluateAll(images => images.filter(image => image.complete && image.naturalWidth).length) };
}

for (const width of [390, 1280]) {
    test(`a long article reaches comments and top without loading all intervening images at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        const f = await fixture(page);
        try {
            const quick = page.getByRole('navigation', { name: '文章快捷导航' });
            await quick.getByRole('button', { name: '跳转评论', exact: true }).click();
            await expect(page.locator('.comments-head')).toBeInViewport();
            await expect(page.locator('#article-comments')).toBeFocused();
            f.release();
            await expect.poll(f.loaded).toBeGreaterThan(0);
            // Let the visible/nearby images decode; they must not move comments away.
            await expect.poll(async () => (await f.loaded()) >= f.requested.size).toBe(true);
            await expect(page.locator('.comments-head')).toBeInViewport();
            expect((await page.locator('.comments-head').boundingBox()).y).toBeGreaterThan(80);
            expect(f.requested.size).toBeLessThan(30);
            await quick.getByRole('button', { name: '回到顶部', exact: true }).click();
            await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
            await expect(page.locator('#article-top')).toBeFocused();
        } finally { f.release(); }
    });
}

test('a distant directory link stays at the selected heading after images expand', async ({ page }) => {
    const f = await fixture(page);
    try {
        if (!await page.locator('.article-toc details').evaluate(element => element.open)) {
            await page.locator('.article-toc summary').click();
        }
        await page.locator('.article-toc a').last().click();
        const heading = page.locator('#article-section-85');
        await expect(heading).toBeFocused();
        await expect(heading).toBeInViewport();
        f.release();
        await expect.poll(f.loaded).toBeGreaterThan(0);
        await expect.poll(async () => (await f.loaded()) >= f.requested.size).toBe(true);
        await expect(heading).toBeInViewport();
        await expect.poll(() => heading.evaluate(node => Math.round(node.getBoundingClientRect().top))).toBeLessThan(155);
        expect(f.requested.size).toBeLessThan(30);
    } finally { f.release(); }
});

test('manual scrolling cancels comment alignment even when images finish loading later', async ({ page, browserName }) => {
    const f = await fixture(page);
    try {
        // Disable browser anchoring to isolate the article navigation controller.
        await page.evaluate(() => { document.documentElement.style.overflowAnchor = 'none'; document.body.style.overflowAnchor = 'none'; });
        await page.getByRole('navigation', { name: '文章快捷导航' }).getByRole('button', { name: '跳转评论', exact: true }).click();
        await expect(page.locator('.comments-head')).toBeInViewport();
        const atComments = await page.evaluate(() => scrollY);
        if (browserName === 'webkit') await page.keyboard.press('PageUp');
        else await page.mouse.wheel(0, -700);
        await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(atComments - 400);
        const manualPosition = await page.evaluate(() => scrollY);
        f.release();
        await expect.poll(f.loaded).toBeGreaterThan(0);
        await expect.poll(async () => (await f.loaded()) >= f.requested.size).toBe(true);
        await expect.poll(async () => Math.abs((await page.evaluate(() => scrollY)) - manualPosition)).toBeLessThan(5);
    } finally { f.release(); }
});
