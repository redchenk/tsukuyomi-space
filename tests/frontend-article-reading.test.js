const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture() {
    const source = fs.readFileSync(path.join(__dirname, '../src/frontend/composables/useQualifiedArticleRead.js'), 'utf8')
        .replace(/^import .*;\n/gm, '').replace('export function', 'function');
    let clock = 0, next = 0, watchCallback, unmount;
    const timers = new Map(), listeners = new Map(), calls = [];
    const document = { visibilityState: 'visible', addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
    const context = vm.createContext({ document, onMounted: fn => fn(), onBeforeUnmount: fn => { unmount = fn; }, watch: (_, fn) => { watchCallback = fn; },
        setTimeout: (fn, ms) => { timers.set(++next, { at: clock + ms, fn }); return next; }, clearTimeout: id => timers.delete(id),
        authFetch: async (url, options) => { calls.push({ url, options }); return { success: true, data: { viewCount: 10 } }; }, parseResponse: async result => result });
    vm.runInContext(source, context);
    const article = { value: { id: 1, view_count: 9 } }, reading = { value: { seconds: 12, token: 'signed-receipt' } };
    context.useQualifiedArticleRead(article, reading);
    watchCallback();
    return { article, reading, calls, unmount: () => unmount(), change: () => watchCallback(),
        hide: () => { document.visibilityState = 'hidden'; listeners.get('visibilitychange')(); },
        show: () => { document.visibilityState = 'visible'; listeners.get('visibilitychange')(); },
        tick: async ms => { clock += ms; for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); await timer.fn(); } } };
}
test('qualified reads wait for 12 continuous visible seconds, submit once and update the visible count', async () => {
    const f = fixture();
    await f.tick(11000); assert.equal(f.calls.length, 0);
    f.hide(); await f.tick(30000); assert.equal(f.calls.length, 0);
    f.show(); await f.tick(11999); assert.equal(f.calls.length, 0);
    await f.tick(1); assert.equal(f.calls.length, 1);
    assert.equal(f.article.value.view_count, 10);
    assert.equal(JSON.parse(f.calls[0].options.body).token, 'signed-receipt');
    f.hide(); f.show(); await f.tick(20000); assert.equal(f.calls.length, 1);
});
test('leaving or changing an article cancels its pending read', async () => {
    const f = fixture(); await f.tick(10000);
    f.reading.value = null; f.change();
    await f.tick(20000); assert.equal(f.calls.length, 0);
    f.article.value = { id: 2 }; f.reading.value = { token: 'new-token', seconds: 12 }; f.change();
    await f.tick(12000); assert.equal(f.calls[0].url, '/api/articles/2/read');
    const g = fixture(); g.unmount(); await g.tick(12000); assert.equal(g.calls.length, 0);
});
