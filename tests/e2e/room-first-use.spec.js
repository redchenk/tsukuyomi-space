const { test, expect } = require('../e2e-fixtures.cjs');

async function fixtures(page) {
  await page.route('https://api.deepseek.com/**', route => route.request().headers().authorization === 'Bearer first-use-bad-key'
    ? route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":{"message":"Invalid API key"}}' }) : route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(route.request().url().endsWith('/models')
      ? { data: [{ id: 'deepseek-v4-flash' }] }
      : { choices: [{ message: { content: '连接成功。' } }] })
  }));
  await page.route('http://localhost:11434/**', route => route.fulfill({ contentType: 'application/json', body: '{"models":[]}' }));
  await page.route('**/*live2d-room-neuro-live*.js', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.initTsukuyomiLive2DRoom = () => {
      window.TSUKUYOMI_LIVE2D_READY = true;
      window.dispatchEvent(new CustomEvent('tsukuyomi:live2d-ready'));
    };
    window.destroyTsukuyomiLive2DRoom = () => {};
  ` }));
}

for (const width of [390, 1280]) {
  test(`first-use flow preserves drafts, invalidates tests and saves at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await fixtures(page);
    await page.goto('/room/settings?setup=1');
    await expect(page.getByLabel('首次聊天配置')).toBeVisible();
    await expect(page.getByRole('navigation', { name: '设置分类' })).toHaveCount(0);
    await page.getByRole('radio').nth(1).check();
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByRole('button', { name: 'DeepSeek', exact: true }).click();
    await expect(page.getByRole('button', { name: '下一步', exact: true })).toBeDisabled();
    await page.locator('#settings-llm-key').fill('first-use-bad-key');
    await page.locator('#settings-llm-model').fill('deepseek-v4-flash');
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByRole('button', { name: '测试连接', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('连接失败');
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: '上一步', exact: true }).click();
    await expect(page.locator('#settings-llm-key')).toHaveValue('first-use-bad-key');
    await page.locator('#settings-llm-key').fill('first-use-fixture-key');
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByRole('button', { name: '测试连接', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('连接成功，模型已返回文本');
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.getByRole('button', { name: '保存，去说第一句话' })).toBeVisible();
    await page.getByRole('button', { name: '上一步', exact: true }).click();
    await expect(page.locator('#settings-llm-key')).toHaveValue('first-use-fixture-key');
    await page.locator('#settings-llm-model').fill('deepseek-chat');
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await expect(page.locator('.settings-connection')).toContainText('尚未测试连接');
    expect(await page.evaluate(() => localStorage.getItem('roomLLMSettings'))).toBeNull();
    await page.screenshot({ path: info.outputPath(`first-use-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: '跳过测试并保存' }).click();
    await expect(page).toHaveURL(/\/room$/);
    await expect(page.locator('.room-entry-splash')).toHaveCount(0);
    await expect(page.locator('.room-setup-dialog')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('roomLLMSettings')).model)).toBe('deepseek-chat');
    await page.getByRole('button', { name: '第一次使用 / 发现功能' }).click();
    await expect(page.getByRole('dialog')).toContainText('接下来发送一句话');
    await expect(page.getByRole('dialog')).not.toContainText('你已完成一轮对话');
    await page.getByRole('button', { name: '去说第一句话' }).click();
    await expect(page.locator('#chatInput')).toBeFocused();
    await page.locator('#chatInput').fill('你好，八千代。');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.locator('.chat-message.assistant').last()).toContainText('连接成功。');
    await expect(page.locator('.chat-message.is-streaming')).toHaveCount(0);
    if (width < 860) await page.locator('summary[aria-label="房间功能"]').click();
    await page.getByRole('button', { name: '开始使用与发现功能', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '开始使用与发现功能' })).toContainText('你已完成一轮对话');
  });

  test(`unconfigured visitors can discover features and archive rules at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await fixtures(page);
    await page.goto('/room');
    await expect(page.locator('.room-entry-splash')).toHaveCount(0);
    await page.getByRole('button', { name: '先看看能做什么' }).click();
    const dialog = page.getByRole('dialog', { name: '开始使用与发现功能' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: /辉夜快跑/ })).toHaveAttribute('href', '/game');
    await dialog.getByText('好感度为什么没有变化？', { exact: true }).click();
    await expect(dialog).toContainText('不按发消息条数');
    await page.screenshot({ path: info.outputPath(`discovery-${width}.png`) });
    await dialog.getByRole('button', { name: '查看日记与当前存档' }).click();
    await expect(page.locator('.diary-affection-help')).toBeVisible();
    await page.locator('.diary-affection-help summary').click();
    await expect(page.locator('.diary-affection-help')).toContainText('还没有生成日记');
    expect(await page.evaluate(() => localStorage.getItem('roomLLMSettings'))).toBeNull();
  });
}
