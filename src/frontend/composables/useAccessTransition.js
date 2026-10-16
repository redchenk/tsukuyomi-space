import { nextTick, onUnmounted, ref, watch } from 'vue';
import { loadHubPage } from '../router';
import { lockPageScroll } from '../utils/pageScrollLock';

// The hole is cut out of the original entry page. The one, live RouterView
// underneath keeps its DOM, requests and state when the reveal finishes.
function portalPath(width, height, x, y, radius) {
  return `path(evenodd, "M0 0H${width}V${height}H0Z M${x - radius} ${y}a${radius} ${radius} 0 1 0 ${radius * 2} 0a${radius} ${radius} 0 1 0 ${-radius * 2} 0Z")`;
}

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
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const x = Math.max(0, Math.min(width, origin.x));
      const y = Math.max(0, Math.min(height, origin.y));
      const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) + 2;
      phase.value = 'revealing';
      const from = portalPath(width, height, x, y, 0.1);
      const to = portalPath(width, height, x, y, radius);
      // Reduced motion and browsers without path clipping get a short fade.
      const circular = !reduced && CSS.supports('clip-path', from);
      animation = element.animate(circular
        ? [{ clipPath: from }, { clipPath: to }]
        : [{ opacity: 1 }, { opacity: 0 }], {
        duration: circular ? 1150 : 140,
        easing: circular ? 'cubic-bezier(.64, 0, .2, 1)' : 'ease-out',
        fill: 'forwards'
      });
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
