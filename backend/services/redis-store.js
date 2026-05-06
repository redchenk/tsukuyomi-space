const net = require('net');
const { URL } = require('url');
const config = require('../config');

function encodeCommand(parts) {
    return `*${parts.length}\r\n${parts.map(part => {
        const value = Buffer.from(String(part));
        return `$${value.length}\r\n${value.toString()}\r\n`;
    }).join('')}`;
}

function parseResp(buffer) {
    const text = buffer.toString();
    const type = text[0];
    if (type === '+') return text.slice(1, text.indexOf('\r\n'));
    if (type === ':') return Number(text.slice(1, text.indexOf('\r\n')));
    if (type === '-') throw new Error(text.slice(1, text.indexOf('\r\n')));
    if (type === '$') {
        const end = text.indexOf('\r\n');
        const length = Number(text.slice(1, end));
        if (length < 0) return null;
        return text.slice(end + 2, end + 2 + length);
    }
    return text;
}

class MemoryStore {
    constructor() {
        this.items = new Map();
        setInterval(() => this.prune(), 60 * 1000).unref();
    }

    isRedisEnabled() {
        return false;
    }

    prune() {
        const now = Date.now();
        for (const [key, item] of this.items.entries()) {
            if (item.expiresAt && item.expiresAt <= now) this.items.delete(key);
        }
    }

    async get(key) {
        const item = this.items.get(key);
        if (!item) return null;
        if (item.expiresAt && item.expiresAt <= Date.now()) {
            this.items.delete(key);
            return null;
        }
        return item.value;
    }

    async set(key, value, ttlSeconds) {
        this.items.set(key, {
            value: String(value),
            expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null
        });
        return 'OK';
    }

    async del(key) {
        return this.items.delete(key) ? 1 : 0;
    }

    async incr(key) {
        const next = Number(await this.get(key) || 0) + 1;
        const item = this.items.get(key);
        this.items.set(key, {
            value: String(next),
            expiresAt: item?.expiresAt || null
        });
        return next;
    }

    async expire(key, ttlSeconds) {
        const item = this.items.get(key);
        if (!item) return 0;
        item.expiresAt = Date.now() + ttlSeconds * 1000;
        return 1;
    }

    async ttl(key) {
        const item = this.items.get(key);
        if (!item) return -2;
        if (!item.expiresAt) return -1;
        return Math.max(0, Math.ceil((item.expiresAt - Date.now()) / 1000));
    }
}

class RedisStore {
    constructor(redisUrl) {
        this.redisUrl = redisUrl;
        const parsed = new URL(redisUrl);
        this.host = parsed.hostname || '127.0.0.1';
        this.port = Number(parsed.port || 6379);
        this.username = decodeURIComponent(parsed.username || '');
        this.password = decodeURIComponent(parsed.password || '');
        this.db = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname.slice(1) : '';
    }

    isRedisEnabled() {
        return true;
    }

    async command(parts) {
        const commands = [];
        if (this.password) {
            commands.push(this.username ? ['AUTH', this.username, this.password] : ['AUTH', this.password]);
        }
        if (this.db) commands.push(['SELECT', this.db]);
        commands.push(parts);

        return new Promise((resolve, reject) => {
            const socket = net.createConnection({ host: this.host, port: this.port });
            const chunks = [];
            let settled = false;
            let idleTimer = null;
            const finish = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                clearTimeout(idleTimer);
                socket.destroy();
                try {
                    const responses = Buffer.concat(chunks).toString().split(/\r\n(?=[+$:-])/).filter(Boolean);
                    resolve(parseResp(Buffer.from(responses[responses.length - 1] || '')));
                } catch (error) {
                    reject(error);
                }
            };
            const timeout = setTimeout(() => {
                settled = true;
                clearTimeout(idleTimer);
                socket.destroy();
                reject(new Error('Redis command timeout'));
            }, config.redis.timeoutMs);

            socket.on('connect', () => {
                socket.write(commands.map(encodeCommand).join(''));
            });
            socket.on('data', (chunk) => {
                chunks.push(chunk);
                clearTimeout(idleTimer);
                idleTimer = setTimeout(finish, 5);
            });
            socket.on('error', error => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                clearTimeout(idleTimer);
                reject(error);
            });
            socket.on('end', () => {
                finish();
            });
            socket.on('close', () => {
                if (chunks.length > 0) finish();
            });
        });
    }

    async get(key) {
        return this.command(['GET', key]);
    }

    async set(key, value, ttlSeconds) {
        return ttlSeconds
            ? this.command(['SET', key, value, 'EX', ttlSeconds])
            : this.command(['SET', key, value]);
    }

    async del(key) {
        return this.command(['DEL', key]);
    }

    async incr(key) {
        return this.command(['INCR', key]);
    }

    async expire(key, ttlSeconds) {
        return this.command(['EXPIRE', key, ttlSeconds]);
    }

    async ttl(key) {
        return this.command(['TTL', key]);
    }
}

const primaryStore = config.redis.url ? new RedisStore(config.redis.url) : new MemoryStore();
const fallbackStore = new MemoryStore();

async function safely(operation) {
    try {
        return await operation(primaryStore);
    } catch (error) {
        console.warn('Redis unavailable, falling back to memory store:', error.message);
        return operation(fallbackStore);
    }
}

async function get(key) {
    return safely(store => store.get(key));
}

async function set(key, value, ttlSeconds) {
    return safely(store => store.set(key, value, ttlSeconds));
}

async function getJson(key) {
    const value = await get(key);
    if (!value) return null;
    try {
        return JSON.parse(value);
    } catch (_) {
        return null;
    }
}

async function setJson(key, value, ttlSeconds) {
    return set(key, JSON.stringify(value), ttlSeconds);
}

async function del(key) {
    return safely(store => store.del(key));
}

async function incrementWithTtl(key, ttlSeconds) {
    return safely(async (store) => {
        const count = await store.incr(key);
        if (count === 1) await store.expire(key, ttlSeconds);
        const ttl = await store.ttl(key);
        return { count, ttl };
    });
}

module.exports = {
    get,
    set,
    getJson,
    setJson,
    del,
    incrementWithTtl,
    isRedisEnabled: () => primaryStore.isRedisEnabled()
};
