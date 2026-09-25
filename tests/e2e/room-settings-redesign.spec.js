const { test, expect } = require('../e2e-fixtures.cjs');

async function category(page, label) {
  const menu = page.locator('.settings-mobile-menu');
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: label }).click();
}

for (const width of [1280, 390]) {
  test(`Room settings tests the draft and saves across categories at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/room/settings');
    await page.getByRole('button', { name: 'DeepSeek', exact: true }).click();
    await page.locator('#settings-llm-key').fill('settings-test-placeholder');
    await page.locator('#settings-llm-model').fill('deepseek-v4-flash');
    await page.route('https://api.deepseek.com/**', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ model: 'deepseek-v4-flash', choices: [{ message: { content: '连接成功。' } }] })
    }));
    await page.getByRole('button', { name: '测试连接', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('连接成功，模型已返回文本');
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem('roomLLMSettings'))).toBeNull();
    await expect(page.locator('.settings-connection')).toContainText('连接测试通过');
    await page.locator('#settings-llm-model').fill('deepseek-chat');
    await expect(page.locator('.settings-connection')).toContainText('尚未测试连接');
    await category(page, '长期记忆');
    await page.getByRole('switch', { name: '开启长期记忆' }).uncheck();
    await category(page, '聊天模型');
    await expect(page.locator('#settings-llm-key')).toHaveValue('settings-test-placeholder');
    await expect(page.locator('#settings-llm-model')).toHaveValue('deepseek-chat');
    await page.locator('.settings-savebar .primary-btn').click();
    await expect(page).toHaveURL(/\/room$/);
    await page.goto('/room/settings');
    await expect(page.locator('#settings-llm-model')).toHaveValue('deepseek-chat');
    await category(page, '长期记忆');
    await expect(page.getByRole('switch', { name: '开启长期记忆' })).not.toBeChecked();
    await expect(page.locator('.settings-save-state')).toContainText('所有修改已保存');
  });
}

test('all Room settings categories fit mobile light and dark layouts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/room/settings');
  const sections = [
    ['聊天模型', '#room-llm-settings'], ['语音与朗读', '#room-tts-settings'],
    ['长期记忆', '#room-memory-settings'], ['角色知识库', '#room-knowledge-settings'],
    ['角色与布局', '#room-model-settings'], ['日记与存档', '#room-diary-settings'],
    ['工具与扩展', '#room-mcp-settings'], ['Live2D 调试', '#room-live2d-debug']
  ];
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    for (const [label, selector] of sections) {
      await category(page, label);
      await expect(page.locator(selector)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator(selector).evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(70);
    }
    const save = await page.locator('.settings-savebar').boundingBox();
    const nav = await page.locator('.mobile-bottom-nav').boundingBox();
    const music = await page.locator('.site-music-panel').boundingBox();
    expect(save.y + save.height).toBeLessThanOrEqual(nav.y);
    expect(music.y + music.height).toBeLessThan(save.y);
    await expect(page.locator('.settings-savebar .primary-btn')).toHaveCSS('border-radius', '999px');
  }
});
