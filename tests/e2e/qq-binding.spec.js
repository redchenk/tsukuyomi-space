const { test, expect } = require('../e2e-fixtures.cjs');
for (const width of [1280, 390]) {
  test(`QQ binding conflict stays visible without opening unlink at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/login');
    await expect(page.locator('#boot-splash')).toBeHidden();
    await expect(page.locator('#app')).toHaveAttribute('data-v-app', '');
    await page.locator('#loginAccount').fill('e2e-user');
    await page.locator('#loginPassword').fill('e2e-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/hub$/);
    await page.goto('/user-center?oauth_error=qq_already_bound');
    const qq = page.locator('.uc-oauth-status').filter({ has: page.getByText('QQ 登录', { exact: true }) });
    await expect(qq.getByRole('status')).toContainText('该 QQ 或当前账号已有其他绑定');
    await expect(qq.locator('input[type=password]')).toHaveCount(0);
    const user = await page.request.get('/api/auth/me');
    expect((await user.json()).data.username).toBe('e2e-user');
    if (process.env.QQ_BIND_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.QQ_BIND_EVIDENCE_DIR}/qq-conflict-${width}.png`, fullPage: true });
  });
}
