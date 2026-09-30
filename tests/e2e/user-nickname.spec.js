const { test, expect } = require('../e2e-fixtures.cjs');

for (const [width, account] of [[1280, 'nickname-own-desktop'], [390, 'nickname-own-mobile']]) {
    test(`users can change nicknames without changing login or profile links at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('/login');
        await page.locator('#loginAccount').fill(account);
        await page.locator('#loginPassword').fill('mem0-test-password');
        await page.getByRole('button', { name: '登录', exact: true }).click();
        await expect(page).toHaveURL(/\/hub$/);
        await page.goto('/user-center');
        await expect(page.locator('#ucNickname')).toBeEnabled();
        await expect(page.locator('#ucUsername')).toHaveValue(account);
        await expect(page.locator('#ucUsername')).toBeDisabled();
        await expect(page.locator('#ucUserId')).toHaveValue(account);
        await expect(page.locator('#ucUserId')).toBeDisabled();

        const nickname = `🌙 月下旅人 ${width}`;
        await page.locator('#ucNickname').fill(`  ${nickname}  `);
        await page.getByRole('button', { name: '保存资料', exact: true }).click();
        await expect(page.locator('.uc-username')).toHaveText(nickname);
        await expect(page.locator('#ucNickname')).toHaveValue(nickname);
        const session = await (await page.request.get('/api/auth/me')).json();
        expect(session.data.username).toBe(account);
        expect(session.data.id).toBe(account);
        expect(session.data.nickname).toBe(nickname);
        await page.reload();
        await expect(page.locator('#ucNickname')).toHaveValue(nickname);
        await expect(page.locator('#ucUsername')).toHaveValue(account);

        await page.getByRole('button', { name: '账号菜单', exact: true }).click();
        await expect(page.locator('.site-account-greeting')).toHaveText(nickname);
        await page.goto(`/users/${account}`);
        await expect(page.locator('h1')).toHaveText(nickname);
        await expect(page).toHaveURL(new RegExp(`/users/${account}$`));
        expect(errors).toEqual([]);
    });
}
