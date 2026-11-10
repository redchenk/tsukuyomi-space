import { nextTick, onUnmounted, ref, watch } from 'vue';
import { loadHubPage } from '../router';
import { lockPageScroll } from '../utils/pageScrollLock';
import { animateCircleReveal } from '../utils/circleReveal';
import { playMoonlightEntry } from '../utils/moonlightEntryMotion';
import { playWaterMirrorEntry } from '../utils/waterMirrorEntryMotion';

const INTRO_SEEN_KEY = 'tsukuyomi_moonlight_intro_seen';

function handoffBootSplash() {
  window.dispatchEvent(new CustomEvent('tsukuyomi:entry-ready', { detail: { handoff: true } }));
}

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
  let directPending = /^\/hub\/?$/.test(window.location.pathname);
  const directIntro = directPending && !seen && motionAllowed();
  const gate = ref(null);
  const phase = ref(directIntro ? 'loading' : 'idle');
  const cinematic = ref(directIntro);
  const fromAccess = ref(false);
  const failed = ref(false);
  const waiting = ref(false);
  const progress = ref(0);
  let current = null;

  function reset() {
    const run = current;
    current = null;
    run?.controller.abort();
    run?.musicShell?.classList.remove('moonlight-arriving', 'water-mirror-arriving');
    run?.glare?.revert();
    run?.reveal?.cancel();
    run?.film?.dispose();
    run?.releaseScroll?.();
    cinematic.value = false;
    fromAccess.value = false;
    waiting.value = false;
    progress.value = 0;
    phase.value = 'idle';
  }

  async function prepareHub(run, clicked) {
    const { signal } = run.controller;
    if (clicked) {
      await waitForResource(loadHubPage(), 12000, signal);
      if (current !== run) return;
      progress.value = 55;
      const failure = await router.push('/hub');
      if (failure) throw failure;
    }
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

  async function start(clicked, origin) {
    const run = {
      controller: new AbortController(),
      width: window.innerWidth,
      height: window.innerHeight,
      skipped: document.hidden,
      releaseScroll: lockPageScroll(() => route.name === 'access')
    };
    current = run;
    phase.value = 'loading';
    fromAccess.value = clicked;
    cinematic.value = motionAllowed() && !run.skipped;
    failed.value = false;
    progress.value = clicked ? 0 : 55;

    try {
      // Start native video playback inside the original interaction.
      if (clicked && cinematic.value) run.film = playWaterMirrorEntry(gate.value);
      await nextTick();
      if (current !== run) return;
      if (!clicked) handoffBootSplash();
      if (cinematic.value) {
        if (!clicked) run.film = playMoonlightEntry(gate.value);
        seen = true;
        try { window.sessionStorage.setItem(INTRO_SEEN_KEY, '1'); } catch (_) {}
        gate.value.querySelector('.moon-entry-skip')?.focus({ preventScroll: true });
      }
      const prelude = run.film?.finished.then(completed => {
        if (current === run && progress.value < 100) waiting.value = true;
        return completed;
      });
      const [, filmCompleted] = await Promise.all([prepareHub(run, clicked), prelude]);
      if (current !== run || route.name !== 'hub') return;

      const fullReveal = cinematic.value && filmCompleted !== false && !run.skipped && !document.hidden;
      phase.value = 'revealing';
      if (fullReveal) {
        run.glare = run.film.reveal?.();
        run.musicShell = document.querySelector('.entry-destination-preparing');
        run.musicShell?.classList.add('moonlight-arriving');
        if (clicked) run.musicShell?.classList.add('water-mirror-arriving');
      }
      const center = fullReveal || !origin ? { x: window.innerWidth / 2, y: window.innerHeight / 2 } : origin;
      run.reveal = animateCircleReveal(gate.value, center, { short: !fullReveal, mist: clicked });
      if (document.hidden) run.reveal.finish();
      await run.reveal.finished;
      if (current !== run) return;
      reset();
      await nextTick();
      onEntered(clicked);
    } catch (_) {
      if (current !== run) return;
      reset();
      if (route.name === 'hub') onEntered(clicked);
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
    void start(true, origin);
  }

  function startDirect() {
    if (!directPending) return false;
    directPending = false;
    if (route.name === 'hub' && seen) {
      handoffBootSplash();
      return true;
    }
    if (route.name !== 'hub' || !motionAllowed() || document.hidden) {
      reset();
      return false;
    }
    void start(false);
    return true;
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
    const clicked = fromAccess.value;
    directPending = false;
    reset();
    failed.value = false;
    if (wasActive && route.name === 'hub') onEntered(clicked);
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
  return { gate, phase, cinematic, fromAccess, failed, progress, waiting, enter, startDirect, skip };
}
