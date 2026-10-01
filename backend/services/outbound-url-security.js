const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const net = require('net');
const { Readable } = require('stream');
const ipaddr = require('ipaddr.js');
const { createPinnedAgent } = require('./pinned-connection');

function timeoutError(stage = 'request') {
    const error = new Error('外部请求超时');
    Object.assign(error, { name: 'TimeoutError', code: 'ETIMEDOUT', networkStage: stage });
    return error;
}
const safeCodes = new Set(['ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH',
    'ABORT_ERR', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ERR_TLS_CERT_ALTNAME_INVALID',
    'ERR_SSL_WRONG_VERSION_NUMBER', 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR', 'URL_REJECTED', 'REDIRECT_REJECTED',
    'INVALID_JSON', 'RESPONSE_TOO_LARGE', 'INVALID_RESPONSE', 'CHALLENGE_FAILED', 'HTTP_STATUS']);
function classifyError(error) {
    const timeout = error?.name === 'TimeoutError' || error?.code === 'ETIMEDOUT'
        || error?.cause?.name === 'TimeoutError' || error?.cause?.code === 'ETIMEDOUT';
    const code = timeout ? 'ETIMEDOUT' : safeCodes.has(error?.code) ? error.code : 'NETWORK_ERROR';
    const reason = timeout ? 'timeout' : ['ENOTFOUND', 'EAI_AGAIN'].includes(code) ? 'dns_error'
        : /^(?:CERT_|DEPTH_|SELF_|UNABLE_|ERR_TLS_|ERR_SSL_)/.test(code) ? 'tls_error'
            : ({ URL_REJECTED: 'url_rejected', REDIRECT_REJECTED: 'redirect_rejected', INVALID_JSON: 'invalid_json',
                RESPONSE_TOO_LARGE: 'response_too_large', INVALID_RESPONSE: 'invalid_response', CHALLENGE_FAILED: 'challenge_failed', HTTP_STATUS: 'http_status' })[code] || 'network_error';
    const children = error?.errors || error?.cause?.errors;
    const errorCodes = Array.isArray(children) ? [...new Set(children.slice(0, 8).map(e => safeCodes.has(e?.code) ? e.code : 'NETWORK_ERROR'))] : [];
    return { reason, error_code: code, ...(errorCodes.length ? { error_codes: errorCodes } : {}),
        ...(code === 'URL_REJECTED' && error?.urlRejection ? { url_rejection: error.urlRejection } : {}),
        ...(code === 'URL_REJECTED' && error?.addressRanges ? { address_ranges: error.addressRanges } : {}) };
}
function rejectedUrl(message, urlRejection, addressRanges) {
    const error = new Error(message); error.code = 'URL_REJECTED';
    if (urlRejection) error.urlRejection = urlRejection;
    if (addressRanges) error.addressRanges = addressRanges;
    return error;
}
function observe(callback, data) { try { callback?.(data); } catch (_) { /* Observability must not change network behavior. */ } }

function addressRange(value = '') {
    const address = String(value || '').toLowerCase().split('%')[0];
    if (!net.isIP(address)) return 'invalid';
    try {
        const parsed = ipaddr.parse(address);
        if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) {
            return parsed.toIPv4Address().range();
        }
        return parsed.range();
    } catch (_) {
        return 'invalid';
    }
}
const isPrivateAddress = value => addressRange(value) !== 'unicast';

function validatePublicRecords(records) {
    if (!Array.isArray(records) || !records.length) throw rejectedUrl('没有可用地址', 'dns_empty');
    const ranges = [...new Set(records.map(record => addressRange(record?.address)))];
    if (records.some(record => ![4, 6].includes(record?.family) || net.isIP(record.address) !== record.family)
        || ranges.some(range => range !== 'unicast')) {
        throw rejectedUrl('禁止访问本机、内网或保留地址', 'dns_non_public', ranges.slice(0, 8));
    }
    return records.map(({ address, family }) => ({ address, family }));
}

async function resolvePublicUrl(value, { protocols = ['https:'], allowedHostnames = [], lookup } = {}) {
    let url;
    try {
        url = new URL(String(value || ''));
    } catch (_) {
        throw rejectedUrl('不支持的外部地址', 'invalid_url');
    }
    if (!protocols.includes(url.protocol) || url.username || url.password) throw rejectedUrl('不支持的外部地址', 'invalid_url');
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (allowedHostnames.length && !allowedHostnames.includes(hostname)) throw rejectedUrl('外部地址不在允许列表中', 'hostname_not_allowed');

    const records = net.isIP(hostname)
        ? [{ address: hostname, family: net.isIP(hostname) }]
        : await (lookup || ((...args) => dns.lookup(...args)))(hostname, { all: true, verbatim: true });
    return { url, records: validatePublicRecords(records) };
}

function pinnedLookup(records = []) {
    const safeRecords = records.map(record => ({ address: record.address, family: record.family }));
    return (_hostname, options, callback) => {
        if (!safeRecords.length) return callback(new Error('No validated DNS address'));
        if (options?.all) return callback(null, safeRecords);
        callback(null, safeRecords[0].address, safeRecords[0].family);
    };
}

async function fetchPinnedUrl(value, {
    method = 'GET',
    headers = {},
    body,
    signal,
    timeoutMs = 30000,
    redirect = 'error',
    protocols = ['https:'],
    allowedHostnames = [],
    connectStrategy = 'default',
    onTrace,
    lookup,
    agentFactory
} = {}) {
    const dnsStarted = performance.now();
    observe(onTrace, { stage: 'dns', outcome: 'started' });
    let resolved, onAbort;
    try {
        if (signal?.aborted) throw signal.reason;
        resolved = await Promise.race([
            resolvePublicUrl(value, { protocols, allowedHostnames, lookup }),
            ...(signal ? [new Promise((_, reject) => {
                onAbort = () => reject(signal.reason);
                signal.addEventListener('abort', onAbort, { once: true });
            })] : [])
        ]);
        if (signal?.aborted) throw signal.reason;
        observe(onTrace, { stage: 'dns', outcome: 'success', duration_ms: Math.round(performance.now() - dnsStarted), address_count: resolved.records.length });
    } catch (error) {
        observe(onTrace, { stage: 'dns', outcome: 'failed', duration_ms: Math.round(performance.now() - dnsStarted), ...classifyError(error) });
        throw error;
    } finally { if (onAbort) signal.removeEventListener('abort', onAbort); }
    const { url, records } = resolved;
    const transport = url.protocol === 'https:' ? https : http;
    if (!['default', 'race-pinned'].includes(connectStrategy) || (connectStrategy === 'race-pinned' && url.protocol !== 'https:')) throw rejectedUrl('Invalid connection strategy');
    const agent = agentFactory ? agentFactory(records, url) : connectStrategy === 'race-pinned' ? createPinnedAgent(records, { signal, timeoutMs,
        onAttempt: ({ error, ...attempt }) => observe(onTrace, { stage: 'connect', ...attempt, ...(error ? classifyError(error) : {}) }) }) : null;
    const streaming = body instanceof Readable;
    const payload = streaming || body === undefined || body === null
        ? null
        : (Buffer.isBuffer(body) ? body : Buffer.from(body));
    const requestHeaders = { 'Accept-Encoding': 'identity', ...headers };
    if (payload && !Object.keys(requestHeaders).some(key => key.toLowerCase() === 'content-length')) {
        requestHeaders['Content-Length'] = String(payload.length);
    }

    return new Promise((resolve, reject) => {
        let incomingResponse, stage = 'connect', stageStarted = performance.now(), bodyFinished = false;
        const trace = (outcome, error, extra = {}) => observe(onTrace, { stage, outcome,
            duration_ms: Math.round(performance.now() - stageStarted), ...(error ? classifyError(error) : {}), ...extra });
        trace('started');
        const request = transport.request(url, {
            method,
            headers: requestHeaders,
            lookup: pinnedLookup(records),
            ...(agent ? { agent } : {}),
            signal
        }, (incoming) => {
            trace('success', null, { http_status: incoming.statusCode || 502 });
            stage = 'body'; stageStarted = performance.now(); incomingResponse = incoming;
            trace('started');
            const finishBody = (outcome, error) => { if (!bodyFinished) { bodyFinished = true; trace(outcome, error); } };
            incoming.once('end', () => finishBody('success'));
            incoming.once('error', error => finishBody('failed', error));
            incoming.once('close', () => finishBody('cancelled'));
            const status = incoming.statusCode || 502;
            if (redirect === 'error' && status >= 300 && status < 400) {
                const error = new Error('外部地址不允许重定向'); error.code = 'REDIRECT_REJECTED';
                incoming.destroy(error);
                reject(error);
                return;
            }

            const responseHeaders = new Headers();
            for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
                responseHeaders.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
            }
            const noBody = method.toUpperCase() === 'HEAD' || status === 204 || status === 304;
            resolve(new Response(noBody ? null : Readable.toWeb(incoming, {
                strategy: { highWaterMark: 64 * 1024, size: chunk => chunk.byteLength }
            }), {
                status,
                statusText: incoming.statusMessage || '',
                headers: responseHeaders
            }));
        });
        request.on('socket', socket => {
            const connected = () => {
                trace('success'); stage = url.protocol === 'https:' ? 'tls' : 'headers'; stageStarted = performance.now();
                if (url.protocol === 'https:' && request.reusedSocket && socket.encrypted && socket.authorized) {
                    trace('cached'); stage = 'headers'; stageStarted = performance.now();
                }
                trace('started');
            };
            if (socket.connecting) socket.once('connect', connected);
            else connected();
            if (url.protocol === 'https:' && !request.reusedSocket) socket.once('secureConnect', () => {
                trace('success'); stage = 'headers'; stageStarted = performance.now();
                trace('started');
            });
        });
        request.setTimeout(timeoutMs, () => {
            const error = timeoutError(stage);
            // After headers, the fetch promise has resolved: fail the body as well.
            incomingResponse?.destroy(error);
            request.destroy(error);
        });
        request.on('error', cause => {
            const error = classifyError(cause).reason === 'timeout' ? timeoutError(stage) : cause;
            if (error !== cause) error.cause = cause;
            if (stage !== 'body') trace('failed', error);
            incomingResponse?.destroy(error);
            reject(error);
        });
        if (agent) request.once('close', () => agent.destroy());
        if (streaming) {
            body.on('error', error => request.destroy(error));
            request.on('close', () => body.destroy());
            body.pipe(request);
        } else {
            if (payload) request.write(payload);
            request.end();
        }
    });
}

module.exports = {
    fetchPinnedUrl,
    isPrivateAddress,
    pinnedLookup,
    resolvePublicUrl,
    validatePublicRecords,
    timeoutError,
    classifyError
};
