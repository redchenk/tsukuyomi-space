const { test, expect } = require('../e2e-fixtures.cjs');
const fs = require('node:fs');
const path = require('node:path');

async function fixture(page) {
  const requests = [];
  await page.route(/\/api\/(?:live\/[^/]+\/)?articles\?/, route => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(Object.fromEntries(params));
    const current = Number(params.get('page'));
    return route.fulfill({ json: {
      success: true, data: [{ id: `story-page-${current}`, title: `第 ${current} 页故事`, excerpt: '保留筛选条件，直接跳转。', category: '技术', author: '月下旅人', published_at: '2026-11-15T00:00:00Z' }],
      pagination: { page: current, limit: 6, total: 29, totalPages: 5 }
    } });
  });
  return requests;
}
async function jump(page, number, enter = false) {
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert', '');
  await page.getByRole('spinbutton', { name: '跳转页码' }).fill(String(number));
  if (enter) await page.getByRole('spinbutton', { name: '跳转页码' }).press('Enter');
  else await page.getByRole('button', { name: '跳转', exact: true }).click();
}

test('Stage page jump preserves filters, refresh and browser history', async ({ page }, info) => {
  if (info.project.name === 'webkit-mobile') await page.setViewportSize({ width: 320, height: 568 });
  const requests = await fixture(page), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/stage?category=技术&q=春日&sort=featured&page=2');
  await expect(page.locator('.journal-title h2')).toHaveText('第 2 页故事');
  await jump(page, 4, true);
  await expect(page.locator('.journal-title h2')).toHaveText('第 4 页故事');
  await expect(page.locator('.journal-page-count')).toHaveText('页码 4 / 5');
  expect(requests.at(-1)).toMatchObject({ category: '技术', q: '春日', sort: 'featured', page: '4', limit: '6' });
  expect(new URL(page.url()).searchParams.get('page')).toBe('4');
  await expect(page.locator('.journal-title')).toHaveAttribute('href', /from=.*page%3D4/);
  await page.goBack();
  await expect(page.locator('.journal-title h2')).toHaveText('第 2 页故事');
  await page.goForward();
  await expect(page.locator('.journal-title h2')).toHaveText('第 4 页故事');
  await page.reload();
  await expect(page.locator('.journal-title h2')).toHaveText('第 4 页故事');
  await jump(page, 1);
  await expect(page.locator('.journal-title h2')).toHaveText('第 1 页故事');
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  expect(requests.at(-1)).toMatchObject({ category: '技术', q: '春日', sort: 'featured', page: '1' });
  await page.locator('.journal-page-navigation').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(page.getByRole('button', { name: '跳转', exact: true })).toBeInViewport({ ratio: 1 });
  const out = path.resolve(process.env.STAGE_EVIDENCE_DIR || 'test-results'); fs.mkdirSync(out, { recursive: true });
  await page.screenshot({ path: path.join(out, `stage-pages-${info.project.name}.png`), animations: 'disabled' });
  expect(errors).toEqual([]);
});

test('Stage rejects invalid pages and can return to the URL page after loading more', async ({ page }) => {
  const requests = await fixture(page);
  await page.goto('/stage?page=2');
  await expect(page.locator('.journal-title h2')).toHaveText('第 2 页故事');
  const input = page.getByRole('spinbutton', { name: '跳转页码' });
  for (const value of ['', '0', '6', '2.5']) {
    await input.fill(value);
    await page.getByRole('button', { name: '跳转', exact: true }).click();
    expect(await input.evaluate(el => el.checkValidity())).toBe(false);
    await expect(page.locator('.journal-title h2')).toHaveText('第 2 页故事');
  }
  expect(requests.map(r => r.page)).toEqual(['2']);
  await page.getByRole('button', { name: '再读一些', exact: true }).click();
  await expect(page.locator('.journal-title h2')).toHaveText(['第 2 页故事', '第 3 页故事']);
  await jump(page, 2);
  await expect(page.locator('.journal-title h2')).toHaveText('第 2 页故事');
  await jump(page, 5);
  await expect(page.locator('.journal-title h2')).toHaveText('第 5 页故事');
  await expect(page.getByRole('button', { name: '再读一些', exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '文章分页' })).toBeVisible();
});
