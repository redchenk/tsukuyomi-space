const CACHED_PAGES = new Set(['hub', 'stage', 'plaza', 'gallery']);
export const ROUTE_CACHE_LIMIT = 4;

export function shouldCacheRoute(route) {
  return CACHED_PAGES.has(route.name);
}

// Only track visits made in this document. Never guess an external history entry
// or persist callback URLs, credentials or account data in browser storage.
export function createRouteHistory(router, { limit = 32 } = {}) {
  const entries = new Map();
  let cursor = null;
  let popNavigation = false;
  let pendingReturn = null;
  const position = () => router.options.history.state?.position;

  function identity(path) {
    const route = router.resolve(path);
    const params = new URLSearchParams();
    for (const key of Object.keys(route.query || {}).sort()) {
      const values = [].concat(route.query[key]);
      for (const value of values) {
        if (route.name === 'stage' && ((key === 'sort' && value === 'latest') || (key === 'page' && value === '1'))) continue;
        params.append(key, value ?? '');
      }
    }
    return `${route.path}?${params}#${route.hash || ''}`;
  }

  function remember(route) {
    const next = position();
    if (!Number.isInteger(next) || !route.fullPath) return;
    if (!popNavigation && cursor !== null && next > cursor) {
      for (const key of entries.keys()) if (key >= next) entries.delete(key);
    }
    cursor = next;
    const sensitive = /^fushi-/.test(String(route.name))
      || Object.keys(route.query || {}).some(key => /^(?:code|state|token|password|secret|key)$/i.test(key));
    if (sensitive) entries.delete(next);
    else entries.set(next, route.fullPath);
    while (entries.size > limit) entries.delete(entries.keys().next().value);
  }

  function beforeNavigation(to) {
    const next = position();
    popNavigation = cursor !== null && Number.isInteger(next) && next !== cursor;
    return popNavigation || Boolean(pendingReturn && identity(to.fullPath) === pendingReturn.identity);
  }

  function afterNavigation(to, failure) {
    if (!failure) remember(to);
    pendingReturn = null;
    popNavigation = false;
  }

  function goToEntry(target, path) {
    if (pendingReturn) return;
    pendingReturn = { position: target, identity: identity(path) };
    router.go(target - position());
  }

  function returnTo(path) {
    if (pendingReturn) return;
    const current = position();
    const targetIdentity = identity(path);
    if (entries.has(current) && identity(entries.get(current)) === targetIdentity) return;
    const candidate = [...entries].filter(([index, value]) => index < current && identity(value) === targetIdentity)
      .sort(([left], [right]) => right - left)[0];
    if (candidate) goToEntry(candidate[0], candidate[1]);
    else return router.push(path);
  }

  function back(fallback = '/hub') {
    if (pendingReturn) return;
    const current = position();
    const previous = entries.get(current - 1);
    if (previous && previous === router.options.history.state?.back) goToEntry(current - 1, previous);
    else return router.push(fallback);
  }

  function cancel() { pendingReturn = null; }
  return { remember, beforeNavigation, afterNavigation, returnTo, back, cancel };
}
