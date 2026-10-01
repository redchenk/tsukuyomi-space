const { spawn } = require('node:child_process');
const { Duplex } = require('node:stream');
const https = require('node:https');
const tls = require('node:tls');
const path = require('node:path');
const net = require('node:net');
const fs = require('node:fs');
const { fetchPinnedUrl, isPrivateAddress } = require('./outbound-url-security');
const { failure, readFrame, recordFrame, connectedFrame, writeFrame } = require('./fushi-egress-protocol');
let active = 0;
function readEgressConfig(env = process.env) {
    const mode = env.FUSHI_EGRESS_MODE || 'direct';
    if (mode === 'direct') return { mode };
    const value = { mode, host: env.FUSHI_EGRESS_SSH_HOST, port: Number(env.FUSHI_EGRESS_SSH_PORT || 47388),
        user: env.FUSHI_EGRESS_SSH_USER, identity: env.FUSHI_EGRESS_SSH_IDENTITY, knownHosts: env.FUSHI_EGRESS_SSH_KNOWN_HOSTS };
    const localPath = input => typeof input === 'string' && input.length <= 512 && path.isAbsolute(input) && !/[\r\n\0]/.test(input);
    if (mode !== 'ssh' || !net.isIP(value.host || '') || isPrivateAddress(value.host)
        || !Number.isInteger(value.port) || value.port < 1 || value.port > 65535
        || !/^[a-z][a-z0-9_-]{0,31}$/.test(value.user || '') || value.user === 'root'
        || !localPath(value.identity) || !localPath(value.knownHosts)) throw new Error('Invalid Fushi egress configuration');
    return value;
}
function createSession(config, signal, spawnProcess = spawn, onRelease = () => {}) {
    if (spawnProcess === spawn) {
        for (const [file, privateKey] of [[config.identity, true], [config.knownHosts, false]]) {
            const stat = fs.lstatSync(file);
            if (!stat.isFile() || (stat.mode & (privateKey ? 0o077 : 0o022)) !== 0
                || (privateKey && stat.uid !== process.geteuid())) throw new Error('Unsafe Fushi egress credential permissions');
        }
    }
    const child = spawnProcess('/usr/bin/ssh', ['-T', '-F', '/dev/null', '-p', String(config.port),
        '-i', config.identity, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
        '-o', `UserKnownHostsFile=${config.knownHosts}`, '-o', 'GlobalKnownHostsFile=/dev/null',
        '-o', 'PasswordAuthentication=no', '-o', 'KbdInteractiveAuthentication=no', '-o', 'ConnectionAttempts=1',
        '-o', 'ForwardAgent=no', '-o', 'ClearAllForwardings=yes', '-o', 'IdentityAgent=none', '-o', 'PermitLocalCommand=no',
        '-o', 'ConnectTimeout=5', '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=1',
        `${config.user}@${config.host}`], { stdio: ['pipe', 'pipe', 'ignore'], shell: false, env: { PATH: '/usr/bin:/bin' } });
    let destroyed = false, released = false, killTimer;
    const release = () => { if (!released) { released = true; onRelease(); } };
    const close = () => {
        if (destroyed) return;
        destroyed = true; signal?.removeEventListener('abort', close);
        child.stdin.destroy(); child.stdout.destroy(); child.kill('SIGTERM');
        killTimer = setTimeout(() => child.kill('SIGKILL'), 200); killTimer.unref();
    };
    child.once('exit', () => { clearTimeout(killTimer); release(); if (!destroyed) child.stdout.destroy(failure()); });
    child.once('error', () => { release(); child.stdout.destroy(failure()); close(); });
    child.stdin.on('error', () => close());
    // No raw SSH stderr or child process environment is ever logged.
    child.stdout.on('error', () => {});
    signal?.addEventListener('abort', close, { once: true });
    return { child, close, async lookup(hostname) {
        if (signal?.aborted) throw signal.reason;
        writeFrame(child.stdin, { type: 'resolve', hostname, port: 443 });
        return recordFrame(await readFrame(child.stdout, { signal }));
    }, agent(records, url) {
        if (url.protocol !== 'https:' || Number(url.port || 443) !== 443) throw failure('URL_REJECTED');
        const agent = new https.Agent({ keepAlive: false });
        const destroy = agent.destroy.bind(agent);
        agent.destroy = () => { destroy(); close(); };
        agent.createConnection = (options, done) => {
            writeFrame(child.stdin, { type: 'connect' });
            readFrame(child.stdout, { signal }).then(frame => {
                connectedFrame(frame, records);
                const stream = Duplex.from({ readable: child.stdout, writable: child.stdin });
                stream.once('close', close);
                stream.on('error', close);
                // The relay sees only encrypted TLS bytes. SNI and certificate
                // validation stay at the website, using the original callback host.
                done(null, tls.connect({ ...options, socket: stream }));
            }).catch(error => { close(); done(error); });
        };
        return agent;
    } };
}
async function fetchFushiUrl(url, options = {}) {
    const config = readEgressConfig();
    if (config.mode === 'direct') return fetchPinnedUrl(url, options);
    if (active >= 2) throw failure();
    active++;
    let session;
    try {
        session = createSession(config, options.signal, spawn, () => { active--; });
        return await fetchPinnedUrl(url, { ...options, protocols: ['https:'], lookup: session.lookup,
            agentFactory: (records, target) => session.agent(records, target) });
    } catch (error) { if (session) session.close(); else active--; throw error; }
}
module.exports = { readEgressConfig, createSession, fetchFushiUrl };
