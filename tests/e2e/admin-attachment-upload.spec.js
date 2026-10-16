const fs = require('node:fs');
const { test, expect } = require('../e2e-fixtures.cjs');
const SIZE = 104 * 1024 * 1024;

async function login(page, username, password, role) {
  const base = test.info().project.use.baseURL || process.env.E2E_BASE_URL || 'http://127.0.0.1:4174';
  const response = await page.request.post('/api/auth/login', {
    data: { username, password }, headers: { Origin:base, 'X-Requested-With':'XMLHttpRequest' }
  });
  expect(response.ok()).toBe(true);
  const me = await (await page.request.get('/api/auth/me')).json();
  expect(me.data.role).toBe(role);
  await page.addInitScript(user => localStorage.setItem('tsukuyomi_user', JSON.stringify(user)), me.data);
}
function largeFile(info) {
  const file = info.outputPath(`admin-large-${info.project.name}.pdf`);
  fs.writeFileSync(file, '%PDF-1.7\nLarge attachment test');
  fs.truncateSync(file, SIZE);
  return file;
}

for (const role of ['admin', 'super_admin']) test(`${role} can upload 104 MiB through the library and editor`, async ({ page }, info) => {
  test.setTimeout(90000);
  await login(page, role === 'admin' ? 'notify-site-admin' : 'upload-super-admin', role === 'admin' ? 'notify-staff-password' : 'upload-super-password', role);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/attachments');
  await expect(page.locator('.attachments-hero')).toContainText('管理员上传不限制文件大小');
  await page.goto('/editor');
  await page.getByRole('button', { name: '上传 / 选择附件', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '附件库' });
  await expect(dialog).toContainText('管理员上传不限制文件大小');
  if (role === 'admin') await page.goto('/attachments');
  const file = largeFile(info);
  const input = role === 'admin' ? page.locator('input[type=file]') : dialog.locator('input[type=file]');
  await input.setInputFiles(file);
  if (role === 'admin') await expect(page.locator('.upload-progress-card')).toHaveAttribute('data-stage', 'complete', { timeout:60000 });
  else {
    await expect(dialog).not.toBeVisible({ timeout:60000 });
    await expect(page.locator('#editorContent')).toHaveValue(/admin-large-/);
  }
  const assets = await (await page.request.get('/api/assets')).json();
  const asset = assets.data.assets.find(a => a.metadata.fileName === file.split('/').pop());
  expect(asset).toBeTruthy(); expect(asset.metadata.size).toBe(SIZE);
  await page.screenshot({ path:info.outputPath('large-attachment-complete.png'), fullPage:true });
  await page.request.delete(`/api/assets/${asset.id}`, { headers: { Origin:new URL(page.url()).origin, 'X-Requested-With':'XMLHttpRequest' } });
  fs.unlinkSync(file);
});

test('ordinary users retain the 100 MB limit in both entry points', async ({ page }, info) => {
  await login(page, 'e2e-user', 'e2e-password', 'user');
  const file = largeFile(info);
  let requests = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/assets/uploads')) requests++; });
  await page.goto('/attachments');
  await expect(page.locator('.attachments-hero')).toContainText('单文件最大 100 MB');
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.locator('.upload-progress-card')).toContainText('单个文件不能超过 100 MB');
  await page.goto('/editor');
  await page.getByRole('button', { name:'上传 / 选择附件', exact:true }).click();
  const dialog = page.getByRole('dialog', { name:'附件库' });
  await expect(dialog).toContainText('单文件最大 100 MB');
  await dialog.locator('input[type=file]').setInputFiles(file);
  await expect(dialog.locator('.upload-progress-card')).toContainText('单个文件不能超过 100 MB');
  expect(requests).toBe(0);
  fs.unlinkSync(file);
});
