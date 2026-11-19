// A small independent entry point paints before the Vue/router bundle is ready.
const splash = document.getElementById('boot-splash');
const chatroomBoot = /^\/chatroom\/?$/.test(window.location.pathname);
if (chatroomBoot) {
  // Fetch the first snapshot while Vue and the route are downloading. Only the
  // matching channel can consume it, and it is never stored across visits.
  const query = new URLSearchParams(location.search).getAll('channel');
  const channel = query.length === 1 && /^[a-z][a-z0-9-]{0,23}$/.test(query[0]) ? query[0] : 'lobby';
  const url = '/api/chatroom/' + channel + '/sync';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const snapshot = fetch(url, {cache:'no-store', credentials:'include', signal:controller.signal})
    .then(response => response.ok ? response.json() : null)
    .catch(() => null)
    .finally(() => clearTimeout(timeout));
  window.tsukuyomiChatEntry = {url, snapshot, controller, started:performance.now()};

  for (const [kind, href] of Object.entries(document.currentScript?.dataset || {})) {
    if (kind !== 'chatModule' && kind !== 'chatStyle') continue;
    const link = document.createElement('link');
    link.href = href;
    link.rel = kind === 'chatModule' ? 'modulepreload' : 'preload';
    if (kind === 'chatStyle') link.as = 'style';
    document.head.append(link);
  }
}
// Count the readable brand moment from a painted frame, not script execution.
// Cached assets or a busy startup must not consume it before the user sees it.
const paintedAt = new Promise(resolve => {
  requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now())));
});
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

function removeBootCover() {
  splash?.remove();
  window.dispatchEvent(new Event('tsukuyomi:boot-dismissed'));
}

function completeBootSplash(event) {
  if (dismissed) return;
  dismissed = true;
  window.clearTimeout(watchdog);
  if (chatroomBoot || event?.detail?.handoff) {
    // The matching chat or Room surface is already painted underneath.
    removeBootCover();
    document.getElementById('app')?.removeAttribute('inert');
    return;
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  paintedAt.then(startedAt => {
    // A BFCache restore may have removed the splash while waiting for paint.
    if (!splash?.isConnected) return;
    timer = window.setTimeout(() => {
      document.getElementById('app')?.removeAttribute('inert');
      splash?.classList.add('is-ready');
      window.setTimeout(removeBootCover, reduced ? 0 : 320);
    }, Math.max(0, 900 - (performance.now() - startedAt)));
  });
}

window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  window.clearTimeout(timer);
  window.clearTimeout(watchdog);
  removeBootCover();
  document.getElementById('app')?.removeAttribute('inert');
  dismissed = true;
});

window.addEventListener('tsukuyomi:entry-ready', completeBootSplash, { once: true });
