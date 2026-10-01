const net = require('node:net');
const https = require('node:https');
const tls = require('node:tls');

// Called only after resolvePublicUrl has validated EVERY DNS answer. Keep a
// slower candidate alive when starting a fallback; Node 20's built-in family
// selection destroys the earlier attempt after 250 ms.
function dialPinnedRecords(records, { port, signal, timeoutMs = 10000, onAttempt, staggerMs = 250 } = {}) {
    const addresses = records.slice(0, 8);
    return new Promise((resolve, reject) => {
        const active = new Map(), errors = [];
        let next = 0, settled = false, stagger, deadline;
        const observe = (entry, outcome, error) => {
            try { onAttempt?.({ attempt: entry.index + 1, address_family: entry.family, outcome,
                duration_ms: Math.round(performance.now() - entry.started), ...(error ? { error } : {}) }); } catch (_) {}
        };
        const clean = entry => {
            entry.socket?.removeListener('connect', entry.connected);
            entry.socket?.removeListener('error', entry.failed);
        };
        const finish = (error, winner) => {
            if (settled) return;
            settled = true; clearTimeout(stagger); clearTimeout(deadline);
            signal?.removeEventListener('abort', aborted);
            for (const entry of active.values()) {
                clean(entry);
                // A cancelled loser can still emit an asynchronous socket error.
                entry.socket?.on('error', () => {});
                if (entry.socket !== winner) { observe(entry, 'cancelled'); entry.socket?.destroy(); }
            }
            active.clear();
            if (error) reject(error); else resolve(winner);
        };
        const exhausted = () => {
            if (next < addresses.length || active.size || settled) return;
            const error = new AggregateError(errors, 'Pinned connections failed');
            error.code = errors[0]?.code || 'NETWORK_ERROR';
            finish(error);
        };
        const schedule = () => {
            clearTimeout(stagger);
            if (!settled && next < addresses.length && active.size < 2) stagger = setTimeout(start, staggerMs);
        };
        const start = () => {
            if (settled || next >= addresses.length || active.size >= 2) return;
            const index = next++, record = addresses[index];
            const entry = { index, family: record.family, started: performance.now() };
            entry.connected = () => { observe(entry, 'success'); finish(null, entry.socket); };
            entry.failed = error => {
                if (settled) return;
                observe(entry, 'failed', error); errors.push(error); clean(entry);
                active.delete(index); entry.socket?.destroy();
                start(); schedule(); exhausted();
            };
            active.set(index, entry); observe(entry, 'started');
            try {
                entry.socket = net.connect({ host: record.address, port, family: record.family, autoSelectFamily: false });
                entry.socket.once('connect', entry.connected);
                entry.socket.once('error', entry.failed);
            } catch (error) { entry.failed(error); }
            schedule();
        };
        const aborted = () => finish(signal.reason || Object.assign(new Error('Connection aborted'), { code: 'ABORT_ERR' }));
        if (signal?.aborted) return aborted();
        signal?.addEventListener('abort', aborted, { once: true });
        deadline = setTimeout(() => finish(Object.assign(new Error('Pinned connection deadline'),
            { name: 'TimeoutError', code: 'ETIMEDOUT', networkStage: 'connect' })), timeoutMs);
        start(); exhausted();
    });
}

function createPinnedAgent(records, options) {
    const agent = new https.Agent({ keepAlive: false });
    agent.createConnection = (tlsOptions, callback) => {
        dialPinnedRecords(records, { ...options, port: Number(tlsOptions.port || 443) }).then(socket => {
            let secure;
            try {
                // Original hostname, SNI, certificate checks and HTTPS defaults
                // remain intact. TLS uses this already pinned TCP socket.
                secure = tls.connect({ ...tlsOptions, socket });
            } catch (error) { socket.destroy(); callback(error); return; }
            callback(null, secure);
        }, callback);
    };
    return agent;
}
module.exports = { dialPinnedRecords, createPinnedAgent };
