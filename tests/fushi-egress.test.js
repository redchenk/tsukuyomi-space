const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { EventEmitter } = require('node:events');
const tls = require('node:tls');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readEgressConfig, createSession } = require('../backend/services/fushi-egress');
const { readFrame, recordFrame, connectedFrame, writeFrame } = require('../backend/services/fushi-egress-protocol');
const publicRecords = [{ address: '93.184.216.34', family: 4 }];
const config = { host: '93.184.216.34', port: 47388, user: 'fushi-egress', identity: '/secure/id', knownHosts: '/secure/hosts' };
function fakeChild() {
    const child = new EventEmitter(); Object.assign(child, { stdin: new PassThrough(), stdout: new PassThrough(), kills: [] });
    child.kill = signal => { child.kills.push(signal); queueMicrotask(() => child.emit('exit', 0)); return true; };
    return child;
}
test('direct transport remains default; SSH requires public host, dedicated user and explicit paths', () => {
    assert.deepEqual(readEgressConfig({}), { mode: 'direct' });
    const env = { FUSHI_EGRESS_MODE: 'ssh', FUSHI_EGRESS_SSH_HOST: config.host, FUSHI_EGRESS_SSH_USER: config.user,
        FUSHI_EGRESS_SSH_IDENTITY: config.identity, FUSHI_EGRESS_SSH_KNOWN_HOSTS: config.knownHosts };
    assert.equal(readEgressConfig(env).port, 47388);
    for (const patch of [{ FUSHI_EGRESS_MODE: 'proxy' }, { FUSHI_EGRESS_SSH_HOST: '127.0.0.1' },
        { FUSHI_EGRESS_SSH_HOST: '100.100.2.136' }, { FUSHI_EGRESS_SSH_USER: 'root' },
        { FUSHI_EGRESS_SSH_USER: '-oProxyCommand=evil' }, { FUSHI_EGRESS_SSH_IDENTITY: 'relative' },
        { FUSHI_EGRESS_SSH_KNOWN_HOSTS: '/tmp/hosts\nextra' }, { FUSHI_EGRESS_SSH_PORT: '0' }]) {
        assert.throws(() => readEgressConfig({ ...env, ...patch }), /Invalid Fushi/);
    }
});
test('SSH runs without shell, prompts, inherited secrets or disabled host key verification', async () => {
    const child = fakeChild(); let args, options, released = 0;
    const session = createSession(config, undefined, (binary, values, opts) => {
        assert.equal(binary, '/usr/bin/ssh'); args = values; options = opts; return child;
    }, () => { released++; });
    assert.equal(options.shell, false); assert.deepEqual(options.env, { PATH: '/usr/bin:/bin' });
    for (const expected of ['StrictHostKeyChecking=yes','BatchMode=yes','IdentitiesOnly=yes','PasswordAuthentication=no','GlobalKnownHostsFile=/dev/null']) assert.ok(args.includes(expected));
    assert.equal(args.at(-1), 'fushi-egress@93.184.216.34');
    const lookup = session.lookup('receiver.example.test');
    assert.deepEqual(await readFrame(child.stdin), { type: 'resolve', hostname: 'receiver.example.test', port: 443 });
    writeFrame(child.stdout, { type: 'resolved', records: publicRecords });
    assert.deepEqual(await lookup, publicRecords);
    session.close(); session.close(); await Promise.resolve();
    assert.deepEqual(child.kills, ['SIGTERM']); assert.equal(released, 1);
});
test('control frames preserve following opaque bytes and bound malformed input', async () => {
    const stream = new PassThrough(); const frame = readFrame(stream);
    stream.write('{"type":"connect"}\nopaque-bytes');
    assert.deepEqual(await frame, { type: 'connect' }); assert.equal(stream.read().toString(), 'opaque-bytes');
    for (const value of ['not-json\n', 'x'.repeat(65)]) {
        const bad = new PassThrough(); const pending = readFrame(bad, { maxBytes: 64 }); bad.write(value);
        await assert.rejects(pending, { code: 'NETWORK_ERROR' }); bad.destroy();
    }
});
test('mixed or invalid remote DNS results fail closed; connected address must be pinned', () => {
    for (const record of [{ address: '127.0.0.1', family: 4 }, { address: '169.254.169.254', family: 4 },
        { address: '::ffff:127.0.0.1', family: 6 }, { address: 'fc00::1', family: 6 }, { address: '93.184.216.34', family: 6 }]) {
        assert.throws(() => recordFrame({ type: 'resolved', records: [...publicRecords, record] }), { code: 'URL_REJECTED' });
    }
    assert.throws(() => recordFrame({ type: 'resolved', records: [] }), { code: 'URL_REJECTED' });
    assert.throws(() => recordFrame({ type: 'resolved', records: publicRecords, secret: 'do-not-print' }), { code: 'NETWORK_ERROR' });
    assert.throws(() => connectedFrame({ type: 'connected', address: '8.8.8.8', family: 4 }, publicRecords), { code: 'NETWORK_ERROR' });
    assert.deepEqual(connectedFrame({ type: 'connected', ...publicRecords[0] }, publicRecords).address, publicRecords[0].address);
});
test('abort during resolution terminates child and cannot leave a hanging read', async () => {
    const child = fakeChild(), controller = new AbortController();
    const session = createSession(config, controller.signal, () => child);
    const pending = session.lookup('receiver.example.test');
    controller.abort(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
    await assert.rejects(pending); assert.deepEqual(child.kills, ['SIGTERM']);
    const ended = new PassThrough(); ended.destroy(); await assert.rejects(readFrame(ended));
});
test('child exit before resolution becomes a safe failure without raw SSH diagnostics', async () => {
    const child = fakeChild(); const session = createSession(config, undefined, () => child);
    const pending = session.lookup('receiver.example.test'); child.emit('exit', 255);
    await assert.rejects(pending, error => error.code === 'NETWORK_ERROR' && !error.message.includes('IdentityFile'));
    session.close();
});
test('TLS stays at the website with original SNI and certificate options', async t => {
    const child = fakeChild(); const session = createSession(config, undefined, () => child);
    let original;
    t.mock.method(tls, 'connect', options => { original = options; return new PassThrough(); });
    const agent = session.agent(publicRecords, new URL('https://receiver.example.test/'));
    const secure = new Promise((resolve, reject) => agent.createConnection({ servername: 'receiver.example.test', rejectUnauthorized: true }, (error, socket) => error ? reject(error) : resolve(socket)));
    assert.deepEqual(await readFrame(child.stdin), { type: 'connect' });
    writeFrame(child.stdout, { type: 'connected', ...publicRecords[0] }); await secure;
    assert.equal(original.servername, 'receiver.example.test'); assert.equal(original.rejectUnauthorized, true);
    assert.ok(original.socket); assert.equal(agent.keepAlive, false); agent.destroy();
});
test('unsafe credential permissions and symlinks are rejected before launching SSH', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fushi-egress-test-'));
    const identity = path.join(directory, 'fixture-key'), knownHosts = path.join(directory, 'fixture-hosts');
    try {
        fs.writeFileSync(identity, 'non-secret fixture', { mode: 0o644 });
        fs.writeFileSync(knownHosts, 'non-secret fixture', { mode: 0o644 });
        assert.throws(() => createSession({ ...config, identity, knownHosts }), /Unsafe Fushi/);
        fs.chmodSync(identity, 0o400); fs.chmodSync(knownHosts, 0o666);
        assert.throws(() => createSession({ ...config, identity, knownHosts }), /Unsafe Fushi/);
        fs.chmodSync(knownHosts, 0o644); const link = path.join(directory, 'symlink'); fs.symlinkSync(identity, link);
        assert.throws(() => createSession({ ...config, identity: link, knownHosts }), /Unsafe Fushi/);
    } finally { fs.rmSync(directory, { recursive: true }); }
});
