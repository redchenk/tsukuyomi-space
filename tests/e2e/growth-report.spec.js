const { test, expect } = require('../e2e-fixtures.cjs');
test('a visible article, a revisit and the administrator growth report use the real API', async ({
  page
}, info) => {
  test.setTimeout(65000);
  const target = new URL(info.project.use.baseURL);
  test.skip(!['127.0.0.1', 'localhost'].includes(target.hostname), 'Uses the isolated local fixture');
  const site = page.context();
  const list = await (await site.request.get('/api/articles?limit=1')).json();
  const item = (Array.isArray(list.data) ? list.data : list.data.articles || list.data.items)[0];
  const path = '/articles/' + item.id + '?utm_source=readerqa&utm_content=first';
  const before = (await (await site.request.get('/api/articles/' + item.id)).json()).data.view_count;
  const read = () =>
    page.waitForResponse((r) => r.url().endsWith('/' + item.id + '/read') && r.request().method() === 'POST');
  const first = read();
  await page.goto(path);
  expect((await (await first).json()).data.counted).toBe(true);
  const repeat = read();
  await page.reload();
  expect((await (await repeat).json()).data.counted).toBe(false);
  const after = (await (await site.request.get('/api/articles/' + item.id)).json()).data.view_count;
  expect(after).toBe(before + 1);
  await page.goto('/terminal?panel=analytics');
  await expect(page.locator('#boot-splash')).toBeHidden();
  await page.getByRole('textbox', { name: '管理员账号' }).fill('admin');
  await page.locator('input[autocomplete="current-password"]').fill('admin-test-password');
  await page.getByRole('button', { name: '连接终端' }).click();
  const panel = page.locator('.growth-report');
  await expect(panel.getByRole('heading', { name: '增长报表' })).toBeVisible();
  await expect(panel.getByText('readerqa', { exact: true })).toBeVisible();
  const row = panel.getByRole('row').filter({ hasText: item.title });
  await expect(row.locator('td').nth(1)).toHaveText('2');
  await expect(row.locator('td').nth(2)).toHaveText('1');
  await expect(row.locator('td').nth(3)).toHaveText('1');
  await panel.getByLabel('首访分组').selectOption('content');
  await expect(panel.getByText('first', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await panel.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(390);
});
