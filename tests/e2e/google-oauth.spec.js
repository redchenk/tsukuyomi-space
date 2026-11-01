const { test, expect } = require('../e2e-fixtures.cjs');

for (const lang of ['zh', 'en', 'ja']) for (const width of [320, 390, 1280]) {
  test(`Google entry is localized without overflow: ${lang} ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(lang => { localStorage.setItem('lang', lang); localStorage.setItem('tsukuyomi_theme', 'light'); }, lang);
    for (const route of ['/login', '/register']) {
      await page.goto(route);
      await expect(page.locator('#boot-splash')).toHaveCount(0);
      const name = { zh: 'Google 登录', en: 'Sign in with Google', ja: 'Google でログイン' }[lang];
      const button = page.getByRole('button', { name, exact: true });
      await expect(button).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const image = button.locator('img');
      expect(await image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      await page.screenshot({ path: `output/google-login/${info.project.name}-${lang}-${width}-${route.slice(1)}.png` });
    }
  });
}

test('an unconfigured Google client is hidden while existing sign-in remains available', async ({ page }) => {
  await page.route('**/api/settings*', async route => {
    const response = await route.fetch();
    const body = await response.json(); body.data.googleOAuthEnabled = false;
    await route.fulfill({ response, json: body });
  });
  await page.goto('/login');
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  await expect(page.locator('.oauth-icon-btn.google')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'QQ 登录', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'GitHub 登录', exact: true })).toBeVisible();
});

async function pending(page, hasEmailMatch = false) {
  await page.route('**/api/auth/oauth/google/pending?*', route => route.fulfill({ json: { success: true,
    data: { provider: 'google', nickname: 'Google Tester', email: hasEmailMatch ? 'existing@example.test' : '',
      requiresEmailBinding: true, hasEmailMatch, suggestedUsername: 'octocat' } } }));
  await page.goto('/login?oauth=google&ticket=fixture-ticket&mode=email');
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  await expect(page.locator('.oauth-profile')).toContainText('Google Tester');
}

for (const width of [1280, 390]) {
  test(`Google login and registration entry points remain readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ['/login', '/register']) {
      await page.goto(path);
      const google = page.getByRole('button', { name: 'Google 登录', exact: true });
      await expect(google).toBeVisible();
      await expect(page.getByRole('button', { name: 'QQ 登录', exact: true })).toBeVisible();
      const box = await google.boundingBox();
      expect(box.width).toBeGreaterThan(110);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
  });

  test(`new Google account verifies email and sets its initial password at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await pending(page);
    await expect(page.locator('.auth-card h1')).toHaveText('绑定邮箱');
    await expect(page.locator('.panel-subtitle')).toContainText('Google');
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
    await page.route('**/api/auth/oauth/google/email', route => { submissions.push(route.request().postDataJSON()); return route.fulfill({ status: 400, json: { success: false, message: '测试验证码错误，请重试' } }); });
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
    await page.route('**/api/auth/oauth/google/email', route => { submissions.push(route.request().postDataJSON()); return route.fulfill({ status: 400, json: { success: false, message: '测试保留账号' } }); });
    await page.getByRole('button', { name: '绑定邮箱并进入', exact: true }).click();
    await expect(page.locator('.form-message')).toContainText('测试保留账号');
    expect(submissions[0].newPassword).toBe('');
    expect(submissions[0].email).toBe('existing@example.test');
  });

  test(`user center manually binds and password-confirms Google unlink at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/login');
    await expect(page.locator('#boot-splash')).toHaveCount(0);
    await page.locator('#loginAccount').fill('e2e-user');
    await page.locator('#loginPassword').fill('e2e-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/hub$/);
    await page.goto('/user-center');
    await page.getByRole('button', { name: '管理账号安全', exact: true }).click();
    const card = page.locator('.uc-google-status');
    await expect(card.getByRole('button', { name: '绑定 Google', exact: true })).toBeVisible();
    await page.route('**/api/auth/oauth/google/start?*', route => route.fulfill({ contentType: 'text/html', body: 'Google authorization fixture' }));
    await card.getByRole('button', { name: '绑定 Google', exact: true }).click();
    await expect(page).toHaveURL(/\/api\/auth\/oauth\/google\/start\?.*action=bind/);
    await page.route('**/api/user/profile*', async route => { const response = await route.fetch(); const body = await response.json(); body.data.oauth_accounts = [{ provider: 'google', nickname: 'Google Tester' }]; await route.fulfill({ response, json: body }); });
    await page.goto('/user-center?oauth_linked=google');
    await expect(card).toContainText('Google Tester');
    await card.getByRole('button', { name: '解绑 Google', exact: true }).click();
    await card.locator('#ucGoogleUnlinkPassword').fill('e2e-password');
    const unlinks = [];
    await page.route('**/api/auth/oauth/google/unlink', route => { unlinks.push(route.request().postDataJSON()); return route.fulfill({ status: 400, json: { success: false, message: '测试保留绑定' } }); });
    await card.getByRole('button', { name: '确认解绑', exact: true }).click();
    await expect(card.locator('.form-message')).toContainText('测试保留绑定');
    expect(unlinks).toEqual([{ currentPassword: 'e2e-password' }]);
    expect(await card.locator('#ucGoogleUnlinkPassword').evaluate(input => input.form !== document.querySelector('#ucCurrentPassword').form)).toBe(true);
  });
}

test('expired Google authorization shows a recoverable error', async ({ page }) => {
  await page.route('**/api/auth/oauth/google/pending?*', route => route.fulfill({ status: 404, json: { success: false, message: 'Google 登录状态已过期，请重新授权' } }));
  await page.goto('/login?oauth=google&ticket=expired');
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  await expect(page.locator('.oauth-panel .form-message')).toContainText('Google 登录状态已过期');
  await expect(page.locator('.oauth-panel form')).toHaveCount(0);
  await expect(page.locator('.oauth-panel')).not.toContainText('QQ');
  await page.getByRole('button', { name: '返回普通登录', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Google 登录', exact: true })).toBeVisible();
});
