const { test, expect } = require('../e2e-fixtures.cjs');
async function hub(page, width = 1280) { await page.setViewportSize({ width, height: 900 }); await page.goto('/hub'); await expect(page.locator('#boot-splash')).toHaveCount(0); }
test('shared search supports keyboard selection and preserves the homepage draft', async ({ page }) => {
  await hub(page);
  await page.locator('#home-chat').fill('尚未发送的消息');
  const trigger = page.locator('.header-search');
  await trigger.focus(); await trigger.press('Enter');
  const search = page.getByRole('dialog', { name: '想找些什么？' });
  const input = search.getByRole('combobox');
  await expect(input).toBeFocused(); await input.fill('八千代'); await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', /.+/);
  await page.keyboard.press('Escape'); await expect(search).not.toBeVisible(); await expect(trigger).toBeFocused();
  await expect(page.locator('#home-chat')).toHaveValue('尚未发送的消息');
  await page.keyboard.press('Control+k'); await input.fill('图库'); await input.press('Enter');
  await expect(page).toHaveURL(/\/gallery$/); await expect(search).not.toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});
test('search recovers from API failure and follows the selected article', async ({ page }) => {
  await page.route(/\/api\/(?:live\/[^/]+\/)?articles\?/, route => {
    const q = new URL(route.request().url()).searchParams.get('q');
    return route.fulfill({ json: q === '故障' ? { success: false, message: 'search unavailable' } : { success: true, data: q ? [{ id: 77, title: `${q}的创作手记`, slug: 'moonlight' }] : [] } });
  });
  await hub(page); await page.locator('.header-search').click();
  const search = page.getByRole('dialog', { name: '想找些什么？' });
  await search.getByRole('combobox').fill('故障'); await expect(search.getByText('文章暂时加载失败，页面入口仍可使用。')).toBeVisible();
  await search.getByRole('combobox').fill('月下'); await search.getByRole('option', { name: '月下的创作手记' }).click();
  await expect(page).toHaveURL(/\/articles\/77\/moonlight$/);
});
test('desktop download is in the primary navigation', async ({ page }) => {
  await hub(page); const download = page.locator('.desktop-nav a[href="/download"]');
  await expect(download).toBeVisible(); await download.click(); await expect(page).toHaveURL(/\/download$/);
});
test('native navigation opens once, traps focus and restores its trigger', async ({ page }) => {
  await hub(page); const trigger = page.locator('.desktop-nav button');
  await trigger.focus(); await trigger.press('Enter'); const dialog = page.locator('#site-navigation');
  await expect(dialog).toBeVisible(); expect(await dialog.evaluate(el => el.matches(':modal'))).toBe(true);
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  for (let i = 0; i < 25; i++) { await page.keyboard.press('Tab'); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); }
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});
test('navigation hands off to search and releases its scroll lock', async ({ page }) => {
  await hub(page); await page.locator('.desktop-nav button').click();
  await page.keyboard.press('Control+k'); await expect(page.locator('#site-navigation')).not.toBeVisible();
  await expect(page.getByRole('dialog', { name: '想找些什么？' }).getByRole('combobox')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});
test('mobile navigation keeps download, account and secondary routes reachable', async ({ page }) => {
  await hub(page, 390); await expect(page.locator('.header-download')).toBeVisible();
  await page.locator('.mobile-dock > button').click(); const dialog = page.locator('#site-navigation');
  await dialog.locator('.explore-tiles a[href="/wiki"]').click(); await expect(page).toHaveURL(/\/wiki$/);
  await expect(dialog).not.toBeVisible();
  await page.locator('.header-account').click(); await expect(dialog.locator('a[href="/login"]')).toBeVisible();
  await expect(dialog.locator('a[href="/register"]')).toBeVisible(); await page.keyboard.press('Escape');
  await page.locator('.header-download').click(); await expect(page).toHaveURL(/\/download$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('Japanese navigation fits narrow screens and retains account actions', async ({ page }) => {
  await hub(page, 861); await page.locator('.header-account').click();
  await page.locator('#site-navigation').getByRole('button', { name: '日本語', exact: true }).click();
  await page.keyboard.press('Escape');
  expect(await page.locator('.site-header').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.locator('.header-account').click(); await expect(page.locator('#site-navigation a[href="/login"]')).toBeVisible();
});
