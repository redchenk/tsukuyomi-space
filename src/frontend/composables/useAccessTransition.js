import { nextTick, onUnmounted, ref, watch } from 'vue';
import { loadHubPage } from '../router';
import { lockPageScroll } from '../utils/pageScrollLock';
import { animateCircleReveal } from '../utils/circleReveal';

export function useAccessTransition({ route, router, onEntered }) {
  const gate = ref(null);
  const phase = ref('idle');
  const failed = ref(false);
  let revision = 0;
  let animation;
  let deadline;
  let releaseScroll;

  function reset() {
    revision++;
    window.clearTimeout(deadline);
    animation?.cancel();
    animation = null;
    releaseScroll?.();
    releaseScroll = null;
    phase.value = 'idle';
  }

  async function enter(origin) {
    if (phase.value !== 'idle' || route.name !== 'access') return;
    if (failed.value) {
      // Browsers retain a failed dynamic import in the module map. A deliberate
      // retry uses a fresh document so it can actually recover after reconnecting.
      phase.value = 'loading';
      window.location.reload();
      return;
    }
    const run = ++revision;
    phase.value = 'loading';
    failed.value = false;
    releaseScroll = lockPageScroll(() => route.name === 'access');
    try {
      // Wait for real route resources, with a retryable deadline. A late chunk
      // may warm the cache but must never navigate after cancellation.
      await Promise.race([
        loadHubPage(),
        new Promise((_, reject) => { deadline = window.setTimeout(() => reject(new Error('Entry timed out')), 12000); })
      ]);
      if (run !== revision) return;
      window.clearTimeout(deadline);
      const failure = await router.push('/hub');
      if (failure) throw failure;
      await nextTick();
      if (run !== revision || route.name !== 'hub') return;
      const artwork = document.querySelector('.hub img[fetchpriority="high"]');
      if (artwork?.decode) {
        // Give the visible artwork a bounded head start. Live data continues
        // updating underneath; a slow or failed image cannot hold the entrance.
        await Promise.race([
          artwork.decode().catch(() => {}),
          new Promise(resolve => { deadline = window.setTimeout(resolve, 900); })
        ]);
        if (run !== revision) return;
        window.clearTimeout(deadline);
      }
      if (run !== revision || route.name !== 'hub') return;
      const element = gate.value;
      phase.value = 'revealing';
      animation = animateCircleReveal(element, origin);
      await animation.finished;
      if (run !== revision) return;
      reset();
      await nextTick();
      onEntered();
    } catch (_) {
      if (run !== revision) return;
      reset();
      if (route.name === 'hub') onEntered();
      else failed.value = true;
    }
  }

  function restore(event) {
    if (!event.persisted) return;
    reset();
    failed.value = false;
    if (route.name === 'hub') onEntered();
  }
  function finishOnResize() { animation?.finish(); }
  function finishWhenHidden() { if (document.hidden) animation?.finish(); }
  watch(() => route.fullPath, () => {
    if (route.name !== 'hub') reset();
    failed.value = false;
  });
  window.addEventListener('pageshow', restore);
  window.addEventListener('resize', finishOnResize);
  document.addEventListener('visibilitychange', finishWhenHidden);
  onUnmounted(() => {
    reset();
    window.removeEventListener('pageshow', restore);
    window.removeEventListener('resize', finishOnResize);
    document.removeEventListener('visibilitychange', finishWhenHidden);
  });
  return { gate, phase, failed, enter };
}
