const { waitForRoom } = require('../e2e-room-helpers.cjs');
const { test, expect } = require('../e2e-fixtures.cjs');
const source = { id: 'guide:voice:0', documentId: 'guide:voice', title: '语音连接教程', content: '先启动语音服务，再在房间设置填写实际服务地址。', url: '/room/settings', revision: 'a'.repeat(64) };
async function setup(page) {
  await page.addInitScript(() => {
    localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true, apiUrl: 'https://api.deepseek.com/chat/completions', apiKey: 'test-key', model: 'deepseek-chat' }));
    localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
  });
  await page.route('**/lib/live2dcubismcore-v5.min.js', route => route.fulfill({ status: 404, body: '' }));
}
test('Room injects retrieved evidence, cites it, and refreshes sources on regeneration', async ({ page }, info) => {
  await setup(page); let lookup = 0, prompt = '';
  await page.route('**/api/knowledge/search', route => { lookup++; return route.fulfill({ json: { success: true, data: { mode: 'hybrid', sources: lookup === 1 ? [source] : [] } } }); });
  await page.route('**/api/chat/stream', route => { prompt = route.request().postDataJSON().systemPrompt; return route.fulfill({ contentType: 'text/event-stream', body: 'event: done\ndata: '+JSON.stringify({ reply: '先启动语音服务，然后填写地址。' })+'\n\n' }); });
  await page.goto('/room'); await waitForRoom(page); await page.locator('#chatInput').fill('怎么配置语音服务？'); await page.locator('#sendChatBtn').click();
  const assistant = page.locator('.chat-message.assistant').last();
  await expect(assistant).toContainText('参考资料');
  expect(prompt).toContain(source.content);
  await expect(assistant.getByRole('link', { name: source.title })).toHaveAttribute('href', source.url);
  await page.screenshot({ path: info.outputPath('rag-room-citations.png'), animations: 'disabled' });
  const regenerate = assistant.getByRole('button', { name: '重新生成', exact: true });
  if (!await regenerate.isVisible()) await assistant.locator('.room-message-options > summary').click();
  await regenerate.click();
  await expect.poll(() => lookup).toBe(2);
  await expect(assistant).not.toContainText('参考资料');
  await expect.poll(() => prompt).not.toContain(source.content);
});
test('retrieval failure does not prevent chat and the saved switch disables lookup', async ({ page }) => {
  await setup(page); let lookup = 0;
  await page.route('**/api/knowledge/search', route => { lookup++; return route.abort(); });
  await page.route('**/api/chat/stream', route => route.fulfill({ contentType: 'text/event-stream', body: 'event: done\ndata: '+JSON.stringify({ reply: '资料暂时不足，可以从房间设置查看。' })+'\n\n' }));
  await page.goto('/room'); await waitForRoom(page); await page.locator('#chatInput').fill('网站语音怎么设置？'); await page.locator('#sendChatBtn').click();
  await expect(page.locator('.chat-message.assistant').last()).toContainText('资料暂时不足'); expect(lookup).toBe(1);
  await page.evaluate(() => localStorage.setItem('roomKnowledgeSettings', JSON.stringify({ enabled: true, siteEnabled: false })));
  await page.reload(); await waitForRoom(page); await page.locator('#chatInput').fill('网站记忆怎么设置？'); await page.locator('#sendChatBtn').click();
  await expect(page.locator('.chat-message.assistant').last()).toContainText('资料暂时不足'); expect(lookup).toBe(1);
});
test('site guide grounds instructions and shows source links on desktop and mobile', async ({ page }, info) => {
  await setup(page); let prompt = '', scope;
  await page.route('**/api/knowledge/search', route => { scope = route.request().postDataJSON().scope; return route.fulfill({ json: { success: true, data: { sources: [source], mode: 'hybrid' } } }); });
  await page.route('**/api/chat', route => { prompt = route.request().postDataJSON().systemPrompt; return route.fulfill({ json: { success: true, data: { reply: '先启动语音服务，再填写地址。' } } }); });
  await page.goto('/hub'); await page.locator('button.site-pet').click();
  await page.locator('.site-guide-form textarea').fill('怎样连接语音？'); await page.locator('.site-guide-form button[type=submit]').click();
  await expect(page.locator('.site-guide-message.assistant')).toContainText('先启动语音服务');
  expect(scope).toBe('guide'); expect(prompt).toContain(source.content);
  await expect(page.locator('.site-guide-sources a')).toHaveAttribute('href', source.url);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('rag-guide-citations.png'), animations: 'disabled' });
});

test('the public knowledge switch saves when it is the only setting changed', async ({ page }) => {
  await setup(page); await page.goto('/room/settings');
  const selectKnowledge = async () => {
    const menu = page.locator('.settings-mobile-menu'); await expect(menu).toBeAttached();
    if (await menu.isVisible()) await menu.click();
    await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '角色知识库', exact: true }).click();
  };
  await selectKnowledge();
  const toggle = page.getByRole('switch', { name: '参考站内资料', exact: true });
  await expect(toggle).toBeChecked(); await toggle.uncheck();
  await expect(page.getByRole('status').filter({ hasText: '有尚未保存的修改' })).toBeVisible();
  await page.getByRole('button', { name: '保存并返回房间', exact: true }).click();
  await expect(page).toHaveURL(/\/room$/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('roomKnowledgeSettings')).siteEnabled)).toBe(false);
  await page.goto('/room/settings'); await page.reload(); await selectKnowledge();
  await expect(toggle).not.toBeChecked();
});
