const { test, expect } = require('../e2e-fixtures.cjs');

test('shared search finds navigation aliases, supports keyboard selection and preserves Room drafts', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/room');
    await page.locator('#chatInput').fill('尚未发送的消息');
    await page.locator('.site-search-trigger').click();
    const search = page.getByRole('dialog', { name: '想找些什么？' });
    const input = search.getByRole('searchbox');
    await expect(input).toBeFocused();
    await input.fill('八千代');
    await input.press('ArrowDown');
    await expect(search.getByRole('link', { name: '私人居所 /room' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(search).not.toBeVisible();
    await expect(page.locator('.site-search-trigger')).toBeFocused();
    await expect(page.locator('#chatInput')).toHaveValue('尚未发送的消息');
    await page.keyboard.press('Control+k');
    await expect(search).toBeVisible();
    await search.getByRole('searchbox').fill('图库');
    await search.getByRole('searchbox').press('Enter');
    await expect(page).toHaveURL(/\/gallery$/);
    await expect(search).not.toBeVisible();
    await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
});

test('search displays real API results, survives an error and follows the selected article', async ({ page }) => {
    const queries = [];
    await page.route(/\/api\/(?:live\/[^/]+\/)?articles\?/, route => {
        const q = new URL(route.request().url()).searchParams.get('q');
        queries.push(q);
        return route.fulfill({ json: q === '故障'
            ? { success: false, message: 'search unavailable' }
            : { success: true, data: q ? [{ id: 77, title: `${q}的创作手记`, slug: 'moonlight' }] : [] } });
    });
    await page.goto('/hub');
    await page.locator('.site-search-trigger').click();
    const search = page.getByRole('dialog', { name: '想找些什么？' });
    await search.getByRole('searchbox').fill('故障');
    await expect(search.getByText('文章暂时加载失败，页面入口仍可使用。')).toBeVisible();
    await search.getByRole('searchbox').fill('月下');
    await expect(search.getByRole('link', { name: '月下的创作手记' })).toBeVisible();
    expect(queries).toContain('月下');
    await search.getByRole('link', { name: '月下的创作手记' }).click();
    await expect(page).toHaveURL(/\/articles\/77\/moonlight$/);
});

test('signed-in Japanese navigation fits a narrow desktop and keeps account actions', async ({ page }) => {
    await page.setViewportSize({ width: 861, height: 844 });
    await page.goto('/login');
    await page.locator('#loginAccount').fill('e2e-user');
    await page.locator('#loginPassword').fill('e2e-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/hub$/);
    await page.getByRole('button', { name: '账号菜单', exact: true }).click();
    const menu = page.locator('#site-navigation');
    await expect(menu.getByRole('link', { name: '用户中心', exact: true })).toBeVisible();
    await menu.getByRole('button', { name: '日本語', exact: true }).click();
    await page.keyboard.press('Escape');
    expect(await page.locator('.site-commandbar').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(page.getByRole('button', { name: /通知、未読/ })).toBeVisible();
});

for (const width of [360, 390, 860, 1024, 1440]) {
    test(`navigation and Room controls fit ${width}px without a duplicate global rail`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/room');
        await expect(page.locator('.site-commandbar')).toBeVisible();
        await expect(page.locator('.site-rail')).toHaveCount(0);
        const header = await page.locator('.site-commandbar').boundingBox();
        expect(header.x).toBeGreaterThanOrEqual(0);
        expect(header.x + header.width).toBeLessThanOrEqual(width);
        expect(await page.locator('.site-commandbar').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        if (width <= 860) {
            const tools = await page.locator('.room-mobile-header').boundingBox();
            expect(tools.y).toBeGreaterThanOrEqual(header.y + header.height);
            await expect(page.locator('.mobile-bottom-nav')).toBeVisible();
            await page.locator('.mobile-bottom-nav button').click();
        } else {
            await page.locator('.desktop-navigation').getByRole('button', { name: '探索' }).click();
        }
        const menu = page.locator('#site-navigation');
        await expect(menu.getByRole('link', { name: /^友情链接/ })).toBeVisible();
        await expect(menu.getByRole('link', { name: /^Agent OS/ })).toHaveAttribute('href', '/agent-os');
        await page.keyboard.press('Escape');
        await expect(menu).not.toBeVisible();
    });
}
