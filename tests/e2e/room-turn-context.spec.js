const { test, expect } = require('../e2e-fixtures.cjs');
test.use({ launchOptions: { args: ['--no-proxy-server'] } });

for (const local of [true, false]) test('Room stable regeneration with ' + (local ? 'guest IndexedDB at mobile width' : 'account memory at desktop width'), async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: local ? 390 : 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('roomMemoryGuestId', 'turn-context-fixture');
    localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: true }));
    localStorage.setItem('roomLLMSettings', JSON.stringify({
      apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      model: 'qwen3.8-flash', apiKey: 'synthetic-browser-fixture', useProxy: false
    }));
    window.__turnRequests = [];
    const original = window.fetch;
    window.fetch = function(input, options) {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.hostname !== 'dashscope.aliyuncs.com') return original.call(this, input, options);
      window.__turnRequests.push(JSON.parse(options.body));
      const encoder = new TextEncoder();
      return Promise.resolve(new Response(new ReadableStream({
        start(controller) {
          const packet = data => controller.enqueue(encoder.encode('data: ' + JSON.stringify(data) + '\n\n'));
          window.__turnDelta = text => packet({ choices: [{ delta: { content: text } }] });
          window.__turnDone = () => {
            packet({ choices: [{ delta: {}, finish_reason: 'stop' }] });
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          };
        }
      }), { headers: { 'Content-Type': 'text/event-stream' } }));
    };
  });
  if (!local) {
    await page.goto('/login');
    await page.locator('#loginAccount').fill('turn-context-account');
    await page.locator('#loginPassword').fill('mem0-test-password');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/hub$/);
  }
  await page.goto('/room');
  const headers = { Origin: new URL(page.url()).origin, 'X-Requested-With': 'XMLHttpRequest' };
  let memoryId;
  if (local) {
    memoryId = 'turn-context-fact';
    await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('tsukuyomi-room-memory', 1);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore('memories', { keyPath: 'id' });
          store.createIndex('userKey', 'userKey'); store.createIndex('createdAt', 'createdAt');
        };
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      const tx = db.transaction('memories', 'readwrite');
      tx.objectStore('memories').put({ id: 'turn-context-fact', userKey: 'guest:turn-context-fixture',
        sourceTurnId: 'distant-turn', content: '用户喜欢用红茶作为奖励。', summary: '奖励偏好',
        updatedAt: '2026-10-01', createdAt: '2026-10-01' });
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
      db.close();
    });
  } else {
    const response = await page.request.post('/api/room/memory', { headers,
      data: { type: 'preference', content: '用户喜欢用红茶作为奖励。', summary: '奖励偏好', force: true, captureChat: false } });
    expect(response.status()).toBe(201); memoryId = (await response.json()).data.id;
  }
  const question = '今天的奖励你觉得怎么样？';
  const reply = '当前问题的回应。';
  await page.locator('#chatInput').fill(question);
  await page.locator('#sendChatBtn').click();
  await page.waitForFunction(() => window.__turnRequests.length === 1);
  await page.evaluate(() => window.__turnDelta('当'));
  await expect(page.locator('.chat-message.assistant[aria-busy="true"] .chat-reply-part')).toHaveText('当');
  await page.evaluate(() => { window.__turnDelta('前问题的回应。'); window.__turnDone(); });
  const assistant = page.locator('.chat-message.assistant:not([aria-busy="true"])');
  await expect(assistant).toHaveCount(1);
  await expect(assistant.locator('.chat-reply-part')).toHaveText(reply);
  await expect(page.locator('#sendChatBtn')).toBeVisible();
  const original = await page.evaluate(() => window.__turnRequests[0]);
  expect(original.temperature).toBe(0.6); expect(original.preserve_thinking).toBe(false);
  expect(original.messages.at(-1).content).toBe(question);
  expect(original.messages[0].content).toContain('红茶');
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (!await assistant.getByRole('button', { name: '重新生成', exact: true }).isVisible())
      await assistant.locator('.room-message-options > summary').click();
    await assistant.getByRole('button', { name: '重新生成', exact: true }).click();
    await page.waitForFunction(count => window.__turnRequests.length === count, attempt + 1);
    const request = await page.evaluate(() => window.__turnRequests.at(-1));
    expect(request.messages[0].content).toBe(original.messages[0].content);
    expect(request.messages[0].content).not.toContain(reply);
    expect(request.messages.at(-1).content).toBe(question);
    await page.evaluate(reply => { window.__turnDelta(reply); window.__turnDone(); }, reply);
    await expect(assistant).toHaveCount(1);
    await expect(page.locator('#sendChatBtn')).toBeVisible();
  }
  if (local) await page.evaluate(async id => {
    const db = await new Promise(resolve => { const request = indexedDB.open('tsukuyomi-room-memory', 1); request.onsuccess = () => resolve(request.result); });
    const tx = db.transaction('memories', 'readwrite'); tx.objectStore('memories').delete(id);
    await new Promise(resolve => { tx.oncomplete = resolve; }); db.close();
  }, memoryId);
  else expect((await page.request.delete('/api/room/memory/' + memoryId, { headers })).status()).toBe(200);
  if (!await assistant.getByRole('button', { name: '重新生成', exact: true }).isVisible())
    await assistant.locator('.room-message-options > summary').click();
  await assistant.getByRole('button', { name: '重新生成', exact: true }).click();
  await page.waitForFunction(() => window.__turnRequests.length === 5);
  expect(await page.evaluate(() => window.__turnRequests.at(-1).messages[0].content)).not.toContain('红茶');
  await page.evaluate(reply => { window.__turnDelta(reply); window.__turnDone(); }, reply);
  await expect(page.locator('#sendChatBtn')).toBeVisible();
  await page.reload();
  await expect(page.locator('.chat-message.assistant .chat-reply-part')).toHaveText(reply);
  expect(await page.evaluate(() => window.__turnRequests.length)).toBe(0);
});
