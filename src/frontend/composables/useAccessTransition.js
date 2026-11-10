import { nextTick, onUnmounted, ref, watch } from 'vue';
import { loadHubPage } from '../router';
import { lockPageScroll } from '../utils/pageScrollLock';
import { animateCircleReveal } from '../utils/circleReveal';
import { playWaterMirrorEntry } from '../utils/waterMirrorEntryMotion';

const INTRO_SEEN_KEY = 'tsukuyomi_moonlight_intro_seen';

function waitForResource(resource, duration, signal, optional = false) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => finish(optional ? resolve : reject, new Error('Entry timed out')), duration);
    const abort = () => finish(reject, signal.reason);
    function finish(settle, result) {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      settle(result);
    }
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    resource.then(value => finish(resolve, value), error => finish(optional ? resolve : reject, error));
  });
}

export function useAccessTransition({ route, router, onEntered, onEntrySound }) {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionAllowed = () => !motion.matches && !navigator.connection?.saveData;
  let seen = false;
  try { seen = window.sessionStorage.getItem(INTRO_SEEN_KEY) === '1'; } catch (_) {}
  const gate = ref(null);
  const phase = ref('idle');
  const cinematic = ref(false);
  const failed = ref(false);
  const waiting = ref(false);
  const progress = ref(0);
  let current = null;

  function reset() {
    const run = current;
    current = null;
    run?.controller.abort();
    run?.reveal?.cancel();
    run?.film?.dispose();
    run?.releaseScroll?.();
    cinematic.value = false;
    waiting.value = false;
    progress.value = 0;
    phase.value = 'idle';
  }

  async function prepareHub(run) {
    const { signal } = run.controller;
    await waitForResource(loadHubPage(), 12000, signal);
    if (current !== run) return;
    progress.value = 55;
    const failure = await router.push('/hub');
    if (failure) throw failure;
    await nextTick();
    if (current !== run || route.name !== 'hub') return;
    progress.value = 77;
    const artwork = document.querySelector('.hub img[fetchpriority="high"]');
    if (artwork?.decode) await waitForResource(artwork.decode(), 900, signal, true);
    if (current === run) {
      progress.value = 100;
      waiting.value = false;
    }
  }

  async function start(origin) {
    const run = {
      controller: new AbortController(),
      width: window.innerWidth,
      height: window.innerHeight,
      skipped: document.hidden,
      releaseScroll: lockPageScroll(() => route.name === 'access')
    };
    current = run;
    phase.value = 'loading';
    cinematic.value = motionAllowed() && !run.skipped;
    failed.value = false;
    progress.value = 0;

    try {
      // Start native video playback inside the original interaction.
      if (cinematic.value) run.film = playWaterMirrorEntry(gate.value);
      await nextTick();
      if (current !== run) return;
      if (cinematic.value) {
        seen = true;
        try { window.sessionStorage.setItem(INTRO_SEEN_KEY, '1'); } catch (_) {}
        gate.value.querySelector('.moon-entry-skip')?.focus({ preventScroll: true });
      }
      const prelude = run.film?.finished.then(completed => {
        if (current === run && progress.value < 100) waiting.value = true;
        return completed;
      });
      const [, filmCompleted] = await Promise.all([prepareHub(run), prelude]);
      if (current !== run || route.name !== 'hub') return;

      const fullReveal = cinematic.value && filmCompleted !== false && !run.skipped && !document.hidden;
      phase.value = 'revealing';
      const center = fullReveal || !origin ? { x: window.innerWidth / 2, y: window.innerHeight / 2 } : origin;
      run.reveal = animateCircleReveal(gate.value, center, { short: !fullReveal, mist: true });
      if (document.hidden) run.reveal.finish();
      await run.reveal.finished;
      if (current !== run) return;
      reset();
      await nextTick();
      onEntered();
    } catch (_) {
      if (current !== run) return;
      reset();
      if (route.name === 'hub') onEntered();
      else failed.value = true;
    }
  }

  function enter(origin) {
    if (phase.value !== 'idle' || route.name !== 'access') return;
    if (failed.value) {
      // A failed dynamic import is cached by the browser for this document.
      phase.value = 'loading';
      window.location.reload();
      return;
    }
    if (origin?.sound && !seen && motionAllowed() && !document.hidden) onEntrySound?.();
    void start(origin);
  }

  function skip() {
    if (!current) return;
    current.skipped = true;
    current.film?.stop();
    current.reveal?.finish();
  }

  function restore(event) {
    if (!event.persisted) return;
    const wasActive = phase.value !== 'idle';
    reset();
    failed.value = false;
    if (wasActive && route.name === 'hub') onEntered();
  }

  function onResize() {
    if (current && (current.reveal || Math.abs(window.innerWidth - current.width) > 36
      || Math.abs(window.innerHeight - current.height) > 100)) skip();
  }
  function onHidden() { if (document.hidden) skip(); }
  function onMotionPreference() { if (!motionAllowed()) skip(); }
  function onKey(event) {
    if (event.key !== 'Escape' || !current) return;
    event.preventDefault();
    skip();
  }

  watch(() => route.fullPath, () => {
    if (route.name !== 'hub') reset();
    failed.value = false;
  });
  window.addEventListener('pageshow', restore);
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onHidden);
  motion.addEventListener('change', onMotionPreference);
  onUnmounted(() => {
    reset();
    window.removeEventListener('pageshow', restore);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onHidden);
    motion.removeEventListener('change', onMotionPreference);
  });
  return { gate, phase, cinematic, failed, progress, waiting, enter, skip };
}
