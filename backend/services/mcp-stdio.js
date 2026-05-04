const { spawn } = require('child_process');

const DEFAULT_PROTOCOL_VERSION = '2024-11-05';

function encodeMessage(message) {
    const body = JSON.stringify(message);
    return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
}

function createMessageParser(onMessage) {
    let buffer = Buffer.alloc(0);

    return (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length) {
            const headerEnd = buffer.indexOf('\r\n\r\n');
            if (headerEnd === -1) return;

            const header = buffer.slice(0, headerEnd).toString('utf8');
            const match = header.match(/content-length:\s*(\d+)/i);
            if (!match) {
                buffer = buffer.slice(headerEnd + 4);
                continue;
            }

            const length = Number(match[1]);
            const bodyStart = headerEnd + 4;
            const bodyEnd = bodyStart + length;
            if (buffer.length < bodyEnd) return;

            const body = buffer.slice(bodyStart, bodyEnd).toString('utf8');
            buffer = buffer.slice(bodyEnd);
            try {
                onMessage(JSON.parse(body));
            } catch (_) {
                // Ignore malformed child output and wait for the next framed message.
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
            child.stdin.write(encodeMessage(payload));
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
