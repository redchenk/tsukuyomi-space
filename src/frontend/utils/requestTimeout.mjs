// AbortSignal.timeout/any are newer than our supported browser floor. Keep the
// deadline alive through response consumption and release it on every exit.
export function requestAbortScope({ signal, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  let timer, listening = false;
  const dispose = () => {
    clearTimeout(timer);
    if (listening) { signal.removeEventListener('abort', cancel); listening = false; }
  };
  const cancel = () => { controller.abort(signal.reason); dispose(); };
  if (signal?.aborted) cancel();
  else {
    if (signal) { signal.addEventListener('abort', cancel, { once: true }); listening = true; }
    timer = setTimeout(() => {
      controller.abort(new DOMException('The request timed out.', 'TimeoutError'));
      dispose();
    }, timeoutMs);
  }
  return { signal: controller.signal, dispose };
}
export async function withRequestTimeout(task, options) {
  const scope = requestAbortScope(options);
  try { return await task(scope.signal); }
  finally { scope.dispose(); }
}
