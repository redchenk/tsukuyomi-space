import { computed, onMounted, onUnmounted, ref } from 'vue';

export function readKeyboardViewport({ height, viewportHeight, restingHeight = height, offsetTop = 0, scale = 1, editable, mobile }) {
  const inset = Math.max(0, height - viewportHeight - offsetTop);
  return { open: Boolean(mobile && editable && scale === 1 && Math.max(inset, restingHeight - viewportHeight) > 120), inset, height: viewportHeight };
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
      if (!editable || restingWidth !== window.innerWidth) {
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
        mobile: mobileQuery?.matches
      });
      if (state.value.open !== next.open || (next.open && (state.value.inset !== next.inset || state.value.height !== next.height))) {
        state.value = next;
      }
    });
  };
  onMounted(() => {
    mobileQuery = window.matchMedia('(max-width: 860px)');
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    update();
  });
  onUnmounted(() => {
    cancelAnimationFrame(frame);
    window.visualViewport?.removeEventListener('resize', update);
    window.visualViewport?.removeEventListener('scroll', update);
    window.removeEventListener('resize', update);
    document.removeEventListener('focusin', update);
    document.removeEventListener('focusout', update);
  });
  return {
    keyboardOpen: computed(() => state.value.open),
    viewportStyle: computed(() => state.value.open ? {
      '--ts-keyboard-inset': `${state.value.inset}px`,
      '--ts-visual-height': `${state.value.height}px`
    } : {})
  };
}
