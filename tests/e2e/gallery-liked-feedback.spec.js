const fs = require('node:fs');
const { test, expect } = require('../e2e-fixtures.cjs');

async function createImage(page, title) {
    await page.goto('/login');
    await expect(page.locator('#boot-splash')).toHaveCount(0);
    await page.locator('#loginAccount').fill('e2e-user');
    await page.locator('#loginPassword').fill('e2e-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/hub$/);
    const response = await page.request.post('/api/assets', {
        headers: { 'X-Requested-With': 'XMLHttpRequest', Origin: new URL(page.url()).origin },
        data: {
            dataUrl: `data:image/webp;base64,${fs.readFileSync('src/frontend/assets/navigation/gallery-yachiyo.webp').toString('base64')}`,
            fileName: `${title}.webp`, collection: 'gallery', storage: 'local'
        }
    });
    const result = await response.json();
    expect(result.success, JSON.stringify(result)).toBe(true);
    return result.data;
}

async function expectRedLike(button) {
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).toContainText('已赞');
    await expect(button).toBeDisabled();
    await expect(button).toHaveCSS('opacity', '1');
    await expect.poll(() => button.evaluate(el => {
        const [red, green, blue] = getComputedStyle(el).color.match(/[\d.]+/g).map(Number);
        return red > green * 1.25 && red > blue * 1.2;
    })).toBe(true);
    // Read both styles in one frame: WebKit can still be animating the color
    // between separate reads immediately after a successful request.
    await expect.poll(() => button.evaluate(el => {
        const fill = getComputedStyle(el.querySelector('svg')).fill;
        return fill !== 'none' && fill === getComputedStyle(el).color
            && el.getAnimations().every(animation => animation.playState !== 'running');
    })).toBe(true);
}

for (const width of [1440, 390]) {
    test(`successful gallery likes stay red in cards, previews and all seasonal themes at ${width}px`, async ({ page }, testInfo) => {
        // Eight full reloads and two like controls per palette on CI WebKit.
        test.setTimeout(90_000);
        await page.setViewportSize({ width, height: 960 });
        const title = `月下影像-${testInfo.project.name}-${width}`;
        const asset = await createImage(page, title);
        await page.goto('/gallery');
        const card = page.locator('.gallery-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
        const cardLike = card.locator('.gallery-like-button');
        await expect(cardLike).toHaveAttribute('aria-pressed', 'false');
        await expect(cardLike.locator('svg')).toHaveCSS('fill', 'none');
        if (width === 390) {
            await card.locator('.gallery-thumb').click();
            await page.locator('.gallery-viewer .gallery-like-button').click();
            await expectRedLike(page.locator('.gallery-viewer .gallery-like-button'));
            await page.getByRole('button', { name: '关闭图片预览' }).click();
        } else await cardLike.click();
        await expectRedLike(cardLike);
        await expect(cardLike.locator('.gallery-like-count')).toHaveText('1');
        await card.scrollIntoViewIfNeeded();
        await card.screenshot({ path: testInfo.outputPath(`liked-card-${width}.png`) });

        for (const season of ['spring', 'summer', 'autumn', 'winter']) {
            for (const theme of ['light', 'dark']) {
                await page.evaluate(({ season, theme }) => {
                    localStorage.setItem('tsukuyomi_season_theme_v1', JSON.stringify({ version: 1, mode: season, hemisphere: 'north' }));
                    localStorage.setItem('tsukuyomi_theme', theme);
                }, { season, theme });
                await page.goto(`/gallery?image=${asset.id}`);
                await page.reload();
                await expect(page.locator('html')).toHaveAttribute('data-season', season);
                await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
                await expectRedLike(cardLike);
                const previewLike = page.locator('.gallery-viewer .gallery-like-button');
                await expectRedLike(previewLike);
                await expect(previewLike.locator('.gallery-like-count')).toHaveText('1');
                if (season === 'winter' && theme === 'dark') {
                    await page.screenshot({ path: testInfo.outputPath(`liked-preview-dark-${width}.png`) });
                }
            }
        }
        const persisted = await (await page.request.get(`/api/assets/gallery/${asset.id}`)).json();
        expect(persisted.data.viewer_liked).toBe(true);
        expect(persisted.data.like_count).toBe(1);
    });
}

test('a failed gallery like stays unliked and can be retried successfully', async ({ page }, testInfo) => {
    const title = `点赞重试-${testInfo.project.name}`;
    const asset = await createImage(page, title);
    const endpoint = `**/api/assets/gallery/${asset.id}/like`;
    await page.route(endpoint, route => route.fulfill({ status: 503, json: { success: false, message: '点赞暂时不可用，请重试' } }));
    await page.goto(`/gallery?image=${asset.id}`);
    const button = page.locator('.gallery-viewer .gallery-like-button');
    const originalColor = await button.evaluate(el => getComputedStyle(el).color);
    await button.click();
    await expect(page.locator('.gallery-like-error')).toContainText('点赞暂时不可用，请重试');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(button).toBeEnabled();
    await expect(button).toHaveCSS('color', originalColor);
    await expect(button.locator('svg')).toHaveCSS('fill', 'none');
    await page.unroute(endpoint);
    await button.click();
    await expectRedLike(button);
    await expect(button.locator('.gallery-like-count')).toHaveText('1');
});
