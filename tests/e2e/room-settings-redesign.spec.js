const { test, expect } = require('../e2e-fixtures.cjs');

async function category(page, label) {
  const menu = page.locator('.settings-mobile-menu');
  // isVisible() does not wait for the lazy-loaded settings page to mount.
  // Otherwise a cold page can skip opening the mobile category drawer.
  await expect(menu).toBeAttached();
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: label }).click();
}

for (const width of [1280, 390]) test(`memory retrieval limit saves, reloads and respects the off switch at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(() => {
    if (!localStorage.getItem('roomMemorySettings')) localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
  });
  await page.goto('/room/settings');
  await category(page, '长期记忆');
  const limit = page.locator('#room-memory-retrieval-limit');
  await expect(limit).toHaveValue('12');
  await expect(limit).toBeDisabled();
  await page.getByRole('switch', { name: '开启长期记忆' }).check();
  await limit.fill('30');
  await expect(page.getByRole('status').filter({ hasText: '有尚未保存的修改' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('memory-limit-settings.png') });
  await page.getByRole('button', { name: '保存并返回房间', exact: true }).click();
  await expect(page).toHaveURL(/\/room$/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('roomMemorySettings')))).toEqual({ enabled: true, retrievalLimit: 30 });
  await page.goto('/room/settings');
  await page.reload();
  await category(page, '长期记忆');
  await expect(limit).toHaveValue('30');
  await expect(page.getByRole('switch', { name: '开启长期记忆' })).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

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

// Keep each theme's eight category transitions within its own test budget,
// especially on WebKit's slower mobile layout and smooth-scroll path.
for (const theme of ['light', 'dark']) {
test(`all Room settings categories fit the mobile ${theme} layout`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/room/settings');
  const sections = [
    ['聊天模型', '#room-llm-settings'], ['语音与朗读', '#room-tts-settings'],
    ['长期记忆', '#room-memory-settings'], ['角色知识库', '#room-knowledge-settings'],
    ['角色与布局', '#room-model-settings'], ['日记与存档', '#room-diary-settings'],
    ['工具与扩展', '#room-mcp-settings'], ['Live2D 调试', '#room-live2d-debug']
  ];
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    for (const [label, selector] of sections) {
      await test.step(`${theme}: ${label}`, async () => {
        await category(page, label);
        await expect(page.locator(selector)).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await expect.poll(() => page.locator(selector).evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(70);
      });
    }
    const save = await page.locator('.settings-savebar').boundingBox();
    await expect(page.locator('.mobile-bottom-nav')).toHaveCount(0);
    const music = await page.locator('.site-music-panel').boundingBox();
    expect(save.y + save.height).toBeCloseTo(844, 0);
    expect(music.y + music.height).toBeLessThan(save.y);
    await page.getByRole('button', { name: 'Expand music drawer', exact: true }).click();
    // The drawer morphs its position/height; assert its settled layout.
    await expect.poll(async () => {
      const player = await page.locator('.site-music-panel').boundingBox();
      return player.y + player.height;
    }).toBeLessThan(save.y);
    await page.getByRole('button', { name: 'Collapse music drawer', exact: true }).click();
    await expect(page.locator('.settings-savebar .primary-btn')).toHaveCSS('border-radius', '999px');
});
}

for (const width of [1280, 390]) test(`existing Room knowledge upgrades with editable source labels at ${width}px`, async ({ page }, testInfo) => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const source = fs.readFileSync('src/frontend/constants/room/knowledgeEntries.js', 'utf8').replace(/^export /gm, '');
  const entries = JSON.parse(JSON.stringify(vm.runInNewContext(source + '\nLEGACY_ROOM_KNOWLEDGE_ENTRIES')));
  entries[0].content = '保留用户手动编写的身份';
  entries[1].enabled = false;
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(entries => {
    // Seed just once: a reload must inspect the actual saved migration.
    if (!localStorage.getItem('roomKnowledgeSettings')) localStorage.setItem('roomKnowledgeSettings', JSON.stringify({ enabled: true, entries }));
  }, entries);
  await page.goto('/room/settings');
  await category(page, '角色知识库');
  const panel = page.locator('#room-knowledge-settings');
  await expect(panel.locator('.knowledge-item')).toHaveCount(101);
  const identity = panel.locator('.knowledge-item').filter({ hasText: '保留用户手动编写的身份' });
  await expect(identity).toBeVisible();
  await expect(identity.locator('.chip')).toHaveCount(1);
  await expect(panel.locator('.knowledge-item.disabled')).toHaveCount(1);
  const film = panel.locator('.knowledge-item').filter({ has: page.getByText('电影末段的身体、味觉与复活演唱会', { exact: true }) });
  await expect(film.locator('.chip').filter({ hasText: '电影字幕' })).toHaveAttribute('title', /02:07:53/);
  const ending = panel.locator('.knowledge-item').filter({ has: page.getByText('小说停在哪里', { exact: true }) });
  await expect(ending.locator('.chip').filter({ hasText: '小说' })).toHaveAttribute('title', '新・终章 p-009.xhtml');
  page.once('dialog', dialog => dialog.accept());
  await ending.getByRole('button', { name: '删除', exact: true }).click();
  await expect(panel.locator('.knowledge-item')).toHaveCount(100);
  await page.reload();
  await category(page, '角色知识库');
  await expect(panel.locator('.knowledge-item')).toHaveCount(100);
  await expect(panel.getByText('小说停在哪里', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.locator('.knowledge-item').first().scrollIntoViewIfNeeded();
  await expect(panel.locator('.knowledge-item').first()).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('room-canon-settings.png') });
});

test('the previous 81-card library gains film sources while a deleted new card stays deleted', async ({ page }) => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const source = fs.readFileSync('src/frontend/constants/room/knowledgeEntries.js', 'utf8').replace(/^export /gm, '');
  const old = JSON.parse(JSON.stringify(vm.runInNewContext(source + `\n({version: PREVIOUS_ROOM_KNOWLEDGE_VERSION, entries: PREVIOUS_ROOM_KNOWLEDGE_IDS.map(id => PREVIOUS_ROOM_KNOWLEDGE_OVERRIDES[id] || DEFAULT_ROOM_KNOWLEDGE_ENTRIES.find(entry => entry.id === id))})`)));
  old.entries.find(entry => entry.id === 'yachiyo_speech_001').content = '保留用户定制的短句口吻';
  await page.addInitScript(old => {
    if (!localStorage.getItem('roomKnowledgeSettings')) localStorage.setItem('roomKnowledgeSettings', JSON.stringify({ enabled: true, builtinVersion: old.version, entries: old.entries }));
  }, old);
  await page.goto('/room/settings');
  await category(page, '角色知识库');
  const panel = page.locator('#room-knowledge-settings');
  await expect(panel.locator('.knowledge-item')).toHaveCount(101);
  await expect(panel.getByText('保留用户定制的短句口吻', { exact: true })).toBeVisible();
  const film = panel.locator('.knowledge-item').filter({ has: page.getByText('电影睡觉提醒与52小时数字边界', { exact: true }) });
  await film.scrollIntoViewIfNeeded();
  await expect(film.locator('.chip').filter({ hasText: '电影字幕' })).toHaveAttribute('title', /02:02:10/);
  page.once('dialog', dialog => dialog.accept());
  await film.getByRole('button', { name: '删除', exact: true }).click();
  await page.reload();
  await category(page, '角色知识库');
  await expect(panel.locator('.knowledge-item')).toHaveCount(100);
  await expect(panel.getByText('电影睡觉提醒与52小时数字边界', { exact: true })).toHaveCount(0);
});
