const { test, expect } = require('../e2e-fixtures.cjs');
test.use({ launchOptions: { args: ['--no-proxy-server'] } });

test('Room settings tests and persists a Streamable HTTP handshake in the browser', async ({ page }) => {
    const methods = [];
    await page.route('https://mcp.example.test/**', async route => {
        const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST,DELETE', 'Access-Control-Expose-Headers': 'MCP-Session-Id' };
        const method = route.request().method();
        if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
        if (method === 'DELETE') { methods.push('DELETE'); return route.fulfill({ status: 204, headers }); }
        const request = route.request().postDataJSON(); methods.push(request.method);
        if (request.method === 'notifications/initialized') return route.fulfill({ status: 202, headers });
        const result = request.method === 'initialize' ? { protocolVersion: '2025-11-25', capabilities: {} } : { tools: [{ name: 'web_search' }] };
        return route.fulfill({ contentType: 'application/json', headers: { ...headers, 'MCP-Session-Id': 'browser-session' }, body: JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) });
    });
    await page.goto('/room/settings');
    await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '工具与扩展' }).click();
    const card = page.locator('#room-mcp-settings');
    await card.getByRole('switch', { name: '允许模型调用 MCP 工具' }).check();
    await card.getByLabel('连接协议').selectOption('streamable-http');
    await card.getByLabel('MCP HTTP 端点').fill('https://mcp.example.test/mcp');
    await card.getByRole('button', { name: '测试并发现工具' }).click();
    await expect(page.getByRole('dialog')).toContainText('连接成功，发现 1 个工具');
    expect(methods).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'DELETE']);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('roomMCPSettings')));
    expect(saved.transport).toBe('streamable-http'); expect(saved.tools[0].name).toBe('web_search');
});

for (const toolFails of [false, true]) test(`Room native tool loop preserves streaming, private protocol fields and one saved turn (tool failure=${toolFails})`, async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('roomLLMSettings', JSON.stringify({ useProxy: true, apiUrl: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' }));
        localStorage.setItem('roomMemorySettings', JSON.stringify({ enabled: false }));
        localStorage.setItem('roomMCPSettings', JSON.stringify({ enabled: true, endpoint: 'https://mcp.example.test/bridge', transport: 'rest', toolAllowlist: 'web_search' }));
    });
    let models = 0, tools = 0;
    await page.route('https://mcp.example.test/**', async route => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST' } });
        const request = route.request().postDataJSON(); tools++;
        expect(request.method).toBe('tools/call'); expect(request.params.name).toBe('web_search');
        await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { isError: toolFails, content: [{ type: 'text', text: toolFails ? 'private-tool-error' : '平均距离约 38 万公里' }] } }) });
    });
    const reply = toolFails ? '这次没能查到，我先不乱猜。' : '平均约 38 万公里哦。今晚一起看看月亮吧～';
    await page.route('**/api/chat/stream', async route => {
        const request = route.request().postDataJSON(); models++;
        if (models === 1) {
            expect(request.tools.map(tool => tool.name)).toEqual(['web_search']);
            const toolCall = { id: 'call_moon', name: 'web_search', arguments: '{"query":"月球距离"}' };
            await route.fulfill({ contentType: 'text/event-stream', body: `event: done\ndata: ${JSON.stringify({ reply: '', toolCalls: [toolCall], continuation: { protocol: 'openai', items: [{ role: 'assistant', content: null, reasoning_content: 'private-reasoning', tool_calls: [{ id: 'call_moon', type: 'function', function: { name: 'web_search', arguments: toolCall.arguments } }] }] } })}\n\n` });
        } else {
            expect(request.agentTurns).toHaveLength(1);
            expect(request.agentTurns[0].results[0]).toMatchObject({ id: 'call_moon', name: 'web_search', isError: toolFails });
            await route.fulfill({ contentType: 'text/event-stream', body: `event: delta\ndata: ${JSON.stringify({ text: reply })}\n\nevent: done\ndata: ${JSON.stringify({ reply })}\n\n` });
        }
    });
    await page.goto('/room'); await page.locator('#chatInput').fill('月球离地球有多远？'); await page.locator('#sendChatBtn').click();
    await expect(page.locator('.chat-message.assistant:not([aria-busy="true"])')).toContainText(reply);
    expect(models).toBe(2); expect(tools).toBe(1);
    expect((await page.locator('.chat-message').allTextContents()).join('\n')).not.toMatch(/private-|call_moon|"query"/);
    const history = await page.evaluate(() => JSON.parse(localStorage.getItem('roomChatHistory:guest')));
    expect(history.map(item => item.role)).toEqual(['user', 'assistant']);
    expect(JSON.stringify(history)).not.toMatch(/private-|call_moon|agentTurns|tool_calls/);
    await page.reload(); await expect(page.locator('.chat-message.assistant')).toContainText(reply); expect(models).toBe(2);
});
