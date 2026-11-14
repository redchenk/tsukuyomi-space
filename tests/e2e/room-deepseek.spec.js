const { test, expect } = require('../e2e-fixtures.cjs');
const fs = require('node:fs');
const path = require('node:path');
test.use({ launchOptions: { args: ['--no-proxy-server'] } });
const reply = (content, extra = {}) => {
  const data = (delta, reason = null) => `data: ${JSON.stringify({ id: 'fixture-chat', model: 'deepseek-flash', choices: [{ index: 0, delta, finish_reason: reason }] })}\n\n`;
  return data({ reasoning_content: '正在核对资料。' }) + data({ content }) + data(extra, 'stop') + 'data: [DONE]\n\n';
};
async function setup(page) {
  await page.addInitScript(() => {
    localStorage.setItem('roomLLMSettings', JSON.stringify({ apiUrl: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash', apiKey: 'fixture-only-deepseek-key', useProxy: true }));
    localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
    localStorage.setItem('roomTTSSettings', JSON.stringify({ enabled: false }));
  });
}
async function open(page) {
  await page.goto('/room'); await expect(page.locator('#loadingOverlay')).toHaveCount(0);
  await expect(page.locator('.room-entry-splash')).toHaveCount(0);
}
test('DeepSeek streams citations and keeps signed sources and file context across reloads', async ({ page }, info) => {
  await setup(page); const requests = [];
  await page.route('**/api/chat/deepseek/files', r => r.fulfill({ json: { id: 'file-fixture-document', purpose: 'user_data' } }));
  await page.route('**/api/chat/deepseek/chat/completions', async r => {
    requests.push(r.request().postDataJSON());
    await r.fulfill({ contentType: 'text/event-stream', body: reply('资料已经读到了。\n\n**春日的约定**，我们继续。', {
      title: '春日对话', annotations: [{ type: 'url_citation', url_citation: { url: 'https://api-docs.deepseek.com/zh-cn/guides/build_a_chatbot/', title: 'DeepSeek 文档' } }],
      server_tool_calls: [{ index: 0, calls: [{ id: 'read-1', type: 'deepseek_read_url', kind: 'read_link', action: { type: 'read_link', url: 'https://example.com' }, status: 'completed', signature: 'opaque-fixture-signature' }] }]
    }) });
  });
  await open(page);
  await page.getByRole('button', { name: '联网搜索', exact: true }).click();
  await page.getByLabel('添加对话文件').setInputFiles({ name: '春日.txt', mimeType: 'text/plain', buffer: Buffer.from('春日的一份材料') });
  await expect(page.locator('.room-file-list')).toContainText('春日.txt');
  await page.locator('#chatInput').fill('总结文件并查阅资料'); await page.locator('#sendChatBtn').click();
  await expect(page.locator('.chat-message.assistant:not([aria-busy="true"])')).toContainText('春日的约定');
  await expect(page.getByRole('link', { name: '1. DeepSeek 文档' })).toBeVisible();
  expect(requests[0].tools).toContainEqual({ type: 'deepseek_web_search' });
  expect(requests[0].messages.at(-1).content[0]).toEqual({ type: 'file', file_id: 'file-fixture-document' });
  await page.reload(); await expect(page.locator('#loadingOverlay')).toHaveCount(0); await expect(page.locator('.room-entry-splash')).toHaveCount(0);
  await page.locator('#chatInput').fill('继续解释刚才的文件'); await page.locator('#sendChatBtn').click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].messages.some(m => Array.isArray(m.content) && m.content.some(p => p.file_id === 'file-fixture-document'))).toBe(true);
  expect(requests[1].messages.some(m => m.server_tool_calls?.[0].calls[0].signature === 'opaque-fixture-signature')).toBe(true);
  await expect(page.locator('.chat-message.assistant:not([aria-busy="true"])')).toHaveCount(2);
  const dir = path.resolve('output/deepseek-room'); fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `room-${info.project.name}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (info.project.name.includes('mobile')) await expect(page.locator('.room-conversation-surface')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});
test('OCR puts recognized text into the composer and never sends it automatically', async ({ page }) => {
  await setup(page); let chats = 0;
  await page.route('**/api/chat/deepseek/v1/tools/ocr', r => r.fulfill({ json: { page_count: 1, pages: [{ index: 0, text: '识别到的文字', finish_reason: 'stop' }] } }));
  await page.route('**/api/chat/deepseek/chat/completions', r => { chats++; return r.fulfill({ body: reply('你好'), contentType: 'text/event-stream' }); });
  await open(page); await page.getByLabel('OCR 提取文字').setInputFiles({ name: 'example.pdf', mimeType: 'application/pdf', buffer: Buffer.from('fixture') });
  await expect(page.locator('#chatInput')).toHaveValue('识别到的文字'); expect(chats).toBe(0);
});
test('refused content is removed and is never persisted as a successful turn', async ({ page }) => {
  await setup(page);
  await page.route('**/api/chat/deepseek/chat/completions', r => r.fulfill({ contentType: 'text/event-stream', body: reply('不应保存的内容').replace('"finish_reason":"stop"', '"finish_reason":"content_filter"') }));
  await open(page); await page.locator('#chatInput').fill('测试拒答'); await page.locator('#sendChatBtn').click();
  await expect(page.locator('.chat-generation-notice.error')).toContainText('安全检查');
  await expect(page.locator('.chat-message.assistant')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('roomChatHistory:guest'))).toBeNull();
});

test('voice input releases the microphone, supplies PCM WAV to ASR and waits for user send', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    window.fixtureMicStops = 0;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() { window.fixtureMicStops++; } }] }) } });
    window.AudioContext = class {
      state = 'running'; destination = {};
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createAnalyser() { return { connect() {}, disconnect() {} }; }
      createScriptProcessor() { const node = { connect() { setTimeout(() => node.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.1) } }), 0); }, disconnect() {} }; return node; }
      async close() {} async resume() {}
    };
  });
  let received, chats = 0;
  await page.route('**/api/chat/deepseek/v1/tools/asr', route => { received = route.request().postDataJSON(); return route.fulfill({ json: { text: '今天的樱花很漂亮', duration_ms: 256 } }); });
  await page.route('**/api/chat/deepseek/chat/completions', route => { chats++; return route.fulfill({ body: reply('你好'), contentType: 'text/event-stream' }); });
  await open(page); await page.getByRole('button', { name: '语音输入', exact: true }).click();
  await expect(page.getByRole('button', { name: '结束录音', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '结束录音', exact: true }).click();
  await expect(page.locator('#chatInput')).toHaveValue('今天的樱花很漂亮');
  expect(chats).toBe(0); expect(await page.evaluate(() => window.fixtureMicStops)).toBe(1);
  const wav = Buffer.from(received.file.data, 'base64'); expect(wav.toString('ascii', 0, 4)).toBe('RIFF'); expect(wav.readUInt32LE(24)).toBe(16000);
  await page.getByRole('button', { name: '语音输入', exact: true }).click();
  await expect(page.getByRole('button', { name: '结束录音', exact: true })).toBeVisible();
  await page.locator('a[href="/room/settings"]:visible').first().click();
  await expect.poll(() => page.evaluate(() => window.fixtureMicStops)).toBe(2);
});

test('official DeepSeek binds tools and chat to the signed-in account and restores cloud file context', async ({ page, baseURL }) => {
  const login = await page.request.post('/api/auth/login', { headers: { Origin: baseURL, 'X-Requested-With': 'XMLHttpRequest' }, data: { username: 'e2e-user', password: 'e2e-password' } });
  expect(login.status()).toBe(200); const { data } = await login.json();
  await page.addInitScript(({ user, origin }) => {
    localStorage.setItem('tsukuyomi_user', JSON.stringify(user));
    localStorage.setItem('roomLLMSettings', JSON.stringify({ apiUrl: origin + '/official-api/v1/chat/completions', model: 'deepseek-flash', apiKey: 'tsukuyomi-site-session' }));
    localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
  }, { user: data.user, origin: baseURL });
  await page.route('**/official-api/api/dashboard', route => route.fulfill({ json: { enabled: true, me: { account_id: 'official-fixture' }, models: [{ id: 'deepseek-flash', provider: 'deepseek', enabled: true, max_output_tokens: 4096, capabilities: { apps: true, vision: true } }] } }));
  const requests = [], keys = [];
  await page.route('**/official-api/v1/deepseek/**', async route => {
    const headers = route.request().headers(); expect(headers['x-official-expected-account']).toBe('official-fixture'); expect(headers.authorization).toBeUndefined();
    keys.push(headers['idempotency-key']); requests.push(route.request().postDataJSON());
    return route.request().url().endsWith('/files') ? route.fulfill({ json: { id: 'file-official', purpose: 'text_recognition', page_count: 1 } }) : route.fulfill({ contentType: 'text/event-stream', body: reply('官方文件已阅读。') });
  });
  await open(page); await page.getByLabel('添加对话文件').setInputFiles({ name: 'cloud.pdf', mimeType: 'application/pdf', buffer: Buffer.from('fixture') });
  await expect(page.locator('.room-file-list')).toContainText('cloud.pdf');
  await page.locator('#chatInput').fill('读这份官方文件'); await page.locator('#sendChatBtn').click();
  await expect(page.locator('.chat-message.assistant').last()).toContainText('官方文件已阅读。');
  await expect.poll(() => page.request.get('/api/room/chat').then(r => r.json()).then(j => JSON.stringify(j))).toContain('file-official');
  expect(keys.every(k => typeof k === 'string' && k.length > 20)).toBe(true); expect(new Set(keys).size).toBe(keys.length);
  expect(requests.at(-1).messages.at(-1).content[0].file_id).toBe('file-official');
});

test('redesigned composer preserves text attachments through send and edit, and clears an abandoned draft', async ({ page }, info) => {
  await page.addInitScript(() => {
    localStorage.setItem('roomLLMSettings', JSON.stringify({ apiUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', apiKey: 'fixture-only', useProxy: false }));
    localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
    localStorage.setItem('roomTTSSettings', JSON.stringify({ enabled: false }));
  });
  const requests = [];
  await page.route('https://api.openai.com/v1/chat/completions', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ contentType: 'text/event-stream', body: reply('已经读到了附件。') });
  });
  await open(page);
  await page.locator('#chatFileInput').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('春日测试材料') });
  await expect(page.locator('.chat-file-preview')).toContainText('notes.txt');
  await page.locator('#chatInput').fill('读一下'); await page.locator('#sendChatBtn').click();
  await expect(page.locator('.chat-message.assistant:not([aria-busy="true"])')).toContainText('读到了附件');
  await expect(page.locator('.chat-file-preview')).toHaveCount(0);
  await expect(page.locator('.chat-file-card')).toContainText('notes.txt');
  expect(JSON.stringify(requests[0].messages.at(-1))).toContain('春日测试材料');
  const user = page.locator('.chat-message.user').last();
  if (info.project.name.includes('mobile')) { await user.locator('.chat-content').click(); await user.locator('.room-message-options > summary').click(); }
  await user.getByRole('button', { name: '编辑并重发这条消息' }).click();
  await page.locator('.chat-edit-input').fill('继续读这个文件');
  await page.getByRole('button', { name: '保存并重发', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(JSON.stringify(requests[1].messages.at(-1))).toContain('春日测试材料');
  await expect(page.locator('.chat-message.assistant:not([aria-busy="true"])')).toContainText('读到了附件');
  await page.locator('#chatFileInput').setInputFiles({ name: 'abandoned.txt', mimeType: 'text/plain', buffer: Buffer.from('不发送的草稿') });
  if (info.project.name.includes('mobile')) await page.locator('.room-tools-disclosure > summary').click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '新建会话', exact: true }).click();
  await expect(page.locator('.chat-file-preview')).toHaveCount(0);
  await expect(page.locator('#chatInput')).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
