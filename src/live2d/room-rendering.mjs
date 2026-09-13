// Room owns its WebGL context. Shared-context callers retain the SDK's state
// save/restore path; only the standalone Room canvas skips synchronous queries.
export function drawRoomModel(renderer, frameBuffer, viewport, exclusiveContext) {
  renderer.setRenderState(frameBuffer, viewport);
  if (exclusiveContext) renderer.doDrawModel();
  else renderer.drawModel();
}

export function createRoomRenderSubscribers() {
  const subscribers = new Set();
  const failed = new WeakSet();
  return {
    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    run(now) {
      for (const callback of subscribers) {
        try {
          callback(now);
          failed.delete(callback);
        } catch (error) {
          // A peripheral behavior error must not stop the model's render loop.
          if (!failed.has(callback)) console.error('Room animation update failed', error);
          failed.add(callback);
        }
      }
    },
    clear() {
      subscribers.clear();
    }
  };
}
