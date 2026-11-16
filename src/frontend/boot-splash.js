// Runs before the app, independently of the module graph and layered CSS.
(() => {
  const root = document.documentElement;
  const nativeViewport = CSS.supports('height', '1dvh');
  let small = innerHeight, large = innerHeight, width = innerWidth, frame;
  function viewport() {
    frame = 0;
    if (nativeViewport) return;
    const editable = document.activeElement?.matches('input, textarea, [contenteditable="true"]');
    if (width !== innerWidth) { small = large = innerHeight; width = innerWidth; }
    if (!editable) { small = Math.min(small, innerHeight); large = Math.max(large, innerHeight); }
    root.style.setProperty('--ts-dvh', `${innerHeight / 100}px`);
    root.style.setProperty('--ts-svh', `${small / 100}px`);
    root.style.setProperty('--ts-lvh', `${large / 100}px`);
  }
  if (!nativeViewport) {
    viewport();
    addEventListener('resize', () => { if (!frame) frame = requestAnimationFrame(viewport); }, { passive: true });
    addEventListener('pageshow', viewport);
  }
  // Old Chromium understands [inert] as an attribute but does not suppress input.
  // Preserve the native implementation where available. The fallback only gates
  // interaction while existing app transitions mark a subtree inert.
  if (!('inert' in HTMLElement.prototype)) {
    // Vue checks property existence. Without reflection, :inert="false"
    // becomes a present HTML attribute and leaves the entire app blocked.
    Object.defineProperty(HTMLElement.prototype, 'inert', {
      configurable: true,
      get() { return this.hasAttribute('inert'); },
      set(value) {
        this.toggleAttribute('inert', Boolean(value));
        if (value && this.contains(document.activeElement)) document.activeElement.blur();
      }
    });
    const focusable = 'a[href],button,input,textarea,select,summary,[tabindex]';
    const available = () => [...document.querySelectorAll(focusable)].filter(node => node.tabIndex >= 0 && !node.disabled && !node.closest('[inert]') && node.getClientRects().length);
    document.addEventListener('click', event => {
      if (event.target.closest('[inert]')) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    document.addEventListener('focusin', event => {
      if (event.target.closest('[inert]')) { event.target.blur(); available()[0]?.focus({ preventScroll: true }); }
    }, true);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || !document.querySelector('[inert]')) return;
      const targets = available();
      event.preventDefault();
      if (!targets.length) return;
      const current = targets.indexOf(document.activeElement);
      const next = current < 0 ? (event.shiftKey ? targets.length - 1 : 0) : (current + (event.shiftKey ? -1 : 1) + targets.length) % targets.length;
      targets[next].focus();
    }, true);
  }
  const test = document.createElement('style');
  test.textContent = '@layer compatibility-test {}';
  document.head.append(test);
  const layers = Boolean(test.sheet?.cssRules.length);
  test.remove();
  if (!layers) {
    const notice = document.getElementById('browser-compat-notice');
    if (notice) notice.hidden = false;
    const app = document.getElementById('app');
    if (app) app.hidden = true;
  }
})();

// A small independent entry point paints before the Vue/router bundle is ready.
const splash = document.getElementById('boot-splash');
// Access starts on the Seedance poster, without a separate logo animation.
const waterMirrorBoot = /^\/(?:access\/?)?$/.test(window.location.pathname);
if (waterMirrorBoot && splash) splash.dataset.scene = 'water-mirror';
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

function completeBootSplash(event) {
  if (dismissed) return;
  dismissed = true;
  window.clearTimeout(watchdog);
  if (waterMirrorBoot || event?.detail?.handoff) {
    // The matching Access scene or Room splash is already painted underneath.
    splash?.remove();
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
      window.setTimeout(() => splash?.remove(), reduced ? 0 : 320);
    }, Math.max(0, 900 - (performance.now() - startedAt)));
  });
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
