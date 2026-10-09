const { test, expect } = require('../e2e-fixtures.cjs');

async function pending(page, hasEmailMatch = false) {
  await page.route('**/api/auth/oauth/github/pending?*', route => route.fulfill({ json: { success: true,
    data: { provider: 'github', nickname: 'Octocat', email: hasEmailMatch ? 'existing@example.test' : '',
      requiresEmailBinding: true, hasEmailMatch, suggestedUsername: 'octocat' } } }));
  await page.goto('/login?oauth=github&ticket=fixture-ticket&mode=email');
  await expect(page.locator('.oauth-profile')).toContainText('Octocat');
}

for (const width of [1280, 390]) {
  test(`GitHub login and registration entry points remain readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ['/login', '/register']) {
      await page.goto(path);
      const github = page.getByRole('button', { name: 'GitHub 登录', exact: true });
      await expect(github).toBeVisible();
      await expect(page.getByRole('button', { name: 'QQ 登录', exact: true })).toBeVisible();
      const box = await github.boundingBox();
      expect(box.width).toBeGreaterThan(110);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
  });

  test(`new GitHub account verifies email and sets its initial password at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await pending(page);
    await expect(page.locator('.auth-card h1')).toHaveText('绑定邮箱');
    await expect(page.locator('.panel-subtitle')).toContainText('GitHub');
    await expect(page.locator('.oauth-panel')).not.toContainText('QQ');
    await page.locator('#qqBindEmail').fill('new@example.test');
    const codes = [];
    await page.route('**/api/auth/email-code', route => { codes.push(route.request().postDataJSON()); return route.fulfill({ json: { success: true } }); });
    await page.getByRole('button', { name: '发送验证码', exact: true }).click();
    expect(codes).toEqual([{ email: 'new@example.test', purpose: 'oauth_bind' }]);
    await page.locator('#qqEmailBindCode').fill('123456');
    await page.locator('#qqEmailPassword').fill('initial-password');
    await page.locator('#qqEmailPasswordConfirm').fill('initial-password');
    const submissions = [];
    await page.route('**/api/auth/oauth/github/email', route => { submissions.push(route.request().postDataJSON()); return route.fulfill({ status: 400, json: { success: false, message: '测试验证码错误，请重试' } }); });
    await page.getByRole('button', { name: '绑定邮箱并进入', exact: true }).click();
    await expect(page.locator('.form-message')).toContainText('测试验证码错误');
    expect(submissions).toEqual([{ ticket: 'fixture-ticket', email: 'new@example.test', emailCode: '123456', username: 'octocat', newPassword: 'initial-password' }]);
    await expect(page.locator('#qqBindEmail')).toHaveValue('new@example.test');
  });

  test(`existing mailbox binding preserves the password and hides new password fields at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await pending(page, true);
    await expect(page.locator('#qqBindEmail')).toHaveValue('existing@example.test');
    await expect(page.locator('#qqEmailPassword')).toHaveCount(0);
    await expect(page.locator('.oauth-bind-note')).toContainText('保留原密码');
    await page.locator('#qqEmailBindCode').fill('123456');
    const submissions = [];
    await page.route('**/api/auth/oauth/github/email', route => { submissions.push(route.request().postDataJSON()); return route.fulfill({ status: 400, json: { success: false, message: '测试保留账号' } }); });
    await page.getByRole('button', { name: '绑定邮箱并进入', exact: true }).click();
    await expect(page.locator('.form-message')).toContainText('测试保留账号');
    expect(submissions[0].newPassword).toBe('');
    expect(submissions[0].email).toBe('existing@example.test');
  });

  test(`user center manually binds and password-confirms GitHub unlink at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/login');
    await page.locator('#loginAccount').fill('e2e-user');
    await page.locator('#loginPassword').fill('e2e-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/hub$/);
    await page.goto('/user-center');
    await page.getByRole('button', { name: '管理账号安全', exact: true }).click();
    const card = page.locator('.uc-github-status');
    await expect(card.getByRole('button', { name: '绑定 GitHub', exact: true })).toBeVisible();
    await page.route('**/api/auth/oauth/github/start?*', route => route.fulfill({ contentType: 'text/html', body: 'GitHub authorization fixture' }));
    await card.getByRole('button', { name: '绑定 GitHub', exact: true }).click();
    await expect(page).toHaveURL(/\/api\/auth\/oauth\/github\/start\?.*action=bind/);
    await page.route('**/api/user/profile*', async route => { const response = await route.fetch(); const body = await response.json(); body.data.oauth_accounts = [{ provider: 'github', nickname: 'Octocat' }]; await route.fulfill({ response, json: body }); });
    await page.goto('/user-center?oauth_linked=github');
    await expect(card).toContainText('Octocat');
    await card.getByRole('button', { name: '解绑 GitHub', exact: true }).click();
    await card.locator('#ucGitHubUnlinkPassword').fill('e2e-password');
    const unlinks = [];
    await page.route('**/api/auth/oauth/github/unlink', route => { unlinks.push(route.request().postDataJSON()); return route.fulfill({ status: 400, json: { success: false, message: '测试保留绑定' } }); });
    await card.getByRole('button', { name: '确认解绑', exact: true }).click();
    await expect(card.locator('.form-message')).toContainText('测试保留绑定');
    expect(unlinks).toEqual([{ currentPassword: 'e2e-password' }]);
    expect(await card.locator('#ucGitHubUnlinkPassword').evaluate(input => input.form !== document.querySelector('#ucCurrentPassword').form)).toBe(true);
  });
}

test('expired GitHub authorization shows a recoverable error', async ({ page }) => {
  await page.route('**/api/auth/oauth/github/pending?*', route => route.fulfill({ status: 404, json: { success: false, message: 'GitHub 登录状态已过期，请重新授权' } }));
  await page.goto('/login?oauth=github&ticket=expired');
  await expect(page.locator('.oauth-panel .form-message')).toContainText('GitHub 登录状态已过期');
  await page.getByRole('button', { name: '返回普通登录', exact: true }).click();
  await expect(page.getByRole('button', { name: 'GitHub 登录', exact: true })).toBeVisible();
});
