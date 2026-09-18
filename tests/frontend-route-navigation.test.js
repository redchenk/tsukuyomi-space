const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadModule(file, exports, context = {}) {
    const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
        .replace(/^import .*;\n/gm, '').replace(/export function /g, 'function ');
    return vm.runInNewContext(code + `\n({ ${exports.join(',')} });`, { URL, AbortController, setTimeout, clearTimeout, queueMicrotask, ...context });
}
function anchor(href, extra = {}) {
    const attrs = { href, ...extra };
    return { getAttribute: name => attrs[name] ?? null, hasAttribute: name => name in attrs };
}
const router = { resolve: path => ({ matched: /^\/(?:hub|stage|editor|wiki|articles\/\d+)(?:[/?#]|$)/.test(path) ? [{}] : [] }) };
const navigationExports = ['internalRoutePath', 'installRouteLinks', 'routeViewKey', 'scrollToRoute', 'cancelPendingRouteScroll', 'focusRouteHeading'];

test('only intercepts recognized same-origin routes and leaves browser/native links intact', () => {
    const { internalRoutePath } = loadModule('src/frontend/utils/routeNavigation.js', navigationExports);
    const base = 'https://yachiyo.hk/articles/15/story';
    assert.equal(internalRoutePath(anchor('/stage?q=月光&page=2'), router, base), '/stage?q=%E6%9C%88%E5%85%89&page=2');
    assert.equal(internalRoutePath(anchor('#chapter'), router, base), '/articles/15/story#chapter');
    for (const link of [anchor('/stage', { target: '_blank' }), anchor('/stage', { download: '' }), anchor('/stage', { 'data-native-navigation': '' }), anchor('/stage', { rel: 'external' }), anchor('/api/auth/qq'), anchor('/agent-os/'), anchor('/assets/music.flac'), anchor('https://example.test/stage'), anchor('javascript:alert(1)'), anchor('mailto:test@example.test'), anchor('#')]) {
        assert.equal(internalRoutePath(link, router, base), null);
    }
});

test('delegates prose links without duplicating page handlers, preserves modified clicks and cleans up', () => {
    const handlers = new Map();
    const root = { addEventListener: (type, fn, capture) => handlers.set(type + (capture === true ? '-capture' : ''), fn), removeEventListener: (type, fn, capture) => handlers.delete(type + (capture === true ? '-capture' : '')) };
    const navigated = [], prefetched = [];
    const api = loadModule('src/frontend/utils/routeNavigation.js', navigationExports, { window: { location: new URL('https://yachiyo.hk/hub') } });
    const cleanup = api.installRouteLinks({ root, router, navigate: p => navigated.push(p), prefetch: p => prefetched.push(p) });
    const click = (extra = {}) => ({ target: { closest: () => anchor('/stage') }, button: 0, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...extra });
    const normal = click(); handlers.get('click')(normal);
    assert.equal(normal.defaultPrevented, true);
    handlers.get('click')(click({ defaultPrevented: true }));
    const modifier = click({ metaKey: true }); handlers.get('click-capture')(modifier); handlers.get('click')(modifier);
    assert.equal(modifier.stopped, true);
    assert.equal(modifier.defaultPrevented, undefined);
    handlers.get('focusin')(click());
    assert.deepEqual(navigated, ['/stage']);
    assert.deepEqual(prefetched, ['/stage']);
    cleanup(); assert.equal(handlers.size, 0);
});

test('anchors and Wiki section queries preserve instances while different articles and edit IDs do not', () => {
    const { routeViewKey } = loadModule('src/frontend/utils/routeNavigation.js', navigationExports);
    assert.equal(routeViewKey({ fullPath: '/articles/15/story#chapter' }), '/articles/15/story');
    assert.equal(routeViewKey({ name: 'wiki', path: '/wiki', fullPath: '/wiki?section=characters' }), '/wiki');
    assert.notEqual(routeViewKey({ fullPath: '/editor?id=1' }), routeViewKey({ fullPath: '/editor?id=2' }));
});

test('route heading focus is announced without leaving a persistent tabindex or focus class', () => {
    const { focusRouteHeading } = loadModule('src/frontend/utils/routeNavigation.js', navigationExports);
    const attributes = new Map(), classes = new Set(), listeners = new Map();
    let focusOptions;
    const heading = {
        getAttribute: name => attributes.get(name) ?? null,
        setAttribute: (name, value) => attributes.set(name, value),
        removeAttribute: name => attributes.delete(name),
        classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
        focus: options => { focusOptions = options; },
        addEventListener: (type, handler) => listeners.set(type, handler)
    };
    assert.equal(focusRouteHeading({ querySelector: selector => selector === 'h1' ? heading : null }), true);
    assert.equal(attributes.get('tabindex'), '-1');
    assert.ok(classes.has('route-focus-heading'));
    assert.equal(focusOptions.preventScroll, true);
    listeners.get('blur')();
    assert.equal(attributes.has('tabindex'), false);
    assert.equal(classes.has('route-focus-heading'), false);
    assert.equal(focusRouteHeading({ querySelector: () => null }), false);
});

function scrollHarness() {
    const state = { key: '/old', loading: false, height: 2000, target: null };
    const listeners = new Map();
    const observers = [];
    const document = {
        body: {}, documentElement: { get scrollHeight() { return state.height; } },
        querySelector: selector => selector === '.route-stage' ? {} : { dataset: { routeKey: state.key }, querySelector: () => state.loading ? {} : null },
        getElementById: () => state.target
    };
    const window = { innerHeight: 800, matchMedia: () => ({ matches: false }), addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) };
    class Observer { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.closed = true; } }
    const api = loadModule('src/frontend/utils/routeNavigation.js', navigationExports, {
        document, window, MutationObserver: Observer, ResizeObserver: Observer,
        requestAnimationFrame: fn => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout,
        getComputedStyle: () => ({ scrollMarginTop: '120px' })
    });
    return { ...api, state, listeners, observers, tick: () => observers.filter(o => !o.closed).forEach(o => o.callback()) };
}
const route = (fullPath) => ({ path: fullPath.split(/[?#]/)[0], fullPath, hash: fullPath.includes('#') ? '#' + fullPath.split('#')[1] : '' });

test('waits for the incoming view and loaded content before restoring browser history position', async () => {
    const h = scrollHarness();
    let resolved = false;
    const pending = h.scrollToRoute(route('/stage?page=2'), route('/articles/15'), { top: 1800, left: 0 }).then(value => { resolved = true; return value; });
    h.state.key = '/stage?page=2'; h.state.loading = true; h.tick();
    await new Promise(r => setTimeout(r, 10)); assert.equal(resolved, false);
    h.state.loading = false; h.tick();
    await new Promise(r => setTimeout(r, 10)); assert.equal(resolved, false);
    h.state.height = 3200; h.tick();
    const result = await pending;
    assert.equal(result.top, 1800); assert.equal(result.behavior, 'instant');
    assert.equal(h.listeners.size, 0); assert.ok(h.observers.every(o => o.closed));
});

test('scroll restoration yields to user input and superseding navigation', async () => {
    const h = scrollHarness();
    const interrupted = h.scrollToRoute(route('/stage'), route('/hub'), { top: 800 });
    h.listeners.get('wheel')(); assert.equal(await interrupted, false);
    const old = h.scrollToRoute(route('/stage'), route('/hub'), null);
    h.cancelPendingRouteScroll(); assert.equal(await old, false);
    h.state.key = '/wiki';
    assert.equal((await h.scrollToRoute(route('/wiki'), route('/hub'), null)).top, 0);
    assert.equal(h.scrollToRoute(route('/wiki?section=music'), route('/wiki'), null), false);
});

test('cross-page anchors await their target and same-page anchors scroll without remounting', async () => {
    const h = scrollHarness(); h.state.key = '/articles/15';
    const pending = h.scrollToRoute(route('/articles/15#chapter'), route('/hub'), null);
    h.state.target = { id: 'chapter' }; h.tick();
    const result = await pending;
    assert.equal(result.el, h.state.target); assert.equal(result.top, 120); assert.equal(result.behavior, 'instant');
    assert.equal((await h.scrollToRoute(route('/articles/15#chapter'), route('/articles/15'), null)).behavior, 'smooth');
});

test('route fades finish once, clean up after cancellation and honor reduced motion and immersive pages', async () => {
    let reduced = false, completed = 0, calls = 0, canceled = 0, settle;
    const api = loadModule('src/frontend/utils/motion.js', ['animateRouteEnter', 'animateRouteLeave', 'cancelRouteMotion'], {
        document: { visibilityState: 'visible' }, window: { matchMedia: () => ({ matches: reduced }) }, isReducedPerformance: () => true
    });
    const element = { matches: () => false, classList: { add() {}, remove() {} }, animate(frames, options) {
        calls++; assert.ok(options.duration <= 220); assert.deepEqual(Object.keys(frames[0]), ['opacity']);
        return { finished: new Promise(resolve => { settle = resolve; }), cancel() { canceled++; } };
    } };
    api.animateRouteEnter(element, () => completed++);
    api.cancelRouteMotion(element); settle(); await Promise.resolve();
    assert.equal(completed, 1); assert.equal(canceled, 1);
    reduced = true; api.animateRouteLeave(element, () => completed++);
    reduced = false; element.matches = () => true; api.animateRouteEnter(element, () => completed++);
    await Promise.resolve();
    assert.equal(completed, 3); assert.equal(calls, 1);
});
