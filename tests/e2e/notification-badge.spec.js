const { test, expect } = require('../e2e-fixtures.cjs');

test('the notification dot follows new arrivals and successful inbox visits', async ({ page, request, baseURL }, testInfo) => {
  test.skip(!['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname), 'Uses local fixture accounts.');
  test.setTimeout(60000);
  const owner = 'badge-' + testInfo.project.name;
  const headers = { Origin: baseURL, 'X-Requested-With': 'XMLHttpRequest' };
  async function login(client, username) {
    const response = await client.post('/api/auth/login', { headers, data: { username, password: 'e2e-password' } });
    expect(response.ok()).toBe(true);
    return (await response.json()).data.user;
  }
  const user = await login(page.request, owner);
  await login(request, 'e2e-user');
  const followPath = '/api/user/follow/' + user.id;
  const follow = async () => expect((await request.post(followPath, { headers })).ok()).toBe(true);
  const unfollow = async () => expect((await request.delete(followPath, { headers })).ok()).toBe(true);
  const summary = async () => (await (await page.request.get('/api/user/notifications/unread-count')).json()).data;
  await unfollow();
  await page.request.post('/api/user/notifications/read-all', { headers });
  expect(await summary()).toEqual({ count: 0, latestUnreadId: 0 });
  await follow();
  const first = await summary();
  expect(first.count).toBe(1);
  expect(first.latestUnreadId).toBeGreaterThan(0);

  const account = page.locator('.header-account');
  const dot = account.locator('.notification-dot');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/gallery');
  await expect(dot).toBeVisible();
  await expect(dot).toHaveCSS('animation-iteration-count', 'infinite');
  await expect(dot).toHaveCSS('animation-duration', '1.8s');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(dot).toHaveCSS('animation-name', 'none');
  await expect(dot).toBeVisible();
  await account.click();
  const inbox = page.locator('.account-menu a[href="/notifications"]');
  await expect(inbox.locator('.notification-dot')).toBeVisible();
  await expect(dot).toBeAttached();

  // A failed visit must leave the indicator available, including in another tab.
  const other = await page.context().newPage();
  await other.goto(baseURL + '/gallery');
  const otherDot = other.locator('.header-account .notification-dot');
  await expect(otherDot).toBeVisible();
  await page.route('**/api/user/notifications?*', route => route.fulfill({
    status: 503, json: { success: false, message: 'Temporary test failure' }
  }));
  await inbox.click();
  await expect(page.locator('.notifications-status.error')).toBeVisible();
  await expect(dot).toBeVisible();
  await page.unroute('**/api/user/notifications?*');
  await page.locator('.notifications-actions .primary-btn').click();
  await expect(page.locator('.notification-card.unread').first()).toBeVisible();
  await expect(dot).toHaveCount(0);
  await expect(otherDot).toHaveCount(0);
  await other.close();
  await page.goto('/gallery');
  await expect(account).toBeVisible();
  expect(await summary()).toEqual(first);
  await expect(dot).toHaveCount(0);

  // Replace a read notification with a new one between polls. The total stays at one.
  await page.request.post('/api/user/notifications/' + first.latestUnreadId + '/read', { headers });
  await unfollow();
  await follow();
  const next = await summary();
  expect(next.count).toBe(first.count);
  expect(next.latestUnreadId).toBeGreaterThan(first.latestUnreadId);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(dot).toBeVisible();
  await page.goto('/notifications');
  await expect(page.locator('.notification-card.unread').first()).toBeVisible();
  await expect(dot).toHaveCount(0);
  await page.locator('.notifications-actions .ghost-btn').click();
  await expect(page.locator('.notifications-count')).toHaveText('0');
  expect(await summary()).toEqual({ count: 0, latestUnreadId: 0 });
});
