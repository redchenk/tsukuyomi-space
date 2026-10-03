import protocol from '../../../../shared/llm-protocol.cjs';

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
let nextId = 1;
export function validateMcpEndpoint(value) {
  const raw = String(value || '').trim();
  if (raw === '/api/mcp/token-plan') return raw;
  const url = new URL(raw);
  if (url.username || url.password || url.hash || url.search
    || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw protocol.error('MCP_ENDPOINT', 'MCP 端点须使用 HTTPS，本机服务可用 HTTP');
  }
  return url.toString();
}

async function rpcBody(response, id, signal) {
  if (!/text\/event-stream/i.test(response.headers?.get?.('content-type') || '')) {
    const data = await protocol.readJson(response, signal, 262144);
    if (data?.jsonrpc !== '2.0' || data?.id !== id) throw protocol.error('MCP_RPC_ID', 'MCP 返回了不匹配的请求标识');
    return data;
  }
  const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '', total = 0;
  const cancel = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw signal.reason || protocol.error('MCP_ABORTED', '工具调用已取消');
      const chunk = await reader.read(); if (chunk.done) break;
      total += chunk.value.length; if (total > 524288) throw protocol.error('MCP_SIZE', 'MCP 响应过大');
      buffer += decoder.decode(chunk.value, { stream: true });
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const packet = buffer.slice(0, boundary.index); buffer = buffer.slice(boundary.index + boundary[0].length);
        const raw = packet.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
        if (!raw) continue;
        const data = JSON.parse(raw);
        if (data?.jsonrpc !== '2.0') throw protocol.error('MCP_RPC', 'MCP JSON-RPC 无效');
        if (data.method && data.id != null) throw protocol.error('MCP_SERVER_REQUEST', '此工具服务要求客户端尚未启用的功能');
        if (data.id === id && !data.method) return data;
      }
      protocol.bounded(buffer, 262144);
    }
    throw protocol.error('MCP_INCOMPLETE', 'MCP 流在返回结果前中断');
  } finally { signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

// A short-lived client per operation: no permanent sockets, polling or session
// credentials in storage. REST compatibility is explicit, never an unsafe retry.
export async function callRoomMcp(settings, method, params = {}, { signal, request = fetch, timeoutMs = settings.endpoint === '/api/mcp/token-plan' ? 45000 : 8000 } = {}) {
  const endpoint = validateMcpEndpoint(settings.endpoint);
  const bridge = endpoint === '/api/mcp/token-plan';
  const streamable = !bridge && settings.transport === 'streamable-http';
  let session = '', version = VERSIONS[0], id;
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  const headerName = String(settings.authHeader || 'Authorization').trim();
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(headerName) || /^(cookie|host|origin|referer|accept|content-type|mcp-session-id|mcp-protocol-version)$/i.test(headerName)) throw protocol.error('MCP_HEADER', 'MCP 鉴权头无效');
  const key = String(settings.apiKey || '').trim();
  if (key && !bridge) headers[headerName] = headerName.toLowerCase() === 'authorization' && !/^Bearer\s/i.test(key) ? `Bearer ${key}` : key;
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason || protocol.error('MCP_ABORTED', '工具调用已取消'));
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(protocol.error('MCP_TIMEOUT', '工具调用超时')), Math.max(1, Math.min(bridge ? 45000 : 15000, timeoutMs)));
  function currentHeaders() {
    return { ...headers, ...(streamable ? { 'MCP-Protocol-Version': version } : {}), ...(session ? { 'MCP-Session-Id': session } : {}) };
  }
  async function post(payload, notification = false) {
    const response = await request(endpoint, { method: 'POST', redirect: 'error', credentials: bridge ? 'same-origin' : 'omit', headers: currentHeaders(), signal: controller.signal, body: JSON.stringify(payload) });
    if (!response.ok) {
      await response.body?.cancel?.().catch(() => {});
      throw Object.assign(protocol.error('MCP_HTTP', `MCP HTTP ${response.status}`), { status: response.status });
    }
    if (notification) {
      await response.body?.cancel?.().catch(() => {});
      if (response.status !== 202 && response.status !== 204) throw protocol.error('MCP_NOTIFICATION', 'MCP 未接受初始化通知');
      return {};
    }
    const data = await rpcBody(response, payload.id, controller.signal);
    if (data.error) throw protocol.error('MCP_RPC_ERROR', `MCP RPC ${Number.isInteger(data.error.code) ? data.error.code : '错误'}`);
    if (!Object.hasOwn(data, 'result')) throw protocol.error('MCP_RPC', 'MCP 未返回结果');
    return { result: data.result, session: response.headers?.get?.('MCP-Session-Id') || '' };
  }
  async function initialize() {
    session = '';
    const response = await post({ jsonrpc: '2.0', id: nextId++, method: 'initialize', params: { protocolVersion: VERSIONS[0], capabilities: {}, clientInfo: { name: 'tsukuyomi-room', version: '1.0.0' } } });
    if (!VERSIONS.includes(response.result?.protocolVersion)) throw protocol.error('MCP_VERSION', '工具服务返回了不支持的 MCP 版本');
    version = response.result.protocolVersion;
    if (response.session && !/^[\x21-\x7E]{1,512}$/.test(response.session)) throw protocol.error('MCP_SESSION', 'MCP 会话标识无效');
    session = response.session;
    await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, true);
  }
  try {
    if (streamable) await initialize();
    id = nextId++;
    const args = !streamable && ['tools/list', 'tools/call'].includes(method) ? { ...params, meta: { auth: { api_key: settings.apiKey, api_host: settings.apiHost, base_path: settings.basePath, resource_mode: settings.resourceMode || 'url' } } } : params;
    const response = await post({ jsonrpc: '2.0', id, method, params: args });
    if (response.result?.isError) throw protocol.error('MCP_TOOL_FAILED', 'MCP 工具执行失败');
    return response.result;
  } catch (e) {
    if (controller.signal.aborted) throw controller.signal.reason || e;
    // An unclear result is never replayed. 404 reinitialization occurs on the
    // next user operation, not by silently repeating tools/call.
    throw e;
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
    if (streamable && session) {
      const cleanup = new AbortController(); const deadline = setTimeout(() => cleanup.abort(), 1000);
      try { const response = await request(endpoint, { method: 'DELETE', redirect: 'error', credentials: 'omit', headers: currentHeaders(), signal: cleanup.signal }); await response.body?.cancel?.().catch(() => {}); } catch {}
      clearTimeout(deadline);
    }
  }
}

export function mcpResultText(result, maxChars = 2000) {
  if (result?.isError) throw protocol.error('MCP_TOOL_FAILED', 'MCP 工具执行失败');
  const content = Array.isArray(result?.content) ? result.content.filter(p => p?.type === 'text').map(p => p.text || '').join('\n') : '';
  return String(content || (result?.structuredContent ? JSON.stringify(result.structuredContent) : result?.text || (typeof result === 'string' ? result : ''))).trim().slice(0, maxChars);
}
