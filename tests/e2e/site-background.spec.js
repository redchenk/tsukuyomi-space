const { test, expect } = require('../e2e-fixtures.cjs');

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    test(`site artwork stays still while content scrolls at ${viewport.width}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto('/hub');
        const background = page.locator('.site-global-bg');
        await expect(background).toHaveCSS('position', 'fixed');
        await expect(background).toHaveCSS('animation-name', 'none');
        await expect(background).toHaveCSS('background-image', /moonlit-lake.*\.png/);
        const before = await background.boundingBox();
        await page.mouse.move(viewport.width / 2, viewport.height / 2);
        await page.mouse.wheel(0, 600);
        await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
        const after = await background.boundingBox();
        expect(after).toEqual(before);
        expect(after.x).toBe(0);
        expect(after.y).toBe(0);
        expect(after.width).toBe(viewport.width);
        expect(after.height).toBeGreaterThanOrEqual(viewport.height);
    });
}

test('account pages share the artwork; entry video and Room scene are preserved', async ({ page }) => {
    for (const path of ['/login', '/register', '/stage', '/wiki', '/room/settings']) {
        await page.goto(path);
        await expect(page.locator('.site-global-bg')).toHaveCSS('background-image', /moonlit-lake.*\.png/);
    }
    await page.goto('/');
    await expect(page.locator('.site-global-bg')).toHaveCount(0);
    await expect(page.locator('.access-video')).toHaveAttribute('autoplay', '');
    await page.locator('.access-page .primary-btn').click();
    await expect(page).toHaveURL(/\/hub$/);
    await page.goto('/room');
    await expect(page.locator('.room-shell')).toBeVisible();
    await expect(page.locator('.site-global-bg')).toHaveCount(0);
    await page.goto('/hub');
    await expect(page.locator('.site-global-bg')).toHaveCSS('background-image', /moonlit-lake.*\.png/);
});
