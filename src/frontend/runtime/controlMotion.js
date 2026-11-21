// Paint follows native input. Forms, router links, switches and gesture tools own their events.
const controls = [
  'button', 'summary', 'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]',
  '[role="button"]', '[role="tab"]', '[role="switch"]', '[role="menuitem"]', '[role="option"]',
  'a[data-ui]', 'a[data-ui-part]', 'nav a[href]', 'a.primary-btn', 'a.ghost-btn', 'a.danger-btn',
  'a.chip', 'a.tab-btn', 'a.filter-btn', 'a.stage-new-btn', 'a.stage-page-btn', 'a.icon-button', 'a.site-tool-button'
].join(',');
const surfaces = '[data-ui], .primary-btn, .ghost-btn, .danger-btn, .tab-btn, .filter-btn, .chip, .stage-new-btn, .stage-page-btn';
const unavailable = ':disabled, [aria-disabled="true"], [aria-busy="true"], [inert]';

export function installControlMotion() {
  const quiet = matchMedia('(prefers-reduced-motion: reduce)');
  const highContrast = matchMedia('(forced-colors: active)');
  const waves = new Map();
  let hovered = null, frame = 0, pointerX = 0, pointerY = 0;

  function clearReflection() {
    cancelAnimationFrame(frame);
    frame = 0;
    hovered?.style.removeProperty('--lens-x');
    hovered?.style.removeProperty('--lens-pull');
    hovered = null;
  }
  function clearWaves() {
    for (const dispose of waves.values()) dispose();
  }
  function clear() {
    clearReflection();
    clearWaves();
  }
  function geometryChanged() {
    clearWaves();
    if (!hovered) return;
    // A scroll can be delivered just after a pointer move at the new layout position.
    const underPointer = document.elementFromPoint(pointerX, pointerY);
    if (!hovered.contains(underPointer)) return clearReflection();
    if (!frame) frame = requestAnimationFrame(reflect);
  }
  function canPaint(control) {
    return control && !control.closest(unavailable) && !quiet.matches && !highContrast.matches &&
      getComputedStyle(control).getPropertyValue('--control-motion-enabled').trim() !== '0';
  }
  function reflect() {
    frame = 0;
    if (!hovered?.isConnected) return clearReflection();
    const bounds = hovered.getBoundingClientRect();
    if (!bounds.width) return;
    const x = Math.max(0, Math.min(1, (pointerX - bounds.left) / bounds.width));
    hovered.style.setProperty('--lens-x', (8 + x * 84).toFixed(1) + '%');
    hovered.style.setProperty('--lens-pull', ((x - .5) * 8).toFixed(1) + 'px');
  }
  function move(event) {
    if (event.pointerType !== 'mouse' || event.buttons) return;
    const control = event.target.closest?.(surfaces);
    if (control !== hovered) {
      clearReflection();
      if (canPaint(control)) hovered = control;
    }
    if (!hovered) return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (!frame) frame = requestAnimationFrame(reflect);
  }
  function leave(event) {
    if (hovered && !(event.relatedTarget instanceof Node && hovered.contains(event.relatedTarget))) clearReflection();
  }
  function activate(event) {
    const control = event.target.closest?.(controls);
    if (event.button > 0 || !canPaint(control)) return;
    const bounds = control.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    waves.get(control)?.();
    if (waves.size >= 3) waves.values().next().value();

    const paint = getComputedStyle(control);
    const layer = document.createElement('div');
    layer.className = 'ui-liquid-wave';
    layer.setAttribute('aria-hidden', 'true');
    layer.inert = true;
    const host = control.closest('dialog[open], [popover]') || document.body;
    const fromPointer = event.detail > 0 && event.clientX >= bounds.left && event.clientX <= bounds.right &&
      event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    const x = fromPointer ? event.clientX - bounds.left : bounds.width / 2;
    const y = fromPointer ? event.clientY - bounds.top : bounds.height / 2;
    layer.style.setProperty('--wave-x', x + 'px');
    layer.style.setProperty('--wave-y', y + 'px');
    layer.style.setProperty('--wave-span', Math.min(240, Math.max(48, bounds.width * 1.7)) + 'px');
    Object.assign(layer.style, {
      width: bounds.width + 'px', height: bounds.height + 'px', borderRadius: paint.borderRadius,
      color: paint.getPropertyValue('--control-echo-color') || paint.color
    });
    const rings = Array.from({ length: 3 }, () => document.createElement('i'));
    layer.append(...rings);
    host.append(layer);
    const origin = host === document.body ? { left: 0, top: 0 } : layer.getBoundingClientRect();
    layer.style.left = (bounds.left - origin.left) + 'px';
    layer.style.top = (bounds.top - origin.top) + 'px';
    function dispose() {
      clearTimeout(fallback);
      layer.remove();
      if (waves.get(control) === dispose) waves.delete(control);
    }
    const fallback = setTimeout(dispose, 800);
    rings[2].addEventListener('animationend', dispose, { once: true });
    waves.set(control, dispose);
  }
  const events = [
    [document, 'pointermove', move], [document, 'pointerout', leave],
    [document, 'click', activate, true], [document, 'scroll', geometryChanged, true],
    [window, 'resize', geometryChanged], [window, 'pagehide', clear], [window, 'blur', clear]
  ];
  for (const [target, type, handle, capture = false] of events) {
    target.addEventListener(type, handle, { capture, passive: true });
  }
  quiet.addEventListener?.('change', clear);
  highContrast.addEventListener?.('change', clear);
  return {
    clear,
    dispose() {
      clear();
      for (const [target, type, handle, capture = false] of events) target.removeEventListener(type, handle, capture);
      quiet.removeEventListener?.('change', clear);
      highContrast.removeEventListener?.('change', clear);
    }
  };
}
