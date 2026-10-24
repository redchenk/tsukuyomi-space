const path = require('node:path');
const { test, expect } = require('../e2e-fixtures.cjs');

test('official image chat uploads, forwards and renders its reply on the current account', async ({ page, baseURL }, testInfo) => {
  const login = await page.request.post('/api/auth/login', { headers: { Origin: baseURL, 'X-Requested-With': 'XMLHttpRequest' }, data: { username: 'e2e-user', password: 'e2e-password' } });
  expect(login.status()).toBe(200);
  const { data } = await login.json();
  await page.addInitScript(({ user, origin }) => {
    localStorage.setItem('tsukuyomi_user', JSON.stringify(user));
    localStorage.setItem('roomLLMSettings', JSON.stringify({ apiUrl: origin + '/official-api/v1/chat/completions', model: 'deepseek-flash', apiKey: 'tsukuyomi-site-session', useProxy: false, visionMode: 'llm' }));
    localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
  }, { user: data.user, origin: baseURL });
  const model = { id: 'deepseek-flash', provider: 'deepseek', enabled: true, max_output_tokens: 1024, capabilities: { vision: true } };
  // Use the existing isolated OSS fixture through the real image upload route.
  await page.route('**/api/room/chat/images', route => route.continue({ headers: { ...route.request().headers(), 'x-upload-fixture-delay': '1800' } }));
  await page.route('**/official-api/api/dashboard', route => route.fulfill({ json: { enabled: true, me: { account_id: 'official-fixture', nickname: '测试用户' }, models: [model], wallet: { available_atoms: '1000000000' } } }));
  const requests = [];
  await page.route('**/official-api/v1/chat/completions', async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ contentType: 'text/event-stream', body: [
      { choices: [{ index: 0, delta: { content: '看见图片了，这是图片输入测试回复。' } }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 500, completion_tokens: 20, total_tokens: 520 } }, '[DONE]'
    ].map(v => `data: ${typeof v === 'string' ? v : JSON.stringify(v)}\n\n`).join('') });
  });
  await page.goto('/room/settings');
  await expect(page.locator('#boot-splash')).toBeHidden();
  await expect(page.getByText('支持文字、图片与工具调用。', { exact: false })).toBeVisible();
  await page.goto('/room');
  await expect(page.locator('#loadingOverlay')).toHaveCount(0);
  await page.locator('input[type="file"][accept*="image"]').setInputFiles(path.resolve('assets/icons/icon-192.png'));
  await expect(page.locator('#chatImagePreview img')).toBeVisible();
  await page.locator('#chatInput').fill('看看这张图片');
  await page.locator('#sendChatBtn').click();
  await expect(page.locator('.chat-message.assistant:not([aria-busy="true"])').last()).toContainText('看见图片了');
  expect(requests).toHaveLength(1);
  const parts = requests[0].messages.at(-1).content;
  expect(parts.find(p => p.type === 'image_url').image_url.url).toMatch(/^data:image\/(webp|png);base64,/);
  expect(requests[0].max_tokens).toBeLessThanOrEqual(1024);
  await expect(page.locator('.chat-message.user .chat-image-thumb').last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  if (process.env.VISION_QA_DIR) await page.screenshot({ path: `${process.env.VISION_QA_DIR}/room-image-${testInfo.project.name}.png` });
});
