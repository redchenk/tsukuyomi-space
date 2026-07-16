const HEARTBEAT_INTERVAL_MS = 25 * 1000;
const MAX_CONNECTIONS_PER_USER = 8;

const subscribers = new Map();
let heartbeatTimer = null;
let revision = 0;

function nextRevision() {
    revision = (revision + 1) % Number.MAX_SAFE_INTEGER;
    return `${Date.now().toString(36)}-${revision.toString(36)}`;
}

function writeEvent(client, event, payload, id = '') {
    if (client.res.destroyed || client.res.writableEnded) {
        client.cleanup();
        return false;
    }
    try {
        const lines = [];
        if (id) lines.push(`id: ${id}`);
        lines.push(`event: ${event}`, `data: ${JSON.stringify(payload)}`, '', '');
        client.res.write(lines.join('\n'));
        client.res.flush?.();
        return true;
    } catch (_) {
        client.cleanup();
        return false;
    }
}

function stopHeartbeatWhenIdle() {
    if (subscribers.size || !heartbeatTimer) return;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
}

function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
        for (const clients of subscribers.values()) {
            for (const client of [...clients]) {
                if (client.res.destroyed || client.res.writableEnded) {
                    client.cleanup();
                    continue;
                }
                try {
                    client.res.write(': keep-alive\n\n');
                    client.res.flush?.();
                } catch (_) {
                    client.cleanup();
                }
            }
        }
    }, HEARTBEAT_INTERVAL_MS);
    heartbeatTimer.unref?.();
}

function subscribe(userId, req, res) {
    const key = String(userId || '').trim();
    if (!key) throw new Error('Authenticated user is required for memory events');

    res.status(200);
    res.set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'private, no-store, no-cache, must-revalidate, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Vary': 'Cookie, Authorization'
    });
    res.flushHeaders?.();
    res.socket?.setKeepAlive?.(true);

    const clients = subscribers.get(key) || new Set();
    subscribers.set(key, clients);

    const client = { res, cleanup: () => {} };
    let cleaned = false;
    client.cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        clients.delete(client);
        if (!clients.size) subscribers.delete(key);
        stopHeartbeatWhenIdle();
    };

    while (clients.size >= MAX_CONNECTIONS_PER_USER) {
        const oldest = clients.values().next().value;
        oldest?.cleanup();
        oldest?.res.end();
    }
    clients.add(client);

    req.once('aborted', client.cleanup);
    res.once('close', client.cleanup);
    res.once('error', client.cleanup);
    startHeartbeat();

    writeEvent(client, 'ready', {
        revision: nextRevision(),
        updatedAt: new Date().toISOString()
    });
    return client.cleanup;
}

function publish(userId, { action = 'updated', memoryIds = [] } = {}) {
    const clients = subscribers.get(String(userId || '').trim());
    if (!clients?.size) return 0;

    const eventId = nextRevision();
    const payload = {
        action: String(action || 'updated'),
        memoryIds: [...new Set((Array.isArray(memoryIds) ? memoryIds : [memoryIds])
            .map(value => String(value || '').trim())
            .filter(Boolean))],
        revision: eventId,
        updatedAt: new Date().toISOString()
    };
    let delivered = 0;
    for (const client of [...clients]) {
        if (writeEvent(client, 'memory', payload, eventId)) delivered += 1;
    }
    return delivered;
}

function publishChat(userId, { action = 'updated', messageIds = [] } = {}) {
    const clients = subscribers.get(String(userId || '').trim());
    if (!clients?.size) return 0;

    const eventId = nextRevision();
    const payload = {
        action: String(action || 'updated'),
        messageIds: [...new Set((Array.isArray(messageIds) ? messageIds : [messageIds])
            .map(value => String(value || '').trim())
            .filter(Boolean))],
        revision: eventId,
        updatedAt: new Date().toISOString()
    };
    let delivered = 0;
    for (const client of [...clients]) {
        if (writeEvent(client, 'chat', payload, eventId)) delivered += 1;
    }
    return delivered;
}

module.exports = {
    publish,
    publishChat,
    subscribe
};
