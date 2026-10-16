// A small independent entry point paints before the Vue/router bundle is ready.
const splash = document.getElementById('boot-splash');
const key = 'tsukuyomi_entry_splash_seen';
const startedAt = performance.now();
let dismissed = false;
let timer;
let watchdog;
let seen = false;
try { seen = sessionStorage.getItem(key) === '1'; } catch (_) { /* Private storage may be unavailable. */ }
const isEntry = /^\/(?:access\/?)?$/.test(location.pathname);
if (!isEntry || seen) { splash?.remove(); dismissed = true; }
else {
  document.getElementById('app')?.setAttribute('inert', '');
  // The brand screen is not a fake percentage. If boot itself fails, expose a
  // real reload action rather than leave an endless spinner in front of it.
  watchdog = window.setTimeout(() => {
    if (!splash?.isConnected) return;
    splash.dataset.stalled = 'true';
    splash.querySelector('.boot-splash-retry').hidden = false;
  }, 10000);
}

function completeBootSplash() {
  if (dismissed) return;
  dismissed = true;
  window.clearTimeout(watchdog);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  timer = window.setTimeout(() => {
    try { sessionStorage.setItem(key, '1'); } catch (_) { /* Still usable without storage. */ }
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
