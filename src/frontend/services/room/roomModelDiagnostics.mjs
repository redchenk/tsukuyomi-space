import protocol from '../../../../shared/llm-protocol.cjs';
import agent from '../../../../shared/agent-protocol.cjs';

const runtime = protocol.runtime;
export function safeDiagnosticText(value, key = '') {
  let text = String(value || '');
  if (key) text = text.split(key).join('[已隐藏]');
  return text.replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|Bearer\s+\S+)/gi, '[已隐藏]').slice(0, 2000);
}
function safeUsage(input) {
  return Object.fromEntries(['prompt_tokens', 'completion_tokens', 'total_tokens', 'input_tokens', 'output_tokens'].flatMap(key =>
    Number.isFinite(input?.[key]) && input[key] >= 0 ? [[key, input[key]]] : []));
}
function failure(error, signal) {
  const code = signal?.aborted ? signal.reason?.code === 'TIMEOUT' ? 'TIMEOUT' : 'CANCELLED' : /^[A-Z0-9_]{1,48}$/.test(error?.code || '') ? error.code : 'REQUEST_FAILED';
  const candidate = Number(error?.statusCode) || Number(/(?:HTTP|LLM)\s+(\d{3})/.exec(error?.message || '')?.[1]);
  const status = Number.isInteger(candidate) && candidate >= 100 && candidate <= 599 ? candidate : null;
  const message = code === 'CANCELLED' ? '测试已取消' : code === 'TIMEOUT' ? '模型测试超时' : code === 'MODEL_CAPABILITY_UNSUPPORTED' ? '当前能力声明不支持此测试，可更换模型或调整人工覆盖'
    : code === 'MODEL_RUNTIME_INVALID' ? '参数配置或映射无效，请检查参数面板'
    : code === 'LLM_STREAM_INCOMPLETE' ? '流式响应未正常结束'
    : /JSON|EMPTY|TRUNCAT|INCOMPLETE/.test(code) ? '模型响应格式无效、为空或不完整'
    : ({ 401: '密钥无效或已过期', 403: '账号没有当前模型的访问权限', 429: '服务商限流，请稍后再试' })[status]
      || (status ? `模型请求失败（HTTP ${status}）` : '连接或协议测试失败，请检查端点、跨域和模型配置');
  return { code, status, message };
}
export async function runModelDiagnostic({ settings, mode = 'text', prompt = '请用一句话回复连接测试。', image = null, signal, request, onProgress = () => {}, now = () => performance.now() }) {
  const started = now();
  const report = { version: 1, mode, startedAt: new Date().toISOString(), status: 'running', protocol: runtime.protocolFor(settings.apiUrl),
    model: safeDiagnosticText(settings.model, settings.apiKey), transport: settings.useProxy ? 'proxy' : 'direct',
    httpStatus: null, contentType: '', eventCount: 0, firstTokenMs: null, durationMs: 0, usage: {}, parameters: {},
    capabilities: {}, warnings: [], observed: {}, events: [] };
  let preview = '', toolCalls = 0, fallback = false;
  const publish = () => onProgress({ ...report, events: [...report.events], preview: safeDiagnosticText(preview, settings.apiKey) });
  const onDiagnostic = event => {
    const elapsed = Math.max(0, Math.round(now() - started));
    if (event.type === 'event') report.eventCount++;
    else {
      report.events = [...report.events, { type: event.type, elapsedMs: elapsed }].slice(-40);
      if (event.type === 'response') {
        report.httpStatus = Number(event.httpStatus) || null;
        const format = String(event.contentType || '').split(';')[0].trim().toLowerCase();
        report.contentType = ['application/json', 'text/event-stream', 'application/x-ndjson', 'application/ndjson', 'text/plain', 'text/html'].includes(format) ? format : '';
        if (Number.isFinite(event.eventCount)) report.eventCount = event.eventCount;
      }
      if (event.type === 'fallback') fallback = true;
    }
    publish();
  };
  const onDelta = text => {
    if (report.firstTokenMs === null && text) report.firstTokenMs = Math.max(0, Math.round(now() - started));
    preview = (preview + text).slice(0, 2000);
    publish();
  };
  try {
    if (!['text', 'stream', 'tools', 'image'].includes(mode)) throw Object.assign(new Error(), { code: 'MODEL_RUNTIME_INVALID' });
    if (!settings.apiUrl || !settings.model || (!settings.apiKey && runtime.protocolFor(settings.apiUrl) !== 'ollama' && !/localhost|127\.0\.0\.1|\[::1\]/.test(new URL(settings.apiUrl).hostname)))
      throw Object.assign(new Error(), { code: 'MODEL_RUNTIME_INVALID' });
    report.parameters = runtime.resolveParameters(settings);
    report.capabilities = runtime.resolveCapabilities(settings);
    const feature = { text: 'text', stream: 'streaming', tools: 'tools', image: 'image' }[mode];
    runtime.requireCapability(settings, feature);
    if (report.capabilities[feature].value === null) report.warnings.push('供应商与内置资料未声明这项能力，测试结果仅代表本次请求');
    for (const [key, value] of Object.entries(report.parameters)) {
      if (value.field === 'omit' && value.value !== undefined) report.warnings.push(`${runtime.PARAMS[key].label}已设置，但当前映射不发送`);
    }
    if (mode === 'image' && !image?.dataUrl) throw Object.assign(new Error(), { code: 'IMAGE_REQUIRED' });
    const options = { settings: { ...settings, visionMode: 'llm' }, systemPrompt: '这是模型协议测试。请直接回答，不使用角色扮演。',
      conversation: [], message: prompt, image: mode === 'image' ? image : null, stream: mode !== 'text', signal, onDelta, onDiagnostic };
    let result;
    if (mode === 'tools') {
      report.warnings.push('工具测试使用本地固定结果，不连接 MCP 或执行外部操作');
      const tools = agent.READ_TOOLS.filter(tool => tool.name === 'web_search');
      result = await agent.runAgent({ tools, signal, onDelta,
        complete: extra => request({ ...options, message: '请先调用 web_search 查询“月读空间诊断测试”，再根据工具结果用一句话回答。', ...extra }),
        execute: async () => { toolCalls++; return { content: '这是本地诊断工具的固定测试结果：协议连接正常。', isError: false }; },
        onState: state => onDiagnostic({ type: state === 'tools' ? 'tool' : 'model' }) });
      report.observed.toolCalls = toolCalls;
      if (!toolCalls) report.warnings.push('模型返回了文字，但没有调用测试工具，本次未验证工具协议');
    } else result = await request(options);
    report.usage = safeUsage(result.usage);
    if (!preview) preview = result.reply || '';
    report.observed.text = Boolean(result.reply);
    const streamed = /event-stream|ndjson/i.test(report.contentType) && !fallback;
    if (mode === 'stream') {
      report.observed.streaming = streamed;
      if (!streamed) report.warnings.push('本次返回一次性响应，未验证流式输出');
    }
    if (mode === 'image') {
      report.observed.imageRequestAccepted = true;
      report.warnings.push('图片请求已完成；识别正确性请查看模型回复，本次不自动修改能力声明');
    }
    report.status = !result.reply || (mode === 'tools' && !toolCalls) || (mode === 'stream' && !streamed) ? 'warning' : 'success';
  } catch (error) {
    const details = failure(error, signal);
    if (report.httpStatus !== null && details.status) report.httpStatus = details.status;
    if (details.code === 'IMAGE_REQUIRED') details.message = '请先选择测试图片';
    report.status = details.code === 'CANCELLED' ? 'cancelled' : 'error';
    report.error = details;
  }
  report.durationMs = Math.max(0, Math.round(now() - started));
  publish();
  return { ...report, preview: safeDiagnosticText(preview, settings.apiKey) };
}
export function exportDiagnosticReport(report) {
  // Select fields explicitly. Future UI additions cannot accidentally export
  // prompt, response text, headers, API keys or a complete endpoint URL.
  const { version, mode, startedAt, status, protocol: wire, model, transport, httpStatus, contentType, eventCount,
    firstTokenMs, durationMs, usage, parameters, capabilities, warnings, observed, events, error } = report;
  return JSON.stringify({ version, mode, startedAt, status, protocol: wire, model, transport, httpStatus, contentType,
    eventCount, firstTokenMs, durationMs, usage, parameters, capabilities, warnings, observed, events, error }, null, 2);
}
