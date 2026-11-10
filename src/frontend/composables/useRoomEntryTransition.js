import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { animateCircleReveal } from '../utils/circleReveal';
import { playMoonlightEntry } from '../utils/moonlightEntryMotion';
import { lockPageScroll } from '../utils/pageScrollLock';
import { routeViewKey } from '../utils/routeNavigation';

const isRoom = route => ['room', 'roomShared'].includes(route.name);

export function useRoomEntryTransition({ route, router }) {
  const splash = ref(null);
  const phase = ref('idle');
  const cinematic = ref(false);
  const loaded = ref(false);
  const waiting = ref(false);
  const active = computed(() => phase.value !== 'idle');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection;
  const motionAllowed = () => !motion.matches && !connection?.saveData;
  let pendingKey;
  let revision = 0;
  let width;
  let height;
  let film;
  let filmReady;
  let glare;
  let animation;
  let deadline;
  let releaseScroll;
  let revealing = false;

  function stopFilm() {
    film?.dispose();
    film = null;
    cinematic.value = false;
    waiting.value = false;
  }

  function reset() {
    revision++;
    window.clearTimeout(deadline);
    animation?.cancel();
    animation = null;
    glare?.revert();
    glare = null;
    stopFilm();
    releaseScroll?.();
    releaseScroll = null;
    pendingKey = null;
    loaded.value = false;
    revealing = false;
    phase.value = 'idle';
  }

  function start(to) {
    const key = routeViewKey(to);
    if (pendingKey === key) return;
    reset();
    const run = revision;
    pendingKey = key;
    width = window.innerWidth;
    height = window.innerHeight;
    phase.value = 'loading';
    cinematic.value = motionAllowed() && !document.hidden;
    releaseScroll = lockPageScroll(() => false);
    // Slow connections stay covered, with an escape route instead of a trap.
    deadline = window.setTimeout(() => {
      if (phase.value !== 'loading') return;
      stopFilm();
      phase.value = 'stalled';
    }, 20000);
    filmReady = nextTick(async () => {
      if (run !== revision) return;
      window.dispatchEvent(new CustomEvent('tsukuyomi:entry-ready', { detail: { handoff: true } }));
      if (!cinematic.value) return;
      const element = splash.value?.$el;
      try {
        film = playMoonlightEntry(element);
      } catch (_) {
        stopFilm();
        return;
      }
      element.querySelector('.moon-entry-skip')?.focus({ preventScroll: true });
      await film.finished;
      if (run === revision && cinematic.value && !loaded.value) waiting.value = true;
    });
  }

  async function reveal() {
    if (!active.value || revealing || !isRoom(route)) return;
    revealing = true;
    const run = revision;
    window.clearTimeout(deadline);
    await filmReady;
    if (run !== revision) return;
    waiting.value = false;
    await nextTick();
    if (run !== revision) return;
    const element = splash.value?.$el;
    if (!element) { reset(); return; }
    const fullReveal = cinematic.value && !document.hidden;
    phase.value = 'revealing';
    if (fullReveal) glare = film.reveal();
    animation = animateCircleReveal(element, { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      { short: !fullReveal });
    if (document.hidden) animation.finish();
    try { await animation.finished; } catch (_) { return; }
    if (run !== revision) return;
    reset();
    await nextTick();
    document.querySelector('.room-page')?.focus({ preventScroll: true });
  }

  function showError() {
    window.clearTimeout(deadline);
    stopFilm();
    phase.value = 'error';
  }

  function roomReady({ routeKey, error }) {
    if (routeKey !== pendingKey || !isRoom(route) || !active.value) return;
    loaded.value = true;
    if (error) showError();
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
    if (routeViewKey(to) === pendingKey) showError();
  });
  watch(() => routeViewKey(route), () => {
    if (isRoom(route)) start(route);
    else reset();
  }, { immediate: true });

  function skip() {
    if (animation) animation.finish();
    else stopFilm();
  }
  function resize() {
    if (animation || Math.abs(window.innerWidth - width) > 36 || Math.abs(window.innerHeight - height) > 100) skip();
  }
  function visibility() { if (document.hidden) skip(); }
  function preference() { if (!motionAllowed()) skip(); }
  function restore(event) {
    if (!event.persisted || !active.value) return;
    skip();
    if (loaded.value && phase.value !== 'error') reveal();
  }
  function retry() { window.location.assign(pendingKey || '/room'); }
  function leave() { reset(); router.push('/hub'); }
  window.addEventListener('resize', resize);
  window.addEventListener('pageshow', restore);
  document.addEventListener('visibilitychange', visibility);
  motion.addEventListener('change', preference);
  connection?.addEventListener?.('change', preference);
  onUnmounted(() => {
    reset();
    removeGuard(); removeAfter(); removeError();
    window.removeEventListener('resize', resize);
    window.removeEventListener('pageshow', restore);
    document.removeEventListener('visibilitychange', visibility);
    motion.removeEventListener('change', preference);
    connection?.removeEventListener?.('change', preference);
  });
  return { splash, phase, active, cinematic, loaded, waiting, roomReady, reveal, retry, leave, skip };
}
