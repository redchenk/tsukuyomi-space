const { test, expect } = require('../e2e-fixtures.cjs');

for (const [width, account] of [[1280, 'terminal-nickname-desktop'], [390, 'terminal-nickname-mobile']]) {
    test(`terminal nickname save persists and explains failures at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        await page.goto('/terminal');
        await page.locator('input[autocomplete="username"]').fill('admin');
        await page.locator('input[autocomplete="current-password"]').fill('admin-test-password');
        await page.getByRole('button', { name: '连接终端' }).click();
        await page.getByRole('button', { name: '用户', exact: true }).click();

        const email = `${account}@example.test`;
        const search = page.getByPlaceholder('搜索用户名、邮箱、角色或 ID');
        await search.fill(email);
        const row = page.locator('tbody tr').filter({ hasText: email });
        const draft = row.getByPlaceholder('编辑昵称');
        const save = row.getByRole('button', { name: '保存昵称', exact: true });
        const nextName = `月下旅人-${width}`;
        let releaseSave;
        const saveGate = new Promise(resolve => { releaseSave = resolve; });
        let holdSave = true;
        let failSave = false;
        const methods = [];
        await page.route('**/api/admin/users/*/nickname', async route => {
            const method = route.request().method();
            methods.push(method);
            if (method === 'PATCH' || failSave) {
                await route.fulfill({ status: 400, contentType: 'text/html', body: '' });
                return;
            }
            if (holdSave) await saveGate;
            await route.continue();
        });

        await draft.fill(`  ${nextName}  `);
        const requestStarted = page.waitForRequest(request => request.url().endsWith('/nickname') && request.method() === 'POST');
        await save.click();
        await requestStarted;
        try {
            await expect(row.getByRole('button', { name: '保存中', exact: true })).toBeDisabled();
            await expect(draft).toBeDisabled();
        } finally {
            holdSave = false;
            releaseSave();
        }
        await expect(page.getByRole('status')).toContainText(`的昵称已更新为 ${nextName}`);
        await expect(row.locator('strong')).toHaveText(nextName);
        await expect(row).toContainText(`登录账号：${account}`);
        await expect(draft).toHaveValue(nextName);
        await expect(save).toBeDisabled();
        expect(methods).toEqual(['POST']);

        await page.reload();
        await page.getByRole('button', { name: '用户', exact: true }).click();
        await search.fill(email);
        await expect(row.locator('strong')).toHaveText(nextName);
        await draft.fill('e2e-user');
        await save.click();
        await expect(page.getByRole('status')).toContainText('的昵称已更新为 e2e-user');
        await expect(draft).toHaveValue('e2e-user');
        await expect(save).toBeDisabled();
        await expect(row.locator('strong')).toHaveText('e2e-user');

        failSave = true;
        await draft.fill(`${nextName}-重试`);
        await save.click();
        await expect(page.getByRole('status')).toContainText('HTTP 400');
        await expect(draft).toBeEnabled();
        await expect(save).toBeEnabled();
        await expect(row.locator('strong')).toHaveText('e2e-user');
        failSave = false;
        await save.click();
        await expect(page.getByRole('status')).toContainText(`的昵称已更新为 ${nextName}-重试`);
        await expect(row.locator('strong')).toHaveText(`${nextName}-重试`);
        expect(methods.every(method => method === 'POST')).toBe(true);
        expect(pageErrors).toEqual([]);
    });
}
