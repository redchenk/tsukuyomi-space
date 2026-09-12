const { test, expect } = require('@playwright/test');

test.use({ launchOptions: { args: ['--no-proxy-server'] } });

async function openPage(page, path, theme = 'dark') {
    await page.addInitScript((value) => localStorage.setItem('tsukuyomi_theme', value), theme);
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
}

for (const width of [360, 390, 768]) {
    test(`public pages fit a ${width}px viewport in both themes`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        for (const theme of ['light', 'dark']) {
            for (const path of ['/hub', '/stage', '/plaza', '/gallery', '/pixel', '/room/settings']) {
                await openPage(page, path, theme);
                await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
                const toolbar = page.locator('.topbar');
                await expect(toolbar).toBeVisible();
                const box = await toolbar.boundingBox();
                expect(box.x).toBeGreaterThanOrEqual(0);
                expect(box.x + box.width).toBeLessThanOrEqual(width);
            }
        }
    });
}

test('mobile navigation traps focus, locks scroll, restores focus and follows routes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPage(page, '/stage');
    await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'instant' }));
    const scrollY = await page.evaluate(() => window.scrollY);
    const trigger = page.locator('.mobile-bottom-nav button');
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: '更多' });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((node) => node.matches(':modal'))).toBe(true);
    await expect(page.locator('body')).toHaveCSS('position', 'fixed');
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: '日本語', exact: true })).toBeFocused();
    for (let i = 0; i < 18; i++) {
        await page.keyboard.press('Tab');
        expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollY);
    await trigger.click();
    await dialog.getByRole('link', { name: '图库', exact: true }).click();
    await expect(page).toHaveURL(/\/gallery$/);
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
    await expect(trigger).toHaveClass(/active/);
    await expect(page.locator('.site-brand small')).toHaveText('图库');
    await trigger.click();
    await page.mouse.click(5, 5);
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
});

test('navigation fits a landscape viewport and releases the page on desktop resize', async ({ page }) => {
    await page.setViewportSize({ width: 740, height: 390 });
    await openPage(page, '/plaza');
    await page.locator('.mobile-bottom-nav button').click();
    const dialog = page.locator('#site-navigation');
    const box = await dialog.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(390);
    await dialog.getByRole('button', { name: '日本語', exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('button', { name: '日本語', exact: true })).toBeInViewport();
    await page.setViewportSize({ width: 1280, height: 600 });
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
    const rail = page.locator('.rail-nav');
    await rail.getByRole('link', { name: 'Agent OS', exact: true }).focus();
    await expect(rail.getByRole('link', { name: 'Agent OS', exact: true })).toBeInViewport();
});

test('mobile content, settings controls and empty states stay compact and usable', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openPage(page, '/stage');
    const firstArticle = page.locator('.stage-card').first();
    await expect(firstArticle).toBeVisible();
    expect((await firstArticle.boundingBox()).y).toBeLessThan(500);
    await page.locator('.stage-about summary').click();
    await expect(page.locator('.stage-seo-intro')).toBeVisible();
    await page.goto('/plaza');
    await expect(page.locator('.plaza-wall')).toBeVisible();
    expect((await page.locator('.plaza-wall').boundingBox()).y).toBeLessThan(550);
    await expect(page.locator('.ts-empty-title').first()).toHaveCSS('border-top-width', '0px');
    await page.goto('/room/settings');
    await expect(page.locator('.site-brand small')).toHaveText('房间设置');
    for (const label of await page.locator('.room-setup-stepper strong').all()) {
        expect(await label.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    }
    await expect(page.locator('.room-simple-form select').first()).toHaveCSS('font-size', '16px');
    await page.getByRole('button', { name: '2 语音', exact: true }).click();
    await expect(page.locator('.room-setup-stepper button').nth(1)).toHaveAttribute('aria-current', 'step');
});

test('Room input remains above an overlay keyboard and composition never sends a message', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
        const viewport = new EventTarget();
        Object.assign(viewport, { height: 844, width: 390, offsetTop: 0, offsetLeft: 0, scale: 1 });
        Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
    });
    await openPage(page, '/room');
    const input = page.locator('#chatInput');
    await expect(input).toBeVisible();
    await input.fill('中文输入测试');
    await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229, bubbles: true });
    await expect(input).toHaveValue('中文输入测试');
    await page.evaluate(() => {
        window.visualViewport.height = 430;
        window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await expect(page.locator('.app-shell')).toHaveClass(/is-keyboard-open/);
    await expect(page.locator('.mobile-bottom-nav')).toHaveCSS('visibility', 'hidden');
    const box = await input.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(430);
    await input.evaluate((node) => node.blur());
    await expect(page.locator('.app-shell')).not.toHaveClass(/is-keyboard-open/);
    await expect(page.locator('.mobile-bottom-nav')).toHaveCSS('visibility', 'visible');
});

test('account pages show their own navigation title on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPage(page, '/login');
    await page.locator('#loginAccount').fill('e2e-user');
    await page.locator('#loginPassword').fill('e2e-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/hub$/);
    for (const [path, title] of [['/user-center', '用户中心'], ['/notifications', '站内信'], ['/attachments', '附件库']]) {
        await page.goto(path);
        await expect(page.locator('.site-brand small')).toHaveText(title);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
});
