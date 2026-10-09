const { test, expect } = require('../e2e-fixtures.cjs');
test.use({ launchOptions: { args: ['--no-proxy-server'] } });

async function configure(page) {
    await page.addInitScript(() => {
        localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true }));
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
    await page.locator('#chatInput').fill(message);
    await page.locator('#sendChatBtn').click();
    await expect(page.locator('.chat-message.assistant:not([aria-busy="true"])').last()).toBeVisible();
    await expect(page.locator('#chatInput')).toBeEnabled();
    await expect(page.locator('.chat-generation-notice.error')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('roomChatGeneration:mem0-browser') || localStorage.getItem('roomChatGeneration:guest'))).toBeNull();
}
async function login(page, username) {
    await page.goto('/login');
    await page.locator('#loginAccount').fill(username);
    await page.locator('#loginPassword').fill('mem0-test-password');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/hub$/);
}
async function newChat(page) {
    page.once('dialog', dialog => dialog.accept());
    await page.locator('.chat-session-new-btn').click();
    await expect(page.locator('.chat-message.assistant')).toHaveCount(0);
}

test('embedded Mem0 really injects a saved fact after a new chat and reload, with account isolation', async ({ page, browser }, testInfo) => {
    const requests = await configure(page);
    await login(page, 'mem0-browser');
    await page.goto('/room');
    await send(page, '我的猫叫雪团');
    const stats = await (await page.request.get('/api/room/memory/status')).json();
    expect(stats.data.count).toBe(1);
    await newChat(page);
    await page.reload();
    const retrieved = page.waitForResponse(response => response.url().includes('purpose=chat'));
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
    await otherPage.locator('#chatInput').fill('我的猫叫什么名字');
    await otherPage.locator('#sendChatBtn').click();
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
    await page.route('**/api/room/memory?**', route => {
        const params = new URL(route.request().url()).searchParams;
        if (params.get('purpose') !== 'chat') return route.continue();
        if (params.get('retrieval') === 'source') {
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
