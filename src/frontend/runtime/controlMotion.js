// Observe native activation in capture phase. Business handlers keep ownership of the event.
const controls = [
  'button', 'summary', 'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]',
  '[role="button"]', '[role="tab"]', '[role="switch"]', '[role="menuitem"]', '[role="option"]',
  'a[data-ui]', 'a[data-ui-part]', 'nav a[href]', 'a.primary-btn', 'a.ghost-btn', 'a.danger-btn',
  'a.chip', 'a.tab-btn', 'a.filter-btn', 'a.stage-new-btn', 'a.stage-page-btn', 'a.icon-button', 'a.site-tool-button'
].join(',');
const unavailable = ':disabled, [aria-disabled="true"], [aria-busy="true"], [inert]';
const columnDots = [1, 3, 3, 5, 7, 5, 3, 3, 1];

export function installControlMotion() {
  const quiet = matchMedia('(prefers-reduced-motion: reduce)');
  const highContrast = matchMedia('(forced-colors: active)');
  const focusVisible = window.CSS?.supports?.("selector(:focus-visible)");
  const active = new Map();

  function clear() {
    for (const dispose of active.values()) dispose();
  }

  function draw(event, trace = false) {
    if (quiet.matches || highContrast.matches || event.button > 0) return;
    const control = event.target instanceof Element && event.target.closest(controls);
    if (!control || control.closest(unavailable)) return;
    if (trace && ((event.relatedTarget instanceof Node && control.contains(event.relatedTarget)) || control.matches(':active'))) return;
    const paint = getComputedStyle(control);
    if (paint.getPropertyValue('--control-motion-enabled').trim() === '0') return;
    const bounds = control.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    active.get(control)?.();
    if (active.size >= 3) active.values().next().value();

    const layer = document.createElement('div');
    layer.className = trace ? 'ui-dot-echo ui-dot-trace' : 'ui-dot-echo';
    layer.setAttribute('aria-hidden', 'true');
    layer.inert = true;
    const primary = control.matches('[data-ui="primary"], .primary-btn, .stage-new-btn');
    layer.style.color = primary ? paint.color : paint.getPropertyValue('--control-echo-color') || paint.color;
    if (control.matches('[data-ui="danger"], .danger-btn')) layer.style.color = paint.color;

    // A fixed child of the top layer stays visible inside a native modal or popover.
    const host = control.closest('dialog[open], [popover]') || document.body;
    Object.assign(layer.style, {
      width: bounds.width + 'px', height: bounds.height + 'px', borderRadius: paint.borderRadius
    });
    host.append(layer);
    // Account for a transformed dialog's fixed-position containing block.
    const origin = host === document.body ? { left: 0, top: 0 } : layer.getBoundingClientRect();
    layer.style.left = (bounds.left - origin.left) + 'px';
    layer.style.top = (bounds.top - origin.top) + 'px';
    const fromPointer = !trace && event.detail > 0 && event.clientX >= bounds.left && event.clientX <= bounds.right &&
      event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    const x = fromPointer ? event.clientX - bounds.left : bounds.width / 2;
    const y = fromPointer ? event.clientY - bounds.top : bounds.height / 2;
    const pitch = Math.min(trace ? 3.6 : 6, bounds.width / columnDots.length, bounds.height / 8);
    const traceEnd = Math.min(bounds.width * .76, bounds.width / 2 + 36);
    const fragment = document.createDocumentFragment();
    for (const [i, dots] of columnDots.entries()) {
      const offset = i - Math.floor(columnDots.length / 2);
      const column = document.createElement('i');
      const count = trace ? Math.min(3, dots) : dots;
      const cx = trace ? traceEnd - (columnDots.length - 1 - i) * pitch : x + offset * pitch;
      const cy = trace ? bounds.height - 2 - count * pitch : y - count * pitch / 2;
      column.style.left = cx + 'px';
      column.style.top = cy + 'px';
      column.style.height = (count * pitch) + 'px';
      column.style.setProperty('--dot-pitch', pitch + 'px');
      column.style.animationDelay = ((trace ? i : Math.abs(offset)) * 20) + 'ms';
      fragment.append(column);
    }
    layer.append(fragment);
    function dispose() {
      clearTimeout(fallback);
      layer.remove();
      if (active.get(control) === dispose) active.delete(control);
    }
    const fallback = setTimeout(dispose, 600);
    layer.addEventListener('animationend', e => {
      if (e.target === layer) dispose();
    });
    dispose.trace = trace;
    active.set(control, dispose);
  }

  const activate = event => draw(event);
  const hover = event => {
    if (event.pointerType === 'mouse' && event.buttons === 0) draw(event, true);
  };
  const focus = event => {
    if (focusVisible && event.target.matches?.(':focus-visible')) draw(event, true);
  };
  const leave = event => {
    const control = event.target.closest?.(controls);
    if (control && !(event.relatedTarget instanceof Node && control.contains(event.relatedTarget))) {
      const effect = active.get(control);
      if (effect?.trace) effect();
    }
  };
  document.addEventListener('pointerover', hover, { passive: true });
  document.addEventListener('pointerout', leave, { passive: true });
  document.addEventListener('focusin', focus);
  document.addEventListener('focusout', leave);
  // Native click covers touch, mouse, keyboard and assistive technology. A cancelled drag emits no click.
  document.addEventListener('click', activate, { capture: true, passive: true });
  document.addEventListener('scroll', clear, { capture: true, passive: true });
  window.addEventListener('resize', clear, { passive: true });
  window.addEventListener('pagehide', clear);
  quiet.addEventListener?.('change', clear);
  highContrast.addEventListener?.('change', clear);
  return {
    clear,
    dispose() {
      clear();
      document.removeEventListener('pointerover', hover);
      document.removeEventListener('pointerout', leave);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', leave);
      document.removeEventListener('click', activate, true);
      document.removeEventListener('scroll', clear, true);
      window.removeEventListener('resize', clear);
      window.removeEventListener('pagehide', clear);
      quiet.removeEventListener?.('change', clear);
      highContrast.removeEventListener?.('change', clear);
    }
  };
}
