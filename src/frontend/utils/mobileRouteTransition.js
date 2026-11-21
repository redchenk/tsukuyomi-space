import { nextTick } from 'vue';
import { isReducedPerformance } from './performance';

const immersive = new Set(['access', 'accessAlias', 'room', 'roomShared', 'live2d', 'pixel', 'game', 'gomoku', 'kaguyaRun', 'drift']);
const article = route => ['article', 'articleDetail'].includes(String(route.name));
const depth = route => article(route) || route.name === 'editor' ? 2 : 1;

// beforeResolve also covers RouterLink, native Back and navigation from search.
// Never wait for data or images indefinitely, or interfere with cinematic routes.
export function installMobileRouteTransitions(router) {
  let current;
  let position = window.history.state?.position || 0;
  function settle() { current?.release(); }
  router.beforeResolve((to, from) => {
    settle();
    if (!from.name || from.path === to.path || immersive.has(String(to.name)) || immersive.has(String(from.name))
      || !matchMedia('(max-width: 860px)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches
      || isReducedPerformance() || document.hidden || typeof document.startViewTransition !== 'function') return;

    const root = document.documentElement;
    const back = depth(to) < depth(from) || (window.history.state?.position || 0) < position;
    root.dataset.navDir = back ? 'back' : 'forward';
    root.dataset.routeTransition = 'active';
    const marked = [];
    function markCover(id) {
      if (!id) return;
      const node = document.querySelector(`.journal-row[data-article-id="${CSS.escape(String(id))}"] .journal-cover img`);
      if (node) { node.style.viewTransitionName = 'article-cover'; marked.push(node); }
    }
    if (article(to)) markCover(to.params.id);
    let continueNavigation, finishNavigation;
    const navigationReady = new Promise(resolve => { finishNavigation = resolve; });
    const ready = new Promise(resolve => { continueNavigation = resolve; });
    const run = { release: () => { continueNavigation(); finishNavigation(); } };
    current = run;
    const safety = setTimeout(() => run.release(), 1000);
    const cleanup = () => {
      clearTimeout(safety);
      marked.forEach(node => { node.style.viewTransitionName = ''; });
      if (current === run) { current = null; delete root.dataset.routeTransition; }
    };
    try {
      const transition = document.startViewTransition(async () => {
        continueNavigation();
        await navigationReady;
        await nextTick();
        if (article(from)) markCover(from.params.id);
        if (article(to) && !document.querySelector('.article-cover')) {
          await new Promise(resolve => {
            const finish = () => { observer.disconnect(); clearTimeout(timer); resolve(); };
            const observer = new MutationObserver(() => { if (document.querySelector('.article-cover')) finish(); });
            const timer = setTimeout(finish, 220);
            observer.observe(document.getElementById('app'), { childList: true, subtree: true });
          });
        }
      });
      transition.finished.then(cleanup, cleanup);
      transition.ready.catch(() => run.release());
    } catch (_) { run.release(); cleanup(); }
    return ready;
  });
  router.afterEach(() => { position = window.history.state?.position || 0; settle(); });
  router.onError(settle);
}
