const { test, expect } = require('../e2e-fixtures.cjs');

function report(days, end = '2026-10-30') {
  const rows = Array.from({ length: days }, (_, i) => ({ date: new Date(Date.parse(end + 'T00:00:00Z') - i * 86400000).toISOString().slice(0, 10),
    llm: { total: i ? 0 : 12, completed: i ? 0 : 10, incomplete: i ? 0 : 1, pending: i ? 0 : 1 },
    tts: { total: i ? 0 : 4, completed: i ? 0 : 3, incomplete: i ? 0 : 1, pending: 0 } }));
  return { timezone: 'Asia/Shanghai', from: rows.at(-1).date, to: end, days, rows,
    today: { ...rows[0], date: '2026-10-30' }, total: { llm: rows[0].llm, tts: rows[0].tts }, firstRecordedDate: '2026-10-20' };
}
for (const [width, theme] of [[390, 'dark'], [1440, 'light']]) test(`Terminal daily official usage at ${width}px`, async ({ page }, testInfo) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(theme => localStorage.setItem('tsukuyomi_theme', theme), theme);
  let fail = false;
  const queries = [];
  await page.route('**/api/admin/official-usage?*', async route => {
    const query = new URL(route.request().url()).searchParams;
    queries.push({ days: query.get('days'), end: query.get('end') });
    await route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json', body: JSON.stringify(fail
      ? { success: false, message: '统计暂时不可用，请重试' }
      : { success: true, data: report(Number(query.get('days')), query.get('end') || undefined) }) });
  });
  await page.goto('/terminal?panel=analytics');
  await expect(page.locator('#boot-splash')).toBeHidden();
  await page.getByRole('textbox', { name: '管理员账号' }).fill('admin');
  await page.locator('input[autocomplete="current-password"]').fill('admin-test-password');
  await page.getByRole('button', { name: '连接终端' }).click();
  const panel = page.locator('.official-usage');
  await expect(panel.getByRole('heading', { name: '官方服务每日调用' })).toBeVisible();
  await expect(panel.locator('tbody tr')).toHaveCount(30);
  await expect(panel.locator('[data-usage-kind=llm] strong')).toHaveText('12');
  await expect(panel.locator('[data-usage-day="2026-10-30"]')).toContainText('完成 10 · 未完成 1 · 待确认 1');
  await expect(panel).toContainText('北京时间（UTC+8）');
  await panel.getByLabel('统计天数').selectOption('7');
  await panel.getByLabel('截至日期').fill('2026-10-29');
  await panel.getByRole('button', { name: '查询', exact: true }).click();
  await expect(panel.locator('tbody tr')).toHaveCount(7);
  expect(queries.at(-1)).toEqual({ days: '7', end: '2026-10-29' });
  await panel.getByText('统计口径', { exact: true }).click();
  await expect(panel).toContainText('语音缓存回放不重复计数');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await panel.locator('.usage-table').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await panel.getByRole('heading', { name: '官方服务每日调用', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`official-usage-${width}-${theme}.png`), animations: 'disabled' });
  fail = true;
  await panel.getByRole('button', { name: '查询', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('统计暂时不可用');
  await expect(panel.locator('tbody tr')).toHaveCount(0);
  fail = false;
  await panel.getByRole('button', { name: '查询', exact: true }).click();
  await expect(panel.locator('tbody tr')).toHaveCount(7);
});
