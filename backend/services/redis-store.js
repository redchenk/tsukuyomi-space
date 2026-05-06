const { createClient } = require('redis');
const config = require('../config');

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
        this.client = null;
        this.connectPromise = null;
    }

    isRedisEnabled() {
        return true;
    }

    createClient() {
        const client = createClient({
            url: this.redisUrl,
            socket: {
                connectTimeout: config.redis.timeoutMs,
                reconnectStrategy: false
            }
        });
        client.on('error', () => {});
        return client;
    }

    async getClient() {
        if (this.client?.isOpen) return this.client;
        if (!this.client) this.client = this.createClient();
        if (!this.connectPromise) {
            this.connectPromise = this.client.connect().catch((error) => {
                this.client?.destroy?.();
                this.client = null;
                throw error;
            }).finally(() => {
                this.connectPromise = null;
            });
        }
        await this.connectPromise;
        return this.client;
    }

    async useClient(operation) {
        const client = await this.getClient();
        return operation(client);
    }

    async get(key) {
        return this.useClient(client => client.get(key));
    }

    async set(key, value, ttlSeconds) {
        return ttlSeconds
            ? this.useClient(client => client.set(key, String(value), { EX: ttlSeconds }))
            : this.useClient(client => client.set(key, String(value)));
    }

    async del(key) {
        return this.useClient(client => client.del(key));
    }

    async incr(key) {
        return this.useClient(client => client.incr(key));
    }

    async expire(key, ttlSeconds) {
        return this.useClient(client => client.expire(key, ttlSeconds));
    }

    async ttl(key) {
        return this.useClient(client => client.ttl(key));
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
