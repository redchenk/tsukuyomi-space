const assert = require('node:assert/strict');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const rendering = import(pathToFileURL(path.join(root, 'src/live2d/room-rendering.mjs')).href);

test('GPU buffers preserve deformed vertices while reusing UVs and indices across frames and mask passes', () => {
  const code = esbuild.buildSync({
    entryPoints: [path.join(root, 'lib/Framework/src/rendering/cubismdrawablebuffers.ts')],
    bundle: true, write: false, platform: 'node', format: 'cjs'
  }).outputFiles[0].text;
  const context = { module: { exports: {} } };
  vm.runInNewContext(code, context);
  let nextBuffer = 0;
  let bound = null;
  const gpuData = new Map();
  const writes = [];
  const deleted = [];
  const gl = {
    ARRAY_BUFFER: 1, ELEMENT_ARRAY_BUFFER: 2, DYNAMIC_DRAW: 3, STATIC_DRAW: 4,
    createBuffer: () => ++nextBuffer,
    bindBuffer: (_target, buffer) => { bound = buffer; },
    bufferData: (_target, data) => { gpuData.set(bound, [...data]); writes.push(bound); },
    bufferSubData: (_target, _offset, data) => { gpuData.set(bound, [...data]); writes.push(bound); },
    deleteBuffer: buffer => deleted.push(buffer)
  };
  const cache = new context.module.exports.CubismDrawableBuffers(gl);
  const vertices = new Float32Array([1, 2, 3, 4]);
  const uv = new Float32Array([0, 0, 1, 1]);
  const indices = new Uint16Array([0, 1, 0]);
  const bindMesh = () => {
    cache.bind(0, 'vertex', vertices);
    cache.bind(0, 'uv', uv);
    cache.bind(0, 'index', indices);
  };
  cache.beginFrame();
  bindMesh();
  bindMesh(); // Mask and color passes use identical geometry this frame.
  assert.equal(writes.length, 3);
  vertices[0] = 9; // Cubism changes the values in the same typed array.
  cache.beginFrame();
  bindMesh();
  assert.equal(writes.length, 4);
  assert.deepEqual(gpuData.get(1), [9, 2, 3, 4]);
  assert.deepEqual(gpuData.get(2), [...uv]);
  assert.deepEqual(gpuData.get(3), [...indices]);
  cache.bind(1, 'vertex', new Float32Array([7, 8]));
  assert.equal(gpuData.size, 4);
  cache.release();
  cache.release();
  assert.deepEqual(deleted, [1, 2, 3, 4]);
  cache.bind(0, 'vertex', vertices);
  assert.equal(nextBuffer, 5); // Re-entry cannot reuse deleted GPU resources.
});

test('exclusive Room draws keep the same render target and mesh path without querying shared state', async () => {
  const { drawRoomModel } = await rendering;
  const calls = [];
  const renderer = {
    setRenderState: (...args) => calls.push(['target', ...args]),
    doDrawModel: () => calls.push(['meshes']),
    drawModel: () => calls.push(['save', 'meshes', 'restore'])
  };
  const viewport = [0, 0, 1170, 2532];
  drawRoomModel(renderer, null, viewport, true);
  assert.deepEqual(calls, [['target', null, viewport], ['meshes']]);
  calls.length = 0;
  drawRoomModel(renderer, 'shared-framebuffer', viewport, false);
  assert.deepEqual(calls, [['target', 'shared-framebuffer', viewport], ['save', 'meshes', 'restore']]);
});

test('render subscriptions update before drawing and release on unmount', async () => {
  const { createRoomRenderSubscribers } = await rendering;
  const driver = createRoomRenderSubscribers();
  const calls = [];
  const release = driver.subscribe(now => calls.push(['parameters', now]));
  driver.run(100);
  calls.push(['draw', 100]);
  release();
  driver.run(120);
  assert.deepEqual(calls, [['parameters', 100], ['draw', 100]]);
  driver.subscribe(now => calls.push(now));
  driver.clear();
  driver.run(140);
  assert.equal(calls.length, 2);
});

const behaviorCode = esbuild.buildSync({
  entryPoints: [path.join(root, 'src/frontend/services/room/live2dCubismBehaviorBridge.js')],
  bundle: true, write: false, platform: 'node', format: 'cjs'
}).outputFiles[0].text;

function mountBehavior(runtimeBridge) {
  let nextId = 0;
  const raf = new Map();
  const window = new EventTarget();
  Object.assign(window, {
    TSUKUYOMI_LOCAL_CUBISM_BRIDGE: runtimeBridge,
    requestAnimationFrame: callback => { raf.set(++nextId, callback); return nextId; },
    cancelAnimationFrame: id => raf.delete(id)
  });
  const document = { visibilityState: 'visible' };
  const context = { module: { exports: {} }, window, document, console, performance, CustomEvent, Date, setTimeout, clearTimeout };
  vm.runInNewContext(behaviorCode, context);
  const frames = [];
  const cleanup = context.module.exports.mountCubismBehaviorBridge({
    onFrame: parameters => frames.push(parameters)
  });
  return { cleanup, frames, raf, document };
}

test('behavior uses each actual render, including rapid consecutive renders, without a second RAF', async () => {
  const { createRoomRenderSubscribers } = await rendering;
  const driver = createRoomRenderSubscribers();
  const mounted = mountBehavior({ subscribeBeforeRender: driver.subscribe });
  assert.equal(mounted.raf.size, 0);
  driver.run(1000);
  driver.run(1008);
  assert.equal(mounted.frames.length, 2);
  assert.ok(mounted.frames.every(frame => frame.length > 0 && frame.every(p => Number.isFinite(p.value))));
  mounted.document.visibilityState = 'hidden';
  driver.run(1020);
  assert.equal(mounted.frames.length, 2);
  mounted.document.visibilityState = 'visible';
  driver.run(2000);
  assert.equal(mounted.frames.length, 3);
  mounted.cleanup();
  driver.run(2020);
  assert.equal(mounted.frames.length, 3);
  assert.equal(mounted.raf.size, 0);
});

test('legacy runtimes still receive animation frames and cancel their RAF on unmount', () => {
  const mounted = mountBehavior({});
  assert.equal(mounted.raf.size, 1);
  const [id, callback] = [...mounted.raf][0];
  mounted.raf.delete(id);
  callback(1000);
  assert.equal(mounted.frames.length, 1);
  assert.equal(mounted.raf.size, 1);
  mounted.cleanup();
  assert.equal(mounted.raf.size, 0);
});
