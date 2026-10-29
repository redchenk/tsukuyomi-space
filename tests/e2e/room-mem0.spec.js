const { test, expect } = require('../e2e-fixtures.cjs');
test.use({ launchOptions: { args: ['--no-proxy-server'] } });

async function configure(page) {
    await page.addInitScript(() => {
        localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true, apiUrl: 'https://fixture.test/v1/chat/completions', model: 'fixture-model', apiKey: 'fixture-key' }));
        if (!localStorage.getItem('roomMemorySettings')) localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: true }));
    });
    const requests = [];
    await page.route('**/api/chat/stream', route => {
        const data = route.request().postDataJSON();
        requests.push(data);
        const question = /什么|哪个|哪里/.test(data.message || '');
        // The reply depends on actual outgoing context, never on a mocked memory API.
        const reply = question ? (data.systemPrompt.includes('雪团') ? '你的猫叫雪团。' : '这次没有找到。') : '嗯，我记下啦。';
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: done\ndata: ${JSON.stringify({ reply })}\n\n` });
    });
    return requests;
}
async function send(page, message) {
    await expect(page.locator('#loadingOverlay')).toHaveCount(0);
    const assistantCount = await page.locator('.chat-message.assistant').count();
    await page.locator('#chatInput').fill(message);
    await page.locator('#sendChatBtn').click();
    await expect(page.locator('.chat-message.assistant')).toHaveCount(assistantCount + 1);
    await expect(page.locator('.chat-message.assistant').last()).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#chatInput')).toBeEnabled();
    await expect(page.locator('.chat-generation-notice.error')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('roomChatGeneration:mem0-browser') || localStorage.getItem('roomChatGeneration:guest'))).toBeNull();
}
async function login(page, username) {
    const origin = process.env.E2E_BASE_URL || 'http://127.0.0.1:4174';
    const response = await page.request.post('/api/auth/login', { headers: { Origin: origin, 'X-Requested-With': 'XMLHttpRequest' },
        data: { username, password: 'mem0-test-password' } });
    expect(response.status()).toBe(200);
    const user = (await response.json()).data.user;
    // Playwright retries replace the browser worker, not the fixture database.
    // Reset only this file's disposable accounts on the loopback test server.
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)
        || !['mem0-browser', 'mem0-isolated', 'mem0-fallback-browser'].includes(username)) {
        throw new Error('Mem0 fixture reset requires an isolated loopback test account');
    }
    const headers = { Origin: origin, 'X-Requested-With': 'XMLHttpRequest' };
    expect((await page.request.delete('/api/room/chat', { headers })).ok()).toBe(true);
    expect((await page.request.delete(`/api/room/memory?expectedUserId=${encodeURIComponent(user.id)}`, { headers })).ok()).toBe(true);
    await page.addInitScript(user => localStorage.setItem('tsukuyomi_user', JSON.stringify(user)), user);
}
async function newChat(page) {
    page.once('dialog', dialog => dialog.accept());
    await page.locator('.chat-session-new-btn').click();
    await expect(page.locator('.chat-message.assistant')).toHaveCount(0);
}

test('embedded Mem0 really injects a saved fact after a new chat and reload, with account isolation', async ({ page, browser }, testInfo) => {
    // Three generations, a reload and a second account's Live2D initialization.
    // Keep per-assertion deadlines while budgeting the complete traced journey.
    test.setTimeout(90000);
    const requests = await configure(page);
    await login(page, 'mem0-browser');
    await page.goto('/room');
    await send(page, '我的猫叫雪团');
    const stats = await (await page.request.get('/api/room/memory/status')).json();
    expect(stats.data.count).toBe(1);
    await newChat(page);
    await page.reload();
    const retrieved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/room/memory/search' && response.request().postDataJSON()?.purpose === 'chat');
    await send(page, '我的猫叫什么名字');
    const result = await (await retrieved).json();
    expect(result.retrieval.backend).toBe('mem0');
    expect(result.retrieval.fallback).toBe(false);
    expect(requests.at(-1).systemPrompt).toContain('雪团');
    expect(JSON.stringify(requests.at(-1).messages || requests.at(-1).history || [])).not.toContain('雪团');
    await expect(page.locator('.room-memory-trace')).toContainText('已参考');
    await expect(page.locator('.chat-message.assistant').last()).toContainText('雪团');
    await page.screenshot({ path: testInfo.outputPath('mem0-injected.png') });

    const other = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const otherPage = await other.newPage();
    const otherRequests = await configure(otherPage);
    await login(otherPage, 'mem0-isolated');
    await otherPage.goto('/room');
    await send(otherPage, '我的猫叫什么名字');
    await expect(otherPage.locator('.chat-message.assistant:not([aria-busy="true"])')).toBeVisible();
    expect(otherRequests.at(-1).systemPrompt).not.toContain('雪团');
    await other.close();
});

test('guest memory persists in IndexedDB and reaches the next model request after reload', async ({ page }) => {
    const requests = await configure(page);
    await page.goto('/room');
    await send(page, '我的猫叫雪团');
    await newChat(page);
    await page.reload();
    await send(page, '我的猫叫什么名字');
    expect(requests.at(-1).systemPrompt).toContain('雪团');
    await expect(page.locator('.room-memory-trace')).toContainText('已参考 1 条长期记忆');
    await expect(page.locator('.chat-message.assistant').last()).toContainText('雪团');
});

test('failed retrieval uses owned source excerpts in the real model request and reports both failed attempts', async ({ page }) => {
    const requests = await configure(page);
    await login(page, 'mem0-fallback-browser');
    await page.goto('/room');
    await send(page, '我的猫叫雪团');
    await newChat(page);
    await page.reload();
    let sourceCalls = 0, failSource = false;
    await page.route('**/api/room/memory/search', route => {
        const params = route.request().postDataJSON();
        if (params.purpose !== 'chat') return route.continue();
        if (params.retrieval === 'source') {
            sourceCalls++;
            if (!failSource) return route.continue();
        }
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false }) });
    });
    await send(page, '我的猫叫什么名字');
    expect(sourceCalls).toBe(1);
    expect(requests.at(-1).systemPrompt).toContain('雪团');
    expect(JSON.stringify(requests.at(-1).messages || requests.at(-1).history || [])).not.toContain('雪团');
    await expect(page.locator('.room-memory-trace')).toContainText('备用检索');
    await expect(page.locator('.room-memory-trace')).toHaveAttribute('title', 'http_503');
    await newChat(page);
    failSource = true;
    await send(page, '我的猫叫什么名字');
    expect(sourceCalls).toBe(2);
    expect(requests.at(-1).systemPrompt).not.toContain('雪团');
    await expect(page.locator('.room-memory-trace')).toContainText('长期记忆暂时无法读取（HTTP 503）');
});

for (const local of [true, false]) test(`configured memory limit reaches the model and regeneration with ${local ? 'guest' : 'account'} records`, async ({ page }, testInfo) => {
    test.setTimeout(60000);
    const requests = await configure(page);
    if (!local) await login(page, 'mem0-isolated');
    await page.goto('/room');
    if (local) {
        await page.evaluate(async () => {
            const id = localStorage.getItem('roomMemoryGuestId') || 'memory-limit-guest';
            localStorage.setItem('roomMemoryGuestId', id);
            const db = await new Promise((resolve, reject) => {
                const open = indexedDB.open('tsukuyomi-room-memory', 1);
                open.onupgradeneeded = () => {
                    const store = open.result.createObjectStore('memories', { keyPath: 'id' });
                    store.createIndex('userKey', 'userKey'); store.createIndex('createdAt', 'createdAt');
                };
                open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
            });
            const tx = db.transaction('memories', 'readwrite');
            for (let i = 0; i < 32; i++) tx.objectStore('memories').put({ id: `limit-fact-${i}`, userKey: `guest:${id}`,
                content: `观测站记录编号${i}，第${i}次预约。`, summary: `观测站记录${i}`, type: 'episodic',
                createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' });
            await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close();
        });
    } else {
        for (let i = 0; i < 32; i++) {
            const result = await page.request.post('/api/room/memory', {
                headers: { Origin: new URL(page.url()).origin, 'X-Requested-With': 'XMLHttpRequest' }, data: { captureChat: false, force: true,
                content: `观测站记录编号${i}，第${i}次预约。`, summary: `观测站记录${i}`, type: 'episodic' } });
            expect(result.ok()).toBe(true);
        }
    }
    const promptRows = () => requests.at(-1).systemPrompt.split('\n').flatMap(line => {
        try { const item = JSON.parse(line); return item.source === 'memories' ? [item] : []; } catch { return []; }
    });
    await send(page, '请参考观测站记录');
    expect(promptRows()).toHaveLength(12);
    await expect(page.locator('.room-memory-trace')).toContainText('已参考 12 条长期记忆');

    await page.goto('/room/settings');
    await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '长期记忆' }).click();
    await expect(page.locator('#room-memory-retrieval-limit')).toHaveValue('12');
    await page.locator('#room-memory-retrieval-limit').fill('20');
    await page.getByRole('button', { name: '保存并返回房间', exact: true }).click();
    await expect(page).toHaveURL(/\/room$/);
    await page.reload();
    await send(page, '请参考观测站记录');
    expect(promptRows()).toHaveLength(20);
    expect(new Set(promptRows().map(item => item.id)).size).toBe(20);
    await expect(page.locator('.room-memory-trace')).toContainText('已参考 20 条长期记忆');
    const assistant = page.locator('.chat-message.assistant').last();
    await assistant.hover();
    await assistant.getByRole('button', { name: '重新生成', exact: true }).click();
    await expect(page.locator('#chatInput')).toBeEnabled();
    await expect.poll(() => promptRows().length).toBe(20);
    await expect(page.locator('.chat-generation-notice.error')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('memory-limit-injection.png') });
});
