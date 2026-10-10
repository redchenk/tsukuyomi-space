import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSeasonTransition, decodeSeasonImages } from '../src/frontend/services/seasonTransition.mjs';

function fixture(options = {}) {
  const events = [];
  const doc = { visibilityState: 'visible', documentElement: { dataset: {} }, startViewTransition(update) {
    events.push('snapshot');
    const done = Promise.resolve().then(update);
    return { ready: done, updateCallbackDone: done, finished: done, skipTransition() { events.push('skip'); } };
  } };
  return { events, doc, change: createSeasonTransition({ document: doc, reducedMotion: () => false,
    prepare: async () => events.push('decoded'), flush: async () => events.push('flushed'), ...options }) };
}

test('new artwork is prepared before taking the old snapshot, and Vue flushes before finishing', async () => {
  const { change, events, doc } = fixture();
  await change('summer', () => events.push('applied'));
  assert.deepEqual(events, ['decoded', 'snapshot', 'applied', 'flushed']);
  assert.equal(doc.documentElement.dataset.seasonTransition, undefined);
});

test('rapid choices apply the latest season even if older decoding finishes later', async () => {
  const pending = new Map();
  const { change, events } = fixture({ prepare: season => new Promise(resolve => pending.set(season, resolve)) });
  const first = change('summer', () => events.push('summer'));
  const last = change('winter', () => events.push('winter'));
  await Promise.resolve();
  pending.get('winter')();
  await last;
  pending.get('summer')();
  await first;
  assert.deepEqual(events, ['snapshot', 'winter', 'flushed']);
});

test('reduced motion, hidden pages and browsers without snapshots apply the selection immediately', async () => {
  for (const mode of ['motion', 'hidden', 'unsupported']) {
    const { doc, events } = fixture();
    if (mode === 'hidden') doc.visibilityState = 'hidden';
    if (mode === 'unsupported') delete doc.startViewTransition;
    const change = createSeasonTransition({ document: doc, reducedMotion: () => mode === 'motion',
      prepare: () => assert.fail('no preloading needed'), flush: () => {} });
    const result = change('autumn', () => events.push('applied'));
    assert.deepEqual(events, ['applied']);
    await result;
  }
});

test('failed image preparation or snapshot creation cannot prevent theme selection', async () => {
  const { doc, events, change } = fixture({ prepare: async () => { throw Error('image unavailable'); } });
  doc.startViewTransition = () => { throw Error('snapshot unavailable'); };
  await change('autumn', () => events.push('applied'));
  assert.deepEqual(events, ['applied', 'flushed']);
  assert.equal(doc.documentElement.dataset.seasonTransition, undefined);
});

test('image preparation deduplicates URLs and settles errors and stalled requests', async () => {
  const urls = [];
  class Image {
    set src(url) { urls.push(url); if (url === 'bad') this.onerror(); if (url === 'ok') this.onload(); }
    decode() { return Promise.resolve(); }
  }
  await decodeSeasonImages(['ok', 'ok', 'bad', 'stalled', null], { Image, timeout: 10 });
  assert.deepEqual(urls, ['ok', 'bad', 'stalled']);
});
