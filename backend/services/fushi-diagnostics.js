const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');
const { isIP } = require('node:net');
const context = new AsyncLocalStorage();
const methods = new Set(['server/discover', 'tools/list', 'tools/call', 'events/list', 'events/subscribe', 'events/unsubscribe']);
const tools = new Set(['fushi_notifications', 'fushi_thread', 'fushi_reply', 'fushi_reply_result']);
const enums = {
    endpoint: new Set(['mcp', 'authorize', 'token', 'revoke', 'metadata']),
    http_method: new Set(['GET', 'POST', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'PATCH']),
    stage: new Set(['parameters', 'callback', 'persistence', 'dns', 'connect', 'tls', 'headers', 'body', 'request']),
    outcome: new Set(['started', 'success', 'failed', 'cached', 'committed', 'rolled_back', 'hit', 'miss', 'closed', 'cancelled']),
    reason: new Set(['timeout', 'network_error', 'dns_error', 'tls_error', 'http_status', 'invalid_json', 'response_too_large',
        'invalid_response', 'challenge_failed', 'invalid_parameters', 'authorization_revoked', 'persistence_failed',
        'content_unavailable', 'callback_rejected', 'internal_error', 'url_rejected', 'redirect_rejected', 'connection_refused', 'http_4xx', 'http_5xx']),
    status: new Set(['pending', 'inflight', 'accepted', 'dead', 'cancelled', 'not_found', 'published', 'pending_review', 'removed', 'unprocessed']),
    source: new Set(['idempotency_key', 'source_message', 'existing_reply', 'new_reply']),
    url_rejection: new Set(['invalid_url', 'hostname_not_allowed', 'dns_empty', 'dns_non_public']),
    auth_error: new Set(['invalid_token', 'untrusted_request', 'invalid_request', 'invalid_client', 'invalid_grant', 'invalid_scope', 'access_denied']),
    error_code: new Set(['ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH',
        'ABORT_ERR', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
        'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ERR_TLS_CERT_ALTNAME_INVALID',
        'ERR_SSL_WRONG_VERSION_NUMBER', 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR', 'URL_REJECTED', 'REDIRECT_REJECTED',
        'INVALID_JSON', 'RESPONSE_TOO_LARGE', 'INVALID_RESPONSE', 'CHALLENGE_FAILED', 'HTTP_STATUS', 'NETWORK_ERROR', 'INTERNAL_ERROR'])
};
const addressRanges = new Set(['invalid', 'unicast', 'unspecified', 'broadcast', 'multicast', 'linkLocal', 'loopback',
    'carrierGradeNat', 'private', 'reserved', 'as112', 'amt', 'uniqueLocal', 'ipv4Mapped', 'deprecatedSiteLocal',
    'discard', 'rfc6145', 'rfc6052', '6to4', 'teredo', 'benchmarking', 'orchid2']);
const numbers = new Set(['http_status', 'rpc_error_code', 'duration_ms', 'attempt', 'address_count', 'item_count', 'bytes']);
const booleans = new Set(['tool_is_error', 'rpc_success', 'connection_closed_early', 'committed', 'idempotency_hit', 'record_found']);
const ids = new Set(['request_id', 'operation_id', 'subscription_id', 'event_id', 'key_hash', 'message_id', 'thread_id', 'notification_id']);
const events = new Set(['request_started', 'request_completed', 'subscription_stage', 'network_stage', 'webhook_completed',
    'delivery_completed', 'subscription_stopped', 'reply_transaction', 'reply_lookup', 'thread_read', 'notifications_read', 'worker_failed']);
function emit(event, fields = {}) {
    if (!events.has(event)) return;
    const record = { component: 'fushi', event, timestamp: new Date().toISOString() };
    const values = { ...context.getStore(), ...fields };
    for (const [key, value] of Object.entries(values)) {
        if (key === 'rpc_method') record[key] = methods.has(value) ? value : 'unknown';
        else if (key === 'tool_name') record[key] = tools.has(value) ? value : 'unknown';
        else if (enums[key]?.has(value)) record[key] = value;
        else if (key === 'address_family' && [4, 6].includes(value)) record[key] = value;
        else if (key === 'error_codes' && Array.isArray(value)) record[key] = value.slice(0, 8).map(code => enums.error_code.has(code) ? code : 'NETWORK_ERROR');
        else if (key === 'address_ranges' && Array.isArray(value)) record[key] = value.slice(0, 8).filter(range => addressRanges.has(range));
        // The user authorized hostname/port diagnosis. Never allow a URL,
        // userinfo, path, query, headers or an arbitrary string in these fields.
        else if (key === 'callback_host' && typeof value === 'string' && value.length <= 253 && !isIP(value)
            && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) record[key] = value;
        else if (key === 'callback_port' && Number.isInteger(value) && value >= 1 && value <= 65535) record[key] = value;
        else if (numbers.has(key) && Number.isFinite(value)) record[key] = value;
        else if (booleans.has(key) && typeof value === 'boolean') record[key] = value;
        else if (ids.has(key) && typeof value === 'string' && /^(?:[0-9a-f-]{36}|[0-9a-f]{64}|sub_[0-9a-f]{64}|evt_[0-9a-f-]{36}|notification:\d+|\d{1,16})$/.test(value)) record[key] = value;
        else if (key === 'next_retry_at' && (value === null || (typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)))) record[key] = value;
    }
    // Never serialize an Error, request, response, URL, headers or arbitrary message.
    console.info(JSON.stringify(record));
}
function rpcMetadata(method, tool) {
    const state = context.getStore();
    if (!state) return;
    state.rpc_method = methods.has(method) ? method : 'unknown';
    if (method === 'tools/call') state.tool_name = tools.has(tool) ? tool : 'unknown';
    else delete state.tool_name;
}
function middleware(req, res, next) {
    const path = req.path;
    const endpoint = path === '/api/fushi/mcp' ? 'mcp' : path === '/api/fushi/oauth/authorize' ? 'authorize'
        : path === '/fushi/oauth/token' ? 'token' : path === '/fushi/oauth/revoke' ? 'revoke'
            : ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/api/fushi/mcp', '/.well-known/oauth-authorization-server'].includes(path) ? 'metadata' : null;
    if (!endpoint) return next();
    const state = { request_id: randomUUID(), endpoint, http_method: req.method };
    const started = performance.now();
    res.setHeader('X-Fushi-Request-Id', state.request_id);
    let finished = false;
    const result = {};
    const json = res.json;
    res.json = function (body) {
        if (typeof body?.error?.code === 'number') result.rpc_error_code = body.error.code;
        if (typeof body?.result?.isError === 'boolean') result.tool_is_error = body.result.isError;
        if (endpoint === 'mcp') result.rpc_success = Boolean(body?.result && !body.error && body.result.isError !== true);
        if (enums.reason.has(body?.error?.data?.reason)) result.reason = body.error.data.reason;
        if (enums.auth_error.has(body?.error)) result.auth_error = body.error;
        return json.call(this, body);
    };
    const complete = early => {
        if (finished) return;
        finished = true;
        emit('request_completed', { ...state, ...result, http_status: res.statusCode,
            duration_ms: Math.round(performance.now() - started), connection_closed_early: early,
            ...(endpoint === 'mcp' && result.rpc_success === undefined ? { rpc_success: false } : {}) });
    };
    res.once('finish', () => complete(false));
    res.once('close', () => complete(!res.writableFinished));
    req.once('aborted', () => complete(true));
    return context.run(state, () => {
        if (endpoint === 'mcp') rpcMetadata(req.get('Mcp-Method'), req.get('Mcp-Name'));
        emit('request_started');
        next();
    });
}
const detached = callback => context.run(undefined, callback);
module.exports = { emit, middleware, rpcMetadata, detached };
