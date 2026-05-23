const store = new Map();

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
    get,
    set,
    remember,
    delPrefix,
    clear
};
