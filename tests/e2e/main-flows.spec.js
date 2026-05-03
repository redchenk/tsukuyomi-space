const { test, expect } = require('@playwright/test');

async function loginAsUser(page) {
    await page.goto('/login');
    await page.locator('#loginAccount').fill('e2e-user');
    await page.locator('#loginPassword').fill('e2e-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/hub$/);
}

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
});

test('user can log in and reach the hub', async ({ page }) => {
    await loginAsUser(page);
    await expect(page.getByText('e2e-user')).toBeVisible();
});

test('user can read an article and post a comment', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/article?id=1');
    await expect(page.getByRole('heading', { name: '欢迎来到月读空间' })).toBeVisible();

    const comment = `E2E article comment ${Date.now()}`;
    await page.locator('.comment-input').first().fill(comment);
    await page.getByRole('button', { name: '发布评论' }).click();

    await expect(page.getByText(comment)).toBeVisible();
});

test('user can publish a plaza message', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/plaza');

    const message = `E2E plaza message ${Date.now()}`;
    await page.locator('.plaza-textarea').fill(message);
    await page.locator('.plaza-composer-actions').getByRole('button', { name: '发布' }).click();

    await expect(page.getByText(message)).toBeVisible();
});

test('admin can open the terminal dashboard and user panel', async ({ page }) => {
    await page.goto('/terminal');
    await page.locator('input[autocomplete="username"]').fill('admin');
    await page.locator('input[autocomplete="current-password"]').fill('admin-test-password');
    await page.getByRole('button', { name: '连接终端' }).click();

    await expect(page.getByText('Tsukuyomi Terminal')).toBeVisible();
    await expect(page.getByRole('heading', { name: '系统总览' })).toBeVisible();

    await page.getByRole('button', { name: /用户/ }).click();
    await expect(page.getByRole('heading', { name: '用户管理' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'e2e-user' }).first()).toBeVisible();
});
