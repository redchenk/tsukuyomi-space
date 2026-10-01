const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const tls = require('node:tls');
const { EventEmitter } = require('node:events');
const { dialPinnedRecords, createPinnedAgent } = require('../backend/services/pinned-connection');
const network = require('../backend/services/outbound-url-security');
const records = [{ address: '93.184.216.34', family: 4 }, { address: '2606:4700:4700::1111', family: 6 }];
function socket() {
    const value = new EventEmitter(); value.destroyed = false;
    value.destroy = () => { value.destroyed = true; return value; };
    return value;
}
test('slow IPv4 survives the 250 ms fallback to an unreachable IPv6 address', async t => {
    const sockets = [], traces = [];
    t.mock.method(net, 'connect', options => {
        assert.equal(options.autoSelectFamily, false);
        const value = socket(); sockets.push(value);
        if (options.family === 4) setTimeout(() => value.emit('connect'), 350);
        else queueMicrotask(() => value.emit('error', Object.assign(new Error('secret destination'), { code: 'ENETUNREACH' })));
        return value;
    });
    const winner = await dialPinnedRecords(records, { port: 443, timeoutMs: 1000, onAttempt: trace => traces.push(trace) });
    assert.equal(winner, sockets[0]); assert.equal(winner.destroyed, false); assert.equal(sockets[1].destroyed, true);
    assert.ok(traces.find(r => r.address_family === 4 && r.outcome === 'success').duration_ms >= 300);
    assert.ok(traces.some(r => r.address_family === 6 && r.error?.code === 'ENETUNREACH'));
    winner.destroy();
});
test('an immediately failed address starts its fallback without waiting 250 ms', async t => {
    const sockets = [];
    t.mock.method(net, 'connect', options => {
        const value = socket(); sockets.push(value);
        queueMicrotask(() => options.family === 4 ? value.emit('error', Object.assign(new Error(), { code: 'ECONNREFUSED' })) : value.emit('connect'));
        return value;
    });
    const winner = await dialPinnedRecords(records, { port: 443, timeoutMs: 50 });
    assert.equal(winner, sockets[1]); assert.ok(sockets[0].destroyed); winner.destroy();
});
test('at most two TCP attempts are active and a winner closes every losing socket', async t => {
    let active = 0, maximum = 0, calls = 0; const sockets = [];
    t.mock.method(net, 'connect', () => {
        const value = socket(), index = calls++; sockets.push(value); active++; maximum = Math.max(maximum, active);
        value.destroy = () => { if (!value.destroyed) active--; value.destroyed = true; return value; };
        if (index === 1) queueMicrotask(() => value.emit('error', Object.assign(new Error(), { code: 'ENETUNREACH' })));
        if (index === 2) queueMicrotask(() => value.emit('connect'));
        return value;
    });
    const winner = await dialPinnedRecords([...records, records[0]], { port: 443, timeoutMs: 100, staggerMs: 5 });
    assert.equal(maximum, 2); assert.equal(active, 1); assert.equal(winner, sockets[2]);
    assert.ok(sockets[0].destroyed); assert.ok(sockets[1].destroyed); winner.destroy();
});
test('connection deadline closes all pending attempts', async t => {
    const sockets = [];
    t.mock.method(net, 'connect', () => { const value = socket(); sockets.push(value); return value; });
    await assert.rejects(() => dialPinnedRecords(records, { port: 443, timeoutMs: 30, staggerMs: 5 }),
        e => e.name === 'TimeoutError' && e.code === 'ETIMEDOUT');
    assert.equal(sockets.length, 2); assert.ok(sockets.every(s => s.destroyed));
});
test('abort before dialing opens no socket, and in-flight abort cancels candidates', async t => {
    const sockets = []; const before = new AbortController(); before.abort(network.timeoutError('connect'));
    t.mock.method(net, 'connect', () => { const value = socket(); sockets.push(value); return value; });
    await assert.rejects(() => dialPinnedRecords(records, { port: 443, timeoutMs: 100, signal: before.signal }), { code: 'ETIMEDOUT' });
    assert.equal(sockets.length, 0);
    const during = new AbortController();
    const result = dialPinnedRecords(records, { port: 443, timeoutMs: 100, staggerMs: 5, signal: during.signal });
    setTimeout(() => during.abort(network.timeoutError('connect')), 15);
    await assert.rejects(() => result, { code: 'ETIMEDOUT' }); assert.ok(sockets.every(s => s.destroyed));
});
test('exhausted addresses keep sanitized child errors and have a bounded attempt count', async t => {
    let calls = 0;
    t.mock.method(net, 'connect', () => {
        calls++; const value = socket(); queueMicrotask(() => value.emit('error', Object.assign(new Error('private URL'), { code: 'ENETUNREACH' }))); return value;
    });
    await assert.rejects(() => dialPinnedRecords(Array(20).fill(records[0]), { port: 443, timeoutMs: 100 }), e => {
        assert.equal(e.errors.length, 8);
        assert.deepEqual(network.classifyError(e), { reason: 'network_error', error_code: 'ENETUNREACH', error_codes: ['ENETUNREACH'] }); return true;
    });
    assert.equal(calls, 8);
});
test('TLS uses the winning pinned socket with original SNI and certificate verification', async t => {
    const winner = socket();
    t.mock.method(net, 'connect', () => { queueMicrotask(() => winner.emit('connect')); return winner; });
    const secure = socket(); let tlsOptions;
    t.mock.method(tls, 'connect', options => { tlsOptions = options; return secure; });
    const agent = createPinnedAgent(records, { timeoutMs: 100 });
    const result = await new Promise((resolve, reject) => agent.createConnection({ host: 'receiver.example.test', servername: 'receiver.example.test', port: 443, rejectUnauthorized: true },
        (error, connected) => error ? reject(error) : resolve(connected)));
    assert.equal(result, secure); assert.equal(tlsOptions.socket, winner);
    assert.equal(tlsOptions.servername, 'receiver.example.test'); assert.equal(tlsOptions.host, 'receiver.example.test');
    assert.equal(tlsOptions.rejectUnauthorized, true); assert.equal(tlsOptions.ca, undefined); assert.equal(agent.keepAlive, false);
    agent.destroy(); winner.destroy();
});
test('aggregate error diagnosis never copies URLs, messages or arbitrary error codes', () => {
    const marker = 'secret-callback-and-token';
    const aggregate = Object.assign(new AggregateError([Object.assign(new Error(marker), { code: 'ETIMEDOUT' }), { code: marker }], marker), { code: 'ETIMEDOUT' });
    const wrapped = network.timeoutError('connect'); wrapped.cause = aggregate;
    assert.deepEqual(network.classifyError(wrapped), { reason: 'timeout', error_code: 'ETIMEDOUT', error_codes: ['ETIMEDOUT', 'NETWORK_ERROR'] });
    assert.ok(!JSON.stringify(network.classifyError(wrapped)).includes(marker));
});
test('attempt diagnostic fields retain only public enums and never raw destinations', async t => {
    const diagnostics = require('../backend/services/fushi-diagnostics');
    let output;
    t.mock.method(console, 'info', value => { output = JSON.parse(value); });
    diagnostics.emit('network_stage', { stage: 'connect', address_family: 4, attempt: 2,
        error_codes: ['ETIMEDOUT', 'ENETUNREACH', 'secret-callback-token'], url: 'secret-callback-token' });
    assert.equal(output.address_family, 4); assert.equal(output.attempt, 2);
    assert.deepEqual(output.error_codes, ['ETIMEDOUT', 'ENETUNREACH', 'NETWORK_ERROR']);
    assert.ok(!JSON.stringify(output).includes('secret-callback-token'));
});
