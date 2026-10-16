// A small independent entry point paints before the Vue/router bundle is ready.
const splash = document.getElementById('boot-splash');
const startedAt = performance.now();
let dismissed = false;
let timer;
let watchdog;
// Every new document gets a splash; SPA navigation never recreates this entry.
document.getElementById('app')?.setAttribute('inert', '');
// If boot itself fails, expose a real reload action instead of an endless spinner.
watchdog = window.setTimeout(() => {
  if (!splash?.isConnected) return;
  splash.dataset.stalled = 'true';
  splash.querySelector('.boot-splash-retry').hidden = false;
}, 10000);

function completeBootSplash(event) {
  if (dismissed) return;
  dismissed = true;
  window.clearTimeout(watchdog);
  if (event?.detail?.handoff) {
    // The room splash is already painted underneath and now owns readiness.
    splash?.remove();
    document.getElementById('app')?.removeAttribute('inert');
    return;
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  timer = window.setTimeout(() => {
    document.getElementById('app')?.removeAttribute('inert');
    splash?.classList.add('is-ready');
    window.setTimeout(() => splash?.remove(), reduced ? 0 : 320);
  }, Math.max(0, (reduced ? 0 : 650) - (performance.now() - startedAt)));
}

window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  window.clearTimeout(timer);
  window.clearTimeout(watchdog);
  splash?.remove();
  document.getElementById('app')?.removeAttribute('inert');
  dismissed = true;
});

window.addEventListener('tsukuyomi:entry-ready', completeBootSplash, { once: true });
