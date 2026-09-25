const { test, expect } = require('../e2e-fixtures.cjs');

for (const account of ['admin', 'notify-staff', 'notify-site-admin']) {
    test(`${account} can persist a personal moderation email preference`, async ({ page }) => {
        if (account === 'notify-site-admin') {
            await page.goto('/login');
            await page.locator('#loginAccount').fill(account);
            await page.locator('#loginPassword').fill('notify-staff-password');
            await page.locator('button[type="submit"]').click();
            await expect(page).toHaveURL(/\/hub$/);
            await page.goto('/terminal?panel=notifications');
        } else {
            await page.goto('/terminal?panel=notifications');
            await page.locator('input[autocomplete="username"]').fill(account);
            await page.locator('input[autocomplete="current-password"]').fill(account === 'admin' ? 'admin-test-password' : 'notify-staff-password');
            await page.getByRole('button', { name: '连接终端' }).click();
        }
        const form = page.locator('.terminal-notification-settings');
        await expect(form).toBeVisible();
        const toggle = page.getByRole('checkbox', { name: '待审核留言邮件提醒' });
        await expect(toggle).not.toBeChecked();
        await expect(toggle).toBeEnabled();
        await toggle.check();
        await form.getByRole('button', { name: '保存通知设置' }).click();
        await expect(page.getByText('通知设置已保存', { exact: true })).toBeVisible();
        await page.reload();
        await expect(toggle).toBeChecked();
        if (account === 'admin') {
            await expect(page.getByRole('checkbox', { name: '新评论与回复邮件通知' })).toBeVisible();
        } else {
            await expect(page.getByRole('checkbox', { name: '新评论与回复邮件通知' })).toHaveCount(0);
        }
        await toggle.uncheck();
        await form.getByRole('button', { name: '保存通知设置' }).click();
        await expect(page.getByText('通知设置已保存', { exact: true })).toBeVisible();
        await page.goto('/terminal?panel=messages');
        await expect(page.getByRole('heading', { name: '留言', exact: true })).toBeVisible();
        await expect(page.locator('.terminal-load-error')).toHaveCount(0);
    });
}
