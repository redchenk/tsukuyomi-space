import Lenis from 'lenis';
import { isReducedPerformance, PERFORMANCE_PROFILE_EVENT } from './performance';

// One document scroller. Nested readers, editors and interactive surfaces keep
// their native wheel/touch behavior and their existing scroll-position owners.
const NATIVE_SURFACE = 'textarea, select, [contenteditable="true"], [data-lenis-prevent], .room-chat-messages, .pixel-canvas, .arena-canvas-viewport, .game-stage, .live2d-stage, .cm-editor, .monaco-editor';

export function installSmoothScroll(router) {
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let lenis;
  let disposed = false;
  let frame = 0;

  function stopFrame() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function advanceScroll(time) {
    frame = 0;
    lenis?.raf(time);
    if (lenis?.isScrolling === 'smooth') frame = requestAnimationFrame(advanceScroll);
  }

  function wake({ event, deltaY }) {
    if (!lenis || lenis.isStopped || event.type !== 'wheel') return;
    // A reversed gesture must not spend its first frames paying off the old
    // target. Rebase at the visible position before Lenis adds this wheel delta.
    if (lenis.isScrolling === 'smooth' && deltaY * (lenis.targetScroll - lenis.actualScroll) < 0) settle();
    if (frame) return;
    // Prime the clock while idle, before onVirtualScroll starts the animation.
    // Otherwise the first frame after a pause includes the entire idle period.
    lenis.raf(performance.now());
    frame = requestAnimationFrame(advanceScroll);
  }

  function suspend() {
    stopFrame();
    lenis?.destroy();
    lenis = undefined;
    root.dataset.scrollEngine = 'native';
  }

  function settle() {
    stopFrame();
    if (lenis?.isScrolling === 'smooth') {
      lenis.scrollTo(lenis.actualScroll, { immediate: true, force: true });
    }
  }

  function syncLock() {
    if (!lenis) return;
    const body = getComputedStyle(document.body);
    const locked = root.style.overflow === 'hidden' || root.style.overflowY === 'hidden'
      || body.overflowY === 'hidden' || body.position === 'fixed'
      || document.getElementById('app')?.hasAttribute('inert');
    if (locked) { stopFrame(); lenis.stop(); }
    else lenis.start();
  }

  function sync() {
    if (disposed) return;
    const enabled = !reduced.matches && !isReducedPerformance() && document.visibilityState !== 'hidden';
    if (!enabled) {
      suspend();
      return;
    }
    if (!lenis) {
      lenis = new Lenis({
        autoRaf: false, lerp: 0.18, smoothWheel: true,
        syncTouch: false, allowNestedScroll: true, anchors: false,
        prevent: node => node.matches?.(NATIVE_SURFACE),
        virtualScroll: ({ event, deltaX, deltaY }) => !event.ctrlKey && !event.shiftKey && Math.abs(deltaY) >= Math.abs(deltaX)
      });
      lenis.on('virtual-scroll', wake);
    }
    root.dataset.scrollEngine = 'lenis';
    syncLock();
  }

  const locks = new MutationObserver(syncLock);
  locks.observe(root, { attributes: true, attributeFilter: ['style'] });
  locks.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
  const app = document.getElementById('app');
  if (app) locks.observe(app, { attributes: true, attributeFilter: ['inert'] });
  // Cancel wheel inertia before the router restores a saved position or an
  // article control starts its own short/long jump. Never override scrollTo.
  const removeGuard = router.beforeEach(() => { settle(); });
  window.addEventListener('pointerdown', settle, { capture: true, passive: true });
  window.addEventListener('keydown', settle, true);
  window.addEventListener('pageshow', sync);
  window.addEventListener('pagehide', suspend);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener(PERFORMANCE_PROFILE_EVENT, sync);
  reduced.addEventListener('change', sync);
  sync();

  return () => {
    disposed = true;
    stopFrame();
    locks.disconnect();
    removeGuard();
    lenis?.destroy();
    delete root.dataset.scrollEngine;
    window.removeEventListener('pointerdown', settle, true);
    window.removeEventListener('keydown', settle, true);
    window.removeEventListener('pageshow', sync);
    window.removeEventListener('pagehide', suspend);
    document.removeEventListener('visibilitychange', sync);
    window.removeEventListener(PERFORMANCE_PROFILE_EVENT, sync);
    reduced.removeEventListener('change', sync);
  };
}
