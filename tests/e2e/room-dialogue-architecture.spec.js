const { test, expect } = require('../e2e-fixtures.cjs');
const fs = require('node:fs');
const { waitForRoom } = require('../e2e-room-helpers.cjs');

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
  await panel.getByText('检查世界书条目', { exact: true }).click();
  for (const checkbox of await panel.locator('input[type=checkbox]').all()) {
    await expect(checkbox).toBeVisible();
    const size = await checkbox.evaluate(el => ({ width: el.offsetWidth, height: el.offsetHeight, target: el.closest('label').offsetHeight }));
    expect(size.width).toBe(18);
    expect(size.height).toBe(18);
    expect(size.target).toBeGreaterThanOrEqual(44);
  }
  await panel.getByText('检查世界书条目', { exact: true }).click();
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
  expect(requests.at(-1).messages[0].content).not.toContain('WORLD_FACT');
  expect(requests.at(-1).messages[0].content).toContain('我叫月核');
});

for (const useProxy of [false, true]) test(`independent card and world book activation reaches ${useProxy ? 'proxy' : 'direct'} chat requests`, async ({ page }, testInfo) => {
  test.setTimeout(120000);
  await page.addInitScript(({ useProxy }) => {
    const key = 'roomDialogueSettingsV1:guest';
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({
      referenceEnabled: true, worldBookEnabled: true,
      reference: { name: '启用检查', personality: 'CARD_ACTIVATION_MARKER', character_book: { scan_depth: 0, entries: [
        { id: 'star', keys: ['星灯'], content: 'WORLD_ACTIVATION_MARKER' },
        { id: 'disabled', constant: true, enabled: false, content: 'DISABLED_WORLD_MARKER' }
      ] } }
    }));
    localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
    localStorage.setItem('roomKnowledgeSettings', JSON.stringify({ enabled: false, siteEnabled: false }));
    localStorage.setItem('roomLLMSettings', JSON.stringify({ apiUrl: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', apiKey: 'synthetic-fixture', useProxy }));
  }, { useProxy });
  const requests = [];
  let rejectNext = false;
  await page.route(useProxy ? '**/api/chat/stream' : 'https://api.deepseek.com/**', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ contentType: 'application/json', body: '{"data":[]}' });
    requests.push(route.request().postDataJSON());
    if (rejectNext) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"fixture unavailable"}' });
    await route.fulfill(useProxy
      ? { contentType: 'text/event-stream', body: 'event: done\ndata: {"reply":"收到这轮发言了。"}\n\n' }
      : { contentType: 'application/json', body: '{"choices":[{"message":{"content":"收到这轮发言了。"}}]}' });
  });
  const panel = page.getByTestId('room-dialogue-settings');
  async function settings() {
    await page.goto('/room/settings');
    await category(page, '角色知识库');
    await panel.locator(':scope > summary').click();
  }
  async function send(message) {
    await waitForRoom(page);
    const count = requests.length;
    await page.locator('#chatInput').fill(message);
    await page.locator('#sendChatBtn').click();
    await expect.poll(() => requests.length).toBe(count + 1);
    await expect(page.locator('.chat-message.assistant[aria-busy=true]')).toHaveCount(0);
    if (rejectNext) return;
    await expect(page.locator('.room-prompt-trace')).toBeVisible();
    await page.locator('.room-prompt-trace').evaluate(el => { el.open = true; });
    return useProxy ? requests.at(-1).systemPrompt : requests.at(-1).messages[0].content;
  }
  await settings();
  await panel.getByLabel('在聊天中参考这张卡', { exact: true }).uncheck();
  await page.locator('.settings-savebar').getByRole('button', { name: '保存并返回房间', exact: true }).click();
  let prompt = await send('聊聊星灯');
  expect(prompt).toContain('WORLD_ACTIVATION_MARKER');
  expect(prompt).not.toMatch(/CARD_ACTIVATION_MARKER|DISABLED_WORLD_MARKER/);
  await expect(page.locator('.room-prompt-trace [data-prompt-source=card]')).toHaveText('角色卡参考：已关闭');
  await expect(page.locator('.room-prompt-trace [data-prompt-source=world]')).toHaveText('世界书：已带入 1 条');
  prompt = await send('今天感觉如何');
  expect(prompt).not.toContain('WORLD_ACTIVATION_MARKER');
  await expect(page.locator('.room-prompt-trace [data-prompt-source=world]')).toHaveText('世界书：已开启，本轮未命中');
  await settings();
  await expect(panel.getByLabel('在聊天中参考这张卡', { exact: true })).not.toBeChecked();
  await expect(panel.getByLabel('启用卡片世界书', { exact: false })).toBeChecked();
  await panel.getByLabel('在聊天中参考这张卡', { exact: true }).check();
  await panel.getByLabel('启用卡片世界书', { exact: false }).uncheck();
  await panel.getByRole('button', { name: '保存对话设置', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    await panel.getByLabel('在聊天中参考这张卡', { exact: true }).evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.screenshot({ path: testInfo.outputPath(`activation-${useProxy ? 'proxy' : 'direct'}-${theme}.png`) });
  }
  await page.goto('/room');
  prompt = await send('再聊聊星灯');
  expect(prompt).toContain('CARD_ACTIVATION_MARKER');
  expect(prompt).not.toMatch(/WORLD_ACTIVATION_MARKER|DISABLED_WORLD_MARKER/);
  await expect(page.locator('.room-prompt-trace [data-prompt-source=card]')).toHaveText('角色卡参考：已带入');
  await expect(page.locator('.room-prompt-trace [data-prompt-source=world]')).toHaveText('世界书：已关闭');
  // A failed attempt must not present the previous reply's sources as this turn.
  rejectNext = true;
  await send('测试连接失败');
  await expect(page.locator('.room-prompt-trace')).toHaveCount(0);
});
