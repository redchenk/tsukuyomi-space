const { test, expect } = require('../e2e-drift-fixtures.cjs');

async function login(context, baseURL, username, password) {
    const response = await context.request.post('/api/auth/login', {
        headers: { Origin: new URL(baseURL).origin, 'X-Requested-With': 'XMLHttpRequest' },
        data: { username, password }
    });
    expect(response.ok()).toBe(true);
    return (await response.json()).data.user;
}

async function post(context, baseURL, path, data) {
    const response = await context.request.post(path, {
        headers: { Origin: new URL(baseURL).origin, 'X-Requested-With': 'XMLHttpRequest' }, data
    });
    expect(response.ok()).toBe(true);
    return (await response.json()).data;
}

test('content management reviews bottles and replies in one tab on desktop and mobile', async ({ page, browser, baseURL }, info) => {
    const sender = await browser.newContext({ baseURL });
    const recipient = await browser.newContext({ baseURL });
    const cleanupIds = [];
    try {
        await login(sender, baseURL, 'reply-owner', 'mem0-test-password');
        await login(recipient, baseURL, 'reply-reader', 'mem0-test-password');
        const bottle = await post(sender, baseURL, '/api/drift', { content: '审核标签测试：海边的一封信' });
        cleanupIds.push(bottle.id);
        const picked = await post(recipient, baseURL, '/api/drift/pick', {});
        expect(picked.id).toBe(bottle.id);
        const replyContent = '标签回信：提醒大家谨防诈骗';
        await post(recipient, baseURL, `/api/drift/${bottle.id}/replies`, { content: replyContent });
        const bottleContent = '标签瓶子：如何预防暴力';
        const pending = await post(sender, baseURL, '/api/drift', { content: bottleContent });
        cleanupIds.push(pending.id);
        expect(pending.status).toBe('pending');
        const user = await login(page.context(), baseURL, 'notify-site-admin', 'notify-staff-password');
        await page.addInitScript(user => localStorage.setItem('tsukuyomi_user', JSON.stringify(user)), user);
        await page.setViewportSize({ width: 1365, height: 900 });
        await page.goto('/admin/drift');
        await expect(page.locator('#boot-splash')).toHaveCount(0);
        await expect(page).toHaveURL(/\/admin\?tab=drift$/);
        await expect(page.getByRole('heading', { name: '内容管理', exact: true })).toBeVisible();
        const tab = page.locator('.admin-tabs button', { hasText: '漂流瓶' });
        await expect(tab).toHaveAttribute('aria-current', 'page');
        await expect(page.locator('.admin-tabs button')).toHaveCount(5);
        await expect(page.locator('.drift-page')).toHaveCount(0);
        const bottleRow = page.locator('.admin-row').filter({ hasText: bottleContent });
        const replyRow = page.locator('.admin-row').filter({ hasText: replyContent });
        await expect(bottleRow).toContainText('关键词：暴力');
        await expect(replyRow).toContainText(`所属瓶子 #${bottle.id}`);
        await page.screenshot({ path: info.outputPath('review-desktop.png'), fullPage: true });
        await page.locator('.admin-tabs button', { hasText: '文章' }).click();
        await expect(page).toHaveURL(/tab=articles$/);
        await tab.click();
        await page.reload();
        await expect(page.locator('#boot-splash')).toHaveCount(0);
        await expect(tab).toHaveAttribute('aria-current', 'page');
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(bottleRow.getByRole('button', { name: '通过', exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
        await page.screenshot({ path: info.outputPath('review-mobile.png'), fullPage: true });
        const search = page.getByRole('searchbox', { name: '搜索当前内容' });
        await expect(page.locator('#boot-splash')).toHaveCount(0);
        await search.fill('标签回信');
        await expect(search).toHaveValue('标签回信');
        await expect(bottleRow).toHaveCount(0);
        await expect(replyRow).toBeVisible();
        await search.fill('');
        await expect(bottleRow).toBeVisible();
        await bottleRow.getByRole('button', { name: '通过', exact: true }).click();
        await expect(bottleRow).toHaveCount(0);
        await expect(page.getByRole('status')).toContainText('漂流瓶内容已通过');
        await replyRow.getByRole('button', { name: '拒绝', exact: true }).click();
        await expect(replyRow).toHaveCount(0);
        await expect(page.getByText('暂无待审核的漂流瓶或回信', { exact: true })).toBeVisible();
        const approved = await (await sender.request.get(`/api/drift/${pending.id}`)).json();
        expect(approved.data.bottle.status).toBe('approved');
        const thread = await (await sender.request.get(`/api/drift/${bottle.id}`)).json();
        expect(thread.data.replies.some(row => row.content === replyContent)).toBe(false);
    } finally {
        for (const id of cleanupIds) await sender.request.post(`/api/drift/${id}/close`, {
            headers: { Origin: new URL(baseURL).origin, 'X-Requested-With': 'XMLHttpRequest' }, data: {}
        });
        await sender.close();
        await recipient.close();
    }
});

test('ordinary accounts cannot open the integrated review workspace', async ({ page, baseURL }) => {
    const user = await login(page.context(), baseURL, 'e2e-user', 'e2e-password');
    await page.addInitScript(user => localStorage.setItem('tsukuyomi_user', JSON.stringify(user)), user);
    await page.goto('/admin/drift');
    await expect(page.getByRole('heading', { name: '无管理权限', exact: true })).toBeVisible();
    await expect(page.locator('.admin-tabs')).toHaveCount(0);
    expect((await page.request.get('/api/moderation/drift')).status()).toBe(403);
});
