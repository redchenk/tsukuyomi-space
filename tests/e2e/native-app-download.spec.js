const { test, expect } = require('../e2e-fixtures.cjs');
const snapshot = require('../../shared/native-app-release.json');

function release(tag) {
  const value = structuredClone(snapshot); const version = tag.slice(1).split('-')[0];
  value.tag_name = tag; value.prerelease = tag.includes('-');
  value.html_url = `https://github.com/redchenk/tsukuyomi-space-app/releases/tag/${tag}`;
  for (const asset of value.assets) {
    asset.name = asset.name.replace(/tsukuyomi-space-\d+\.\d+\.\d+-/, `tsukuyomi-space-${version}-`);
    asset.browser_download_url = `https://github.com/redchenk/tsukuyomi-space-app/releases/download/${tag}/${asset.name}`;
  }
  return value;
}
const body = releases => ({ success: true, data: { releases, source: 'github', stale: false } });

test('signed-in visitors can open App downloads directly from the header on desktop and small phones', async ({ page }) => {
  await page.route('**/api/app/releases', route => route.fulfill({ json: body([snapshot]) }));
  await page.goto('/login');
  await page.locator('#loginAccount').fill('e2e-user');
  await page.locator('#loginPassword').fill('e2e-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/hub$/);
  const link = page.locator('.site-commandbar').getByRole('link', { name: '下载 App', exact: true });
  await expect(link).toHaveAttribute('href', '/download');
  for (const width of [320, 332, 390, 861, 1280, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.locator('.site-commandbar').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const account = await page.locator('.site-account-trigger').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(account.x + account.width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await link.click();
  await expect(page).toHaveURL(/\/download$/);
  await expect(link).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-platform="android"] > .download-button')).toBeVisible();
});

test('automatically chooses the newer beta and keeps all five downloads on the chosen version', async ({ page }) => {
  await page.route('**/api/app/releases', route => route.fulfill({ json: body([release('v0.6.10'), release('v0.6.11-beta.1')]) }));
  await page.goto('/download');
  await expect(page.locator('.download-version strong')).toHaveText('v0.6.11-beta.1');
  for (const key of ['windows', 'macos', 'android', 'linux', 'ios']) {
    await expect(page.locator(`[data-platform="${key}"] > .download-button`)).toHaveAttribute('href', /\/v0\.6\.11-beta\.1\//);
  }
  await page.getByRole('button', { name: '正式版', exact: true }).click();
  await expect(page.locator('.download-version strong')).toHaveText('v0.6.10');
  await expect(page.locator('[data-platform="ios"] > .download-button')).toHaveAttribute('href', /ios-arm64-unsigned\.ipa$/);
  await page.getByRole('button', { name: '测试版', exact: true }).click();
  await expect(page.locator('.download-version strong')).toHaveText('v0.6.11-beta.1');
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('manual checks discover a new release; later failures keep working download links and show the error', async ({ page }) => {
  let tag = 'v0.6.11-beta.1', failed = false;
  await page.route('**/api/app/releases', route => failed
    ? route.fulfill({ status: 503, json: { success: false } })
    : route.fulfill({ json: body([release(tag)]) }));
  await page.goto('/download');
  await expect(page.locator('.download-version strong')).toHaveText(tag);
  tag = 'v0.6.12-beta.1';
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(page.locator('.download-version strong')).toHaveText(tag);
  failed = true;
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('保留上次获取的发行版');
  await expect(page.locator('[data-platform="android"] > .download-button')).toHaveAttribute('href', /\/v0\.6\.12-beta\.1\//);
});

test('visible page refreshes after the cache interval and stops checking after leaving downloads', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-10T14:00:00Z') });
  let tag = 'v0.6.11-beta.1', calls = 0;
  await page.route('**/api/app/releases', route => { calls++; return route.fulfill({ json: body([release(tag)]) }); });
  await page.goto('/download');
  await expect(page.locator('.download-version strong')).toHaveText(tag);
  tag = 'v0.6.12-beta.1';
  await page.clock.fastForward(300001);
  await expect(page.locator('.download-version strong')).toHaveText(tag);
  const beforeLeave = calls;
  await page.locator('.site-brand').click();
  await expect(page).toHaveURL(/\/hub$/);
  await page.clock.fastForward(600001);
  expect(calls).toBe(beforeLeave);
});
