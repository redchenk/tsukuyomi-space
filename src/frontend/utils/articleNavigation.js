/** Navigate within an article without scrolling through (and downloading) every
 * lazy image on the way. Follow late layout changes only during this explicit
 * navigation; any reader interaction or navigation cancels the adjustment. */
export function createArticleNavigation(getReader) {
  let cleanup;
  const interactions = ['wheel', 'touchstart', 'pointerdown', 'keydown'];

  function cancel() {
    cleanup?.();
    cleanup = undefined;
  }

  function jump(target, { block = 'start', behavior, focus = true } = {}) {
    cancel();
    if (!target?.isConnected) return;
    if (focus) target.focus({ preventScroll: true });

    function destination() {
      const box = target.getBoundingClientRect();
      const style = getComputedStyle(target);
      const marginTop = Number.parseFloat(style.scrollMarginTop) || 0;
      const marginBottom = Number.parseFloat(style.scrollMarginBottom) || 0;
      const top = target.id === 'article-top' ? 0 : window.scrollY + box.top + (block === 'center'
        ? (box.height + marginBottom - marginTop - window.innerHeight) / 2
        : -marginTop);
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      return Math.min(max, Math.max(0, top));
    }

    let requestedTop = destination();
    const longJump = Math.abs(requestedTop - window.scrollY) > window.innerHeight * 3;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: requestedTop, behavior: longJump || reducedMotion ? 'instant' : (behavior || 'smooth') });

    let frame = 0;
    let active = true;
    const reader = getReader();
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    const timer = setTimeout(cancel, 5000);
    function schedule() {
      if (!active || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!target.isConnected) return cancel();
        const top = destination();
        // An unchanged destination leaves a short native animation intact.
        if (Math.abs(top - requestedTop) > 1) {
          requestedTop = top;
          window.scrollTo({ top, behavior: 'instant' });
        }
      });
    }
    cleanup = () => {
      active = false;
      resize?.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      for (const type of interactions) window.removeEventListener(type, cancel, true);
      window.removeEventListener('resize', schedule);
    };
    for (const type of interactions) window.addEventListener(type, cancel, { passive: true, capture: true });
    window.addEventListener('resize', schedule, { passive: true });
    if (reader) resize?.observe(reader);
  }

  return { jump, cancel };
}
