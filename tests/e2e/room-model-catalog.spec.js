const { test, expect } = require('../e2e-fixtures.cjs');
const settings = { apiUrl: 'https://api.siliconflow.cn/v1/chat/completions', apiKey: 'fixture-silicon-key', model: 'vendor/current-chat', useProxy: false };
const list = { data: [{ id: 'deepseek-ai/DeepSeek-New', name: 'New DeepSeek', created: 200 }, { id: 'Qwen/Qwen-New', created: 100 }] };

for (const viewport of [{ name: 'desktop', width: 1440, height: 960 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`${viewport.name}: automatic native catalogue, scoped cache and manual failure retain model`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(value => {
      if (!localStorage.getItem('roomLLMSettings')) localStorage.setItem('roomLLMSettings', JSON.stringify(value));
    }, settings);
    let requests = 0, denied = false;
    await page.route('https://api.siliconflow.cn/v1/models?*', route => {
      requests++;
      return route.fulfill({ status: denied ? 403 : 200, contentType: 'application/json', body: JSON.stringify(denied ? { error: { message: 'not-visible-provider-body' } } : list) });
    });
    await page.goto('/room/settings');
    await expect(page.locator('#settings-llm-model')).toHaveValue(settings.model);
    await expect(page.locator('#llmSyncedModels option')).toHaveCount(2);
    await expect(page.locator('#llmSyncedModels option').first()).toHaveAttribute('value', 'deepseek-ai/DeepSeek-New');
    await expect(page.getByText('当前模型未出现在目录中', { exact: false })).toBeVisible();
    expect(requests).toBe(1);
    await page.reload();
    await expect(page.locator('#llmSyncedModels option')).toHaveCount(2);
    await expect(page.getByText('已载入当前账号的模型缓存', { exact: false })).toBeVisible();
    expect(requests).toBe(1);
    denied = true;
    await page.getByRole('button', { name: '刷新模型', exact: true }).click();
    await expect(page.locator('.settings-field [role="alert"]')).toContainText('没有模型列表权限');
    await expect(page.locator('#llmSyncedModels option')).toHaveCount(2);
    await expect(page.locator('#settings-llm-model')).toHaveValue(settings.model);
    expect(requests).toBe(2);
    expect(await page.evaluate(() => localStorage.getItem('roomModelCatalog:v2'))).not.toContain(settings.apiKey);
  });
  test(`${viewport.name}: typing never sends partial key; provider switches clear previous key`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(value => localStorage.setItem('roomLLMSettings', JSON.stringify(value)), settings);
    let requests = 0;
    await page.route('https://api.siliconflow.cn/v1/models?*', route => { requests++; return route.fulfill({ contentType: 'application/json', body: JSON.stringify(list) }); });
    await page.goto('/room/settings');
    await expect(page.locator('#llmSyncedModels option')).toHaveCount(2);
    const key = page.locator('#settings-llm-key');
    await key.fill('new-fixture-account-key');
    await expect(page.locator('#llmSyncedModels option')).toHaveCount(1); // preset fallback, no other account's list
    expect(requests).toBe(1);
    await page.locator('#settings-llm-model').click();
    await expect.poll(() => requests).toBe(2);
    await expect(page.locator('#llmSyncedModels option')).toHaveCount(2);
    await page.getByRole('button', { name: 'DeepSeek', exact: true }).click();
    await expect(key).toHaveValue('');
    await expect(page.getByText('填写当前服务商的 API 密钥后会自动更新', { exact: false })).toBeVisible();
  });
}
