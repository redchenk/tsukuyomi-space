import { computed, onMounted, onUnmounted, ref } from 'vue';

export function readKeyboardViewport({ height, viewportHeight, restingHeight = height, offsetTop = 0, scale = 1, editable, mobile, wasOpen = false, overlayHeight = 0 }) {
  const inset = Math.max(0, height - viewportHeight - offsetTop, overlayHeight);
  const availableHeight = overlayHeight > 0 ? Math.min(viewportHeight, height - overlayHeight) : viewportHeight;
  const anchored = Boolean(mobile && scale === 1 && (editable || wasOpen));
  return {
    open: anchored && Math.max(inset, restingHeight - viewportHeight) > 120,
    anchored, inset, height: scale === 1 ? availableHeight : height,
    offsetTop: anchored && viewportHeight < restingHeight - 1 ? Math.max(0, offsetTop) : 0,
    layoutHeight: restingHeight
  };
}

export function useMobileKeyboard() {
  const state = ref({ open: false, inset: 0, height: 0 });
  let frame = 0;
  let restingHeight = 0;
  let restingWidth = 0;
  let mobileQuery;
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const viewport = window.visualViewport;
      const active = document.activeElement;
      const editable = active?.matches('textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="color"]), [contenteditable="true"]');
      // Keep the pre-keyboard scene size through focus/blur and the closing
      // animation. Android may resize innerHeight; iOS pans offsetTop instead.
      if (!restingHeight || (!editable && !state.value.open) || restingWidth !== window.innerWidth) {
        restingHeight = window.innerHeight;
        restingWidth = window.innerWidth;
      }
      const next = readKeyboardViewport({
        height: window.innerHeight,
        restingHeight,
        viewportHeight: viewport?.height ?? window.innerHeight,
        offsetTop: viewport?.offsetTop ?? 0,
        scale: viewport?.scale ?? 1,
        editable,
        mobile: mobileQuery?.matches,
        wasOpen: state.value.open,
        overlayHeight: navigator.virtualKeyboard?.boundingRect?.height || 0
      });
      if (!next.open && !editable) next.anchored = false;
      if (Object.keys(next).some(key => state.value[key] !== next[key])) {
        state.value = next;
      }
    });
  };
  onMounted(() => {
    mobileQuery = window.matchMedia('(max-width: 860px), (hover: none) and (pointer: coarse)');
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    navigator.virtualKeyboard?.addEventListener('geometrychange', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    update();
  });
  onUnmounted(() => {
    cancelAnimationFrame(frame);
    window.visualViewport?.removeEventListener('resize', update);
    window.visualViewport?.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
    navigator.virtualKeyboard?.removeEventListener('geometrychange', update);
    document.removeEventListener('focusin', update);
    document.removeEventListener('focusout', update);
  });
  return {
    keyboardOpen: computed(() => state.value.open),
    viewportStyle: computed(() => state.value.height ? {
      '--ts-keyboard-inset': `${state.value.inset}px`,
      '--ts-visual-height': `${state.value.height}px`,
      '--ts-visual-offset-top': `${state.value.offsetTop}px`,
      '--ts-room-scene-height': `${state.value.layoutHeight}px`
    } : {})
  };
}
