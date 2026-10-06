const { test } = require('node:test');
const assert = require('node:assert/strict');
const moduleReady = import('../src/frontend/services/musicPlaybackOrder.mjs');

test('saved playback modes are validated and default to repeat queue', async () => {
    const { PLAYBACK_MODES, playbackMode } = await moduleReady;
    for (const mode of PLAYBACK_MODES) assert.equal(playbackMode(mode), mode);
    for (const invalid of [null, '', 'random', {}, '__proto__']) assert.equal(playbackMode(invalid), 'loop');
});
test('sequential completion stops at the last track, while manual navigation wraps', async () => {
    const order = (await moduleReady).createPlaybackOrder();
    assert.equal(order.next(0, 3, 'sequence', true), 1);
    assert.equal(order.next(1, 3, 'sequence', true), 2);
    assert.equal(order.next(2, 3, 'sequence', true), null);
    assert.equal(order.next(2, 3, 'sequence'), 0);
    assert.equal(order.previous(0, 3, 'sequence'), 2);
});
test('repeat queue wraps and repeat one applies only to automatic completion', async () => {
    const order = (await moduleReady).createPlaybackOrder();
    assert.equal(order.next(2, 3, 'loop', true), 0);
    assert.equal(order.next(1, 3, 'single', true), 1);
    assert.equal(order.next(1, 3, 'single'), 2);
    assert.equal(order.previous(1, 3, 'single'), 0);
});
test('shuffle visits the whole queue without repetition and never repeats across a cycle boundary', async () => {
    const order = (await moduleReady).createPlaybackOrder(() => .2);
    let index = 0; const visited = [index];
    for (let n = 0; n < 9; n++) { index = order.next(index, 10, 'shuffle', true); visited.push(index); }
    assert.equal(new Set(visited).size, 10);
    assert.notEqual(order.next(index, 10, 'shuffle', true), index);
});
test('shuffle Previous and Next traverse heard history, then resume the unplayed bag', async () => {
    const order = (await moduleReady).createPlaybackOrder(() => .8);
    const first = order.next(0, 4, 'shuffle');
    const second = order.next(first, 4, 'shuffle');
    assert.equal(order.previous(second, 4, 'shuffle'), first);
    assert.equal(order.previous(first, 4, 'shuffle'), 0);
    assert.equal(order.next(0, 4, 'shuffle'), first);
    assert.equal(order.next(first, 4, 'shuffle'), second);
    assert.equal(new Set([0, first, second, order.next(second, 4, 'shuffle')]).size, 4);
});
test('queue replacement and direct track selection discard stale shuffle indexes', async () => {
    const order = (await moduleReady).createPlaybackOrder(() => .5);
    order.next(0, 100, 'shuffle');
    order.reset(1, 2);
    assert.equal(order.previous(1, 2, 'shuffle'), 1);
    assert.equal(order.next(1, 2, 'shuffle'), 0);
    assert.equal(order.next(0, 1, 'shuffle'), 0);
});
test('empty and single-song queues are safe in every playback mode', async () => {
    const { createPlaybackOrder, PLAYBACK_MODES } = await moduleReady;
    for (const mode of PLAYBACK_MODES) {
        const order = createPlaybackOrder();
        assert.equal(order.next(0, 0, mode, true), null);
        assert.equal(order.previous(0, 0, mode), null);
        assert.equal(order.next(0, 1, mode, true), mode === 'sequence' ? null : 0);
    }
});
test('shuffle history remains functional after more than 100 changes', async () => {
    const order = (await moduleReady).createPlaybackOrder(() => .6);
    let current = 0; let previous;
    for (let n = 0; n < 500; n++) { previous = current; current = order.next(current, 20, 'shuffle'); }
    assert.equal(order.previous(current, 20, 'shuffle'), previous);
    assert.equal(order.next(previous, 20, 'shuffle'), current);
});
