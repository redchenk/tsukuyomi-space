const { test, expect } = require('../e2e-fixtures.cjs');

test.use({ launchOptions: { args: ['--no-proxy-server'] } });

async function openPage(page, path, theme = 'dark') {
    await page.addInitScript((value) => localStorage.setItem('tsukuyomi_theme', value), theme);
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
}

for (const width of [360, 390, 430, 768]) {
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
    await page.locator('.desktop-navigation').getByRole('button', { name: '更多' }).click();
    const agentLink = dialog.getByRole('link', { name: 'Agent OS', exact: true });
    await agentLink.focus();
    await expect(agentLink).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
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
    await expect(page.locator('#settings-llm-model')).toHaveCSS('font-size', '16px');
    await page.locator('.settings-mobile-menu').click();
    await page.getByRole('button', { name: '语音与朗读 可选', exact: true }).click();
    await expect(page.locator('#room-tts-settings')).toBeVisible();
    await expect(page.locator('.settings-mobile-menu')).toContainText('语音与朗读');
});

test('Room tools stay collapsed in the mobile companion header', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPage(page, '/room');

    const disclosure = page.locator('.room-tools-disclosure');
    const trigger = disclosure.locator('summary');
    const menu = disclosure.locator('.room-mobile-tools');
    await expect(trigger).toBeVisible();
    await expect(disclosure).not.toHaveAttribute('open', '');
    await expect(menu).toBeHidden();

    const triggerBox = await trigger.boundingBox();
    expect(triggerBox.x).toBeGreaterThanOrEqual(0);
    expect(triggerBox.x + triggerBox.width).toBeLessThanOrEqual(390);

    await trigger.click();
    await expect(disclosure).toHaveAttribute('open', '');
    await expect(page.getByRole('button', { name: '日记', exact: true })).toBeVisible();

    await page.getByRole('button', { name: '日记', exact: true }).click();
    await expect(disclosure).not.toHaveAttribute('open', '');
    await expect(menu).toBeHidden();
    await expect(page.locator('#diaryPanel')).toBeVisible();
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
