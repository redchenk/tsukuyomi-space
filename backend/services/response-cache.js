const store = new Map();
const MAX_CACHE_ENTRIES = 500;

function prune() {
    const now = Date.now();
    for (const [key, item] of store.entries()) {
        if (item.expiresAt <= now) store.delete(key);
    }
    while (store.size >= MAX_CACHE_ENTRIES) {
        store.delete(store.keys().next().value);
    }
}

function get(key) {
    const item = store.get(key);
    if (!item) return null;
    if (item.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
    }
    return item.value;
}

function set(key, value, ttlMs = 5000) {
    prune();
    store.set(key, {
        value,
        expiresAt: Date.now() + Math.max(250, Number(ttlMs) || 5000)
    });
    return value;
}

function remember(key, ttlMs, factory) {
    const cached = get(key);
    if (cached) return cached;
    return set(key, factory(), ttlMs);
}

function delPrefix(prefix) {
    for (const key of store.keys()) {
        if (key.startsWith(prefix)) store.delete(key);
    }
}

function clear() {
    store.clear();
}

module.exports = {
    MAX_CACHE_ENTRIES,
    get,
    set,
    remember,
    delPrefix,
    clear
};
