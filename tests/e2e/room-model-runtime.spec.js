const fs = require('node:fs');
const { test, expect } = require('../e2e-fixtures.cjs');
const settings = { apiUrl: 'https://api.deepseek.com/chat/completions', apiKey: 'fixture-runtime-key', model: 'deepseek-chat', useProxy: false };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
const sse = text => [
  { choices: [{ index: 0, delta: { content: text } }] },
  { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
  { choices: [], usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 } }, '[DONE]'
].map(item => `data: ${typeof item === 'string' ? item : JSON.stringify(item)}\n\n`).join('');
async function setup(page, handler, overrides = {}) {
  await page.addInitScript(value => {
    if (!localStorage.getItem('roomLLMSettings')) localStorage.setItem('roomLLMSettings', JSON.stringify(value));
    localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
  }, { ...settings, ...overrides });
  await page.route('https://api.deepseek.com/**', async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (request.method() === 'GET') return route.fulfill({ contentType: 'application/json', headers: cors,
      body: JSON.stringify({ data: [{ id: settings.model, capabilities: { vision: false, function_calling: true, streaming: true } }] }) });
    return handler(route, request.postDataJSON());
  });
  await page.goto('/room/settings');
  await expect(page.getByText('已更新 1 个聊天模型', { exact: false })).toBeVisible();
}
async function openRuntime(page) { await page.locator('.runtime-panel > summary').click(); }
async function openWorkbench(page) { await page.locator('.runtime-workbench > summary').click(); }
const result = page => page.getByRole('region', { name: '模型诊断结果' });

test('layered settings persist, declarations retain manual overrides, and actual chat/diagnostic payloads agree', async ({ page }, testInfo) => {
  const requests = [];
  await setup(page, async (route, body) => { requests.push(body); await route.fulfill({ contentType: 'text/event-stream', headers: cors, body: sse('参数配置已生效。') }); });
  await openRuntime(page);
  await page.getByLabel('编辑范围').selectOption('provider');
  await page.locator('[name="room-runtime-temperature"]').fill('0.8');
  await page.locator('[name="room-runtime-maxOutputTokens"]').fill('256');
  await page.getByLabel('编辑范围').selectOption('model');
  await page.locator('[name="room-runtime-temperature"]').fill('0.3');
  await page.locator('[name="room-runtime-mapping-maxOutputTokens"]').selectOption('max_completion_tokens');
  const imageRow = page.locator('.runtime-capability-row').filter({ hasText: '图片输入' });
  await expect(imageRow).toContainText('不支持 · 供应商声明');
  await page.locator('[name="room-runtime-capability-image"]').selectOption('true');
  await page.getByRole('button', { name: '刷新模型', exact: true }).click();
  await expect(imageRow).toContainText('支持 · 人工覆盖');
  await page.getByRole('button', { name: '保存并返回房间', exact: true }).click();
  await expect(page).toHaveURL(/\/room$/);
  await page.locator('#chatInput').fill('验证保存后的参数');
  await page.locator('#sendChatBtn').click();
  await expect(page.locator('.chat-message.assistant:not([aria-busy="true"])')).toContainText('参数配置已生效');
  expect(requests[0]).toMatchObject({ temperature: 0.3, max_completion_tokens: 256 });
  expect(requests[0].max_tokens).toBeUndefined();
  await page.goto('/room/settings');
  await page.getByRole('button', { name: '刷新模型', exact: true }).click();
  await expect(page.getByText('已更新 1 个聊天模型', { exact: false })).toBeVisible();
  await openRuntime(page);
  await expect(page.locator('[name="room-runtime-temperature"]')).toHaveValue('0.3');
  await expect(page.locator('[name="room-runtime-capability-image"]')).toHaveValue('true');
  await openWorkbench(page); await page.getByRole('button', { name: '开始模型测试' }).click();
  await expect(result(page)).toContainText('测试完成');
  expect(requests.at(-1)).toMatchObject({ temperature: 0.3, max_completion_tokens: 256 });
  await expect(result(page)).toContainText('completion_tokens: 4');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Review screenshots are an explicit artifact task. Keeping optional tall
  // element captures out of the functional test avoids mobile WebKit spending
  // the test timeout scrolling a multi-viewport element into a stable position.
  if (process.env.RUNTIME_QA_DIR) {
    fs.mkdirSync(process.env.RUNTIME_QA_DIR, { recursive: true });
    await page.screenshot({ path: `${process.env.RUNTIME_QA_DIR}/room-model-runtime-dark-${testInfo.project.name}.png`,
      fullPage: true, animations: 'disabled' });
  }
});
test('tool protocol completes with a local fixture and report downloads exclude request content', async ({ page }) => {
  const requests = [];
  await setup(page, async (route, body) => {
    requests.push(body);
    if (requests.length === 1) return route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify({ choices: [{ message: {
      content: null, tool_calls: [{ id: 'call_fixture', type: 'function', function: { name: 'web_search', arguments: '{"query":"test"}' } }]
    } }] }) });
    expect(body.messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'call_fixture' });
    expect(body.messages.at(-1).content).toContain('固定测试结果');
    return route.fulfill({ contentType: 'text/event-stream', headers: cors, body: sse('private-diagnostic-reply') });
  });
  await openWorkbench(page);
  await page.getByLabel('测试项目').selectOption('tools');
  await page.getByRole('button', { name: '开始模型测试' }).click();
  await expect(result(page)).toContainText('测试完成');
  expect(requests).toHaveLength(2);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载脱敏诊断报告' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream(); let report = '';
  for await (const chunk of stream) report += chunk.toString();
  expect(report).not.toMatch(/fixture-runtime-key|private-diagnostic-reply|固定测试结果|chat\/completions/);
  expect(JSON.parse(report).observed.toolCalls).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('roomChatHistory:guest'))).toBeNull();
});
test('a JSON response to a streaming test is reported without claiming streaming support', async ({ page }) => {
  await setup(page, route => route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify({ choices: [{ message: { content: '一次性回复' } }] }) }));
  await openWorkbench(page); await page.getByRole('button', { name: '开始模型测试' }).click();
  await expect(result(page)).toContainText('部分能力未验证');
  await expect(result(page)).toContainText('本次返回一次性响应');
});
test('proxy diagnostics show the provider failure status and a fixed error explanation', async ({ page }) => {
  await page.route('**/api/chat/stream', route => route.fulfill({ contentType: 'text/event-stream',
    body: 'event: error\ndata: {"message":"untrusted-provider-error fixture-runtime-key","statusCode":401}\n\n' }));
  await setup(page, () => { throw new Error('Proxy diagnostics must use the proxy transport'); }, { useProxy: true });
  await openWorkbench(page); await page.getByRole('button', { name: '开始模型测试' }).click();
  await expect(result(page)).toContainText('密钥无效或已过期');
  await expect(result(page).locator('.diagnostic-metrics')).toContainText('401');
  await expect(result(page)).not.toContainText('untrusted-provider-error');
});
test('cancellation is visible and configuration switches discard stale results', async ({ page }) => {
  let release, entered = false;
  await setup(page, async route => {
    entered = true;
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ contentType: 'text/event-stream', headers: cors, body: sse('旧模型结果') }).catch(() => {});
  });
  await openWorkbench(page); await page.getByRole('button', { name: '开始模型测试' }).click();
  await expect.poll(() => entered).toBe(true);
  await page.getByRole('button', { name: '取消测试' }).click(); release();
  await expect(result(page)).toContainText('已取消');
  await page.locator('#settings-llm-model').fill('another-model');
  await expect(result(page)).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('roomLLMSettings')).model)).toBe(settings.model);
});
test('manual unsupported capability blocks a request, while an explicit override allows image input', async ({ page }) => {
  let requests = 0;
  await setup(page, async (route, body) => {
    requests++;
    expect(body.messages.at(-1).content.some(part => part.type === 'image_url')).toBe(true);
    return route.fulfill({ contentType: 'text/event-stream', headers: cors, body: sse('图片请求完成') });
  });
  await openWorkbench(page); await page.getByLabel('测试项目').selectOption('image');
  await page.getByRole('button', { name: '开始模型测试' }).click();
  await expect(result(page)).toContainText('当前能力声明不支持此测试'); expect(requests).toBe(0);
  await openRuntime(page); await page.locator('[name="room-runtime-capability-image"]').selectOption('true');
  await page.getByLabel('测试图片', { exact: true }).setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8x8AAAAASUVORK5CYII=', 'base64') });
  await expect(page.getByAltText('测试图片预览')).toBeVisible();
  await page.getByRole('button', { name: '开始模型测试' }).click();
  await expect(result(page)).toContainText('识别正确性请查看模型回复'); expect(requests).toBe(1);
});

test('changing a model during a pending diagnostic prevents the old response from reappearing', async ({ page }) => {
  let release, entered = false;
  await setup(page, async route => {
    entered = true; await new Promise(resolve => { release = resolve; });
    await route.fulfill({ contentType: 'text/event-stream', headers: cors, body: sse('stale-provider-response') }).catch(() => {});
  });
  await openWorkbench(page); await page.getByRole('button', { name: '开始模型测试' }).click();
  await expect.poll(() => entered).toBe(true);
  await page.locator('#settings-llm-model').fill('new-model'); release();
  await expect(result(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '开始模型测试' })).toBeEnabled();
  await expect(page.locator('.runtime-workbench')).not.toContainText('stale-provider-response');
});

for (const [locale, labels] of [['en', ['Model parameters and capabilities', 'Reasoning effort', 'Model diagnostics', 'Run model test']],
  ['ja', ['モデルのパラメータと機能', '推論の強度', 'モデル診断', 'モデルテストを開始']]]) {
  test(`new model controls follow the ${locale} interface language`, async ({ page }) => {
    await setup(page, route => route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }) }));
    await page.evaluate(value => localStorage.setItem('lang', value), locale);
    await page.reload(); await openRuntime(page);
    await page.locator('[name="room-runtime-temperature"]').fill('0.35');
    await expect.poll(() => page.locator('.settings-savebar').evaluate(node => node.getBoundingClientRect().height)).toBeLessThan(160);
    expect(await page.locator('.settings-savebar .button-row').evaluate(node => {
      const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth;
    })).toBe(true);
    await openWorkbench(page);
    await expect(page.locator('.runtime-panel')).toContainText(labels[0]);
    await expect(page.locator('.runtime-panel')).toContainText(labels[1]);
    await expect(page.locator('.runtime-workbench')).toContainText(labels[2]);
    await expect(page.getByRole('button', { name: labels[3], exact: true })).toBeVisible();
    await page.getByRole('button', { name: labels[3], exact: true }).click();
    await expect(page.locator('.diagnostic-result')).toBeVisible();
  });
}
