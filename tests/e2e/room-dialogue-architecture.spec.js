const { test, expect } = require('../e2e-fixtures.cjs');
const fs = require('node:fs');

async function category(page, label) {
  const menu = page.locator('.settings-mobile-menu');
  await expect(menu).toBeAttached();
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: label, exact: true }).click();
}

for (const width of [390, 1440]) test(`character reference and continuity reach the real request at ${width}px`, async ({ page }, testInfo) => {
  // This covers import, export, four generations and three full navigations.
  // Retain each assertion's short timeout while allowing the complete journey
  // to finish on native WebKit runners that record a trace concurrently.
  test.setTimeout(120000);
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('roomMemoryGuestId', 'dialogue-architecture');
    localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: true }));
    localStorage.setItem('roomLLMSettings', JSON.stringify({ apiUrl: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', apiKey: 'synthetic-fixture', useProxy: false }));
  });
  const requests = [];
  await page.route('https://api.deepseek.com/**', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [] }) });
    requests.push(route.request().postDataJSON());
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '收到，我们接着聊。' } }] }) });
  });
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/room/settings');
  await category(page, '角色知识库');
  const panel = page.getByTestId('room-dialogue-settings');
  await panel.locator(':scope > summary').click();
  await expect(panel.getByLabel('在聊天中参考这张卡', { exact: true })).toBeChecked();
  await expect(panel.getByLabel('启用卡片世界书', { exact: false })).toBeChecked();
  await expect(panel.getByLabel('剧透偏好', { exact: true })).toHaveValue('allow');
  await panel.getByLabel('希望八千代怎样认识你', { exact: true }).fill('我喜欢简短直接的交流。');
  await expect(page.locator('.settings-savebar')).toContainText('有尚未保存的修改');
  const card = { spec: 'chara_card_v2', data: { name: '参考卡', personality: 'REFERENCE_STYLE', mes_example: 'NEVER_OCCURRED', system_prompt: 'NEVER_SYSTEM', character_book: { entries: [{ id: 1, constant: true, content: 'WORLD_FACT' }] } } };
  await panel.locator('input[type=file]').setInputFiles({ name: 'reference.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(card)) });
  await expect(panel).toContainText('已载入预览');
  await expect(panel.getByLabel('在聊天中参考这张卡', { exact: true })).toBeChecked();
  await panel.getByRole('button', { name: '保存对话设置', exact: true }).click();
  await expect(panel).toContainText('已保存，下一轮聊天生效');
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: '导出八千代角色卡', exact: true }).click();
  const exported = JSON.parse(fs.readFileSync(await (await download).path(), 'utf8'));
  expect(exported.spec).toBe('chara_card_v2');
  expect(exported.data.scenario).toContain('电影结局');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.locator(':scope > summary').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath(`dialogue-settings-${width}.png`) });
  await page.goto('/room');
  await expect(page.locator('.room-entry-splash')).toHaveCount(0);
  async function send(value) {
    await expect(page.locator('#chatInput')).toBeVisible();
    await expect(page.locator('.room-entry-splash')).toHaveCount(0);
    await expect(page.locator('#loadingOverlay')).toHaveCount(0);
    const count = requests.length;
    await page.locator('#chatInput').fill(value);
    await page.locator('#sendChatBtn').click();
    await expect.poll(() => requests.length).toBe(count + 1);
    await expect(page.locator('#sendChatBtn')).toBeVisible();
    await expect(page.locator('.chat-message.assistant[aria-busy=true]')).toHaveCount(0);
  }
  await send('我叫月核。');
  await send('下次如果我说“晚上好”，请你回答“晚上好月核”。');
  if (width < 768) await page.locator('.room-tools-disclosure > summary').click();
  await page.getByRole('button', { name: '新建会话', exact: true }).click();
  await expect(page.locator('.chat-message.user')).toHaveCount(0);
  await send('晚上好');
  const body = requests.at(-1);
  const prompt = body.messages[0].content;
  expect(prompt).toContain('电影结局后的日常');
  expect(prompt).toContain('我叫月核');
  expect(prompt).toContain('晚上好月核');
  expect(prompt).toContain('REFERENCE_STYLE');
  expect(prompt).toContain('WORLD_FACT');
  expect(prompt).not.toMatch(/NEVER_OCCURRED|NEVER_SYSTEM/);
  expect(body.messages.filter(m => m.role === 'user')).toHaveLength(1);
  await page.locator('.room-prompt-trace > summary').click();
  await expect(page.locator('.room-prompt-trace')).toContainText('称呼与明确约定：2');
  // Removing a card is effective on the next request, without deleting memories.
  await page.goto('/room/settings');
  await category(page, '角色知识库');
  await panel.locator(':scope > summary').click();
  await panel.getByRole('button', { name: '移除参考卡', exact: true }).click();
  await page.locator('.settings-savebar').getByRole('button', { name: '保存并返回房间', exact: true }).click();
  await expect(page).toHaveURL(/\/room$/);
  await send('今天想唱什么？');
  expect(requests.at(-1).messages[0].content).not.toContain('REFERENCE_STYLE');
  expect(requests.at(-1).messages[0].content).toContain('我叫月核');
});
