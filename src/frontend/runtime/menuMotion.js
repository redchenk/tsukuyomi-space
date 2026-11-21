// Measure actual trigger and final panel in viewport coordinates. Animate the shell
// with clipping so text, thumbnails and focus targets are never stretched.
const sessions = new WeakMap();
const duration = 700;
const quiet = () => matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)').matches;
let lastActivation;
export function trackMenuTriggers() {
  function remember(event) {
    const el = event.target.closest?.('button, a[href], summary, [role="button"], [aria-expanded]');
    if (el) lastActivation = { el, rect: el.getBoundingClientRect(), time: performance.now() };
  }
  document.addEventListener('click', remember, true);
  return () => document.removeEventListener('click', remember, true);
}
function rendered(el) {
  return el && el !== document.body && el.isConnected && el.getBoundingClientRect().width > 0;
}
function sourceFor(el, preferred) {
  if (rendered(preferred) && (!el.contains(preferred) || preferred.tagName === 'SUMMARY')) return { el: preferred, rect: preferred.getBoundingClientRect() };
  if (lastActivation && performance.now() - lastActivation.time < 1800 && !el.contains(lastActivation.el)) return lastActivation;
  return null;
}
function clearPaint(session) {
  for (const effect of session.effects) effect.cancel();
  session.effects = [];
  session.marker?.remove();
  session.marker = null;
}
export function forgetMenu(el) {
  const session = sessions.get(el);
  if (session) clearPaint(session);
  sessions.delete(el);
  el?.removeAttribute('data-menu-phase');
}
function contentGroups(el) {
  const entries = [...el.querySelectorAll('[data-menu-item]')].filter(n => n.closest('[data-menu-surface]') === el);
  if (entries.length) return entries;
  const body = el.querySelector(':scope > .ts-sheet-body');
  return [...(body || el).children].filter(n => !n.matches('summary, .sheet-handle, .ui-liquid-wave'));
}
function tracks(el, session) {
  const box = el.getBoundingClientRect();
  if (!box.width || !box.height) return [];
  const src = rendered(session.source?.el) ? session.source.el.getBoundingClientRect() : session.source?.rect;
  const anchor = src || { left: box.left + box.width / 2 - 24, top: box.top, width: 48, height: 40 };
  const width = Math.min(box.width, anchor.width), height = Math.min(box.height, anchor.height);
  const clamp = n => Math.max(0, Math.min(1, n));
  const left = (box.width-width) * clamp((anchor.left + anchor.width/2 - box.left) / box.width);
  const top = (box.height-height) * clamp((anchor.top + anchor.height/2 - box.top) / box.height);
  const radius = getComputedStyle(el).borderTopLeftRadius;
  const inset = [top, box.width-width-left, box.height-height-top, left].map(n => n.toFixed(2)+'px').join(' ');
  const start = { clipPath: 'inset('+inset+' round 12px)', translate: (anchor.left-box.left-left)+'px '+(anchor.top-box.top-top)+'px' };
  const end = { clipPath: 'inset(0px 0px 0px 0px round '+radius+')', translate: '0px 0px' };
  const options = { duration, fill: 'both' };
  const shell = el.animate([{...start, offset:0, easing:'cubic-bezier(.24,.78,.2,1)'}, {...end, offset:.71}, {...end, offset:1}], options);
  shell.id = 'menu-surface';
  const children = contentGroups(el).map((child,i) => {
    const delay = .35 + Math.min(i,4)*.045;
    const hidden = {opacity:0, translate:'0px 5px'};
    const shown = {opacity:1, translate:'0px 0px'};
    const effect = child.animate([{...hidden, offset:0}, {...hidden, offset:delay, easing:'ease-out'}, {...shown, offset:delay+.34}, {...shown, offset:1}], options);
    effect.id = 'menu-content';
    return effect;
  });
  // Carry the original header glyph through the small, still-empty glass surface.
  // The real heading takes its place when the content starts appearing.
  const trigger = session.source?.el;
  if (el.dataset.menuOrigin !== 'header' || !trigger) return [shell, ...children];
  const marker = document.createElement('span');
  marker.className = 'menu-origin-mark';
  marker.setAttribute('aria-hidden', 'true');
  marker.inert = true;
  const glyph = trigger.querySelector('svg, img');
  if (glyph) marker.append(glyph.cloneNode(true));
  const caption = [...trigger.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
  const label = trigger.querySelector('span');
  if (caption) marker.append(caption.textContent.trim());
  else if (label?.getClientRects().length && label.innerText?.trim()) marker.append(label.innerText.trim());
  if (!marker.hasChildNodes()) return [shell, ...children];
  el.append(marker);
  session.marker = marker;
  const insetX = Math.min(12, width / 4), insetY = Math.max(0, (height - 22) / 2);
  const movingLabel = marker.animate([
    { translate: (left+insetX)+'px '+(top+insetY)+'px', opacity:1, offset:0, easing:'cubic-bezier(.24,.78,.2,1)' },
    { translate:'18px 16px', opacity:0, offset:.42 },
    { translate:'18px 16px', opacity:0, offset:1 }
  ], options);
  movingLabel.id = 'menu-trigger-mark';
  return [shell, ...children, movingLabel];
}
function play(el, session, closing, complete) {
  const revision = ++session.revision;
  el.dataset.menuPhase = closing ? 'closing' : 'opening';
  const running = session.effects;
  if (quiet() || !el.animate || !el.isConnected) {
    clearPaint(session);
    el.removeAttribute('data-menu-phase');
    complete?.();
    return;
  }
  // Reversing an unfinished opening keeps the exact geometry already on screen.
  if (!running.length) {
    session.effects = tracks(el, session);
    for (const effect of session.effects) effect.currentTime = closing ? duration : 0;
  }
  for (const effect of session.effects) {
    effect.playbackRate = closing ? -1.55 : 1;
    effect.play();
  }
  Promise.allSettled(session.effects.map(effect => effect.finished)).then(() => {
    if (session.revision !== revision || sessions.get(el) !== session) return;
    clearPaint(session);
    delete el.dataset.menuPhase;
    complete?.();
  });
}
export function revealMenu(el, preferred, complete) {
  if (!el) { complete?.(); return; }
  const previous = sessions.get(el);
  const source = sourceFor(el, preferred);
  if (previous) forgetMenu(el);
  const session = { source, effects: [], revision: 0 };
  sessions.set(el, session);
  el.setAttribute('data-menu-surface','');
  if (source && el.matches('#site-navigation,#site-search,.site-music-drawer') && source.el.closest('.site-header')) {
    const r = source.rect;
    el.dataset.menuOrigin = 'header';
    el.style.setProperty('--menu-source-x', (r.left+r.width/2)+'px');
    el.style.setProperty('--menu-source-top', Math.max(4,r.top)+'px');
  } else delete el.dataset.menuOrigin;
  play(el, session, false, complete);
}
export function dismissMenu(el, complete) {
  const session = sessions.get(el);
  if (!session || !el?.isConnected) { complete(); return; }
  if (el.dataset.menuPhase === 'closing') return;
  play(el, session, true, () => { forgetMenu(el); complete(); });
}

// Preserve native disclosure semantics and leave the summary available to AT.
export const menuDetails = {
  mounted(el) {
    const summary = el.querySelector(':scope > summary');
    el.setAttribute('data-menu-disclosure', '');
    let surface = el;
    let initiallyOpen = el.open;
    function toggle() {
      if (initiallyOpen && el.open) { initiallyOpen = false; return; }
      initiallyOpen = false;
      if (el.open) {
        // An absolutely positioned list is outside the summary's layout box.
        surface = [...el.children].find(child => child !== summary &&
          ['absolute','fixed'].includes(getComputedStyle(child).position)) || el;
        revealMenu(surface, summary);
      } else forgetMenu(surface);
    }
    function click(event) {
      if (event.defaultPrevented || !el.open || quiet()) return;
      event.preventDefault();
      dismissMenu(surface, () => { el.open = false; });
    }
    el.addEventListener('toggle', toggle);
    summary?.addEventListener('click', click);
    el._disposeMenu = () => { el.removeEventListener('toggle', toggle); summary?.removeEventListener('click',click); forgetMenu(surface); };
  },
  unmounted(el) { el._disposeMenu?.(); }
};

export const floatingMenu = {
  updated(el, binding) {
    if (binding.value === binding.oldValue) return;
    if (binding.value && ['absolute','fixed'].includes(getComputedStyle(el).position)) revealMenu(el);
    else forgetMenu(el);
  },
  unmounted: forgetMenu
};
