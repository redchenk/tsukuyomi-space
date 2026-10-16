import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { animateCircleReveal } from '../utils/circleReveal';
import { lockPageScroll } from '../utils/pageScrollLock';
import { routeViewKey } from '../utils/routeNavigation';

const isRoom = route => ['room', 'roomShared'].includes(route.name);

export function useRoomEntryTransition({ route, router }) {
  const splash = ref(null);
  const phase = ref('idle');
  const active = computed(() => phase.value !== 'idle');
  let pendingKey;
  let startedAt = 0;
  let revision = 0;
  let animation;
  let deadline;
  let delay;
  let releaseScroll;
  let ready = false;
  let revealing = false;

  function reset() {
    revision++;
    window.clearTimeout(deadline);
    window.clearTimeout(delay);
    animation?.cancel();
    animation = null;
    releaseScroll?.();
    releaseScroll = null;
    pendingKey = null;
    ready = false;
    revealing = false;
    phase.value = 'idle';
  }

  function start(to) {
    const key = routeViewKey(to);
    if (pendingKey === key) return;
    reset();
    pendingKey = key;
    startedAt = performance.now();
    phase.value = 'loading';
    releaseScroll = lockPageScroll(() => false);
    // Slow connections stay covered, with an escape route instead of a trap.
    deadline = window.setTimeout(() => {
      if (phase.value === 'loading') phase.value = 'stalled';
    }, 20000);
    nextTick(() => {
      if (!active.value) return;
      window.dispatchEvent(new CustomEvent('tsukuyomi:entry-ready', { detail: { handoff: true } }));
    });
  }

  async function reveal() {
    if (!active.value || revealing || !isRoom(route)) return;
    revealing = true;
    const run = revision;
    window.clearTimeout(deadline);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    await new Promise(resolve => {
      delay = window.setTimeout(resolve, Math.max(0, (reduced ? 0 : 450) - (performance.now() - startedAt)));
    });
    if (run !== revision) return;
    await nextTick();
    const element = splash.value?.$el;
    if (!element) { reset(); return; }
    const seal = element.querySelector('.boot-splash-seal').getBoundingClientRect();
    phase.value = 'revealing';
    animation = animateCircleReveal(element, { x: seal.left + seal.width / 2, y: seal.top + seal.height / 2 });
    try { await animation.finished; } catch (_) { return; }
    if (run !== revision) return;
    reset();
    await nextTick();
    document.querySelector('.room-page')?.focus({ preventScroll: true });
  }

  function roomReady({ routeKey, error }) {
    if (routeKey !== pendingKey || !isRoom(route) || !active.value) return;
    ready = true;
    window.clearTimeout(deadline);
    if (error) phase.value = 'error';
    else reveal();
  }

  const removeGuard = router.beforeEach((to, from) => {
    if (isRoom(to) && routeViewKey(to) !== routeViewKey(from)) start(to);
    else if (!isRoom(to)) reset();
  });
  const removeAfter = router.afterEach((to, _from, failure) => {
    if (failure && routeViewKey(to) === pendingKey && routeViewKey(route) !== pendingKey) reset();
  });
  const removeError = router.onError((_error, to) => {
    if (routeViewKey(to) === pendingKey) {
      window.clearTimeout(deadline);
      phase.value = 'error';
    }
  });
  watch(() => routeViewKey(route), () => {
    if (isRoom(route)) start(route);
    else reset();
  }, { immediate: true });

  function finish() { animation?.finish(); }
  function visibility() { if (document.hidden) finish(); }
  function restore(event) {
    if (!event.persisted || !active.value) return;
    if (animation) finish();
    else if (ready && phase.value !== 'error') reveal();
  }
  function retry() { window.location.assign(pendingKey || '/room'); }
  function leave() { reset(); router.push('/hub'); }
  window.addEventListener('resize', finish);
  window.addEventListener('pageshow', restore);
  document.addEventListener('visibilitychange', visibility);
  onUnmounted(() => {
    reset();
    removeGuard(); removeAfter(); removeError();
    window.removeEventListener('resize', finish);
    window.removeEventListener('pageshow', restore);
    document.removeEventListener('visibilitychange', visibility);
  });
  return { splash, phase, active, roomReady, reveal, retry, leave };
}
