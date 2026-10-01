const { test } = require('node:test');
const assert = require('node:assert/strict');
const dns = require('node:dns').promises;
const https = require('node:https');
const { Writable, PassThrough } = require('node:stream');
const { EventEmitter } = require('node:events');
const network = require('../backend/services/outbound-url-security');
const hooks = require('../backend/services/fushi-webhooks');
const secret = `whsec_${Buffer.alloc(32, 3).toString('base64')}`;
const callback = { id: 'fixture', url: 'https://receiver.example.test/callback', secret };

// Mock only DNS/the transport boundary, not fetchPinnedUrl. Public address
// validation, pinned lookup, Node body adapter and TLS options remain under test.
function transport(t, { failure, stall, reused = false, status = 200, chunks = ['{"challenge":"fixture"}'] } = {}) {
    t.mock.method(dns, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }]);
    let observedOptions, request, incoming;
    t.mock.method(https, 'request', (url, options, receive) => {
        observedOptions = options;
        const socket = new EventEmitter(); Object.assign(socket, { connecting: !reused, encrypted: true, authorized: reused });
        request = new Writable({ autoDestroy: false, write(_chunk, _encoding, done) { done(); } });
        request.reusedSocket = reused;
        let timeout;
        request.setTimeout = (ms, listener) => { timeout = setTimeout(listener, ms); return request; };
        const abort = () => { const error = new Error('fixture abort'); error.name = 'AbortError'; error.code = 'ABORT_ERR'; error.cause = options.signal.reason; request.destroy(error); };
        options.signal?.addEventListener('abort', abort, { once: true });
        request.once('close', () => { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); });
        queueMicrotask(() => {
            request.emit('socket', socket);
            if (stall === 'connect') return;
            if (failure === 'ECONNREFUSED') { const error = new Error('secret remote address'); error.code = failure; request.destroy(error); return; }
            socket.connecting = false; if (!reused) socket.emit('connect');
            if (stall === 'tls') return;
            if (failure) { const error = new Error('secret certificate details'); error.code = failure; request.destroy(error); return; }
            if (!reused) socket.emit('secureConnect');
            if (stall === 'headers') return;
            incoming = new PassThrough();
            Object.assign(incoming, { statusCode: status, statusMessage: 'Fixture', rawHeaders: ['Content-Type', 'application/json'] });
            incoming.once('close', () => request.destroy());
            receive(incoming);
            for (const chunk of chunks) incoming.write(chunk);
            if (stall !== 'body') incoming.end();
        });
        return request;
    });
    return { options: () => observedOptions, request: () => request, incoming: () => incoming };
}
test('DNS failure is timed and sanitized without starting a connection', async t => {
    let connections = 0; const traces = [];
    t.mock.method(dns, 'lookup', async () => { const error = new Error('secret hostname'); error.code = 'ENOTFOUND'; throw error; });
    t.mock.method(https, 'request', () => { connections++; });
    await assert.rejects(() => network.fetchPinnedUrl(callback.url, { onTrace: record => traces.push(record) }), { code: 'ENOTFOUND' });
    assert.equal(connections, 0); assert.equal(traces.at(-1).stage, 'dns'); assert.equal(traces.at(-1).reason, 'dns_error');
    assert.equal(traces.at(-1).error_code, 'ENOTFOUND'); assert.equal(typeof traces.at(-1).duration_ms, 'number');
    assert.ok(!JSON.stringify(traces).includes('secret'));
});
test('DNS wait respects abort and cannot open a late socket after resolution', async t => {
    let resolveDns, connections = 0; const controller = new AbortController();
    t.mock.method(dns, 'lookup', () => new Promise(resolve => { resolveDns = resolve; }));
    t.mock.method(https, 'request', () => { connections++; });
    const call = network.fetchPinnedUrl(callback.url, { signal: controller.signal });
    controller.abort(network.timeoutError('dns'));
    await assert.rejects(() => call, { name: 'TimeoutError', code: 'ETIMEDOUT' });
    resolveDns([{ address: '93.184.216.34', family: 4 }]); await Promise.resolve();
    assert.equal(connections, 0);
});
for (const [code, stage, reason] of [['ECONNREFUSED','connect','network_error'], ['CERT_HAS_EXPIRED','tls','tls_error'], ['ERR_TLS_CERT_ALTNAME_INVALID','tls','tls_error']]) {
    test(`${code} is attributed to ${stage} without leaking error messages`, async t => {
        transport(t, { failure: code }); const traces = [];
        await assert.rejects(() => network.fetchPinnedUrl(callback.url, { onTrace: record => traces.push(record) }), { code });
        const failure = traces.find(r => r.outcome === 'failed');
        assert.deepEqual([failure.stage, failure.reason, failure.error_code], [stage, reason, code]);
        assert.ok(!JSON.stringify(traces).includes('secret'));
    });
}
for (const stage of ['connect', 'tls', 'headers']) test(`socket timeout while waiting for ${stage} has a typed timeout code`, async t => {
    transport(t, { stall: stage }); const traces = [];
    await assert.rejects(() => network.fetchPinnedUrl(callback.url, { timeoutMs: 20, onTrace: r => traces.push(r) }),
        e => e.name === 'TimeoutError' && e.code === 'ETIMEDOUT' && e.networkStage === stage);
    assert.equal(traces.at(-1).reason, 'timeout'); assert.equal(traces.at(-1).stage, stage);
});
test('socket timeout after headers fails response body with typed ETIMEDOUT', async t => {
    transport(t, { stall: 'body', chunks: ['{'] }); const traces = [];
    const response = await network.fetchPinnedUrl(callback.url, { timeoutMs: 20, onTrace: r => traces.push(r) });
    await assert.rejects(() => response.text(), e => e.name === 'TimeoutError' && e.code === 'ETIMEDOUT' && e.networkStage === 'body');
    assert.ok(traces.some(r => r.stage === 'body' && r.reason === 'timeout'));
});
test('whole callback budget includes body even when bytes keep resetting socket inactivity', async t => {
    const fake = transport(t, { stall: 'body', chunks: ['{'] });
    const trickle = setInterval(() => fake.incoming()?.write(' '), 5);
    try {
        await assert.rejects(() => hooks.postSigned(callback, 'fixture', { type: 'verification' }, { verification: true, timeoutMs: 30 }),
            e => e.name === 'TimeoutError' && e.code === 'ETIMEDOUT');
    } finally { clearInterval(trickle); }
});
test('complete response records all stages and retains TLS validation and pinned public lookup', async t => {
    const fake = transport(t); const traces = [];
    const response = await network.fetchPinnedUrl(callback.url, { onTrace: r => traces.push(r) });
    assert.deepEqual(await response.json(), { challenge: 'fixture' });
    assert.deepEqual(traces.filter(r => r.outcome === 'success').map(r => r.stage), ['dns','connect','tls','headers','body']);
    const options = fake.options();
    assert.notEqual(options.rejectUnauthorized, false); assert.equal(options.agent, undefined);
    await new Promise((resolve, reject) => options.lookup('changed.example.test', {}, (error, address, family) => {
        if (error) return reject(error); assert.equal(address, '93.184.216.34'); assert.equal(family, 4); resolve();
    }));
});
test('redirect is rejected without following or draining an unbounded response', async t => {
    transport(t, { status: 302, stall: 'body' });
    await assert.rejects(() => network.fetchPinnedUrl(callback.url), { code: 'REDIRECT_REJECTED' });
});
test('reused verified TLS socket is recorded as cached and headers are still measured', async t => {
    transport(t, { reused: true }); const traces = [];
    const response = await network.fetchPinnedUrl(callback.url, { onTrace: r => traces.push(r) });
    await response.text();
    assert.ok(traces.some(r => r.stage === 'tls' && r.outcome === 'cached'));
    assert.ok(traces.some(r => r.stage === 'headers' && r.outcome === 'success'));
});
test('mixed DNS answers and every private address fail before HTTPS is invoked', async t => {
    let connections = 0; t.mock.method(https, 'request', () => { connections++; });
    for (const address of ['127.0.0.1','10.0.0.2','169.254.169.254','::1','fc00::1','::ffff:127.0.0.1']) {
        t.mock.method(dns, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }, { address, family: address.includes(':') ? 6 : 4 }]);
        await assert.rejects(() => network.fetchPinnedUrl(callback.url), { code: 'URL_REJECTED' });
    }
    assert.equal(connections, 0);
});
test('observability callback exceptions do not disrupt a safe response', async t => {
    transport(t);
    const response = await network.fetchPinnedUrl(callback.url, { onTrace() { throw new Error('observer failure'); } });
    assert.equal(response.status, 200); await response.text();
});
test('Fushi webhook selects bounded pinned racing while the shared default remains unchanged', async t => {
    const fake = transport(t);
    const response = await hooks.postSigned(callback, 'fixture', { type: 'verification' }, { verification: true });
    assert.equal(response.accepted, true); assert.ok(fake.options().agent instanceof https.Agent);
    assert.equal(fake.options().agent.keepAlive, false);
});
