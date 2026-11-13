const { waitForRoom } = require('../e2e-room-helpers.cjs');
const path = require('node:path');
const { test, expect } = require('../e2e-fixtures.cjs');

test('disabled storage credentials preserve the pending image and do not invoke the model', async ({ page, baseURL }) => {
    const login = await page.request.post('/api/auth/login', { headers: { Origin: baseURL, 'X-Requested-With': 'XMLHttpRequest' }, data: { username: 'e2e-user', password: 'e2e-password' } });
    expect(login.status()).toBe(200);
    const { data } = await login.json();
    await page.addInitScript(user => {
        localStorage.setItem('tsukuyomi_user', JSON.stringify(user));
        localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true, apiUrl: 'https://api.deepseek.com/chat/completions', apiKey: 'fixture-room-key', model: 'deepseek-chat' }));
        localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
    }, data.user);
    let modelCalls = 0;
    await page.route('**/api/chat/stream', route => { modelCalls++; return route.abort(); });
    await page.route('**/api/room/chat/images', route => route.fulfill({ status: 503, json: {
        success: false, code: 'ROOM_IMAGE_STORAGE_UNAVAILABLE', retryable: false,
        message: '图片云同步服务暂不可用，请联系管理员检查存储凭据或权限；原图仍保留在当前消息中'
    } }));
    await page.goto('/room'); await waitForRoom(page);
    await page.locator('input[type="file"][accept*="image"]').setInputFiles(path.resolve('assets/icons/icon-192.png'));
    await page.locator('#chatInput').fill('图片同步失败保留原图');
    await page.locator('#sendChatBtn').click();
    const card = page.locator('.room-image-upload');
    await expect(card).toHaveAttribute('data-stage', 'error');
    await expect(card).toContainText('联系管理员检查存储凭据或权限');
    await expect(card.locator('progress')).toHaveCount(0);
    await expect(card).not.toContainText('100%');
    await expect(page.locator('.chat-message.user .chat-image-thumb').last()).toBeVisible();
    expect(modelCalls).toBe(0);
});

test('local MCP port 8790 passes the enforced CSP and other HTTP ports show an actionable error', async ({ page }) => {
    let toolsCalls = 0;
    await page.route('http://localhost:8790/mcp', async route => {
        const request = route.request(), rpc = request.postDataJSON();
        const headers = { 'Access-Control-Allow-Origin': '*' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': '*' } });
        if (rpc?.method === 'notifications/initialized') return route.fulfill({ status: 202, headers });
        if (rpc?.method === 'tools/list') toolsCalls++;
        return route.fulfill({ headers, json: { jsonrpc: '2.0', id: rpc.id, result: rpc.method === 'initialize'
            ? { protocolVersion: '2025-11-25', capabilities: {} }
            : { tools: [{ name: 'understand_image', description: 'Local image fixture', inputSchema: { type: 'object', properties: {} } }] } } });
    });
    await page.goto('/room/settings?section=mcp');
    await expect(page.locator('#boot-splash')).toHaveCount(0);
    await expect(page.locator('.app-shell')).not.toHaveAttribute('inert', '');
    await page.locator('input[name="room-setting-mcp-endpoint"]').fill('http://localhost:8790/mcp');
    await page.locator('#room-mcp-settings select').filter({ has: page.locator('option[value="streamable-http"]') }).selectOption('streamable-http');
    await page.getByRole('button', { name: '测试并发现工具', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'MCP 工具测试' });
    await expect(dialog).toContainText('连接成功，发现 1 个工具');
    expect(toolsCalls).toBe(1);
    await dialog.getByRole('button', { name: '关闭', exact: true }).first().click();
    await page.locator('input[name="room-setting-mcp-endpoint"]').fill('http://localhost:8791/mcp');
    await page.getByRole('button', { name: '测试并发现工具', exact: true }).click();
    await expect(page.getByText('本站允许 localhost 或 127.0.0.1 的 8790、11434 端口连接本机 MCP；其他端点请使用 HTTPS', { exact: false }).first()).toBeVisible();
    expect(toolsCalls).toBe(1);
});

test('a guest image stays visible after a reply and refresh without base64 in chat history', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true, apiUrl: 'https://api.deepseek.com/chat/completions', apiKey: 'fixture-room-key', model: 'deepseek-chat' }));
        localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
    });
    await page.route('**/api/chat/stream', route => route.fulfill({ status: 200, contentType: 'text/event-stream',
        body: 'event: delta\ndata: {"text":"图片收到了。"}\n\nevent: done\ndata: {"reply":"图片收到了。"}\n\n' }));
    await page.goto('/room'); await waitForRoom(page);
    await page.locator('input[type="file"][accept*="image"]').setInputFiles(path.resolve('assets/icons/icon-192.png'));
    await expect(page.locator('#chatImagePreview img')).toBeVisible();
    await page.locator('#chatInput').fill('看看这张图片');
    await page.locator('#sendChatBtn').click();
    await expect(page.locator('.chat-message.assistant:not([aria-busy="true"])')).toContainText('图片收到了。');
    await expect(page.locator('.chat-message.user .chat-image-thumb')).toBeVisible();
    await page.reload();
    const image = page.locator('.chat-message.user .chat-image-thumb');
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
    const saved = await page.evaluate(() => localStorage.getItem('roomChatHistory:guest'));
    expect(saved).not.toContain('data:image');
    expect(saved).not.toContain('[image:');
    expect(saved).toContain('localId');
});

test('article threads initially show only the latest reply and reveal hidden recipients and notification anchors', async ({ page }) => {
    const messages = [
        { id: 8100, article_id: 3, author: '楼主', content: '评论主楼', created_at: '2026-09-27 01:00:00' },
        { id: 8101, article_id: 3, parent_id: 8100, reply_to_id: 8100, author: '甲', content: '较早的回复', created_at: '2026-09-27 02:00:00' },
        { id: 8102, article_id: 3, parent_id: 8100, reply_to_id: 8101, author: '乙', content: '最新的回复', created_at: '2026-09-27 03:00:00' }
    ];
    // Public reads use a cache-busting /api/live/:nonce/ prefix.
    await page.route(/\/api\/(?:live\/[^/]+\/)?articles\/3\/messages(?:\?.*)?$/, route => route.fulfill({ json: { success: true, data: messages } }));
    await page.goto('/article?id=3');
    await expect(page.locator('#comment-8102')).toBeVisible();
    await expect(page.locator('#comment-8101')).toHaveCount(0);
    await page.getByRole('button', { name: '展开全部 2 条回复' }).click();
    await expect(page.locator('#comment-8101')).toBeVisible();
    await page.getByRole('button', { name: '收起回复' }).click();
    await expect(page.locator('#comment-8101')).toHaveCount(0);
    await page.locator('#comment-8102 .message-reply-recipient a').click();
    await expect(page.locator('#comment-8101')).toBeVisible();
    await page.reload();
    await expect(page.locator('#comment-8101')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '收起回复' }).click();
    await expect(page.locator('#comment-8102')).toBeVisible();
    await expect(page.locator('#comment-8101')).toHaveCount(0);
    await page.locator('#comment-8102 .message-reply-recipient a').click();
    await expect(page.locator('#comment-8101')).toBeVisible();
});
