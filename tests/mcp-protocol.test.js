const { test } = require('node:test');
const assert = require('node:assert/strict');
const { requestOverStdio } = require('../backend/services/mcp-stdio');
const settings = { endpoint: 'https://mcp.example.test/mcp', transport: 'streamable-http', apiKey: 'synthetic-test-key' };
const rpc = (id, result, headers = {}) => new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { headers: { 'Content-Type': 'application/json', ...headers } });
const client = () => import('../src/frontend/services/room/roomMcp.mjs');

test('HTTP MCP initializes, negotiates, accepts SSE, closes session and never sends browser cookies', async () => {
    const { callRoomMcp } = await client(); const requests = [];
    const result = await callRoomMcp(settings, 'tools/call', { name: 'web_search', arguments: { query: '月球' } }, { request: async (url, options) => {
        requests.push(options); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
        if (options.method === 'DELETE') return new Response(null, { status: 204 });
        const body = JSON.parse(options.body);
        if (body.method === 'initialize') return rpc(body.id, { protocolVersion: '2025-06-18', capabilities: {} }, { 'MCP-Session-Id': 'session-test' });
        assert.equal(options.headers['MCP-Session-Id'], 'session-test'); assert.equal(options.headers['MCP-Protocol-Version'], '2025-06-18');
        if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
        assert.equal(body.params.meta, undefined);
        return new Response(`data: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/message', params: {} })}\r\n\r\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: '中文结果' }] } })}\r\n\r\n`, { headers: { 'Content-Type': 'text/event-stream' } });
    } });
    assert.equal(result.content[0].text, '中文结果'); assert.equal(requests.length, 4);
});

test('REST bridge keeps authenticated site fetch and legacy auth metadata without duplicate bearer credentials', async () => {
    const { callRoomMcp } = await client(); let calls = 0;
    await callRoomMcp({ ...settings, endpoint: '/api/mcp/token-plan' }, 'tools/list', {}, { request: async (url, options) => {
        calls++; const body = JSON.parse(options.body); assert.equal(url, '/api/mcp/token-plan'); assert.equal(options.credentials, 'same-origin');
        assert.equal(options.headers.Authorization, undefined); assert.equal(body.params.meta.auth.api_key, 'synthetic-test-key');
        return rpc(body.id, { tools: [] });
    } }); assert.equal(calls, 1);
});

test('HTTP failure, mismatched RPC IDs and isError are failures and are not silently replayed', async () => {
    const { callRoomMcp } = await client();
    for (const fault of ['http', 'id', 'tool']) {
        let executions = 0;
        await assert.rejects(callRoomMcp(settings, 'tools/call', {}, { request: async (_, options) => {
            if (options.method === 'DELETE') return new Response(null, { status: 204 });
            const body = JSON.parse(options.body);
            if (body.method === 'initialize') return rpc(body.id, { protocolVersion: '2025-11-25' }, { 'MCP-Session-Id': 'session' });
            if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
            executions++;
            return fault === 'http' ? new Response('private-error', { status: 404 }) : rpc(fault === 'id' ? -1 : body.id, { isError: fault === 'tool', content: [] });
        } }), error => /^MCP_/.test(error.code) && !error.message.includes('private-error'));
        assert.equal(executions, 1);
    }
});

test('MCP body stall after HTTP headers is included in deadline and aborted readers are cancelled', async () => {
    const { callRoomMcp } = await client(); let cancelled = false;
    await assert.rejects(callRoomMcp({ ...settings, transport: 'rest' }, 'tools/list', {}, { timeoutMs: 30, request: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'application/json' } }) }), error => error.code === 'MCP_TIMEOUT');
    assert.equal(cancelled, true);
});

test('MCP rejects oversized or malformed JSON, unsafe endpoints, forbidden auth headers and unsupported versions', async () => {
    const { callRoomMcp, validateMcpEndpoint, mcpResultText } = await client();
    for (const endpoint of ['http://remote.example/mcp', 'https://u:p@example.test/mcp', 'https://example.test/mcp?token=x', 'file:///tmp/x']) assert.throws(() => validateMcpEndpoint(endpoint));
    assert.equal(validateMcpEndpoint('http://127.0.0.1:9880/mcp'), 'http://127.0.0.1:9880/mcp');
    await assert.rejects(callRoomMcp({ ...settings, authHeader: 'Cookie' }, 'tools/list'), error => error.code === 'MCP_HEADER');
    for (const body of ['{', JSON.stringify({ x: 'x'.repeat(262145) })]) await assert.rejects(callRoomMcp({ ...settings, transport: 'rest' }, 'tools/list', {}, { request: async () => new Response(body) }));
    await assert.rejects(callRoomMcp(settings, 'tools/list', {}, { request: async (_, options) => rpc(JSON.parse(options.body).id, { protocolVersion: '2099-01-01' }) }), error => error.code === 'MCP_VERSION');
    assert.throws(() => mcpResultText({ isError: true, content: [{ type: 'text', text: 'secret' }] }), /执行失败/);
});

function childScript(mode) {
    return `const readline=require('readline'); const rl=readline.createInterface({input:process.stdin});
    rl.on('line', async line=>{ const req=JSON.parse(line); if(!req.id)return;
    if(req.method==='initialize'){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result:{protocolVersion:'2025-11-25'}})+'\\n');return;}
    const mode=${JSON.stringify(mode)};
    if(mode==='exit'){process.exit(0);return;} if(mode==='stall'){process.stderr.write('synthetic-secret');return;}
    if(mode==='error'){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,error:{code:-1,message:'synthetic-secret'}})+'\\n');return;}
    if(mode==='json'){process.stdout.write('bad-json\\n');return;}
    const output=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:req.id,result:{content:[{type:'text',text:'中文😀'}]}})+'\\n');
    for(const byte of output){process.stdout.write(Buffer.from([byte])); await new Promise(r=>setTimeout(r,1));}
    });`;
}
test('stdio MCP decodes fragmented UTF-8 and negotiates before invoking tools', async () => {
    const result = await requestOverStdio({ command: process.execPath, args: ['-e', childScript('ok')], method: 'tools/call', timeoutMs: 2000 });
    assert.equal(result.content[0].text, '中文😀');
});
test('stdio failures and stderr never disclose provider details; exits without a result fail promptly', async () => {
    for (const mode of ['error', 'json', 'exit', 'stall']) await assert.rejects(requestOverStdio({ command: process.execPath, args: ['-e', childScript(mode)], method: 'tools/call', timeoutMs: mode === 'stall' ? 100 : 2000 }), error => /^MCP_/.test(error.code) && !error.message.includes('synthetic-secret'));
});
test('stdio cancellation stops an in-flight child and does not wait for process timeout', async () => {
    const controller = new AbortController(); const start = Date.now();
    const result = requestOverStdio({ command: process.execPath, args: ['-e', childScript('stall')], method: 'tools/call', timeoutMs: 2000, signal: controller.signal });
    setTimeout(() => controller.abort(), 80);
    await assert.rejects(result, error => error.code === 'MCP_ABORTED'); assert.ok(Date.now() - start < 1000);
});
