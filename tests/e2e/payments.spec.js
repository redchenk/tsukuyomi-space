const { test, expect } = require('../e2e-fixtures.cjs');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve('.codex_tmp/payment-qa');
const id = `TS${'a'.repeat(32)}`;
const sampleOrder = { id, title: '测试服务', description: '服务内容与交付说明', productId: 'service', amount: '1.23', status: 'pending', expired: false, createdAt: 1792324800000, expiresAt: 1792325700000, paidAt: null, closedAt: null };
const json = data => ({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
async function authenticate(page, administrator = false) {
  const response = await page.request.post(administrator ? '/api/admin/login' : '/api/auth/login', {
    headers: { Origin: 'http://127.0.0.1:4174', 'X-Requested-With': 'XMLHttpRequest' },
    data: administrator ? { username: 'admin', password: 'admin-test-password' } : { username: 'e2e-user', password: 'e2e-password' }
  });
  expect(response.status()).toBe(200);
  const result = await response.json();
  await page.addInitScript(data => {
    localStorage.setItem('tsukuyomi_user', JSON.stringify(data.user));
    if (data.admin) localStorage.setItem('admin_user', JSON.stringify(data.admin));
  }, result.data);
}

for (const width of [1280, 390]) {
  test(`payment return remains pending until verified and checkout uses server order at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let created;
    await page.route('**/api/payments/**', async route => {
      const url = new URL(route.request().url()), method = route.request().method();
      if (url.pathname.endsWith('/catalog')) return route.fulfill(json({ enabled: true, products: [{ id: 'service', title: '测试服务', description: '服务内容与交付说明', price: '1.23' }] }));
      if (url.pathname.endsWith('/checkout')) return route.fulfill(json({ url: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do?fixture=1' }));
      if (url.pathname.endsWith('/refresh') || url.pathname.endsWith(id)) return route.fulfill(json(sampleOrder));
      if (method === 'POST') { created = route.request().postDataJSON(); return route.fulfill(json(sampleOrder)); }
      return route.fulfill(json({ items: [sampleOrder], page: 1, totalPages: 1, total: 1 }));
    });
    await page.route('https://openapi-sandbox.dl.alipaydev.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Cashier test destination</h1>' }));
    await authenticate(page);
    await page.goto(`/payments?order=${id}&trade_status=TRADE_SUCCESS&total_amount=1.23`);
    await expect(page.locator('.payment-receipt h2')).toHaveText('待支付');
    await expect(page.getByRole('heading', { name: '我的订单', exact: true })).toBeVisible();
    await expect(page.locator('#boot-splash')).toHaveCount(0);
    expect(await page.locator('.payments-heading h1').evaluate(node => node.getBoundingClientRect().top)).toBeGreaterThan(85);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, `orders-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: '使用支付宝支付', exact: true }).click();
    await expect(page).toHaveURL(/openapi-sandbox\.dl\.alipaydev\.com\/gateway\.do/);
    expect(created.productId).toBe('service');
    expect(Object.keys(created).sort()).toEqual(['productId', 'requestKey']);
    expect(created.requestKey).toMatch(/^[\w-]{16,80}$/);
    expect(errors).toEqual([]);
  });
}

test('Terminal configures the toggle and products without accepting credentials', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const readiness = { configured: true, environment: 'sandbox', missing: [], maxAmountCents: 5000, notifyUrl: 'https://payments.example.test/api/payments/alipay/notify' };
  let saved;
  await page.route('**/api/admin/payments/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/orders')) return route.fulfill(json({ items: [], page: 1, totalPages: 1, total: 0 }));
    if (route.request().method() === 'PUT') saved = route.request().postDataJSON();
    return route.fulfill(json({ enabled: false, products: [], ...saved, readiness }));
  });
  await authenticate(page, true);
  await page.goto('/terminal');
  await page.getByRole('button', { name: '支付与订单', exact: true }).click();
  await expect(page.getByText('服务器支付配置已就绪', { exact: false })).toBeVisible();
  await expect(page.getByLabel('开启在线收款', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: '添加商品', exact: true }).click();
  await page.getByLabel('商品编号', { exact: true }).fill('service');
  await page.getByLabel('商品名称', { exact: true }).fill('测试服务');
  await page.getByLabel('价格（元）', { exact: true }).fill('1.23');
  await page.getByLabel('商品说明', { exact: true }).fill('服务内容与交付说明');
  await page.getByLabel('上架此商品', { exact: true }).check();
  await page.getByLabel('开启在线收款', { exact: true }).check();
  await page.getByRole('button', { name: '保存支付配置', exact: true }).click();
  await expect(page.getByText('支付配置已保存', { exact: true })).toBeVisible();
  expect(saved).toEqual({ enabled: true, products: [{ id: 'service', title: '测试服务', price: '1.23', description: '服务内容与交付说明', enabled: true, walletCredit: false }] });
  fs.mkdirSync(output, { recursive: true });
  await expect(page.locator('#boot-splash')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(output, 'terminal-1280.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  await page.screenshot({ path: path.join(output, 'terminal-390.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('normal users retain access to history with purchase disabled and see no purchase control', async ({ page }) => {
  await authenticate(page);
  await page.goto('/payments');
  await expect(page.getByText('在线收款暂未开放，已有订单仍可在下方查看。', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '我的订单', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '使用支付宝支付', exact: true })).toHaveCount(0);
});
