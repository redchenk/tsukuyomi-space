const { spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');
const os = require('os');

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
function failure(code) {
    return Object.assign(new Error(`MCP ${code}`), { code });
}

// Only a trusted, server-configured executable may use this transport. Child
// stderr is drained, never included in errors: it can contain provider secrets.
function requestOverStdio({ command, args = [], env = {}, method, params = {}, timeoutMs = 30000, signal }) {
    if (signal?.aborted) return Promise.reject(failure('MCP_ABORTED'));
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            env: { PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin', HOME: process.env.MINIMAX_MCP_HOME || os.tmpdir(), LANG: process.env.LANG || 'C.UTF-8', ...env },
            stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true, detached: process.platform !== 'win32'
        });
        let nextId = 1, settled = false, buffer = '', total = 0;
        const decoder = new StringDecoder('utf8'), pending = new Map();
        const abort = () => finish(failure('MCP_ABORTED'));
        const timer = setTimeout(() => finish(failure('MCP_TIMEOUT')), Math.max(1, Math.min(45000, timeoutMs)));
        function finish(error, result) {
            if (settled) return;
            settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
            for (const handlers of pending.values()) handlers.reject(error || failure('MCP_CLOSED'));
            pending.clear();
            try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill(); } catch { child.kill(); }
            if (error) reject(error); else resolve(result);
        }
        signal?.addEventListener('abort', abort, { once: true });
        function send(payload) {
            if (settled) throw failure('MCP_CLOSED');
            child.stdin.write(`${JSON.stringify(payload)}\n`, error => { if (error) finish(failure('MCP_WRITE')); });
        }
        function request(requestMethod, requestParams) {
            const id = nextId++;
            return new Promise((requestResolve, requestReject) => {
                pending.set(id, { resolve: requestResolve, reject: requestReject });
                try { send({ jsonrpc: '2.0', id, method: requestMethod, params: requestParams }); }
                catch (error) { finish(error); }
            });
        }
        child.stdin.on('error', () => finish(failure('MCP_WRITE')));
        child.stdout.on('data', chunk => {
            if (settled) return;
            total += chunk.length; buffer += decoder.write(chunk);
            if (total > 2 * 1024 * 1024 || Buffer.byteLength(buffer) > 1024 * 1024) return finish(failure('MCP_SIZE'));
            let newline;
            while ((newline = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
                if (!line) continue;
                let message;
                try { message = JSON.parse(line); } catch { return finish(failure('MCP_JSON')); }
                if (message?.jsonrpc !== '2.0') return finish(failure('MCP_RPC'));
                if (message.method) {
                    if (message.id != null) return finish(failure('MCP_SERVER_REQUEST'));
                    continue;
                }
                const handlers = pending.get(message.id);
                if (!handlers) return finish(failure('MCP_RPC_ID'));
                pending.delete(message.id);
                if (message.error) handlers.reject(failure('MCP_RPC_ERROR'));
                else if (!Object.hasOwn(message, 'result')) handlers.reject(failure('MCP_RPC'));
                else handlers.resolve(message.result);
            }
        });
        child.stderr.on('data', () => {});
        child.on('error', error => finish(failure(error.code === 'ENOENT' ? 'MCP_COMMAND_MISSING' : 'MCP_PROCESS')));
        child.on('close', () => { if (!settled) finish(failure('MCP_INCOMPLETE')); });
        (async () => {
            try {
                const initialized = await request('initialize', { protocolVersion: VERSIONS[0], capabilities: {}, clientInfo: { name: 'tsukuyomi-space', version: '2.1.0' } });
                if (!VERSIONS.includes(initialized?.protocolVersion)) throw failure('MCP_VERSION');
                send({ jsonrpc: '2.0', method: 'notifications/initialized' });
                finish(null, await request(method, params));
            } catch (error) { finish(error); }
        })();
    });
}
module.exports = { requestOverStdio };
