const { test, expect } = require('../e2e-fixtures.cjs');

test('public profile reflows a long name and filters the displayed articles without losing keyboard focus', async ({ page }) => {
  const nickname = '不擅长捉弄的同学';
  const articles = [
    { id: 11, title: 'Moonrise', category: 'Art', published_at: '2026-01-04', view_count: 4 },
    { id: 12, title: 'Starlight', category: 'Music', published_at: '2026-01-03', view_count: 18 },
    { id: 13, title: 'Moonlight', category: 'Art', published_at: '2026-01-01', view_count: 42 }
  ];
  await page.route(/\/api\/user\/public\/e2e-user(?:\?|$)/, route => route.fulfill({ json: { success: true, data: {
    user: { id: 'e2e-user', username: 'e2e-user', nickname, role: 'user' },
    stats: { articles: 17, totalViews: 123, followers: 0, following: 0 }, viewer: {}, articles
  } } }));
  await page.goto('/users/e2e-user');
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  const title = page.getByRole('heading', { level: 1, name: nickname });
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(title).toBeVisible();
    expect(await title.evaluate(el => el.offsetHeight / parseFloat(getComputedStyle(el).lineHeight))).toBeLessThanOrEqual(2.1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await expect(page.locator('.creator-scope')).toBeVisible();
  await expect(page.locator('.creator-count')).toHaveText('3 / 17');
  await expect(page.locator('.creator-lead h3 a')).toHaveText('Moonrise');
  const topic = page.locator('.creator-topic').filter({ hasText: 'Art' });
  await topic.click();
  await expect(topic).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.creator-story')).toHaveCount(2);
  const popular = page.getByRole('button', { name: /^(热门|Popular|人気)$/ });
  await popular.press('Space');
  await expect(popular).toBeFocused();
  await expect(page.locator('.creator-story h3 a').first()).toHaveText('Moonlight');
  const search = page.locator('.creator-search input');
  await search.fill('no result');
  await expect(page.locator('.creator-story')).toHaveCount(0);
  await page.locator('.creator-empty button').click();
  await expect(search).toHaveValue('');
  await expect(page.locator('.creator-story')).toHaveCount(3);
  await expect(page.getByRole('link', { name: 'Moonlight', exact: true })).toHaveAttribute('href', '/articles/13');
});
