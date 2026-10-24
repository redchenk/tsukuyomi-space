const { test, expect } = require('../e2e-fixtures.cjs');

for (const width of [1280, 390]) {
  test(`search stays separate from account credentials and password submits once at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/login');
    await page.locator('#loginAccount').fill('e2e-user');
    await page.locator('#loginPassword').fill('e2e-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/hub$/);

    const updates = [];
    await page.route('**/api/user/password', route => {
      updates.push(route.request().postDataJSON());
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });
    await page.route('**/api/user/profile*', async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.data.oauth_accounts = [{ provider: 'qq', nickname: 'Test QQ' }];
      await route.fulfill({ response, json: body });
    });
    await page.goto('/user-center');
    await page.getByRole('button', { name: '管理账号安全', exact: true }).click();
    await expect(page.locator('#ucCurrentPassword')).toBeVisible();
    const owners = await page.evaluate(() => {
      const search = document.querySelector('.uc-navigation-search input');
      const password = document.querySelector('#ucCurrentPassword');
      return {
        distinct: search.form !== password.form,
        searchPasswords: search.form.querySelectorAll('input[type="password"]').length,
        account: password.form.elements.namedItem('username').value,
        credentialFields: [...password.form.elements].filter(el => el.name).map(el => el.name)
      };
    });
    expect(owners).toEqual({
      distinct: true, searchPasswords: 0, account: 'e2e-user',
      credentialFields: ['username', 'current-password', 'new-password', 'confirm-password']
    });

    if (width > 860) {
      const search = page.locator('.uc-navigation-search input');
      await search.fill('安全');
      await expect(page.locator('.uc-tabs button.tab-btn')).toHaveCount(1);
      await search.press('Enter');
      await expect(page).toHaveURL(/\/user-center$/);
      await expect(page.locator('#ucCurrentPassword')).toHaveValue('');
      expect(updates).toEqual([]);
    }

    await page.locator('#ucCurrentPassword').fill('e2e-password');
    await page.locator('#ucNewPassword').fill('test-new-password');
    await page.locator('#ucConfirmNewPassword').fill('test-new-password');
    await page.locator('#ucConfirmNewPassword').press('Enter');
    await expect(page.locator('#ucNewPassword')).toHaveValue('');
    expect(updates).toEqual([{ currentPassword: 'e2e-password', newPassword: 'test-new-password' }]);

    const unlinkRequests = [];
    await page.route('**/api/auth/oauth/qq/unlink', route => {
      unlinkRequests.push(route.request().postDataJSON());
      return route.fulfill({ status: 400, json: { success: false, message: '测试保留绑定' } });
    });
    await page.getByRole('button', { name: '解绑 QQ', exact: true }).click();
    await page.locator('#ucQqUnlinkPassword').fill('e2e-password');
    expect(await page.locator('#ucQqUnlinkPassword').evaluate(input =>
      input.form !== document.querySelector('#ucCurrentPassword').form &&
      input.form.elements.namedItem('username').value === 'e2e-user'
    )).toBe(true);
    await page.locator('#ucQqUnlinkPassword').press('Enter');
    await expect(page.locator('.uc-oauth-unlink-form')).toContainText('测试保留绑定');
    expect(unlinkRequests).toEqual([{ currentPassword: 'e2e-password' }]);

    // A search submitted from the global dialog must continue navigating normally,
    // without using the still-mounted password form or sending another update.
    await page.locator('.site-search-trigger').first().click();
    const globalSearch = page.locator('#site-search input[type="search"]');
    await globalSearch.fill('autofill regression');
    await globalSearch.press('Enter');
    await expect(page).toHaveURL(/\/stage\?q=/);
    expect(updates).toHaveLength(1);
  });
}
