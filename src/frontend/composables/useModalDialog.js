import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { lockPageScroll } from '../utils/pageScrollLock';

// Native dialogs make the rest of the page inert and keep Tab inside the modal.
export function useModalDialog(isOpen) {
  const dialog = ref(null);
  let restoreScroll;
  let previousFocus;
  let revision = 0;
  let removeKeys;
  function keepFocus(event) {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.value.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
      .filter(node => node.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }
  function release() {
    removeKeys?.();
    removeKeys = null;
    dialog.value?.close();
    restoreScroll?.();
    restoreScroll = null;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }
  watch(isOpen, async (open) => {
    const run = ++revision;
    if (!open) { release(); return; }
    previousFocus = document.activeElement;
    const path = location.pathname + location.search;
    restoreScroll = lockPageScroll(() => location.pathname + location.search === path);
    await nextTick();
    if (run !== revision || !isOpen() || !dialog.value) return;
    dialog.value.showModal();
    const node = dialog.value;
    node.addEventListener('keydown', keepFocus);
    removeKeys = () => node.removeEventListener('keydown', keepFocus);
    dialog.value.querySelector('[data-modal-close], button')?.focus({ preventScroll: true });
  }, { immediate: true });
  onBeforeUnmount(() => { ++revision; release(); });
  return dialog;
}
