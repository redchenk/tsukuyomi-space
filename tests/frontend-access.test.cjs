const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parse } = require('@vue/compiler-sfc');

function setup(file, exports, props = {}, { reduced = false, saveData = false } = {}) {
    const source = parse(fs.readFileSync(file, 'utf8')).descriptor.scriptSetup.content;
    const mounted = [];
    const unmounted = [];
    const emitted = [];
    const documentEvents = new Map();
    const windowEvents = new Map();
    const timers = new Map();
    const query = {
        matches: reduced,
        addEventListener: (name, callback) => { query.change = callback; },
        removeEventListener: () => { delete query.change; }
    };
    const connection = {
        saveData,
        addEventListener: (name, callback) => { connection.change = callback; },
        removeEventListener: () => { delete connection.change; }
    };
    const document = {
        hidden: false,
        addEventListener: (name, callback) => documentEvents.set(name, callback),
        removeEventListener: name => documentEvents.delete(name)
    };
    const setTimeout = callback => {
        const timer = Symbol('timer');
        timers.set(timer, callback);
        return timer;
    };
    const clearTimeout = timer => timers.delete(timer);
    const context = vm.createContext({
        defineProps: () => props,
        defineEmits: () => (...args) => emitted.push(args),
        defineExpose: () => {},
        ref: value => ({ value }),
        onMounted: callback => mounted.push(callback),
        onBeforeUnmount: callback => unmounted.push(callback),
        watch: () => {},
        document,
        navigator: { connection },
        Event: class Event { constructor(type) { this.type = type; } },
        setTimeout,
        clearTimeout,
        window: {
            matchMedia: () => query,
            addEventListener: (name, callback) => windowEvents.set(name, callback),
            removeEventListener: name => windowEvents.delete(name),
            dispatchEvent: () => {},
            setTimeout,
            clearTimeout
        }
    });
    vm.runInContext(source.replace(/^import .*;\n/gm, '') + '\nthis.result = {' + exports.join(',') + '};', context);
    return {
        ...context.result, query, connection, props, emitted, document, documentEvents, windowEvents, timers,
        mount: () => mounted.forEach(callback => callback()),
        unmount: () => unmounted.forEach(callback => callback())
    };
}

function access(props, preferences) {
    const state = setup('src/frontend/pages/AccessPage.vue',
        ['motionAllowed', 'startAccess', 'toggleSound'], props, preferences);
    state.mount();
    return state;
}

function scene(props = { allowMotion: true, allowIntro: true, moving: true }) {
    const state = setup('src/frontend/components/WaterMirrorScene.vue',
        ['idle', 'painted', 'syncIdle', 'onPlaying', 'onError'], props);
    const callbacks = new Map();
    let plays = 0;
    let pauses = 0;
    const video = {
        error: null,
        play() { plays++; return Promise.resolve(); },
        pause() { pauses++; },
        requestVideoFrameCallback(callback) {
            const frame = Symbol('video frame');
            callbacks.set(frame, callback);
            return frame;
        },
        cancelVideoFrameCallback(frame) { callbacks.delete(frame); }
    };
    state.idle.value = video;
    state.mount();
    return {
        ...state, video, callbacks, plays: () => plays, pauses: () => pauses,
        presentFrame() {
            for (const [frame, callback] of callbacks) {
                callbacks.delete(frame);
                callback();
            }
        }
    };
}

const activation = {
    detail: 1,
    clientX: 120,
    clientY: 240,
    currentTarget: { getBoundingClientRect: () => ({ left: 100, top: 200, width: 80, height: 40 }) }
};

for (const preference of ['reduced', 'saveData']) {
    test(`the ${preference} preference keeps the homepage on its poster`, () => {
        const state = access({}, { [preference]: true });
        assert.equal(state.motionAllowed.value, false);
        const setting = preference === 'reduced' ? state.query : state.connection;
        setting[preference === 'reduced' ? 'matches' : 'saveData'] = false;
        setting.change();
        assert.equal(state.motionAllowed.value, true);
        state.unmount();
        assert.equal(state.query.change, undefined);
        assert.equal(state.connection.change, undefined);
        assert.equal(state.timers.size, 0);
    });
}

test('busy entry ignores activation and keyboard entry uses the button center', () => {
    const state = access({ entering: true });
    state.startAccess(activation);
    assert.equal(state.emitted.length, 0);
    state.props.entering = false;
    state.toggleSound();
    state.startAccess({ ...activation, detail: 0 });
    const [event, origin] = state.emitted[0];
    assert.equal(event, 'enter');
    assert.equal(origin.x, 140);
    assert.equal(origin.y, 220);
    assert.equal(origin.sound, false);
});

test('the standby poster stays visible until a frame is presented', () => {
    const state = scene();
    state.onPlaying();
    assert.equal(state.painted.value, false);
    state.presentFrame();
    assert.equal(state.painted.value, true);
    state.onError();
    assert.equal(state.painted.value, false);
});

test('standby stops in the background, respects manual pause, and resumes on restore', () => {
    const state = scene();
    assert.equal(state.plays(), 1);
    state.document.hidden = true;
    state.documentEvents.get('visibilitychange')();
    assert.equal(state.pauses(), 1);
    state.document.hidden = false;
    state.props.moving = false;
    state.windowEvents.get('pageshow')();
    assert.equal(state.plays(), 1);
    state.props.moving = true;
    state.windowEvents.get('pageshow')();
    assert.equal(state.plays(), 2);
});

test('autoplay rejection leaves the poster and does not block entry', async () => {
    const state = scene();
    state.video.play = () => Promise.reject(new Error('autoplay denied'));
    state.syncIdle();
    await Promise.resolve();
    assert.equal(state.painted.value, false);
    const page = access({});
    page.startAccess(activation);
    assert.equal(page.emitted[0][0], 'enter');
    assert.equal(page.emitted[0][1].x, 120);
});

test('leaving stops standby and cancels pending frame and warm-up callbacks', () => {
    const state = scene();
    state.onPlaying();
    assert.equal(state.callbacks.size, 1);
    assert.equal(state.timers.size, 1);
    state.unmount();
    assert.equal(state.callbacks.size, 0);
    assert.equal(state.timers.size, 0);
    assert.equal(state.documentEvents.size, 0);
    assert.equal(state.windowEvents.size, 0);
    assert.equal(state.pauses(), 1);
});
