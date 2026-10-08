const assert = require('node:assert/strict');
const { it, describe } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const vue = require('vue');
const source = file => fs.readFileSync(file, 'utf8');
const strip = code => code.replace(/^import .*?;\s*$/gm, '').replace(/^export /gm, '');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const payload = id => ({ messages: [{ id, user_id: 'one', reply_count: 3 }], activity: [], pagination: { page: 1, total: 1, totalPages: 1 } });

function service() {
    const calls = [];
    let session = null, now = 0;
    const handler = () => Promise.resolve({ success: true, data: payload(calls.length) });
    const state = { handler };
    const context = { URLSearchParams, Date: class extends Date { static now() { return now; } },
        getSession: () => session, apiUrl: path => path,
        apiFetch: (path, options) => { calls.push({ path, options, private: false }); return state.handler(); },
        fetch: (path, options) => { calls.push({ path, options, private: true }); return state.handler(); },
        parseResponse: response => response };
    vm.runInNewContext(`${strip(source('src/frontend/services/plazaMessages.js'))}\nglobalThis.api = { loadPlazaPage, loadPlazaReplies, prefetchPlazaMessages, clearPlazaMessageCache };`, context);
    return { ...context.api, calls, state, account: id => { session = id ? { user: { id } } : null; }, advance: time => { now += time; } };
}

describe('Plaza page request cache', () => {
    it('coalesces prefetched reads and returns independent objects to each caller', async () => {
        const s = service(), response = deferred();
        s.state.handler = () => response.promise;
        const first = s.prefetchPlazaMessages(), second = s.loadPlazaPage();
        assert.equal(s.calls.length, 1);
        response.resolve({ success: true, data: payload(1) });
        const a = await first, b = await second;
        a.messages[0].viewer_liked = true;
        a.pagination.total = 999;
        assert.equal(b.messages[0].viewer_liked, undefined);
        assert.equal((await s.loadPlazaPage()).pagination.total, 1);
        assert.equal(s.calls.length, 1);
    });
    it('bounds cache size and age and retries failed reads', async () => {
        const s = service();
        for (let page = 1; page <= 13; page++) await s.loadPlazaPage({ page });
        await s.loadPlazaPage({ page: 1 });
        assert.equal(s.calls.length, 14);
        s.advance(30001);
        await s.loadPlazaPage({ page: 1 });
        assert.equal(s.calls.length, 15);
        s.state.handler = () => Promise.resolve({ success: false, message: 'temporary failure' });
        await assert.rejects(s.loadPlazaPage({ page: 2 }), /temporary failure/);
        s.state.handler = () => Promise.resolve({ success: true, data: payload(9) });
        assert.equal((await s.loadPlazaPage({ page: 2 })).messages[0].id, 9);
    });
    it('keeps personal data on the authenticated API and separates account caches', async () => {
        const s = service();
        s.account('one'); await s.loadPlazaPage({ sort: 'mine' });
        assert.equal(s.calls[0].private, true);
        assert.equal(s.calls[0].options.credentials, 'include');
        assert.match(s.calls[0].path, /^\/api\/messages\?/);
        assert.doesNotMatch(s.calls[0].path, /en-api|userId|user_id/);
        s.account('two'); await s.loadPlazaPage({ sort: 'mine' });
        assert.equal(s.calls.length, 2);
        await s.loadPlazaReplies(23, 42);
        assert.equal(s.calls[2].private, false);
        assert.match(s.calls[2].path, /view=thread.*limit=20.*before_id=42/);
    });
    it('does not let a request started before a mutation repopulate the cache', async () => {
        const s = service(), old = deferred();
        s.state.handler = () => old.promise;
        const pending = s.loadPlazaPage();
        s.clearPlazaMessageCache();
        s.state.handler = () => Promise.resolve({ success: true, data: payload(2) });
        assert.equal((await s.loadPlazaPage()).messages[0].id, 2);
        old.resolve({ success: true, data: payload(1) }); await pending;
        assert.equal((await s.loadPlazaPage()).messages[0].id, 2);
        assert.equal(s.calls.length, 2);
    });
});

function page(overrides = {}) {
    let currentSession = overrides.session || null;
    const timers = new Map(), calls = [];
    const route = vue.reactive({ name: 'plaza', query: {}, hash: '' });
    const location = { hash: '', origin: 'https://example.test' };
    const context = { ...vue, console, URL, Date,
        setTimeout: fn => { const id = Symbol(); timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
        onMounted: () => {}, onUnmounted: () => {}, onActivated: () => {}, onDeactivated: () => {},
        defineProps: () => ({ lang: 'zh', t: { plazaLoadFailed: '无法读取留言', refresh: '刷新' } }), defineEmits: () => () => {},
        useRoute: () => route, useRouter: () => ({ replace: options => { location.hash = options.hash || ''; route.hash = location.hash; return Promise.resolve(); } }),
        getSession: () => currentSession, loadCurrentSession: () => new Promise(() => {}),
        useUserLevels: () => ({ hydrateUserLevels: () => new Promise(() => {}), userLevel: () => null }),
        loadPublicStats: () => new Promise(() => {}), apiFetch: () => new Promise(() => {}),
        applyMessageLikeState: async messages => { messages.forEach(item => { item.viewer_liked = true; }); },
        loadPlazaPage: async options => { calls.push(options); return payload(1); },
        loadPlazaReplies: async () => ({ replies: [], next_before_id: null }),
        clearPlazaMessageCache: () => {}, PLAZA_PAGE_SIZE: 8,
        compareAppDate: (a, b) => String(a || '').localeCompare(String(b || '')),
        formatDateTime: value => value, parseAppDate: value => new Date(value),
        document: { getElementById: () => null, querySelector: () => null }, location,
        window: { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), addEventListener() {}, removeEventListener() {} },
        ...overrides };
    const script = source('src/frontend/pages/PlazaPage.vue').match(/<script setup>([\s\S]*?)<\/script>/)[1];
    vm.runInNewContext(`${strip(source('src/frontend/services/messageThreads.mjs'))}\n${strip(script)}\nplazaMounted = true;
        globalThis.api = { plaza, session, refreshPlaza, loadPlazaMessages, fetchPlazaReplies, plazaToggleReplies, plazaSyncPageWithHash, plazaReplyTarget };`, context);
    return { ...context.api, calls, location, route, account: value => { currentSession = value; context.api.session.value = value; },
        runTimers: async () => { const scheduled = [...timers.values()]; timers.clear(); await Promise.all(scheduled.map(fn => fn())); } };
}

describe('Plaza progressive loading', () => {
    it('shows the public page before slow session, topics, stats, levels and likes finish', async () => {
        const p = page({ session: { user: { id: 'one' } }, applyMessageLikeState: () => new Promise(() => {}) });
        await p.refreshPlaza({ force: false });
        assert.equal(p.plaza.loading, false);
        assert.equal(p.plaza.messages[0].id, 1);
        assert.equal(p.plaza.topicsLoading, true);
        const guest = page();
        await guest.refreshPlaza({ force: false });
        assert.equal(guest.plaza.loading, false);
        assert.equal(guest.plaza.messages[0].id, 1);
    });
    it('ignores a stale page as soon as a search changes, before debounce finishes', async () => {
        const old = deferred(); let count = 0;
        const p = page({ loadPlazaPage: () => ++count === 1 ? old.promise : Promise.resolve(payload(2)) });
        const pending = p.loadPlazaMessages();
        p.plaza.query = 'new search'; await vue.nextTick();
        old.resolve(payload(1)); await pending;
        assert.equal(p.plaza.messages.length, 0);
        await p.runTimers();
        assert.equal(p.plaza.messages[0].id, 2);
        assert.equal(p.plaza.loading, false);
    });
    it('loads expanded replies on demand, merges cursor pages and preserves directed recipients', async () => {
        const calls = [];
        const root = { id: 1, author: 'Alice', reply_count: 3 };
        const p = page({ loadPlazaPage: async () => ({ ...payload(1), messages: [root, { id: 4, parent_id: 1, reply_to_id: 2, reply_to_author: 'Bob' }] }),
            loadPlazaReplies: async (rootId, cursor) => { calls.push([rootId, cursor]); return cursor
                ? { replies: [{ id: 2, parent_id: 1, author: 'Bob' }], next_before_id: null }
                : { replies: [{ id: 4, parent_id: 1 }, { id: 3, parent_id: 1 }], next_before_id: 3 }; } });
        await p.loadPlazaMessages();
        assert.equal(calls.length, 0);
        const target = p.plazaReplyTarget(p.plaza.messages[1]);
        assert.equal(target.id, 2); assert.equal(target.name, 'Bob');
        await p.fetchPlazaReplies(1);
        await p.fetchPlazaReplies(1, true);
        assert.deepEqual(calls, [[1, null], [1, 3]]);
        assert.equal(p.plaza.messages.length, 4);
        assert.equal(new Set(p.plaza.messages.map(item => item.id)).size, 4);
        assert.equal(p.plaza.repliesCursor[1], null);
    });
    it('does not add replies from a page that has already been replaced', async () => {
        const pending = deferred(); let pageNumber = 0;
        const p = page({ loadPlazaReplies: () => pending.promise, loadPlazaPage: async () => payload(++pageNumber) });
        await p.loadPlazaMessages();
        const replies = p.fetchPlazaReplies(1);
        await p.loadPlazaMessages();
        pending.resolve({ replies: [{ id: 44, parent_id: 1 }], next_before_id: null }); await replies;
        assert.deepEqual(Array.from(p.plaza.messages, item => item.id), [2]);
    });
    it('ignores another page hash while a cached Plaza is inactive', async () => {
        const p = page();
        p.route.name = 'article'; p.location.hash = '#msg-12';
        await p.plazaSyncPageWithHash();
        assert.equal(p.calls.length, 0);
    });
    it('preserves visible messages while a background refresh fails', async () => {
        let fail = false;
        const p = page({ loadPlazaPage: async () => { if (fail) throw new Error('unavailable'); return payload(10); } });
        await p.loadPlazaMessages(); fail = true;
        await p.loadPlazaMessages({ background: true });
        assert.equal(p.plaza.messages[0].id, 10);
        assert.equal(p.plaza.loading, false);
        assert.equal(p.plaza.loadError, '');
    });
    it('resolves a notification anchor on another page and retains its older reply', async () => {
        const calls = [];
        const p = page({ loadPlazaPage: async options => { calls.push(options); return {
            ...payload(10), messages: [{ id: 10 }, { id: 12, parent_id: 10 }], anchor_id: 12, pagination: { page: 5, total: 40, totalPages: 5 } }; } });
        p.location.hash = '#msg-12';
        await p.plazaSyncPageWithHash();
        assert.equal(calls[0].anchorId, '12');
        assert.equal(p.plaza.page, 5);
        assert.equal(p.plaza.repliesExpanded[10], true);
        assert.ok(p.plaza.messages.some(item => item.id === 12));
    });
});
