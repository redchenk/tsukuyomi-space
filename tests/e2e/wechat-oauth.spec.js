const { test, expect } = require('@playwright/test');

test('WeChat sign-in opens the website login flow and retains the destination', async ({ page }) => {
    await page.route('**/api/settings*', async route => {
        const response = await route.fetch();
        const body = await response.json();
        body.data.wechatOAuthEnabled = true;
        await route.fulfill({ response, json: body });
    });
    await page.route('**/api/auth/oauth/wechat/start?*', route => route.fulfill({
        contentType: 'text/html', body: 'WeChat authorization fixture'
    }));
    await page.goto('/login?redirect=%2Fgallery');
    const button = page.getByRole('button', { name: '微信登录', exact: true });
    await expect(button).toBeVisible();
    await button.click();
    await expect(page).toHaveURL(/\/api\/auth\/oauth\/wechat\/start\?redirect=%2Fgallery/);
});

test('WeChat completion offers email verification and a password for new users', async ({ page }) => {
    await page.route('**/api/auth/oauth/wechat/pending?*', route => route.fulfill({
        json: { success: true, data: { provider: 'wechat', nickname: '扫码用户', requiresEmailBinding: true } }
    }));
    await page.goto('/login?oauth=wechat&ticket=fixture-ticket');
    const form = page.locator('.oauth-email-form');
    await expect(form).toBeVisible();
    await expect(page.locator('.oauth-panel')).not.toContainText('QQ');
    await expect(form.locator('#qqEmailPassword')).toHaveCount(0);
    await form.getByRole('checkbox').check();
    await expect(form.locator('#qqEmailPassword')).toBeVisible();
});

test('unconfigured WeChat credentials leave ordinary sign-in available', async ({ page }) => {
    await page.route('**/api/settings*', async route => {
        const response = await route.fetch();
        const body = await response.json();
        body.data.wechatOAuthEnabled = false;
        await route.fulfill({ response, json: body });
    });
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'QQ 登录', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '微信登录', exact: true })).toHaveCount(0);
});
