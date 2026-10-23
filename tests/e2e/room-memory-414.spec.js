const { test, expect } = require('../e2e-fixtures.cjs');

test('long Chinese memory reads use short POST URLs through a URI-limited proxy', async ({ page }, testInfo) => {
    test.setTimeout(60000);
    const username = `memory-414-${testInfo.project.name}`;
    const question = '八千代，' + '今天想和你聊聊这些日常。'.repeat(120) + '我的猫叫什么名字？';
    expect(new URLSearchParams({ q: question }).toString().length).toBeGreaterThan(8192);
    await page.addInitScript(() => {
        localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true, apiUrl: 'https://fixture.test/v1/chat/completions', model: 'fixture-model', apiKey: 'fixture-key' }));
        localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: true }));
        localStorage.setItem('roomKnowledgeSettings', JSON.stringify({ enabled: true, siteEnabled: false, entries: [] }));
    });
    const modelRequests = [], reads = [], responses = [];
    let failIndex = false;
    page.on('response', response => {
        if (/\/api\/room\/(?:memory|persona-memory)\/search$/.test(response.url())) responses.push(response);
    });
    // Emulate a strict URI ceiling, but send accepted reads to the real fixture
    // server so ownership, storage, retrieval and prompt injection are exercised.
    await page.route(/\/api\/room\/(?:memory|persona-memory)(?:[/?]|$)/, route => {
        const req = route.request(), url = new URL(req.url());
        if (url.pathname.endsWith('/search')) {
            reads.push(req);
            if (failIndex && url.pathname === '/api/room/memory/search' && req.postDataJSON().purpose === 'chat'
                && req.postDataJSON().retrieval !== 'source') {
                return route.fulfill({ status: 503, contentType: 'application/json', body: '{"success":false}' });
            }
        }
        if (req.url().length > 2048) return route.fulfill({ status: 414, body: 'URI too long' });
        return route.continue();
    });
    await page.route('**/api/chat/stream', route => {
        const data = route.request().postDataJSON();
        modelRequests.push(data);
        const reply = data.systemPrompt.includes('雪团') ? '你的猫叫雪团。' : '没有找到这条记忆。';
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: done\ndata: ${JSON.stringify({ reply })}\n\n` });
    });
    const origin = process.env.E2E_BASE_URL || 'http://127.0.0.1:4174';
    const login = await page.request.post('/api/auth/login', { headers: { Origin: origin, 'X-Requested-With': 'XMLHttpRequest' },
        data: { username, password: 'mem0-test-password' } });
    expect(login.status()).toBe(200);
    const user = (await login.json()).data.user;
    await page.addInitScript(user => localStorage.setItem('tsukuyomi_user', JSON.stringify(user)), user);
    const saved = await page.request.post('/api/room/memory', {
        headers: { Origin: origin, 'X-Requested-With': 'XMLHttpRequest' },
        data: { captureChat: false, force: true, content: '我的猫叫雪团。', summary: '宠物名字' }
    });
    expect(saved.ok()).toBe(true);
    await page.goto('/room');
    await expect(page.locator('#loadingOverlay')).toBeHidden();
    for (const fallback of [false, true]) {
        failIndex = fallback;
        const previous = modelRequests.length;
        await page.locator('#chatInput').fill(question);
        await page.locator('#sendChatBtn').click();
        await expect.poll(() => modelRequests.length).toBe(previous + 1);
        await expect(page.locator('#chatInput')).toBeEnabled();
        await expect(page.locator('.chat-message.assistant').last()).toContainText('雪团');
        expect(modelRequests.at(-1).systemPrompt).toContain('雪团');
        await expect(page.locator('.room-memory-trace').last()).toContainText(fallback ? '备用检索' : '已参考');
        await expect.poll(() => page.evaluate(key => localStorage.getItem(key), `roomChatGeneration:${username}`)).toBeNull();
        if (!fallback) {
            page.once('dialog', dialog => dialog.accept());
            if (testInfo.project.use.isMobile) {
                await page.locator('.room-tools-disclosure > summary').click();
                await page.getByRole('navigation', { name: '房间功能', exact: true }).getByRole('button', { name: '新建会话', exact: true }).click();
            } else await page.locator('.chat-session-new-btn').click();
            await expect(page.locator('.chat-message.assistant')).toHaveCount(0);
        }
    }
    expect(reads.some(req => req.postDataJSON().retrieval === 'source')).toBe(true);
    expect(reads.some(req => req.url().includes('/persona-memory/'))).toBe(true);
    for (const req of reads) {
        expect(req.method()).toBe('POST');
        expect(req.url().length).toBeLessThan(100);
        expect(req.postDataJSON().q).toBe(question);
    }
    expect(responses.every(response => [200, 503].includes(response.status()))).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('memory-long-query.png') });

    await page.goto('/room/settings');
    if (testInfo.project.use.isMobile) await page.getByRole('button', { name: '聊天模型 全部设置', exact: true }).click();
    await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '长期记忆' }).click();
    await page.getByRole('searchbox', { name: '搜索记忆', exact: true }).fill(question);
    const searched = page.waitForResponse(response => response.url().endsWith('/api/room/memory/search')
        && response.request().postDataJSON().q === question);
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    const result = await searched;
    expect(result.status()).toBe(200);
    expect(result.request().method()).toBe('POST');
    expect(result.request().postDataJSON().view).toBe('manage');
});
