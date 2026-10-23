const { test, expect } = require('../e2e-fixtures.cjs');

async function openMail(page) {
  await page.goto('/terminal?panel=mail');
  await expect(page.locator('#boot-splash')).toBeHidden();
  await page.getByRole('textbox', { name: '管理员账号' }).fill('admin');
  await page.locator('input[autocomplete="current-password"]').fill('admin-test-password');
  await page.getByRole('button', { name: '连接终端' }).click();
  await expect(page.getByRole('heading', { name: '发送邮件', exact: true })).toBeVisible();
  await expect(page.getByText('邮件通道已就绪 · 使用网站统一邮件样式')).toBeVisible();
}
async function search(page, term) {
  await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/mail-campaigns/recipients' && new URL(response.url()).searchParams.get('search') === term),
    page.getByRole('searchbox', { name: '搜索用户' }).fill(term)
  ]);
}
async function compose(page, title) {
  await page.getByRole('textbox', { name: '邮件主题', exact: true }).fill(title);
  await page.getByRole('textbox', { name: '邮件正文' }).fill('你好，月读空间的新朋友：\n\n这周我们更新了成长任务。给任意一篇文章点赞或收藏，即可完成任务。\n\n感谢你的陪伴，期待在月下相见。');
  await page.getByRole('textbox', { name: '按钮链接（选填）' }).fill('/stage');
  await page.getByRole('textbox', { name: '按钮文字' }).fill('去看看新文章');
}

test('desktop searches a single recipient, previews the branded email and sends once', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMail(page);
  await search(page, 'campaign-e2e-01');
  await page.getByRole('checkbox', { name: '选择 campaign-e2e-01@example.test' }).check();
  await compose(page, '本周更新 · 桌面单人验收');
  expect(await page.getByRole('textbox', { name: '邮件正文' }).evaluate(element => Number.parseFloat(getComputedStyle(element).borderTopLeftRadius))).toBeLessThan(24);
  await page.screenshot({ path: 'test-results/terminal-mail-desktop-compose.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '预览并确认收件人' }).click();
  const dialog = page.getByRole('dialog', { name: '确认邮件与收件人' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('本批将发送给 1 个邮箱');
  const frame = page.frameLocator('iframe[title="邮件样式预览"]');
  await expect(frame.getByRole('heading', { name: '本周更新 · 桌面单人验收' })).toBeVisible();
  await expect(frame.getByRole('img', { name: '月下樱花与八千代' })).toBeVisible();
  await page.screenshot({ path: 'test-results/terminal-mail-desktop-preview.png', animations: 'disabled' });
  let id;
  const recorded = page.waitForResponse(response => /\/mail-campaigns\/[^/]+\/send$/.test(new URL(response.url()).pathname));
  await dialog.getByRole('button', { name: '确认发送给 1 个邮箱' }).click();
  id = (await (await recorded).json()).data.id;
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: '已提交 1 个邮箱' })).toBeVisible();
  await expect.poll(async () => (await (await page.request.get(`/api/admin/mail-campaigns/${id}`)).json()).data.campaign.counts.sent).toBe(1);
  await page.reload();
  await expect(page.locator('#boot-splash')).toBeHidden();
  await expect(page.getByRole('heading', { name: '发送邮件', exact: true })).toBeVisible();
  const row = page.locator('.terminal-mail-history-row').filter({ hasText: '本周更新 · 桌面单人验收' });
  await expect(row).toContainText('已提交 1');
  await row.getByRole('button', { name: '查看明细' }).click();
  await expect(page.getByRole('region', { name: '发送明细' })).toContainText('campaign-e2e-01@example.test');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('mobile filters all pages, keeps cross-page selections and submits the reviewed batch', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMail(page);
  await search(page, 'campaign-e2e-');
  await page.getByRole('button', { name: '勾选本页' }).click();
  await page.getByRole('navigation', { name: '收件用户分页' }).getByRole('button', { name: '下一页' }).click();
  await expect(page.locator('.terminal-mail-recipients input')).toHaveCount(4);
  await page.getByRole('button', { name: '勾选本页' }).click();
  await expect(page.locator('.terminal-mail-selected summary')).toContainText('已勾选 12 人');
  await page.getByRole('radio', { name: '群发给全部匹配用户' }).check();
  await compose(page, '本周更新 · 手机群发验收');
  await page.getByRole('button', { name: '预览并确认收件人' }).click();
  const dialog = page.getByRole('dialog', { name: '确认邮件与收件人' });
  await expect(dialog).toContainText('本批将发送给 12 个邮箱');
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const frame = page.frameLocator('iframe[title="邮件样式预览"]');
  await expect(frame.getByRole('heading', { name: '本周更新 · 手机群发验收' })).toBeVisible();
  await page.screenshot({ path: 'test-results/terminal-mail-mobile-preview.png', animations: 'disabled' });
  const response = page.waitForResponse(response => /\/mail-campaigns\/[^/]+\/send$/.test(new URL(response.url()).pathname));
  await dialog.getByRole('button', { name: '确认发送给 12 个邮箱' }).click();
  const id = (await (await response).json()).data.id;
  await expect.poll(async () => (await (await page.request.get(`/api/admin/mail-campaigns/${id}`)).json()).data.campaign.counts.sent, { timeout: 25000 }).toBe(12);
  await page.getByRole('button', { name: '刷新记录', exact: true }).click();
  await expect(page.locator('.terminal-mail-history-row').filter({ hasText: '本周更新 · 手机群发验收' })).toContainText('已提交 12');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/terminal-mail-mobile-complete.png', fullPage: true, animations: 'disabled' });
});
