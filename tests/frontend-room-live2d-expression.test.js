const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const code = esbuild.buildSync({
  stdin: {
    contents: `
      export { dispatchRoomLive2DExpression } from './src/frontend/services/room/live2dControl.js';
      export { mountCubismBehaviorBridge } from './src/frontend/services/room/live2dCubismBehaviorBridge.js';
    `,
    resolveDir: root,
    loader: 'js'
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs'
}).outputFiles[0].text;

test('reply expression remains visible with TTS on and leaves speech motion to playback', () => {
  const window = new EventTarget();
  const events = { face: [], act: [], mouth: [], speak: [] };
  let render;
  window.TSUKUYOMI_LOCAL_CUBISM_BRIDGE = {
    subscribeBeforeRender(callback) {
      render = callback;
      return () => { render = null; };
    }
  };
  window.addEventListener('tsukuyomi:live2d-character-state', event => events.face.push(event.detail));
  window.addEventListener('tsukuyomi:room-act', event => events.act.push(event.detail));
  window.addEventListener('tsukuyomi:live2d-mouth', event => events.mouth.push(event.detail));
  window.addEventListener('tsukuyomi:live2d-speak', event => events.speak.push(event.detail));
  const context = {
    module: { exports: {} },
    window, document: { visibilityState: 'visible' },
    CustomEvent, performance, Date, console, setTimeout, clearTimeout
  };
  vm.runInNewContext(code, context);
  const { dispatchRoomLive2DExpression, mountCubismBehaviorBridge } = context.module.exports;
  const frames = [];
  const cleanup = mountCubismBehaviorBridge({
    onFrame() {},
    onPerformanceFrame: frame => frames.push(frame)
  });

  const expression = dispatchRoomLive2DExpression({
    emotion: 'happy',
    expression: 'closed_smile',
    behaviorActions: [{ type: 'bounce', durationMs: 2000 }],
    durationMs: 5000
  });
  assert.equal(expression, 'closed_smile');
  assert.equal(events.face.length, 1);
  assert.equal(events.face[0].expressionOnly, true);
  assert.equal(events.act.length, 0);
  assert.equal(events.mouth.length, 0);
  assert.equal(events.speak.length, 0);

  render(performance.now() + 60);
  const replyFrame = frames.at(-1);
  assert.equal(replyFrame.expression, 'closed_smile');
  assert.equal(replyFrame.character.mode, 'idle');
  assert.equal(replyFrame.character.speakingBlend, 0);
  assert.equal(replyFrame.behaviorPlan, null);

  window.dispatchEvent(new CustomEvent('tsukuyomi:room-act', {
    detail: {
      source: 'streaming-speech',
      expression: 'smile',
      emotion: 'happy',
      behaviorActions: [{ type: 'sway', durationMs: 1400, intensity: 0.6 }],
      durationMs: 1400
    }
  }));
  window.dispatchEvent(new CustomEvent('tsukuyomi:live2d-character-state', {
    detail: { mode: 'speaking', emotion: 'happy', holdMs: 2000 }
  }));
  window.dispatchEvent(new CustomEvent('tsukuyomi:live2d-character-state', { detail: events.face[0] }));
  render(performance.now() + 120);
  const speakingFrame = frames.at(-1);
  assert.equal(speakingFrame.expression, 'smile');
  assert.equal(speakingFrame.character.mode, 'speaking');
  assert.ok(speakingFrame.behaviorPlan);
  cleanup();
});
