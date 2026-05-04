const { spawn } = require('child_process');

const DEFAULT_PROTOCOL_VERSION = '2024-11-05';

function createMessageParser(onMessage) {
    let buffer = '';

    return (chunk) => {
        buffer += chunk.toString('utf8');
        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            newlineIndex = buffer.indexOf('\n');
            if (!line) continue;
            try {
                onMessage(JSON.parse(line));
            } catch (_) {
                // Ignore malformed child output and wait for the next JSON-RPC line.
            }
        }
    };
}

function requestOverStdio({
    command,
    args = [],
    env = {},
    method,
    params = {},
    timeoutMs = 30000
}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            env: { ...process.env, ...env },
            stdio: ['pipe', 'pipe', 'pipe']
        });
        let nextId = 1;
        let stderr = '';
        let settled = false;
        const pending = new Map();

        const finish = (error, result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            child.kill();
            if (error) reject(error);
            else resolve(result);
        };

        const timer = setTimeout(() => {
            finish(new Error(`MCP stdio timeout after ${timeoutMs}ms${stderr ? `: ${stderr.slice(-300)}` : ''}`));
        }, timeoutMs);

        const send = (payload) => {
            child.stdin.write(`${JSON.stringify(payload)}\n`);
        };

        const sendRequest = (requestMethod, requestParams) => {
            const id = nextId;
            nextId += 1;
            send({ jsonrpc: '2.0', id, method: requestMethod, params: requestParams });
            return new Promise((requestResolve, requestReject) => {
                pending.set(id, { resolve: requestResolve, reject: requestReject });
            });
        };

        child.stdout.on('data', createMessageParser((message) => {
            if (!message || message.id == null || !pending.has(message.id)) return;
            const handlers = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) {
                handlers.reject(new Error(message.error.message || `MCP error ${message.error.code || ''}`.trim()));
            } else {
                handlers.resolve(message.result);
            }
        }));

        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString('utf8');
        });

        child.on('error', (error) => {
            finish(new Error(error.code === 'ENOENT'
                ? `MCP command not found: ${command}. Please install uvx on the server.`
                : error.message));
        });

        child.on('exit', (code) => {
            if (!settled && code !== 0) {
                finish(new Error(`MCP process exited with code ${code}${stderr ? `: ${stderr.slice(-300)}` : ''}`));
            }
        });

        (async () => {
            try {
                await sendRequest('initialize', {
                    protocolVersion: DEFAULT_PROTOCOL_VERSION,
                    capabilities: {},
                    clientInfo: { name: 'tsukuyomi-space', version: '2.1.0' }
                });
                send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
                const result = await sendRequest(method, params);
                finish(null, result);
            } catch (error) {
                finish(error);
            }
        })();
    });
}

module.exports = {
    requestOverStdio
};
