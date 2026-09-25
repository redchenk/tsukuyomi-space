const { test, expect } = require('../e2e-fixtures.cjs');
test.use({ launchOptions: { args: ['--no-proxy-server'] } });

async function configure(page) {
    await page.addInitScript(() => {
        localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true }));
        localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: true }));
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
