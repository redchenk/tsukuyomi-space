import test from 'node:test';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import { colorChannels, lowerColorMix, browserCssCompat } from '../scripts/browser-css-compat.mjs';
import { requestAbortScope, withRequestTimeout } from '../src/frontend/utils/requestTimeout.mjs';

test('sRGB mixing preserves alpha, nesting and custom property fallbacks', () => {
  assert.deepEqual(colorChannels('color-mix(in srgb, #f00 25%, transparent)'), ['255', '0', '0', '0.25']);
  assert.deepEqual(colorChannels('color-mix(in srgb, #f00 25%, #00f)'), ['63.75', '0', '191.25', '1']);
  assert.deepEqual(colorChannels('color-mix(in srgb, color-mix(in srgb, #f00 50%, #00f) 50%, transparent)'), ['127.5', '0', '127.5', '0.5']);
  assert.deepEqual(colorChannels('color-mix(in srgb, #f00 20%, #00f 20%)'), ['127.5', '0', '127.5', '0.4']);
  const needed = new Set();
  const result = lowerColorMix('0 0 0 1px color-mix(in srgb, var(--accent, #f00) 25%, transparent)', needed);
  assert.match(result, /var\(--accent-r, 255\)/); assert.ok(needed.has('--accent'));
  assert.throws(() => colorChannels('color-mix(in oklab, red, blue)'), /Unsupported/);
});
test('compiled route styles retain seasonal token cascade and valid viewport fallbacks', async () => {
  const result = await postcss([browserCssCompat(process.cwd())]).process(':root{--paper:#fff;--ts-dvh:1dvh} [data-theme=dark]{--paper:#151923} .view{height:var(--height,100dvh);background:color-mix(in srgb,var(--paper) 50%,transparent)}', { from: undefined });
  assert.match(result.css, /--paper-r:255/); assert.match(result.css, /--paper-r:21/);
  assert.match(result.css, /--ts-dvh:1dvh/); assert.match(result.css, /var\(--ts-dvh, 1vh\)/);
  assert.doesNotMatch(result.css, /color-mix/);
});
test('request scopes work without native timeout/any and clean up after response consumption', async () => {
  const parent = new AbortController();
  let listeners = 0;
  const add = parent.signal.addEventListener.bind(parent.signal), remove = parent.signal.removeEventListener.bind(parent.signal);
  parent.signal.addEventListener = (...args) => { listeners++; add(...args); };
  parent.signal.removeEventListener = (...args) => { listeners--; remove(...args); };
  let signal;
  const result = await withRequestTimeout(async current => { signal = current; await new Promise(resolve => setTimeout(resolve, 5)); return 'body'; }, { signal: parent.signal, timeoutMs: 20 });
  assert.equal(result, 'body'); assert.equal(listeners, 0);
  await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(signal.aborted, false);
  await assert.rejects(withRequestTimeout(current => new Promise((_, reject) => current.addEventListener('abort', () => reject(current.reason))), { timeoutMs: 5 }), { name: 'TimeoutError' });
  const scope = requestAbortScope({ signal: parent.signal });
  const reason = new Error('route left'); parent.abort(reason);
  assert.equal(scope.signal.reason, reason); scope.dispose();
  const early = requestAbortScope({ signal: parent.signal });
  assert.equal(early.signal.reason, reason); early.dispose();
});
