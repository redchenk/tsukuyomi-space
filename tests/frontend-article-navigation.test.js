const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture({ top = 60000, height = 100000, reduced = false } = {}) {
    let next = 0;
    const frames = new Map(), timers = new Map(), listeners = new Map(), scrolls = [], observers = [];
    const window = { scrollY: 0, innerHeight: 844, matchMedia: () => ({ matches: reduced }),
        scrollTo(options) { scrolls.push(options); this.scrollY = options.top; },
        addEventListener(type, callback) { listeners.set(type, callback); },
        removeEventListener(type) { listeners.delete(type); } };
    const document = { documentElement: { scrollHeight: height } };
    const target = { id: 'article-comments', isConnected: true, focus(options) { this.focusOptions = options; },
        getBoundingClientRect: () => ({ top: top - window.scrollY, height: 300 }) };
    const source = fs.readFileSync('src/frontend/utils/articleNavigation.js', 'utf8').replace('export function', 'function');
    const factory = vm.runInNewContext(source + '\ncreateArticleNavigation', { window, document,
        getComputedStyle: () => ({ scrollMarginTop: '106px', scrollMarginBottom: '0px' }),
        requestAnimationFrame: callback => { frames.set(++next, callback); return next; },
        cancelAnimationFrame: id => frames.delete(id),
        setTimeout: (callback, delay) => { timers.set(++next, { callback, delay }); return next; },
        clearTimeout: id => timers.delete(id),
        ResizeObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } }
    });
    const api = factory(() => ({}));
    const flush = () => { for (const [id, callback] of [...frames]) { frames.delete(id); callback(); } };
    return { api, window, target, document, scrolls, observers, timers, frames, listeners,
        resize(delta = 0) { top += delta; document.documentElement.scrollHeight += delta; observers.at(-1).callback(); flush(); },
        gesture(type) { listeners.get(type)?.(); },
        expire() { for (const value of [...timers.values()]) value.callback(); } };
}

test('a distant comment jump is immediate, respects the navbar offset, and follows growing images', () => {
    const f = fixture(); f.api.jump(f.target);
    assert.equal(f.scrolls[0].behavior, 'instant');
    assert.equal(f.window.scrollY, 59894);
    assert.equal(f.target.focusOptions.preventScroll, true);
    f.resize(9000);
    assert.equal(f.target.getBoundingClientRect().top, 106);
    assert.equal(f.scrolls.length, 2);
    f.resize(); assert.equal(f.scrolls.length, 2);
});

test('short jumps keep smooth motion and reduced-motion or notification jumps are immediate', () => {
    const f = fixture({ top: 1000 }); f.api.jump(f.target); f.resize();
    assert.equal(f.scrolls.length, 1); assert.equal(f.scrolls[0].behavior, 'smooth');
    const reduced = fixture({ top: 1000, reduced: true }); reduced.api.jump(reduced.target);
    assert.equal(reduced.scrolls[0].behavior, 'instant');
    const notification = fixture({ top: 1000 }); notification.api.jump(notification.target, { behavior: 'instant', block: 'center', focus: false });
    assert.equal(notification.scrolls[0].behavior, 'instant'); assert.equal(notification.target.focusOptions, undefined);
});

test('comment alignment clamps to the document end and returning to top reaches zero', () => {
    const f = fixture({ top: 10000, height: 10400 }); f.api.jump(f.target);
    assert.equal(f.window.scrollY, 10400 - 844);
    f.resize(3000); assert.equal(f.window.scrollY, 13400 - 844);
    f.target.id = 'article-top'; f.api.jump(f.target); assert.equal(f.window.scrollY, 0);
});

for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
    test(`${type} stops adjustments so layout changes cannot take over manual reading`, () => {
        const f = fixture(); f.api.jump(f.target); f.gesture(type); f.resize(10000);
        assert.equal(f.scrolls.length, 1); assert.equal(f.observers[0].disconnected, true);
        assert.equal(f.timers.size, 0); assert.equal(f.frames.size, 0); assert.equal(f.listeners.size, 0);
    });
}

test('expiry, leaving the page and replacing a destination release all temporary observers', () => {
    const f = fixture(); f.api.jump(f.target); f.expire(); f.resize(10000);
    assert.equal(f.scrolls.length, 1); assert.equal(f.observers[0].disconnected, true);
    f.api.jump(f.target); f.api.cancel(); f.resize(10000); assert.equal(f.scrolls.length, 2);
    f.api.jump(f.target); const old = f.observers.at(-1); f.api.jump(f.target);
    assert.equal(old.disconnected, true); assert.equal(f.timers.size, 1);
    f.target.isConnected = false; f.resize(); assert.equal(f.listeners.size, 0);
});
