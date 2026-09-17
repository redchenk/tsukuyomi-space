// Only Vue routes participate. APIs, downloads, OAuth and the separate Agent OS
// application retain normal browser navigation.
export function internalRoutePath(anchor, router, baseUrl) {
  if (!anchor || anchor.hasAttribute('download') || anchor.hasAttribute('data-native-navigation')) return null;
  const target = anchor.getAttribute('target');
  if (target && target.toLowerCase() !== '_self') return null;
  if (anchor.getAttribute('rel')?.split(/\s+/).includes('external')) return null;
  const href = anchor.getAttribute('href');
  if (!href || href === '#') return null;
  try {
    const url = new URL(href, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== new URL(baseUrl).origin) return null;
    const path = url.pathname + url.search + url.hash;
    return router.resolve(path).matched.length ? path : null;
  } catch (_) {
    return null;
  }
}

export function installRouteLinks({ router, navigate, prefetch, root = document }) {
  const anchorFor = event => event.target?.closest?.('a[href]');
  const pathFor = event => internalRoutePath(anchorFor(event), router, window.location.href);
  const modified = event => event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0;
  function preserveBrowserAction(event) {
    // Let Cmd/Ctrl-click reach the browser without existing @click.prevent handlers.
    if (modified(event) && pathFor(event)) event.stopPropagation();
  }
  function onClick(event) {
    if (event.defaultPrevented || modified(event)) return;
    const path = pathFor(event);
    if (!path) return;
    event.preventDefault();
    navigate(path);
  }
  function onIntent(event) {
    const path = pathFor(event);
    if (!path || path.startsWith(window.location.pathname + window.location.search + '#')) return;
    prefetch(path);
  }
  root.addEventListener('click', preserveBrowserAction, true);
  root.addEventListener('click', onClick);
  root.addEventListener('pointerover', onIntent, { passive: true });
  root.addEventListener('focusin', onIntent);
  return () => {
    root.removeEventListener('click', preserveBrowserAction, true);
    root.removeEventListener('click', onClick);
    root.removeEventListener('pointerover', onIntent);
    root.removeEventListener('focusin', onIntent);
  };
}

export function routeViewKey(route) {
  // Wiki owns section queries. Anchor jumps retain the reader and unsaved forms.
  if (route.name === 'wiki') return route.path;
  return route.fullPath.split('#')[0];
}

let pendingScroll;
export function cancelPendingRouteScroll() {
  pendingScroll?.abort();
  pendingScroll = null;
}

function hashTarget(hash) {
  if (!hash) return null;
  try { return document.getElementById(decodeURIComponent(hash.slice(1))); }
  catch (_) { return null; }
}

export function scrollToRoute(to, from, savedPosition) {
  cancelPendingRouteScroll();
  if (!savedPosition && !to.hash && to.path === from.path) return false;
  const controller = new AbortController();
  pendingScroll = controller;
  const key = routeViewKey(to);
  return new Promise(resolve => {
    let settled = false;
    let frame = 0;
    let timeout;
    const observer = new MutationObserver(schedule);
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    function finish(position) {
      if (settled) return;
      settled = true;
      observer.disconnect();
      resize?.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) window.removeEventListener(type, cancel);
      controller.signal.removeEventListener('abort', cancel);
      if (pendingScroll === controller) pendingScroll = null;
      resolve(position);
    }
    function cancel() { finish(false); }
    function check(expired = false) {
      if (settled) return;
      const view = document.querySelector('.route-view-frame[data-route-key]');
      if (!view || view.dataset.routeKey !== key) {
        if (expired) finish(false);
        return;
      }
      if ((savedPosition || to.hash) && !expired && view.querySelector('.ts-skeleton, [aria-busy="true"]')) return;
      if (savedPosition) {
        const maxTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        if (!expired && maxTop + 1 < savedPosition.top) return;
        finish({ ...savedPosition, behavior: 'instant' });
      } else if (to.hash) {
        const el = hashTarget(to.hash);
        if (!el && !expired) return;
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        finish(el ? { el, top: Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 100,
          behavior: to.path === from.path && !reduced ? 'smooth' : 'instant' } : { top: 0, behavior: 'instant' });
      } else finish({ top: 0, left: 0, behavior: 'instant' });
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => check());
    }
    controller.signal.addEventListener('abort', cancel, { once: true });
    for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) window.addEventListener(type, cancel, { passive: true });
    observer.observe(document.querySelector('.route-stage') || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-route-key', 'aria-busy', 'class'] });
    resize?.observe(document.documentElement);
    // Out-in transitions and article/list requests can finish after router nextTick.
    timeout = setTimeout(() => check(true), 5000);
    check();
  });
}
